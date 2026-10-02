import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze, type Diagnostic } from '@wiluszdamian/cue-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planInit, resolveRules, runInit } from '../src/init.js';
import { readManifest } from '../src/manifest.js';
import { planSync } from '../src/sync.js';

/**
 * The scaffold has to obey the constitution it ships alongside: one that fails its
 * own `lint` on the first run teaches the reader that the rules are decorative,
 * and nothing written afterwards recovers from that.
 *
 * Several rules are scoped to exactly these directories, so this is the only place
 * they meet realistic files rather than fixtures built to trip them.
 */

const detection = { manager: 'npm', evidence: 'test', confident: true } as const;
const VERSION = '0.1.0-test';

/** Any npm invocation, which a bun project should never be shown. */
const NPM_COMMAND = new RegExp(String.raw`npx|npm (ci|run|install)`);

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cue-scaffold-'));
  writeFileSync(join(root, 'package.json'), '{"name":"demo","private":true}');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const options = (extra: Record<string, unknown> = {}) => ({
  projectRoot: root,
  detection,
  cueVersion: VERSION,
  env: {},
  home: root,
  ...extra,
});

function install(extra: Record<string, unknown> = {}): void {
  const opts = options(extra);
  runInit(opts, planInit(opts));
}

/** Every TypeScript file the scaffold wrote, at its repo-relative path. */
function scaffoldSources(): { path: string; text: string }[] {
  const manifest = readManifest(root);
  return (manifest?.files ?? [])
    .filter((f) => f.path.endsWith('.ts'))
    .map((f) => ({ path: f.path, text: readFileSync(join(root, f.path), 'utf8') }));
}

function violations(): Diagnostic[] {
  const rules = resolveRules(root);
  return [
    ...analyze({ files: scaffoldSources(), constitution: rules.constitution, tags: rules.tags })
      .diagnostics,
  ];
}

describe('the scaffold obeys its own constitution', () => {
  it('writes TypeScript files to analyse', () => {
    install();
    expect(scaffoldSources().length).toBeGreaterThan(4);
  });

  it('produces no violations at all', () => {
    install();
    const found = violations();
    // Named individually, so a failure says which rule and where.
    expect(found.map((d) => `${d.file}:${d.line} ${d.ruleId}`)).toEqual([]);
  });

  it('parses cleanly — an unparsed file is not a clean file', () => {
    install();
    const rules = resolveRules(root);
    const result = analyze({
      files: scaffoldSources(),
      constitution: rules.constitution,
      tags: rules.tags,
    });
    expect(result.skipped).toEqual([]);
  });
});

describe('the layout the scoped rules assume', () => {
  it.each([
    'playwright.config.ts',
    'fixtures/pom/test-options.ts',
    'fixtures/pom/page-object-fixture.ts',
    'fixtures/api/request-fixture.ts',
    'pages/app/login.page.ts',
    'tests/app/auth.setup.ts',
    'tests/app/functional/login.spec.ts',
    'test-data/static/util/invalid-values.ts',
    'env/.env.example',
    'TESTING.md',
    '.github/workflows/tests.yml',
    '.github/workflows/cue.yml',
    '.husky/pre-commit',
  ])('creates %s', (path) => {
    install();
    expect(existsSync(join(root, path))).toBe(true);
  });

  it('routes every spec through the single import point', () => {
    install();
    const spec = readFileSync(join(root, 'tests/app/functional/login.spec.ts'), 'utf8');
    expect(spec).toContain("from '../../../fixtures/pom/test-options.js'");
    // A second import of `@playwright/test` is the second way to reach a fixture.
    expect(spec).not.toContain("from '@playwright/test'");
  });

  it('keeps signed-in state and real env files out of git', () => {
    install();
    const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.auth/');
    expect(gitignore).toContain('env/.env.*');
    expect(gitignore).toContain('!env/.env.example');
  });

  it('excludes destructive tests unless explicitly allowed', () => {
    install();
    const config = readFileSync(join(root, 'playwright.config.ts'), 'utf8');
    expect(config).toContain('grepInvert');
    expect(config).toContain('@destructive');
  });
});

describe('--bare', () => {
  it('writes the rules without the suite skeleton', () => {
    install({ bare: true });
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(root, 'eslint.config.mjs'))).toBe(true);
    expect(existsSync(join(root, 'playwright.config.ts'))).toBe(false);
  });

  it('does not add Playwright entries to .gitignore', () => {
    install({ bare: true });
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).not.toContain('playwright-report/');
  });

  it('is not later handed a scaffold by sync', () => {
    install({ bare: true });
    // Read from the manifest, so a project that declined the scaffold keeps declining.
    const report = planSync(options());
    expect(report.changes.filter((c) => c.kind === 'create')).toEqual([]);
    expect(report.orphans).toEqual([]);
  });
});

describe('the scaffold speaks the package manager the project uses', () => {
  it.each([
    ['bun', 'bunx', 'bun install --frozen-lockfile', 'oven-sh/setup-bun'],
    ['pnpm', 'pnpm dlx', 'pnpm install --frozen-lockfile', 'cache: pnpm'],
    ['yarn', 'yarn dlx', 'yarn install --immutable', 'cache: yarn'],
    ['npm', 'npx', 'npm ci', 'cache: npm'],
  ])('renders %s commands', (manager, exec, installCommand, setupStep) => {
    const opts = options({ detection: { manager, evidence: 'test', confident: true } });
    runInit(opts, planInit(opts));

    const workflow = readFileSync(join(root, '.github/workflows/cue.yml'), 'utf8');
    const testing = readFileSync(join(root, 'TESTING.md'), 'utf8');

    expect(workflow).toContain(installCommand);
    expect(workflow).toContain(setupStep);
    expect(workflow).toContain(`${exec} eslint .`);
    expect(testing).toContain(`${exec} playwright test`);
  });

  it('never shows a bun project an npm command', () => {
    const opts = options({ detection: { manager: 'bun', evidence: 'test', confident: true } });
    runInit(opts, planInit(opts));

    const generated = ['.github/workflows/cue.yml', '.github/workflows/tests.yml', 'TESTING.md'];
    for (const path of generated) {
      const content = readFileSync(join(root, path), 'utf8');
      expect(content, path).not.toMatch(NPM_COMMAND);
    }
  });
});

describe('a scaffolded project stays current', () => {
  it('reports no drift immediately after init', () => {
    install();
    const report = planSync(options());
    expect(report.stale).toBe(0);
    expect(report.orphans).toEqual([]);
  });
});
