import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { indexKnowledge, loadKnowledge, loadRules, writeRouteMap } from '@understudy/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Agent, AgentResponse } from '../src/agent.js';
import { compileFiles } from '../src/compile.js';
import type { ExecutionInput, ExecutionResult, Executor } from '../src/execution.js';
import { summarisePlaywrightReport } from '../src/playwright-run.js';
import { PROMPTS_V1, PROMPTS_V2, promptSet, PROMPT_SET_V2_VERSION } from '../src/prompts.js';
import { formatReport } from '../src/report.js';
import { runBenchmark } from '../src/runner.js';
import { scoreLocators } from '../src/scoring.js';
import { safeWorkspacePath, UnsafePathError, writeWorkspace } from '../src/workspace.js';

/**
 * The execution layer, without a browser: how answers are placed on disk, compiled
 * and summarised, and how the runner uses an executor. The real thing — Playwright
 * against the running demo application — is in test/integration.
 */

const REPO = join(import.meta.dirname, '..', '..', '..');
const DEMO = join(REPO, 'examples', 'demo-app');
const rules = loadRules(join(REPO, 'rules'));

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'understudy-exec-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('prompt set 2', () => {
  it('is a set of its own, found by version', () => {
    expect(promptSet(PROMPT_SET_V2_VERSION)?.prompts).toBe(PROMPTS_V2);
    expect(promptSet(1)?.prompts).toBe(PROMPTS_V1);
    expect(promptSet(99)).toBeUndefined();
  });

  it('has unique ids, none shared with set 1 (a recording is named by prompt id)', () => {
    const ids = PROMPTS_V2.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(PROMPTS_V1.map((p) => p.id)).not.toContain(id);
  });

  it('is about the demo application, and runs against it', () => {
    for (const prompt of PROMPTS_V2) expect(prompt.app).toBe('demo');
  });

  it('only asks for defects the demo application has', () => {
    const mutations = readFileSync(join(DEMO, 'mutations.mjs'), 'utf8');
    for (const prompt of PROMPTS_V2) {
      if (prompt.mutation !== undefined) {
        expect(mutations, `${prompt.id} names ${prompt.mutation}`).toContain(
          `'${prompt.mutation}'`,
        );
      }
    }
    expect(PROMPTS_V2.filter((p) => p.mutation !== undefined).length).toBeGreaterThanOrEqual(2);
  });

  it('never hints at the rules it is measuring, and exercises rules that exist', () => {
    const known = new Set(rules.constitution.rules.map((r) => r.id));
    for (const prompt of PROMPTS_V2) {
      const text = prompt.text.toLowerCase();
      for (const giveaway of ['understudy', 'constitution', 'page object', '@smoke', 'tag the']) {
        expect(text, `${prompt.id} mentions "${giveaway}"`).not.toContain(giveaway);
      }
      for (const ruleId of prompt.exercises) expect(known.has(ruleId)).toBe(true);
    }
  });
});

describe('where a model’s files may go', () => {
  it.each([
    ['../outside.spec.ts', 'leaves the workspace'],
    ['tests/../../outside.spec.ts', 'leaves the workspace'],
    ['/etc/passwd', 'absolute'],
    ['C:\\Windows\\x.spec.ts', 'absolute'],
    ['C:/Windows/x.spec.ts', 'absolute'],
    ['', 'empty'],
    ['playwright.config.ts', 'belongs to the harness'],
    ['package.json', 'belongs to the harness'],
    ['results.json', 'belongs to the harness'],
    ['.', 'leaves the workspace'],
  ])('refuses %j', (path, reason) => {
    expect(() => safeWorkspacePath(dir, path)).toThrow(UnsafePathError);
    expect(() => safeWorkspacePath(dir, path)).toThrow(reason);
  });

  it('accepts ordinary paths, with either kind of separator', () => {
    expect(safeWorkspacePath(dir, 'tests/app/a.spec.ts')).toBe(
      join(dir, 'tests', 'app', 'a.spec.ts'),
    );
    expect(safeWorkspacePath(dir, 'tests\\app\\a.spec.ts')).toBe(
      join(dir, 'tests', 'app', 'a.spec.ts'),
    );
    expect(safeWorkspacePath(dir, 'pages/playwright.config.ts')).toBe(
      join(dir, 'pages', 'playwright.config.ts'),
    );
  });

  it('writes all of the files, or none', () => {
    expect(() =>
      writeWorkspace(dir, [
        { path: 'tests/a.spec.ts', source: 'a' },
        { path: '../b.spec.ts', source: 'b' },
      ]),
    ).toThrow(UnsafePathError);
    expect(() => readFileSync(join(dir, 'tests', 'a.spec.ts'))).toThrow();

    const written = writeWorkspace(dir, [{ path: 'tests/a.spec.ts', source: 'a' }]);
    expect(written).toEqual(['tests/a.spec.ts']);
    expect(readFileSync(join(dir, 'tests', 'a.spec.ts'), 'utf8')).toBe('a');
  });
});

