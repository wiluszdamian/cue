import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeRouteMap, type KbElement, type RouteMap } from '@understudy/engine';
import {
  check,
  discoverFiles,
  formatCheck,
  formatHuman,
  locatorCheckExitCode,
  summaryLine,
  type CheckMode,
  type CheckReport,
} from '../src/check.js';
import { resolveRules } from '../src/init.js';

const NOW = new Date('2026-10-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number): string => new Date(NOW.getTime() - days * DAY).toISOString();

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'understudy-check-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path: string, text: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, 'utf8');
}

const el = (role: string, name: string): KbElement => ({
  role,
  name,
  locator: `getByRole('${role}', { name: '${name}' })`,
  confidence: 'runtime-only',
});

function survey(route: string, elements: KbElement[], days = 1): void {
  const map: RouteMap = {
    schemaVersion: 2,
    route,
    title: route,
    exploredAt: ago(days),
    verifiedAt: ago(days),
    snapshotHash: 'h',
    elements,
    links: [],
    gaps: [],
  };
  writeRouteMap(root, map);
}

/** A project that knows the login page. */
function knowsLogin(): void {
  survey('/login', [
    el('button', 'Log in'),
    el('textbox', 'Email'),
    el('textbox', 'Password'),
    el('link', 'Forgot password?'),
  ]);
}

const test = (lines: string[]): string =>
  [
    "import { test } from './fixtures';",
    "test('t', { tag: ['@smoke'] }, async ({ page }) => {",
    "  await page.goto('/login');",
    ...lines.map((line) => `  ${line}`),
    '});',
  ].join('\n');

const run = (targets: string[] = []) => check({ projectRoot: root, targets, now: NOW });

describe('discovering files', () => {
  beforeEach(() => {
    write('tests/a.spec.ts', 'export {};');
    write('tests/b.test.tsx', 'export {};');
    write('tests/helper.ts', 'export {};');
    write('pages/login-page.ts', '// understudy-route: /login\nexport {};');
    write('pages/plain-page.ts', 'export {};');
    write('node_modules/x/c.spec.ts', 'export {};');
    write('dist/d.spec.ts', 'export {};');
    write('types.d.ts', 'export {};');
  });

  it('by default takes test files and files that name their route', () => {
    expect(discoverFiles(root, [])).toEqual([
      'pages/login-page.ts',
      'tests/a.spec.ts',
      'tests/b.test.tsx',
    ]);
  });

  it('takes a file as given, even one that is not a test', () => {
    expect(discoverFiles(root, ['tests/helper.ts'])).toEqual(['tests/helper.ts']);
  });

  it('takes everything TypeScript in a directory', () => {
    expect(discoverFiles(root, ['tests'])).toEqual([
      'tests/a.spec.ts',
      'tests/b.test.tsx',
      'tests/helper.ts',
    ]);
  });

  it('takes a glob', () => {
    expect(discoverFiles(root, ['tests/**/*.spec.ts'])).toEqual(['tests/a.spec.ts']);
    expect(discoverFiles(root, ['**/*-page.ts'])).toEqual([
      'pages/login-page.ts',
      'pages/plain-page.ts',
    ]);
  });

  it('never looks inside node_modules, dist or .agent-kb', () => {
    const all = discoverFiles(root, ['**/*.ts']);
    expect(all.some((p) => p.startsWith('node_modules') || p.startsWith('dist'))).toBe(false);
    expect(all).not.toContain('types.d.ts');
  });

  it('says so when nothing matched', () => {
    const report = run(['nothing/**/*.ts']);
    expect(report.noFilesReason).toBe('Nothing matched nothing/**/*.ts.');
  });
});

describe('what it reports', () => {
  beforeEach(() => {
    knowsLogin();
  });

  it('flags an invented locator with the nearest real one and the command to run', () => {
    write(
      'tests/login.spec.ts',
      test(["await page.getByRole('button', { name: 'Sign in' }).click();"]),
    );
    const text = formatHuman(run(), NOW);

    expect(text).toContain('tests/login.spec.ts:4:14');
    expect(text).toContain("Unknown locator: getByRole('button', { name: 'Sign in' })");
    expect(text).toContain('Route: /login');
    expect(text).toContain("getByRole('button', { name: 'Log in' })  (/login)");
    expect(text).toContain('understudy survey <url>/login');
  });

  it('says when the match was last confirmed', () => {
    survey(
      '/login',
      [el('button', 'Log in'), el('textbox', 'Email'), el('textbox', 'Password')],
      2,
    );
    write('tests/login.spec.ts', test(["page.getByRole('textbox');"]));
    const text = formatHuman(run(), NOW);
    expect(text).toContain('Ambiguous locator');
    expect(text).toContain('Matches:');
    expect(text).toContain('Verified: 2 days ago');
  });

  it('stays quiet about what is fine, and says so', () => {
    write(
      'tests/login.spec.ts',
      test(["await page.getByRole('textbox', { name: 'Email' }).fill('x');"]),
    );
    const text = formatHuman(run(), NOW);
    expect(text).toContain('Every locator that can be judged is known.');
    expect(text).toContain('1 locator(s): 1 known, 0 undecidable (not judged)');
  });

  it('always shows what it did not judge, and why', () => {
    write('tests/login.spec.ts', test(["await page.getByText('Welcome').click();"]));
    const text = formatHuman(run(), NOW);
    expect(text).toContain('Not judged (the code alone cannot say):');
    expect(text).toContain(
      "getByText('Welcome') — getByText looks at something the knowledge base does not store",
    );
    expect(summaryLine(run())).toContain('1 undecidable (not judged)');
  });

  it('counts every verdict in the summary', () => {
    write(
      'tests/login.spec.ts',
      test([
        "page.getByRole('textbox', { name: 'Email' });",
        "page.getByRole('button', { name: 'Nope' });",
        "page.getByText('x');",
      ]),
    );
    expect(summaryLine(run())).toBe('3 locator(s): 1 known, 1 unknown, 1 undecidable (not judged)');
  });

  it('warns that unreadable knowledge files may explain the unknowns', () => {
    write('.agent-kb/app-map/broken.yaml', 'route: [unclosed');
    write('tests/login.spec.ts', test(["page.getByRole('button', { name: 'Nope' });"]));
    const text = formatHuman(run(), NOW);
    expect(text).toContain('broken.yaml could not be read');
    expect(text).toContain('some "unknown" findings may be this');
  });
});

