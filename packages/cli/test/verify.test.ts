import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRouteMap } from '@understudy/engine';
import { survey, type CaptureResult, type SnapshotDriver } from '../src/survey.js';
import {
  computeOverall,
  formatVerifyReport,
  verify,
  verifyExitCode,
  type Overall,
  type VerifyCounts,
} from '../src/verify.js';

/**
 * `verify` makes one promise: it says the map matches the application only when
 * the application was looked at. Every test below is a way of checking that the
 * sentence is not available for free.
 */

const SNAPSHOTS = join(import.meta.dirname, '..', '..', 'engine', 'test', 'snapshots');
const real = (page: string) =>
  readFileSync(join(SNAPSHOTS, 'playwright-cli@0.1.22', `${page}.txt`), 'utf8');

const BASE = 'http://app.test';
const DAY = 24 * 60 * 60 * 1000;

/** Serves a snapshot per path, the way a running application would. */
function app(pages: Record<string, CaptureResult>): SnapshotDriver {
  return {
    capture(url) {
      const path = new URL(url).pathname;
      return pages[path] ?? { ok: false, reason: `no such route: ${path}` };
    },
  };
}
const page = (name: string): CaptureResult => ({ ok: true, output: real(name) });

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'understudy-verify-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Maps a real page into the knowledge base, as if surveyed `daysAgo` days ago. */
function surveyed(name: string, path: string, daysAgo = 0): void {
  survey({
    projectRoot: root,
    url: `${BASE}${path}`,
    driver: app({ [path]: page(name) }),
    now: new Date(Date.now() - daysAgo * DAY),
  });
}

describe('computeOverall', () => {
  const none: VerifyCounts = {
    total: 0,
    liveChecked: 0,
    liveSkipped: 0,
    drifted: 0,
    unreachable: 0,
    fresh: 0,
    ageing: 0,
    stale: 0,
    invalid: 0,
  };
  const cases: [string, Partial<VerifyCounts>, Overall][] = [
    ['nothing at all', {}, 'EMPTY'],
    ['only an unreadable file', { invalid: 1 }, 'FAIL'],
    ['no live check', { total: 2, liveSkipped: 2 }, 'NOT_VERIFIED'],
    ['some checked, some not', { total: 2, liveChecked: 1, liveSkipped: 1 }, 'PARTIAL'],
    ['all checked but one stale', { total: 2, liveChecked: 2, stale: 1 }, 'PARTIAL'],
    ['all checked and fine', { total: 2, liveChecked: 2 }, 'PASS'],
    ['drift beats everything', { total: 2, liveChecked: 2, drifted: 1 }, 'FAIL'],
    ['unreachable beats not verified', { total: 1, unreachable: 1 }, 'FAIL'],
  ];

  it.each(cases)('%s', (_name, partial, expected) => {
    expect(computeOverall({ ...none, ...partial })).toBe(expected);
  });
});

describe('nothing verified', () => {
  it('reports an empty knowledge base as such', () => {
    const report = verify({ projectRoot: root });
    expect(report.overall).toBe('EMPTY');
    expect(formatVerifyReport(report)).toContain('Nothing to verify');
  });

  it('never claims a match when no environment was given', () => {
    surveyed('login', '/login');
    surveyed('signup', '/signup');

    const report = verify({ projectRoot: root });
    const text = formatVerifyReport(report);

    expect(report.overall).toBe('NOT_VERIFIED');
    expect(report.counts).toMatchObject({ total: 2, liveChecked: 0, liveSkipped: 2 });
    expect(text).toContain('NOT VERIFIED');
    expect(text).toContain('says nothing about whether the map matches it');
    expect(text).not.toContain('PASS');
    expect(text).not.toContain('every route was checked');
    // The old report said exactly this, with nothing looked at.
    expect(text).not.toContain('The map matches the application');
  });

  it('shows freshness as its own thing, from age alone', () => {
    surveyed('login', '/login', 60);
    const report = verify({ projectRoot: root });
    expect(report.routes[0]).toMatchObject({ freshness: 'stale', live: 'not-checked' });
    expect(formatVerifyReport(report)).toContain('says nothing about the application');
  });
});

