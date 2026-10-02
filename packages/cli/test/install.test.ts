import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectPackageManager, fromUserAgent } from '../src/package-manager.js';
import { detectAgents } from '../src/agents.js';
import { apply, extractRegion, plan, removeFiles, type DesiredFile } from '../src/install.js';
import { emptyManifest, hashContent, recordFile, readManifest } from '../src/manifest.js';
import { describePlan, planInit, runInit } from '../src/init.js';
import { runChecks, summarise } from '../src/doctor.js';

/**
 * The CLI writes into other people's repositories, so the properties under test
 * here are the ones that decide whether it is safe to run twice: idempotence,
 * and never destroying work Cue did not write.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cue-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const detection = { manager: 'pnpm', evidence: 'test', confident: true } as const;
const VERSION = '0.1.0-test';

function initOptions(extra: Record<string, unknown> = {}) {
  return {
    projectRoot: root,
    detection,
    cueVersion: VERSION,
    // Otherwise ~/.claude/ and $CLAUDE_CODE_ENTRYPOINT make the result depend on
    // who runs the suite.
    env: {},
    home: root,
    ...extra,
  };
}

describe('package manager detection', () => {
  it('prefers the running process over a committed lockfile', () => {
    writeFileSync(join(root, 'package-lock.json'), '{}');
    const result = detectPackageManager({ cwd: root, userAgent: 'pnpm/10.0.0 npm/? node/v22' });
    expect(result.manager).toBe('pnpm');
    expect(result.evidence).toBe('npm_config_user_agent');
  });

  it('falls back to the lockfile', () => {
    writeFileSync(join(root, 'bun.lock'), '');
    expect(detectPackageManager({ cwd: root }).manager).toBe('bun');
  });

  it('admits when it is guessing', () => {
    const result = detectPackageManager({ cwd: root });
    expect(result.confident).toBe(false);
    expect(result.manager).toBe('npm');
  });

  it('lets an explicit flag win over everything', () => {
    writeFileSync(join(root, 'bun.lock'), '');
    const result = detectPackageManager({
      cwd: root,
      userAgent: 'pnpm/10.0.0',
      override: 'yarn',
    });
    expect(result.manager).toBe('yarn');
  });

  it('ignores a user agent it does not recognise', () => {
    expect(fromUserAgent('deno/2.0.0')).toBeUndefined();
  });
});

describe('agent detection', () => {
  it('reports evidence rather than a bare verdict', () => {
    mkdirSync(join(root, '.cursor'), { recursive: true });
    const found = detectAgents({ cwd: root, home: root, env: {} });
    expect(found.map((a) => a.id)).toEqual(['cursor']);
    expect(found[0]?.evidence).toContain('.cursor/ in this project');
  });

  it('finds nothing in an empty project, which is not an error', () => {
    expect(detectAgents({ cwd: root, home: root, env: {} })).toEqual([]);
  });
});

describe('regions', () => {
  const file: DesiredFile = {
    path: '.gitignore',
    target: 'agents',
    content: '\nours\n',
    region: { begin: '# BEGIN', end: '# END' },
    reason: 'test',
  };

  it('appends to a file it does not own without disturbing the rest', () => {
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
    apply(plan(root, [file], undefined), { projectRoot: root, cueVersion: VERSION });

    const content = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(content).toContain('node_modules/');
    expect(extractRegion(content, '# BEGIN', '# END')).toBe('\nours\n');
  });

  it('replaces only its own span when content changes', () => {
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
    let manifest = emptyManifest(VERSION, 'pnpm');
    const first = apply(plan(root, [file], manifest), {
      projectRoot: root,
      cueVersion: VERSION,
    });
    for (const entry of first.entries) manifest = recordFile(manifest, entry);

    writeFileSync(
      join(root, '.gitignore'),
      `${readFileSync(join(root, '.gitignore'), 'utf8')}my-own-entry\n`,
    );

    const updated: DesiredFile = { ...file, content: '\nours-v2\n' };
    apply(plan(root, [updated], manifest), { projectRoot: root, cueVersion: VERSION });

    const content = readFileSync(join(root, '.gitignore'), 'utf8');
    // Outside our markers: it survives, and is not tampering with our region.
    expect(content).toContain('my-own-entry');
    expect(content).toContain('ours-v2');
    expect(content).not.toContain('ours\n#');
  });
});

describe('init', () => {
  it('installs the baseline even when no agent is detected', () => {
    const prepared = planInit(initOptions());
    expect(prepared.targets).toEqual(['agents']);
    expect(prepared.suggested).toEqual([]);

    const result = runInit(initOptions(), prepared);
    expect(result.written).toContain('AGENTS.md');
    expect(result.written).toContain('eslint.config.mjs');
  });

  it('writes the ownership table into AGENTS.md', () => {
    runInit(initOptions(), planInit(initOptions()));
    const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Who decides what');
    expect(agents).toContain('cue` **(wins)**');
    expect(agents).toContain('not an invitation to improvise');
  });

  it('is idempotent', () => {
    runInit(initOptions(), planInit(initOptions()));
    const before = readFileSync(join(root, 'AGENTS.md'), 'utf8');

    const second = planInit(initOptions());
    expect(second.plan.files.every((f) => f.action === 'unchanged')).toBe(true);

    const result = runInit(initOptions(), second);
    expect(result.written).toEqual([]);
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(before);
  });

  it('never overwrites a file the user has edited', () => {
    runInit(initOptions(), planInit(initOptions()));

    const path = join(root, 'eslint.config.mjs');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n// my own rule tweaks\n`);

    const prepared = planInit(initOptions());
    const conflict = prepared.plan.files.find((f) => f.file.path === 'eslint.config.mjs');
    expect(conflict?.action).toBe('conflict');

    const result = runInit(initOptions(), prepared);
    expect(result.written).not.toContain('eslint.config.mjs');
    expect(readFileSync(path, 'utf8')).toContain('// my own rule tweaks');
    expect(describePlan(prepared)).toContain('--force overrides');
  });

  it('overwrites an edited file only when explicitly forced', () => {
    runInit(initOptions(), planInit(initOptions()));
    const path = join(root, 'eslint.config.mjs');
    writeFileSync(path, '// replaced entirely\n');

    const options = initOptions({ force: true });
    runInit(options, planInit(options));
    expect(readFileSync(path, 'utf8')).toContain('@wiluszdamian/cue-eslint-plugin');
  });

  it('leaves a foreign file at a path it wanted alone', () => {
    writeFileSync(join(root, 'eslint.config.mjs'), '// pre-existing config\n');

    const prepared = planInit(initOptions());
    const occupied = prepared.plan.files.find((f) => f.file.path === 'eslint.config.mjs');
    expect(occupied?.action).toBe('occupied');

    runInit(initOptions(), prepared);
    expect(readFileSync(join(root, 'eslint.config.mjs'), 'utf8')).toBe('// pre-existing config\n');
  });

  it('records everything it wrote in the manifest', () => {
    runInit(initOptions(), planInit(initOptions()));
    const manifest = readManifest(root);
    expect(manifest?.targets).toEqual(['agents']);

    const agents = manifest?.files.find((f) => f.path === 'AGENTS.md');
    expect(agents?.kind).toBe('region');
    expect(agents?.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('adds an agent target on top of the baseline', () => {
    const options = initOptions({ targets: ['claude-code'] });
    const result = runInit(options, planInit(options));
    expect(result.targets).toEqual(['agents', 'claude-code']);
    expect(readFileSync(join(root, 'CLAUDE.md'), 'utf8')).toContain('@AGENTS.md');
  });

  it('honours --baseline-only against a detected agent', () => {
    mkdirSync(join(root, '.cursor'), { recursive: true });
    const prepared = planInit(initOptions({ baselineOnly: true }));
    expect(prepared.targets).toEqual(['agents']);
  });

  it('renders MCP commands for the detected package manager', () => {
    const bun = { manager: 'bun', evidence: 'test', confident: true } as const;
    const options = initOptions({ detection: bun, targets: ['cursor'] });
    runInit(options, planInit(options));
    // A bun user should never be handed an npx command.
    expect(readFileSync(join(root, '.cursor/mcp.json'), 'utf8')).toContain('bunx');
  });

  it('wires up both MCP servers, not just the browser one', () => {
    const options = initOptions({ targets: ['cursor'] });
    runInit(options, planInit(options));

    const config = JSON.parse(readFileSync(join(root, '.cursor/mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { args: string[] }>;
    };

    // With only the browser server an agent guesses selectors instead of asking,
    // so the point lookups have to ship alongside it.
    expect(Object.keys(config.mcpServers).sort()).toEqual(['cue', 'playwright']);
    expect(config.mcpServers.cue?.args.join(' ')).toContain('@wiluszdamian/cue-mcp');
  });

  it('gives Codex both servers as removable TOML blocks', () => {
    const options = initOptions({ targets: ['codex'] });
    runInit(options, planInit(options));

    const toml = readFileSync(join(root, '.codex/config.toml'), 'utf8');
    expect(toml).toContain('[mcp_servers.cue]');
    expect(toml).toContain('[mcp_servers.playwright]');
    // The marked region is what makes removal an exact reversal.
    expect(toml).toContain('# BEGIN CUE');
    expect(toml).toContain('# END CUE');
  });
});

describe('removal', () => {
  it('deletes what a target installed and forgets it', () => {
    const options = initOptions({ targets: ['cursor'] });
    runInit(options, planInit(options));

    const manifest = readManifest(root);
    const owned = manifest?.files.filter((f) => f.target === 'cursor') ?? [];
    expect(owned).toHaveLength(1);

    const result = removeFiles(root, owned);
    expect(result.removed).toEqual(['.cursor/mcp.json']);
    expect(result.kept).toEqual([]);
  });

  it('keeps a file the user edited rather than deleting their work', () => {
    const options = initOptions({ targets: ['cursor'] });
    runInit(options, planInit(options));
    writeFileSync(join(root, '.cursor/mcp.json'), '{ "mcpServers": { "mine": {} } }');

    const manifest = readManifest(root);
    const owned = manifest?.files.filter((f) => f.target === 'cursor') ?? [];
    const result = removeFiles(root, owned);

    expect(result.removed).toEqual([]);
    expect(result.kept[0]?.reason).toContain('edited by hand');
  });

  it('deletes a region file that held nothing but our region', () => {
    const options = initOptions({ targets: ['codex'] });
    runInit(options, planInit(options));

    const manifest = readManifest(root);
    const owned = manifest?.files.filter((f) => f.target === 'codex') ?? [];
    removeFiles(root, owned);

    // It did not exist before init, so an empty husk is not a clean uninstall.
    expect(existsSync(join(root, '.codex/config.toml'))).toBe(false);
  });

  it('strips only its own region from a shared file', () => {
    runInit(initOptions(), planInit(initOptions()));
    writeFileSync(
      join(root, '.gitignore'),
      `${readFileSync(join(root, '.gitignore'), 'utf8')}my-own-entry\n`,
    );

    const manifest = readManifest(root);
    const gitignore = manifest?.files.filter((f) => f.path === '.gitignore') ?? [];
    removeFiles(root, gitignore);

    const content = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(content).toContain('my-own-entry');
    expect(content).not.toContain('BEGIN CUE');
  });
});

describe('doctor', () => {
  function check(manifestPresent: boolean) {
    if (manifestPresent) runInit(initOptions(), planInit(initOptions()));
    return summarise(
      runChecks({
        projectRoot: root,
        manifest: readManifest(root),
        rules: planInit(initOptions()).rules,
        detection,
        cueVersion: VERSION,
        env: {},
        home: root,
      }),
    );
  }

  it('fails an uninitialised project, with a fix for every failure', () => {
    const summary = check(false);
    expect(summary.errors).toBeGreaterThan(0);
    for (const result of summary.results) {
      if (result.status === 'error' || result.status === 'warn') {
        // Naming a problem without the remedy moves the work rather than doing it.
        // A stated limitation is the exception: it has no fix by definition.
        expect(result.fix ?? result.id.startsWith('limitation:'), result.id).toBeTruthy();
      }
    }
  });

  it('clears the setup errors once init has run', () => {
    const summary = check(true);
    const ids = summary.results.filter((r) => r.status === 'error').map((r) => r.id);
    // The test project does not install the plugin, so that error is expected.
    expect(ids).toEqual(['eslint-plugin']);
  });

  it('marks unverifiable things as unchecked rather than passing them', () => {
    writeFileSync(
      join(root, 'package.json'),
      '{"devDependencies":{"@wiluszdamian/cue-eslint-plugin":"*"}}',
    );
    runInit(initOptions(), planInit(initOptions()));
    const summary = summarise(
      runChecks({
        projectRoot: root,
        manifest: readManifest(root),
        rules: planInit(initOptions()).rules,
        detection,
        cueVersion: VERSION,
        offline: true,
        env: {},
        home: root,
      }),
    );
    const skills = summary.results.find((r) => r.id === 'official-skills');
    expect(skills?.status).toBe('unchecked');
  });
});

describe('hashing', () => {
  it('treats CRLF and LF as the same content', () => {
    // Windows is supported and `core.autocrlf` is common: a checkout is not an edit.
    expect(hashContent('a\r\nb\r\n')).toBe(hashContent('a\nb\n'));
  });
});