describe('with nothing known', () => {
  beforeEach(() => {
    write('tests/login.spec.ts', test(["page.getByRole('button', { name: 'Anything' });"]));
  });

  it('says to extract and survey instead of listing every locator as unknown', () => {
    const text = formatHuman(run(), NOW);
    expect(text).toContain('Nothing is known about this application yet');
    expect(text).toContain('understudy extract --source <path>');
    expect(text).toContain('understudy survey <url>');
    expect(text).not.toContain('Unknown locator');
  });
});

describe('with no test files', () => {
  it('says which files it looks for', () => {
    const text = formatHuman(run(), NOW);
    expect(text).toContain('No test files found');
  });
});

describe('exit codes', () => {
  function reportFor(kind: string): CheckReport {
    if (kind !== 'empty-kb' && kind !== 'no-files') knowsLogin();
    if (kind === 'no-files') knowsLogin();
    const body: Record<string, string[]> = {
      known: ["page.getByRole('textbox', { name: 'Email' });"],
      unknown: ["page.getByRole('button', { name: 'Nope' });"],
      ambiguous: ["page.getByRole('textbox');"],
      'wrong-route': ["page.goto('/elsewhere'); page.getByRole('textbox', { name: 'Email' });"],
      undecidable: ["page.getByText('x');"],
      'empty-kb': ["page.getByRole('button', { name: 'Nope' });"],
      'no-files': [],
    };
    if (kind === 'wrong-route') survey('/elsewhere', [el('button', 'Other')]);
    if (kind === 'stale') survey('/login', [el('button', 'Log in')], 90);
    if (kind === 'stale') body[kind] = ["page.getByRole('button', { name: 'Log in' });"];
    if (kind !== 'no-files') write('tests/x.spec.ts', test(body[kind] ?? []));
    return run();
  }

  // [case, advisory, strict]
  const table: [string, number, number][] = [
    ['known', 0, 0],
    ['undecidable', 0, 0],
    ['unknown', 1, 1],
    ['wrong-route', 1, 1],
    ['ambiguous', 0, 1],
    ['stale', 0, 1],
    ['empty-kb', 0, 1],
    ['no-files', 0, 1],
  ];

  it.each(table)('%s → advisory %i, strict %i', (kind, advisory, strict) => {
    const report = reportFor(kind);
    const exit = (mode: CheckMode) => locatorCheckExitCode(report, mode);
    expect(exit('advisory')).toBe(advisory);
    expect(exit('strict')).toBe(strict);
  });
});

describe('formats', () => {
  beforeEach(() => {
    knowsLogin();
    write('tests/login.spec.ts', test(["page.getByRole('button', { name: 'Sign in' });"]));
  });
  const constitution = () => resolveRules(root).constitution;

  it('json is the report itself', () => {
    const parsed = JSON.parse(formatCheck(run(), 'json', constitution(), root)) as CheckReport;
    expect(parsed.counts.unknown).toBe(1);
    expect(parsed.files[0]?.findings[0]?.verdict).toBe('unknown');
  });

  it('github gives an annotation an editor can place', () => {
    const text = formatCheck(run(), 'github', constitution(), root);
    expect(text).toMatch(/^::error file=tests\/login\.spec\.ts,line=4,/);
    expect(text).toContain('understudy survey');
  });

  it('sarif names the rule and the place', () => {
    const sarif = JSON.parse(formatCheck(run(), 'sarif', constitution(), root)) as {
      runs: { results: { ruleId: string }[] }[];
    };
    expect(sarif.runs[0]?.results[0]?.ruleId).toBe('selectors-from-agent-kb');
  });

  it('agent reads the same as human: it is already written for a model', () => {
    expect(formatCheck(run(), 'agent', constitution(), root)).toBe(
      formatCheck(run(), 'human', constitution(), root),
    );
  });
});

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

describe.skipIf(!existsSync(CLI))('the built command', () => {
  const understudy = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'check', '--cwd', root, ...args], {
      encoding: 'utf8',
      input: '',
    });

  beforeEach(() => {
    knowsLogin();
    write('tests/login.spec.ts', test(["page.getByRole('button', { name: 'Sign in' });"]));
  });

  it('informs and exits 0 without --ci', () => {
    const result = understudy();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Unknown locator');
  });

  it('fails the build on an invented locator with --ci', () => {
    expect(understudy('--ci').status).toBe(1);
    expect(understudy('--ci=advisory').status).toBe(1);
  });

  it('rejects a mode or a format it does not know', () => {
    expect(understudy('--ci=lenient').status).toBe(2);
    expect(understudy('--format=xml').status).toBe(2);
  });

  it('checks the file it is given', () => {
    write('other/ok.spec.ts', test(["page.getByRole('textbox', { name: 'Email' });"]));
    const result = understudy('other/ok.spec.ts', '--ci');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('1 known');
  });
});
