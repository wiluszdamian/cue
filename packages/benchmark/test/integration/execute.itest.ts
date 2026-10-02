import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRules, writeRouteMap } from '@wiluszdamian/cue-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Agent, AgentResponse } from '../../src/agent.js';
import { DemoExecutor } from '../../src/executor.js';
import { PROMPTS_V2 } from '../../src/prompts.js';
import { formatReport } from '../../src/report.js';
import { runBenchmark } from '../../src/runner.js';

/**
 * The real thing: generated tests compiled with the project's compiler and run by
 * Playwright in a browser against the demo application. Needs Chromium
 * (`pnpm --filter @wiluszdamian/cue-demo-app exec playwright install chromium`), so it
 * is not part of `pnpm test`; run it with `pnpm --filter @wiluszdamian/cue-benchmark test:integration`.
 *
 * The answers below are hand-written fixtures, not model output: they show the
 * harness tells a test that works from one that does not, and nothing more.
 */

const REPO = join(import.meta.dirname, '..', '..', '..', '..');
const DEMO = join(REPO, 'examples', 'demo-app');

const LOGIN_SPEC = `import { test, expect } from '@playwright/test';

test('a valid user reaches the dashboard', { tag: ['@smoke'] }, async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@demo.test');
  await page.getByLabel('Password').fill('user-pass');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Sam' })).toBeVisible();
});
`;

const INVENTED_SPEC = LOGIN_SPEC.replace(
  "page.getByRole('button', { name: 'Log in' }).click()",
  "page.getByRole('button', { name: 'Sign in now' }).click({ timeout: 1500 })",
);

const BROKEN_TYPES_SPEC = `import { test } from '@playwright/test';
const count: number = 'three';
test('x', { tag: ['@smoke'] }, async ({ page }) => {
  await page.goto('/login');
  void count;
});
`;

let knowledge: string;
const executor = new DemoExecutor({ demoRoot: DEMO });

beforeAll(() => {
  knowledge = mkdtempSync(join(tmpdir(), 'cue-bench-int-'));
  const at = new Date().toISOString();
  writeRouteMap(knowledge, {
    schemaVersion: 2,
    route: '/login',
    title: 'Sign in',
    exploredAt: at,
    verifiedAt: at,
    snapshotHash: 'h',
    links: [],
    gaps: [],
    elements: [
      {
        role: 'textbox',
        name: 'Email',
        locator: "getByRole('textbox', { name: 'Email' })",
        confidence: 'runtime-only',
      },
      {
        role: 'textbox',
        name: 'Password',
        locator: "getByRole('textbox', { name: 'Password' })",
        confidence: 'runtime-only',
      },
      {
        role: 'button',
        name: 'Log in',
        locator: "getByRole('button', { name: 'Log in' })",
        confidence: 'runtime-only',
      },
    ],
  });
  writeRouteMap(knowledge, {
    schemaVersion: 2,
    route: '/dashboard',
    title: 'Dashboard',
    exploredAt: at,
    verifiedAt: at,
    snapshotHash: 'h2',
    links: [],
    gaps: [],
    elements: [
      {
        role: 'heading',
        name: 'Welcome back, Sam',
        locator: "getByRole('heading', { name: 'Welcome back, Sam', level: 1 })",
        confidence: 'runtime-only',
      },
    ],
  });
});

afterAll(async () => {
  await executor.close();
  rmSync(knowledge, { recursive: true, force: true });
});

const run = (name: string, source: string) =>
  executor.execute({
    promptId: name,
    condition: 'bare',
    files: [{ path: `tests/app/functional/${name}.spec.ts`, source }],
  });