describe('live verification', () => {
  it('passes only when every route was checked and matches', () => {
    surveyed('login', '/login');
    surveyed('signup', '/signup');

    const report = verify({
      projectRoot: root,
      baseUrl: BASE,
      driver: app({ '/login': page('login'), '/signup': page('signup') }),
    });

    expect(report.overall).toBe('PASS');
    expect(report.counts).toMatchObject({ liveChecked: 2, liveSkipped: 0, drifted: 0 });
    expect(formatVerifyReport(report)).toContain('PASS — every route was checked');
  });

  it('is PARTIAL when only some routes were checked, and says which were not', () => {
    surveyed('login', '/login');
    surveyed('signup', '/signup');

    const report = verify({
      projectRoot: root,
      baseUrl: BASE,
      driver: app({ '/login': page('login'), '/signup': page('signup') }),
      only: ['/login'],
    });
    const text = formatVerifyReport(report);

    expect(report.overall).toBe('PARTIAL');
    expect(report.routes.map((r) => [r.route, r.live])).toEqual([
      ['/login', 'unchanged'],
      ['/signup', 'not-checked'],
    ]);
    expect(text).toContain('PARTIAL');
    expect(text).toContain('1 route(s) were not checked; nothing is claimed about them.');
    expect(text).not.toContain('PASS');
  });

  it('counts a route the application just confirmed as not stale, whatever its age', () => {
    surveyed('login', '/login', 60);
    const report = verify({
      projectRoot: root,
      baseUrl: BASE,
      driver: app({ '/login': page('login') }),
    });
    expect(report.routes[0]).toMatchObject({ freshness: 'stale', live: 'unchanged' });
    expect(report.counts.stale).toBe(0);
    expect(report.overall).toBe('PASS');
  });

  it('fails on drift and names what is gone', () => {
    surveyed('login', '/login');
    const report = verify({
      projectRoot: root,
      baseUrl: BASE,
      // The route now serves a different page.
      driver: app({ '/login': page('signup') }),
    });

    expect(report.overall).toBe('FAIL');
    expect(report.routes[0]?.live).toBe('drifted');
    expect(report.routes[0]?.missing).toContain("getByRole('button', { name: 'Log in' })");
    expect(formatVerifyReport(report)).toContain("gone: getByRole('button', { name: 'Log in' })");
  });

  it('fails when a route cannot be reached', () => {
    surveyed('login', '/login');
    const report = verify({ projectRoot: root, baseUrl: BASE, driver: app({}) });
    expect(report.overall).toBe('FAIL');
    expect(report.routes[0]).toMatchObject({ live: 'unreachable' });
  });

  it('fails on an unreadable file instead of leaving it out', () => {
    surveyed('login', '/login');
    mkdirSync(join(root, '.agent-kb', 'app-map'), { recursive: true });
    writeFileSync(join(root, '.agent-kb', 'app-map', 'broken.yaml'), 'route: [unclosed', 'utf8');

    const report = verify({
      projectRoot: root,
      baseUrl: BASE,
      driver: app({ '/login': page('login') }),
    });

    expect(report.overall).toBe('FAIL');
    expect(report.invalidFiles).toHaveLength(1);
    expect(report.invalidFiles[0]?.path).toContain('broken.yaml');
    expect(formatVerifyReport(report)).toContain('[invalid]');
  });
});

describe('--refresh', () => {
  it('records the verification for routes that were checked and unchanged', () => {
    surveyed('login', '/login', 60);
    const before = readRouteMap(root, '/login')?.map.verifiedAt;

    const report = verify({
      projectRoot: root,
      baseUrl: BASE,
      driver: app({ '/login': page('login') }),
      refresh: true,
    });

    expect(report.routes[0]?.freshness).toBe('fresh');
    expect(readRouteMap(root, '/login')?.map.verifiedAt).not.toBe(before);
  });

  it('leaves routes that were not checked, drifted or unreachable alone', () => {
    surveyed('login', '/login', 60);
    surveyed('signup', '/signup', 60);
    const signupBefore = readRouteMap(root, '/signup')?.map.verifiedAt;
    const loginBefore = readRouteMap(root, '/login')?.map.verifiedAt;

    verify({
      projectRoot: root,
      baseUrl: BASE,
      driver: app({ '/login': page('signup'), '/signup': page('signup') }),
      refresh: true,
      only: ['/login'],
    });

    // /login drifted (it was served the sign-up page); /signup was not selected.
    expect(readRouteMap(root, '/login')?.map.verifiedAt).toBe(loginBefore);
    expect(readRouteMap(root, '/signup')?.map.verifiedAt).toBe(signupBefore);
  });
});

