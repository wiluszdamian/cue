import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readAllRouteMaps } from '@understudy/engine';
import { survey, SurveyError, type CaptureResult, type SnapshotDriver } from '../src/survey.js';
import { verifyMap } from '../src/verify-map.js';

/**
 * The survey seam: what the driver hands over, and what ends up in `.agent-kb`.
 * The snapshots are the ones a real @playwright/cli printed.
 */

const FIXTURES = join(import.meta.dirname, '..', '..', 'engine', 'test', 'snapshots');
const real = (page: string) =>
  readFileSync(join(FIXTURES, 'playwright-cli@0.1.22', `${page}.txt`), 'utf8');

const driverReturning = (result: CaptureResult): SnapshotDriver => ({ capture: () => result });

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'understudy-survey-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('survey', () => {
  it('maps a real login page', () => {
    const result = survey({
      projectRoot: root,
      url: 'http://127.0.0.1:4399/login',
      driver: driverReturning({ ok: true, output: real('login'), cliVersion: '0.1.22' }),
    });

    expect(result.route).toBe('/login');
    expect(result.map.elements.map((element) => element.locator)).toContain(
      "getByRole('button', { name: 'Log in' })",
    );
    expect(result.map.gaps.filter((gap) => gap.startsWith('Snapshot parser'))).toEqual([]);
  });

  it('writes nothing, and names the CLI version, when the format is not recognised', () => {
    expect.assertions(4);
    try {
      survey({
        projectRoot: root,
        url: 'http://x.test/login',
        driver: driverReturning({ ok: true, output: 'Error: something new', cliVersion: '9.9.9' }),
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SurveyError);
      expect((error as Error).message).toContain('playwright-cli 9.9.9');
      expect((error as Error).message).toContain('--from');
    }
    expect(existsSync(join(root, '.agent-kb'))).toBe(false);
  });

  it('records lines it did not understand as gaps instead of dropping them', () => {
    const login = real('login');
    const fence = login.lastIndexOf('```');
    const text = `${login.slice(0, fence)}<<< something new >>>\n${login.slice(fence)}`;
    const result = survey({
      projectRoot: root,
      url: 'http://127.0.0.1:4399/login',
      driver: driverReturning({ ok: true, output: text }),
    });

    expect(result.map.gaps).toContain('Snapshot parser: Unrecognised line: <<< something new >>>');
    expect(result.map.elements.length).toBeGreaterThan(0);
  });
});

describe('verify-map against an unrecognised format', () => {
  it('reports the route as unreachable instead of throwing or matching', () => {
    survey({
      projectRoot: root,
      url: 'http://127.0.0.1:4399/login',
      driver: driverReturning({ ok: true, output: real('login') }),
    });
    expect(readAllRouteMaps(root)).toHaveLength(1);

    const report = verifyMap({
      projectRoot: root,
      baseUrl: 'http://x.test',
      driver: driverReturning({ ok: true, output: '<html></html>', cliVersion: '9.9.9' }),
    });

    expect(report.verdicts[0]).toMatchObject({ route: '/login', kind: 'unreachable' });
    expect(report.verdicts[0]?.detail).toContain('playwright-cli 9.9.9');
    expect(report.unreachable).toBe(1);
  });
});
