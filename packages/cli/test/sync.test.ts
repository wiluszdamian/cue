import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { countChanges, renderDiff } from '../src/diff.js';
import { planInit, runInit } from '../src/init.js';
import { readManifest } from '../src/manifest.js';
import {
  checkExitCode,
  formatSyncReport,
  NotInstalledError,
  planSync,
  runSync,
} from '../src/sync.js';

/**
 * `sync` is what a project runs when the constitution moves under it. The
 * ownership table lives in AGENTS.md, so a rule change leaves every project's
 * always-loaded layer stale until this runs: does it notice, and does it refuse
 * to trample edits.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const detection = { manager: 'pnpm', evidence: 'test', confident: true } as const;
const VERSION = '0.1.0-test';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'understudy-sync-'));
  writeFileSync(join(root, 'package.json'), '{"name":"demo","private":true}');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const options = (extra: Record<string, unknown> = {}) => ({
  projectRoot: root,
  detection,
  understudyVersion: VERSION,
  ...extra,
});

function install(): void {
  const init = { ...options(), env: {}, home: root, baselineOnly: true };
  runInit(init, planInit(init));
}

/** Its own `rules/`, which `resolveRules` prefers, so a test can move the source of truth. */
function withLocalRules(): void {
  cpSync(join(REPO_ROOT, 'rules'), join(root, 'rules'), { recursive: true });
}

function addTopic(): void {
  const path = join(root, 'rules', 'ownership.yaml');
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace(
      '  - topic: test data strategy',
      [
        '  - topic: flaky test triage',
        '    owner: understudy',
        '    precedence: absolute',
        '    skills: []',
        '    keywords: [flaky, quarantine, retry policy, unstable test]',
        '    note: A quarantined test with no linked issue is a bug in the process.',
        '',
        '  - topic: test data strategy',
      ].join('\n'),
    ),
  );
}

describe('sync', () => {
  it('refuses to run in a project that was never initialised', () => {
    expect(() => planSync(options())).toThrow(NotInstalledError);
  });

  it('reports nothing to do when the project is current', () => {
    withLocalRules();
    install();
    const report = planSync(options());
    expect(report.stale).toBe(0);
    expect(report.changes).toEqual([]);
    expect(checkExitCode(report)).toBe(0);
    expect(formatSyncReport(report, ['agents'])).toContain('Everything is current');
  });

  it('notices when the ownership table changes upstream', () => {
    withLocalRules();
    install();
    addTopic();

    const report = planSync(options());
    expect(report.stale).toBe(1);
    expect(checkExitCode(report)).toBe(1);

    const change = report.changes.find((c) => c.path === 'AGENTS.md');
    expect(change?.kind).toBe('update');
    expect(change?.diff).toContain('flaky test triage');
  });

  it('writes the new table when applied', () => {
    withLocalRules();
    install();
    addTopic();

    const result = runSync(options(), planSync(options()));
    expect(result.written).toEqual(['AGENTS.md']);
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('flaky test triage');
    expect(checkExitCode(planSync(options()))).toBe(0);
  });

  it('never changes which targets are installed', () => {
    withLocalRules();
    install();
    addTopic();
    runSync(options(), planSync(options()));
    // Adding a target is `add`; sync only regenerates what is already there.
    expect(readManifest(root)?.targets).toEqual(['agents']);
  });

  it('leaves a hand-edited file alone and says so', () => {
    withLocalRules();
    install();
    const path = join(root, 'AGENTS.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('## Testing conventions', '## Mine'));

    const report = planSync(options());
    expect(report.conflicts).toBe(1);
    expect(report.changes.find((c) => c.path === 'AGENTS.md')?.kind).toBe('conflict');

    runSync(options(), report);
    expect(readFileSync(path, 'utf8')).toContain('## Mine');
  });

  it('does not fail --check on a hand edit, only on real staleness', () => {
    withLocalRules();
    install();
    const path = join(root, 'AGENTS.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('## Testing conventions', '## Mine'));

    // A deliberate edit is a choice, not drift.
    expect(checkExitCode(planSync(options()))).toBe(0);
  });

  it('overwrites a hand edit under --force, and shows what it discards first', () => {
    withLocalRules();
    install();
    const path = join(root, 'AGENTS.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('## Testing conventions', '## Mine'));

    const forced = options({ force: true });
    const report = planSync(forced);
    const change = report.changes.find((c) => c.path === 'AGENTS.md');

    expect(change?.kind).toBe('update');
    expect(change?.diff).toContain('- ## Mine');
    // Regression: `stale` excluded conflicts, so --force silently did nothing.
    expect(report.stale).toBe(1);

    runSync(forced, report);
    expect(readFileSync(path, 'utf8')).not.toContain('## Mine');
  });

  it('preserves the user content outside a managed region', () => {
    withLocalRules();
    install();
    const path = join(root, 'AGENTS.md');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n## My own section\n`);
    addTopic();

    runSync(options({ force: true }), planSync(options({ force: true })));

    const content = readFileSync(path, 'utf8');
    expect(content).toContain('## My own section');
    expect(content).toContain('flaky test triage');
  });

  it('reports a file the installed targets no longer produce', () => {
    withLocalRules();
    install();

    // Simulate a file left behind by an older version of a target.
    const manifest = readManifest(root);
    writeFileSync(join(root, 'stale.md'), 'left behind\n');
    writeFileSync(
      join(root, '.understudy/install.json'),
      JSON.stringify(
        {
          ...manifest,
          files: [
            ...(manifest?.files ?? []),
            {
              path: 'stale.md',
              hash: 'a'.repeat(64),
              target: 'agents',
              kind: 'created',
              generatedBy: '0.0.1',
              writtenAt: new Date().toISOString(),
            },
          ],
        },
        null,
        2,
      ),
    );

    const report = planSync(options());
    expect(report.orphans.map((o) => o.path)).toEqual(['stale.md']);
    expect(report.changes.find((c) => c.path === 'stale.md')?.kind).toBe('orphan');
    // An orphan is reported, never deleted behind the user's back.
    expect(report.stale).toBe(0);
  });
});

describe('diff', () => {
  it('marks additions and removals', () => {
    const rendered = renderDiff('a\nb\nc\n', 'a\nB\nc\n');
    expect(rendered).toContain('- b');
    expect(rendered).toContain('+ B');
    expect(rendered).toContain('  a');
  });

  it('counts what changed', () => {
    expect(countChanges('a\nb\n', 'a\nb\nc\n')).toEqual({ added: 1, removed: 0 });
  });

  it('elides long unchanged stretches', () => {
    const before = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
    const after = `${before}\nnew tail`;
    const rendered = renderDiff(before, after);
    expect(rendered).toContain('…');
    expect(rendered.split('\n').length).toBeLessThan(20);
  });

  it('falls back to a summary rather than printing thousands of lines', () => {
    const huge = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join('\n');
    expect(renderDiff(huge, `${huge}\nx`)).toContain('too large to show');
  });
});