describe('--refresh writes what the check learned', () => {
  it('marks an element the page lost as stale, and keeps it', () => {
    surveyed('login', '/login');
    const report = verify({
      projectRoot: root,
      baseUrl: BASE,
      driver: app({ '/login': page('signup') }),
      refresh: true,
      environment: 'staging',
    });
    expect(report.overall).toBe('FAIL');

    const map = readRouteMap(root, '/login')?.map;
    const logIn = map?.elements.find((e) => e.name === 'Log in');
    expect(logIn?.status).toBe('stale');
    expect(map?.elements.length).toBeGreaterThan(1);
  });

  it('does not touch the files without --refresh', () => {
    surveyed('login', '/login');
    const before = readFileSync(join(root, '.agent-kb', 'app-map', 'login.yaml'), 'utf8');
    verify({ projectRoot: root, baseUrl: BASE, driver: app({ '/login': page('signup') }) });
    expect(readFileSync(join(root, '.agent-kb', 'app-map', 'login.yaml'), 'utf8')).toBe(before);
  });

  it('records the environment name with the new observation, never an address', () => {
    surveyed('login', '/login', 60);
    verify({
      projectRoot: root,
      baseUrl: BASE,
      driver: app({ '/login': { ok: true, output: real('login'), cliVersion: '0.1.22' } }),
      refresh: true,
      environment: 'staging',
    });
    const written = readFileSync(join(root, '.agent-kb', 'app-map', 'login.yaml'), 'utf8');
    expect(written).toContain('environment: staging');
    expect(written).toContain('version: 0.1.22');
    expect(written).not.toContain('app.test');
  });
});

describe('CI exit codes', () => {
  function reportFor(overall: Overall) {
    surveyed('login', '/login');
    switch (overall) {
      case 'EMPTY':
        return verify({ projectRoot: mkdtempSync(join(tmpdir(), 'understudy-empty-')) });
      case 'NOT_VERIFIED':
        return verify({ projectRoot: root });
      case 'PASS':
        return verify({
          projectRoot: root,
          baseUrl: BASE,
          driver: app({ '/login': page('login') }),
        });
      case 'FAIL':
        return verify({ projectRoot: root, baseUrl: BASE, driver: app({}) });
      case 'PARTIAL':
        surveyed('signup', '/signup');
        return verify({
          projectRoot: root,
          baseUrl: BASE,
          driver: app({ '/login': page('login') }),
          only: ['/login'],
        });
    }
  }

  // [overall, advisory, strict]
  const table: [Overall, number, number][] = [
    ['PASS', 0, 0],
    ['PARTIAL', 0, 1],
    ['NOT_VERIFIED', 0, 1],
    ['EMPTY', 0, 1],
    ['FAIL', 1, 1],
  ];

  it.each(table)('%s → advisory %i, strict %i', (overall, advisory, strict) => {
    const report = reportFor(overall);
    expect(report.overall).toBe(overall);
    expect(verifyExitCode(report, 'advisory')).toBe(advisory);
    expect(verifyExitCode(report, 'strict')).toBe(strict);
  });
});

describe('the report as data', () => {
  it('serialises for --json', () => {
    surveyed('login', '/login');
    const report = verify({ projectRoot: root });
    const parsed = JSON.parse(JSON.stringify(report)) as { overall: string; routes: unknown[] };
    expect(parsed.overall).toBe('NOT_VERIFIED');
    expect(parsed.routes).toHaveLength(1);
  });
});