describe('compiling generated tests', () => {
  /** Inside the demo app, as the executor does, so its Playwright types resolve. */
  function workspace(): string {
    const parent = join(DEMO, '.benchmark');
    mkdirSync(parent, { recursive: true });
    return mkdtempSync(join(parent, 'compile-'));
  }

  const compile = (files: Record<string, string>) => {
    const root = workspace();
    try {
      const written = writeWorkspace(
        root,
        Object.entries(files).map(([path, source]) => ({ path, source })),
      );
      return compileFiles(root, written, DEMO);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it('accepts a test written against Playwright’s real API', () => {
    const result = compile({
      'tests/a.spec.ts':
        "import { test, expect } from '@playwright/test';\n" +
        "test('x', async ({ page }) => { await page.goto('/login'); await expect(page).toHaveURL(/login/); });\n",
    });
    expect(result).toEqual({ ok: true, errors: [], filesChecked: 1 });
  });

  it('rejects a type error, saying where', () => {
    const result = compile({
      'tests/a.spec.ts':
        "import { test } from '@playwright/test';\nconst n: number = 'nope';\ntest('x', async () => { void n; });\n",
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/^tests\/a\.spec\.ts\(2,\d+\): TS2322/);
  });

  it('rejects a method Playwright does not have', () => {
    const result = compile({
      'tests/a.spec.ts':
        "import { test } from '@playwright/test';\ntest('x', async ({ page }) => { await page.clickTheButton('Log in'); });\n",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('clickTheButton');
  });

  it('rejects an import of something that is not there', () => {
    const result = compile({
      'tests/a.spec.ts': "import { loginPage } from '../pages/login-page';\nvoid loginPage;\n",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Cannot find module');
  });

  it('follows an import between the files of one answer', () => {
    const result = compile({
      'pages/login.ts': "export const path = '/login';\n",
      'tests/a.spec.ts': "import { path } from '../pages/login';\nvoid path;\n",
    });
    expect(result.ok).toBe(true);
    expect(result.filesChecked).toBe(2);
  });

  it('has nothing to check when the answer holds no TypeScript', () => {
    expect(compile({ 'notes.md': 'hello' })).toEqual({ ok: true, errors: [], filesChecked: 0 });
  });
});

describe('reading Playwright’s report', () => {
  const failing = {
    stats: { expected: 1, unexpected: 2, flaky: 0, skipped: 1 },
    suites: [
      {
        specs: [
          { title: 'passes', tests: [{ results: [{ status: 'passed' }] }] },
          {
            title: 'cannot find it',
            tests: [
              {
                results: [
                  {
                    status: 'timedOut',
                    error: {
                      message:
                        '\u001b[31mTimeout 2000ms exceeded.\u001b[39m\nwaiting for getByRole',
                    },
                  },
                ],
              },
            ],
          },
        ],
        suites: [
          {
            specs: [
              {
                title: 'wrong text',
                tests: [
                  {
                    results: [
                      { status: 'failed', errors: [{ message: 'Expected: "a"\nReceived: "b"' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it('counts what passed, failed, timed out and was skipped', () => {
    expect(summarisePlaywrightReport(failing)).toMatchObject({
      status: 'failed',
      total: 4,
      passed: 1,
      failed: 2,
      timedOut: 1,
      skipped: 1,
    });
  });

  it('keeps the first lines of each failure, without colour codes', () => {
    const { failures } = summarisePlaywrightReport(failing);
    expect(failures).toEqual([
      'cannot find it: Timeout 2000ms exceeded. — waiting for getByRole',
      'wrong text: Expected: "a" — Received: "b"',
    ]);
  });

  it('is passed when something passed and nothing failed', () => {
    expect(
      summarisePlaywrightReport({ stats: { expected: 3, unexpected: 0, skipped: 0 } }).status,
    ).toBe('passed');
  });

  it('is did-not-run when nothing ran at all, which is not a pass', () => {
    const result = summarisePlaywrightReport({ stats: { expected: 0, unexpected: 0, skipped: 0 } });
    expect(result).toMatchObject({ status: 'did-not-run', total: 0, note: 'no test ran' });
  });

  it('is failed when the file would not even load', () => {
    const result = summarisePlaywrightReport({
      stats: { expected: 0, unexpected: 0 },
      errors: [{ message: 'SyntaxError: Unexpected token' }],
    });
    expect(result.status).toBe('failed');
    expect(result.failures).toEqual(['SyntaxError: Unexpected token']);
  });

  it('counts a flaky test as a failure: there are no retries to excuse it', () => {
    expect(
      summarisePlaywrightReport({ stats: { expected: 1, unexpected: 0, flaky: 1 } }).status,
    ).toBe('failed');
  });
});

describe('judging locators against the knowledge base', () => {
  function knowledge() {
    const at = new Date().toISOString();
    writeRouteMap(dir, {
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
          role: 'button',
          name: 'Log in',
          locator: "getByRole('button', { name: 'Log in' })",
          confidence: 'runtime-only',
        },
        {
          role: 'textbox',
          name: 'Email',
          locator: "getByRole('textbox', { name: 'Email' })",
          confidence: 'runtime-only',
        },
      ],
    });
    writeRouteMap(dir, {
      schemaVersion: 2,
      route: '/signup',
      title: 'Create an account',
      exploredAt: at,
      verifiedAt: at,
      snapshotHash: 'h2',
      links: [],
      gaps: [],
      elements: [
        {
          role: 'button',
          name: 'Create account',
          locator: "getByRole('button', { name: 'Create account' })",
          confidence: 'runtime-only',
        },
      ],
    });
    return indexKnowledge(loadKnowledge(dir).kb);
  }

  const file = (source: string) => [{ path: 'tests/a.spec.ts', source }];
  const test = (...lines: string[]) =>
    `test('t', async ({ page }) => { await page.goto('/login'); ${lines.join(' ')} });`;

  it('counts the right element on the right page as valid', () => {
    const score = scoreLocators(
      file(test("page.getByRole('button', { name: 'Log in' });")),
      knowledge(),
    );
    expect(score).toMatchObject({ total: 1, judged: 1, known: 1, validRate: 1 });
  });

  it('counts an invented one, and a real one on the wrong page, as invalid — separately', () => {
    const score = scoreLocators(
      file(
        test(
          "page.getByRole('button', { name: 'Sign in now' });",
          "page.getByRole('button', { name: 'Create account' });",
        ),
      ),
      knowledge(),
    );
    expect(score).toMatchObject({ unknown: 1, wrongRoute: 1, known: 0, validRate: 0 });
    expect(score.invalidLocators).toEqual([
      "getByRole('button', { name: 'Sign in now' })",
      "getByRole('button', { name: 'Create account' }) (wrong route)",
    ]);
  });

  it('does not count a locator it cannot judge as invented, or as valid', () => {
    const score = scoreLocators(
      file(test("page.getByText('Welcome');", "page.getByRole('textbox', { name: 'Email' });")),
      knowledge(),
    );
    expect(score).toMatchObject({ total: 2, judged: 1, undecidable: 1, known: 1, validRate: 1 });
  });

  it('has no rate when there is nothing it could judge', () => {
    expect(
      scoreLocators(file(test("page.getByText('x');")), knowledge()).validRate,
    ).toBeUndefined();
    expect(scoreLocators(file('const x = 1;'), knowledge()).validRate).toBeUndefined();
  });
});

describe('a run with an executor', () => {
  const agent: Agent = {
    name: 'stub',
    run(request): Promise<AgentResponse> {
      return Promise.resolve({
        promptId: request.prompt.id,
        condition: request.condition,
        model: 'stub-1',
        code: "test('t', async ({ page }) => { await page.getByRole('button', { name: 'Log in' }); });",
      });
    },
  };

  class FakeExecutor implements Executor {
    readonly inputs: ExecutionInput[] = [];
    closed = 0;
    constructor(private readonly outcome: (input: ExecutionInput) => ExecutionResult) {}
    execute(input: ExecutionInput): Promise<ExecutionResult> {
      this.inputs.push(input);
      return Promise.resolve(this.outcome(input));
    }
    close(): Promise<void> {
      this.closed += 1;
      return Promise.resolve();
    }
  }

  const ok = (passed: boolean): ExecutionResult => ({
    compile: { ok: true, errors: [], filesChecked: 1 },
    run: {
      status: passed ? 'passed' : 'failed',
      total: 1,
      passed: passed ? 1 : 0,
      failed: passed ? 0 : 1,
      timedOut: 0,
      skipped: 0,
      failures: passed ? [] : ['t: Timeout 2000ms exceeded.'],
    },
    durationMs: 10,
  });

  const prompts = PROMPTS_V2.slice(0, 2);

  it('executes every answer of both conditions and summarises them per condition', async () => {
    const executor = new FakeExecutor((input) => ok(input.condition === 'understudy'));
    const result = await runBenchmark({
      projectRoot: dir,
      agent,
      rules,
      prompts,
      promptSetVersion: PROMPT_SET_V2_VERSION,
      executor,
    });

    expect(executor.inputs).toHaveLength(4);
    expect(executor.inputs.map((i) => `${i.condition}/${i.promptId}`)).toEqual([
      'bare/demo-login',
      'bare/demo-login-failure',
      'understudy/demo-login',
      'understudy/demo-login-failure',
    ]);
    expect(result.promptSetVersion).toBe(2);
    expect(result.conditions.map((c) => c.execution)).toEqual([
      expect.objectContaining({
        samples: 2,
        compiled: 2,
        passedFirstRun: 0,
        failedRun: 2,
      }) as unknown,
      expect.objectContaining({
        samples: 2,
        compiled: 2,
        passedFirstRun: 2,
        failedRun: 0,
      }) as unknown,
    ]);
    expect(executor.closed).toBe(1);
  });

  it('keeps each sample’s own result, so a failure can be traced to its answer', async () => {
    const executor = new FakeExecutor(() => ok(false));
    const result = await runBenchmark({ projectRoot: dir, agent, rules, prompts, executor });
    const sample = result.conditions[0]?.samples[0];
    expect(sample).toMatchObject({ promptId: 'demo-login', condition: 'bare' });
    expect(sample?.files).toEqual(['tests/app/functional/demo-login.spec.ts']);
    expect(sample?.execution?.run.failures).toEqual(['t: Timeout 2000ms exceeded.']);
    expect(sample?.locators).toBeDefined();
  });

  it('closes the executor even when an answer cannot be produced', async () => {
    const executor = new FakeExecutor(() => ok(true));
    const failing: Agent = { name: 'broken', run: () => Promise.reject(new Error('no answer')) };
    await expect(
      runBenchmark({ projectRoot: dir, agent: failing, rules, prompts, executor }),
    ).rejects.toThrow('no answer');
    expect(executor.closed).toBe(1);
  });

  it('adds nothing about execution when there is no executor', async () => {
    const result = await runBenchmark({ projectRoot: dir, agent, rules, prompts });
    expect(result.conditions.every((c) => c.execution === undefined)).toBe(true);
    expect(result.conditions.every((c) => c.locators === undefined)).toBe(true);
  });

  it('does not call every locator invented when the knowledge base is empty', async () => {
    const executor = new FakeExecutor(() => ok(true));
    const result = await runBenchmark({ projectRoot: dir, agent, rules, prompts, executor });
    const text = formatReport(result);
    expect(text).toContain('not judged: the knowledge base is empty');
    expect(text).not.toContain('invented ·');
  });

  it('reports compile and first-run numbers, and says what failed', async () => {
    const executor = new FakeExecutor((input) =>
      input.promptId === 'demo-login'
        ? {
            compile: {
              ok: false,
              errors: ["tests/a.spec.ts(1,1): TS2339 Property 'x' does not exist"],
              filesChecked: 1,
            },
            run: ok(false).run,
            durationMs: 5,
          }
        : ok(true),
    );
    const result = await runBenchmark({ projectRoot: dir, agent, rules, prompts, executor });
    const text = formatReport(result);

    expect(text).toContain('Compiled and run against the demo application (first run, no retries)');
    expect(text).toContain('compiled 1/2 · passed first run 1/2 · 1 failed');
    expect(text).toContain('demo-login: does not compile; failed');
    expect(text).toContain("TS2339 Property 'x' does not exist");
    expect(text).toContain('Timeout 2000ms exceeded.');
  });
});
