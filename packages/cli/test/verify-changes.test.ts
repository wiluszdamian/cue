import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changedFiles, extract, workingTreeFiles } from '@wiluszdamian/cue-engine';
import { survey, type CaptureResult, type SnapshotDriver } from '../src/survey.js';
import { formatVerifyReport, verify, verifyExitCode } from '../src/verify.js';

/**
 * Age is not the only way a note goes stale: the code it was read from can change
 * the day after. These tests use a real product repository, a real `extract` and a
 * snapshot a real playwright-cli printed.
 */

const SNAPSHOTS = join(import.meta.dirname, '..', '..', 'engine', 'test', 'snapshots');
const real = (page: string): string =>
  readFileSync(join(SNAPSHOTS, 'playwright-cli@0.1.22', `${page}.txt`), 'utf8');
const serving = (pages: Record<string, string>): SnapshotDriver => ({
  capture(url): CaptureResult {
    const path = new URL(url).pathname;
    const page = pages[path];
    return page === undefined
      ? { ok: false, reason: `no such route: ${path}` }
      : { ok: true, output: page };
  },
});

const LOGIN_TSX = '<button data-testid="login-submit">Log in</button>\n';
const SIGNUP_TSX = '<button data-testid="signup-create">Create account</button>\n';

let product: string;
let project: string;

const git = (...args: string[]): void => {
  const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: product,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
};

function writeProduct(path: string, text: string): void {
  const full = join(product, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, 'utf8');
}

beforeEach(() => {
  product = mkdtempSync(join(tmpdir(), 'cue-product-'));
  project = mkdtempSync(join(tmpdir(), 'cue-project-'));

  git('init', '-q');
  writeProduct('app/Login.tsx', LOGIN_TSX);
  writeProduct('app/Signup.tsx', SIGNUP_TSX);
  git('add', '.');
  git('commit', '-q', '-m', 'one');

  // What a user does: extract the source, then survey the pages.
  extract({ projectRoot: project, sourceRoot: product });
  for (const [name, path] of [
    ['login', '/login'],
    ['signup', '/signup'],
  ] as const) {
    survey({
      projectRoot: project,
      url: `http://app.test${path}`,
      driver: serving({ [path]: real(name) }),
    });
  }
});

