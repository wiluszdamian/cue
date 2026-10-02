import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { RunResult } from './execution.js';

/**
 * Running generated specs with the demo application's own Playwright, once, with
 * no retries: "passed on the first run" is the number, and a retry would hide it.
 */

const CONFIG = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\\.spec\\.ts$/,
  retries: 0,
  workers: 1,
  timeout: 15_000,
  reporter: [['json', { outputFile: 'results.json' }]],
  use: { baseURL: process.env['BENCH_BASE_URL'] },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
`;

const SHOWN = 3;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

interface JsonError {
  readonly message?: string;
}
interface JsonResult {
  readonly status?: string;
  readonly error?: JsonError;
  readonly errors?: readonly JsonError[];
}
interface JsonTest {
  readonly results?: readonly JsonResult[];
}
interface JsonSpec {
  readonly title?: string;
  readonly tests?: readonly JsonTest[];
}
interface JsonSuite {
  readonly specs?: readonly JsonSpec[];
  readonly suites?: readonly JsonSuite[];
}
export interface PlaywrightJsonReport {
  readonly suites?: readonly JsonSuite[];
  readonly errors?: readonly JsonError[];
  readonly stats?: {
    readonly expected?: number;
    readonly unexpected?: number;
    readonly flaky?: number;
    readonly skipped?: number;
  };
}

function firstLines(message: string | undefined): string {
  const lines = (message ?? 'failed with no message').replace(ANSI, '').split('\n');
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, 2)
    .join(' — ')
    .slice(0, 300);
}

function* specsOf(suites: readonly JsonSuite[] | undefined): Generator<JsonSpec> {
  for (const suite of suites ?? []) {
    yield* suite.specs ?? [];
    yield* specsOf(suite.suites);
  }
}

/** Playwright's JSON report as a `RunResult`. Pure, so it is tested without a browser. */
export function summarisePlaywrightReport(report: PlaywrightJsonReport): RunResult {
  const stats = report.stats ?? {};
  const passed = stats.expected ?? 0;
  const skipped = stats.skipped ?? 0;
  // With no retries a flaky test cannot occur; counted as a failure if one ever does.
  const failed = (stats.unexpected ?? 0) + (stats.flaky ?? 0);
  const loadErrors = report.errors ?? [];

  let timedOut = 0;
  const failures: string[] = [];
  for (const spec of specsOf(report.suites)) {
    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        if (result.status === 'timedOut') timedOut += 1;
        if (result.status === 'failed' || result.status === 'timedOut') {
          const message = result.error?.message ?? result.errors?.[0]?.message;
          failures.push(`${spec.title ?? 'test'}: ${firstLines(message)}`);
        }
      }
    }
  }
  for (const error of loadErrors) failures.push(firstLines(error.message));

  const status =
    failed > 0 || loadErrors.length > 0 ? 'failed' : passed > 0 ? 'passed' : 'did-not-run';
  return {
    status,
    total: passed + failed + skipped,
    passed,
    failed,
    timedOut,
    skipped,
    failures: failures.slice(0, SHOWN),
    ...(status === 'did-not-run' ? { note: 'no test ran' } : {}),
  };
}

export interface PlaywrightRun {
  readonly workspace: string;
  readonly demoRoot: string;
  /** Files written to the workspace, relative to it. */
  readonly specs: readonly string[];
  readonly baseUrl: string;
  readonly timeoutMs?: number;
}

const NOT_RUN = (note: string): RunResult => ({
  status: 'did-not-run',
  total: 0,
  passed: 0,
  failed: 0,
  timedOut: 0,
  skipped: 0,
  failures: [],
  note,
});

export function runPlaywright(options: PlaywrightRun): RunResult {
  const specs = options.specs.filter((file) => file.endsWith('.spec.ts'));
  if (specs.length === 0) return NOT_RUN('the answer contains no *.spec.ts file');

  writeFileSync(join(options.workspace, 'playwright.config.ts'), CONFIG, 'utf8');
  const cli = createRequire(join(options.demoRoot, 'package.json')).resolve('@playwright/test/cli');

  const result = spawnSync(
    process.execPath,
    [cli, 'test', '--config', 'playwright.config.ts', ...specs],
    {
      cwd: options.workspace,
      encoding: 'utf8',
      shell: false,
      timeout: options.timeoutMs ?? 180_000,
      env: { ...process.env, BENCH_BASE_URL: options.baseUrl, CI: '1', NO_COLOR: '1' },
    },
  );

  const reportPath = join(options.workspace, 'results.json');
  if (!existsSync(reportPath)) {
    const why = result.error?.message ?? `${result.stderr}${result.stdout}`;
    return {
      ...NOT_RUN('Playwright produced no report'),
      status: 'failed',
      failures: [firstLines(why)],
    };
  }
  return summarisePlaywrightReport(
    JSON.parse(readFileSync(reportPath, 'utf8')) as PlaywrightJsonReport,
  );
}