describe('a generated test, run for real', () => {
  it('compiles and passes when it is right', async () => {
    const result = await run('works', LOGIN_SPEC);
    expect(result.compile.ok, result.compile.errors.join('\n')).toBe(true);
    expect(result.run).toMatchObject({ status: 'passed', passed: 1, failed: 0 });
  }, 60_000);

  it('fails, and says why, when it names a button that is not there', async () => {
    const result = await run('invented', INVENTED_SPEC);
    expect(result.compile.ok).toBe(true);
    expect(result.run.status).toBe('failed');
    expect(result.run.failed).toBe(1);
    expect(result.run.failures.join(' ')).toMatch(/Sign in now|Timeout/);
  }, 60_000);

  it('does not compile with a type error, but is still run: compiling and passing are separate', async () => {
    const result = await run('types', BROKEN_TYPES_SPEC);
    expect(result.compile.ok).toBe(false);
    expect(result.compile.errors[0]).toContain('TS2322');
    expect(result.run.status).toBe('passed');
  }, 60_000);

  it('does not run a file that is not a spec', async () => {
    const result = await executor.execute({
      promptId: 'no-spec',
      condition: 'bare',
      files: [{ path: 'pages/login.ts', source: 'export const x = 1;\n' }],
    });
    expect(result.run).toMatchObject({ status: 'did-not-run', total: 0 });
  }, 60_000);

  it('refuses a path that leaves the workspace and writes nothing', async () => {
    const result = await executor.execute({
      promptId: 'escape',
      condition: 'bare',
      files: [{ path: '../../escaped.spec.ts', source: LOGIN_SPEC }],
    });
    expect(result.compile.ok).toBe(false);
    expect(result.compile.errors[0]).toContain('Refusing to write');
    expect(result.run.status).toBe('did-not-run');
  }, 60_000);

  it('fails against an application with a defect switched on', async () => {
    const result = await executor.execute({
      promptId: 'mutated',
      condition: 'bare',
      files: [{ path: 'tests/app/functional/mutated.spec.ts', source: LOGIN_SPEC }],
      mutation: 'login-button-renamed',
    });
    expect(result.run.status).toBe('failed');
  }, 60_000);
});

describe('a whole run', () => {
  const answers: Record<string, string> = {
    'bare/demo-login': INVENTED_SPEC,
    'cue/demo-login': LOGIN_SPEC,
  };
  const agent: Agent = {
    name: 'fixture',
    run(request): Promise<AgentResponse> {
      return Promise.resolve({
        promptId: request.prompt.id,
        condition: request.condition,
        model: 'fixture',
        code: answers[`${request.condition}/${request.prompt.id}`] ?? '',
      });
    },
  };

  it('tells the answer that works from the one that does not, in both numbers', async () => {
    const result = await runBenchmark({
      projectRoot: knowledge,
      agent,
      rules: loadRules(join(REPO, 'rules')),
      prompts: PROMPTS_V2.filter((prompt) => prompt.id === 'demo-login'),
      promptSetVersion: 2,
      executor,
    });
    const [bare, cue] = result.conditions;

    expect(bare?.execution).toMatchObject({ samples: 1, passedFirstRun: 0, failedRun: 1 });
    expect(cue?.execution).toMatchObject({ samples: 1, passedFirstRun: 1, failedRun: 0 });
    // The invented button is also caught before anything runs.
    expect(bare?.locators).toMatchObject({ unknown: 1, known: 2 });
    expect(bare?.locators?.invalidLocators[0]).toContain('Sign in now');
    // The welcome heading is real, on the dashboard. The checker only knows the test
    // went to /login, since it does not follow the click that leads to /dashboard, so
    // it calls the heading a wrong-route locator. That is a limit of the checker, and
    // it is why "wrong route" is reported apart from "invented".
    expect(cue?.locators).toMatchObject({ unknown: 0, wrongRoute: 1, known: 3 });

    // demo-login names the defect auth-silent-fail. The answer that failed on the correct
    // application has nothing to break; the one that passed stops passing once login
    // silently does nothing, which is what a good test of login should do.
    expect(bare?.mutations).toEqual({ eligible: 1, detected: 0, missed: 0, notApplicable: 1 });
    expect(cue?.mutations).toEqual({
      eligible: 1,
      detected: 1,
      missed: 0,
      notApplicable: 0,
    });

    const text = formatReport(result);
    expect(text).toContain('passed first run 0/1');
    expect(text).toContain('passed first run 1/1');
    expect(text).toContain('Caught the defect put into the application');
  }, 180_000);
});