afterEach(() => {
  rmSync(product, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

const live = (): SnapshotDriver => serving({ '/login': real('login'), '/signup': real('signup') });

describe('code that changed since the map was made', () => {
  it('is not mentioned while nothing has changed', () => {
    const report = verify({ projectRoot: project, files: workingTreeFiles(product) });
    expect(report.counts.possiblyStale).toBe(0);
    expect(report.routes.every((route) => route.changes.length === 0)).toBe(true);
    expect(report.notes).toEqual([]);
  });

  it('marks the one route read from a changed file, and says which file', () => {
    writeProduct('app/Login.tsx', '<button data-testid="login-submit">Sign in</button>\n');
    const report = verify({ projectRoot: project, files: workingTreeFiles(product) });

    expect(report.counts.possiblyStale).toBe(1);
    const login = report.routes.find((route) => route.route === '/login');
    const signup = report.routes.find((route) => route.route === '/signup');
    expect(login?.changes).toHaveLength(1);
    expect(login?.changes[0]).toMatch(
      /^app\/Login\.tsx changed since it was confirmed \(\d{4}-\d{2}-\d{2}\)$/,
    );
    // An unrelated change must not invalidate everything.
    expect(signup?.changes).toEqual([]);

    const text = formatVerifyReport(report);
    expect(text).toContain('possibly stale 1');
    expect(text).toContain('possibly stale: app/Login.tsx changed since it was confirmed');
  });

  it('notices a file that is gone', () => {
    rmSync(join(product, 'app', 'Login.tsx'));
    const report = verify({ projectRoot: project, files: workingTreeFiles(product) });
    expect(report.routes.find((r) => r.route === '/login')?.changes[0]).toContain(
      'no longer exists',
    );
  });

  it('does not let a live check that still matches be doubted', () => {
    writeProduct('app/Login.tsx', 'rewritten\n');
    const report = verify({
      projectRoot: project,
      files: workingTreeFiles(product),
      baseUrl: 'http://app.test',
      driver: live(),
    });
    // The page still looks as recorded, whatever happened to the source behind it.
    expect(report.counts.possiblyStale).toBe(0);
    expect(report.overall).toBe('PASS');
  });

  it('makes the run PARTIAL when the route in doubt was not looked at', () => {
    writeProduct('app/Login.tsx', 'rewritten\n');
    const report = verify({
      projectRoot: project,
      files: workingTreeFiles(product),
      baseUrl: 'http://app.test',
      driver: live(),
      only: ['/signup'],
    });
    expect(report.counts).toMatchObject({ liveChecked: 1, liveSkipped: 1, possiblyStale: 1 });
    expect(report.overall).toBe('PARTIAL');
    expect(formatVerifyReport(report)).toContain('read from code that has changed since');
  });

  it('is PARTIAL on its own once everything was checked but one thing is in doubt only by change', () => {
    // Checked everything live except what the change reached: nothing is claimed about it.
    writeProduct('app/Login.tsx', 'rewritten\n');
    const report = verify({
      projectRoot: project,
      files: workingTreeFiles(product),
      baseUrl: 'http://app.test',
      driver: live(),
      only: ['/signup'],
    });
    expect(verifyExitCode(report, 'advisory')).toBe(0);
    expect(verifyExitCode(report, 'strict')).toBe(1);
  });

  it('says so, rather than staying quiet, when the product source cannot be found', () => {
    const report = verify({ projectRoot: project });
    expect(report.notes[0]).toContain('The product source was not found');
    expect(report.notes[0]).toContain('--source');
    expect(report.counts.possiblyStale).toBe(0);
    expect(formatVerifyReport(report)).toContain('! The product source was not found');
  });

  it('has nothing to say about routes that depend on no file', () => {
    // Surveyed with no extract: nothing was confirmed against the source.
    const bare = mkdtempSync(join(tmpdir(), 'cue-bare-'));
    try {
      survey({
        projectRoot: bare,
        url: 'http://app.test/login',
        driver: serving({ '/login': real('login') }),
      });
      const report = verify({ projectRoot: bare, files: workingTreeFiles(product) });
      expect(report.notes).toEqual([]);
      expect(report.counts.possiblyStale).toBe(0);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe('checking only what a change reaches', () => {
  function changeLogin(): string[] {
    writeProduct('app/Login.tsx', '<button data-testid="login-submit">Sign in</button>\n');
    git('add', '.');
    git('commit', '-q', '-m', 'two');
    const changed = changedFiles('HEAD~1..HEAD', product);
    if (!changed.ok) throw new Error(changed.reason);
    return changed.files;
  }

  it('checks the route whose source changed and leaves the rest alone, saying why', () => {
    const changedPaths = changeLogin();
    expect(changedPaths).toEqual(['app/Login.tsx']);

    const report = verify({
      projectRoot: project,
      files: workingTreeFiles(product),
      changedPaths,
      baseUrl: 'http://app.test',
      driver: live(),
    });

    expect(report.selection).toEqual({ changedFiles: 1, routes: ['/login'] });
    expect(report.routes.map((r) => [r.route, r.live])).toEqual([
      ['/login', 'unchanged'],
      ['/signup', 'not-checked'],
    ]);
    expect(report.routes.find((r) => r.route === '/signup')?.detail).toBe(
      'no changed file is one it was read from',
    );
    const text = formatVerifyReport(report);
    expect(text).toContain('1 changed file(s) reach 1 route(s): /login');
    // The rest was not looked at, and the verdict says so.
    expect(report.overall).toBe('PARTIAL');
  });

  it('says nothing surveyed depends on the change, and checks nothing, when that is so', () => {
    writeProduct('docs/readme.md', '# notes\n');
    git('add', '.');
    git('commit', '-q', '-m', 'docs');
    const changed = changedFiles('HEAD~1..HEAD', product);
    if (!changed.ok) throw new Error(changed.reason);

    const report = verify({
      projectRoot: project,
      files: workingTreeFiles(product),
      changedPaths: changed.files,
      baseUrl: 'http://app.test',
      driver: live(),
    });
    expect(report.selection).toEqual({ changedFiles: 1, routes: [] });
    expect(report.counts.liveChecked).toBe(0);
    expect(report.overall).toBe('NOT_VERIFIED');
    expect(formatVerifyReport(report)).toContain(
      'nothing surveyed depends on them, so nothing was checked',
    );
  });

  it('combines with --route: only the routes both ask for', () => {
    const changedPaths = changeLogin();
    const report = verify({
      projectRoot: project,
      files: workingTreeFiles(product),
      changedPaths,
      only: ['/signup'],
      baseUrl: 'http://app.test',
      driver: live(),
    });
    // /signup was asked for but is not reached; /login is reached but was not asked for.
    expect(report.counts.liveChecked).toBe(0);
  });

  it('with --refresh, records what the live check found for the routes it reached', () => {
    const changedPaths = changeLogin();
    verify({
      projectRoot: project,
      files: workingTreeFiles(product),
      changedPaths,
      baseUrl: 'http://app.test',
      driver: live(),
      refresh: true,
    });
    const saved = readFileSync(join(project, '.agent-kb', 'app-map', 'login.yaml'), 'utf8');
    expect(saved).toContain('schemaVersion: 2');
  });
});
