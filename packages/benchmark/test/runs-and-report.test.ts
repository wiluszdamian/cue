import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRules, writeRouteMap } from '@understudy/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectRuns,
  missingRecordings,
  record,
  RecordedAgent,
  recordingPath,
  type Agent,
  type AgentRequest,
  type AgentResponse,
} from '../src/agent.js';
import type { ExecutionInput, ExecutionResult, Executor } from '../src/execution.js';
import { collectMetadata, spread } from '../src/metadata.js';
import { PROMPTS_V2 } from '../src/prompts.js';
import { recordRun } from '../src/record-run.js';
import { formatMarkdown, formatReport } from '../src/report.js';
import { runBenchmark } from '../src/runner.js';

const REPO = join(import.meta.dirname, '..', '..', '..');
const rules = loadRules(join(REPO, 'rules'));

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'understudy-runs-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const noMutation = PROMPTS_V2.filter((prompt) => prompt.mutation === undefined).slice(0, 2);
const [P0, P1] = noMutation;
if (P0 === undefined || P1 === undefined)
  throw new Error('prompt set 2 needs two prompts without a defect');
const withMutation = PROMPTS_V2.filter((prompt) => prompt.mutation !== undefined).slice(0, 1);

const response = (request: AgentRequest, extra: Partial<AgentResponse> = {}): AgentResponse => ({
  promptId: request.prompt.id,
  condition: request.condition,
  model: 'm-1',
  code: "test('t', async () => {});",
  recordedAt: '2026-10-01T10:00:00.000Z',
  ...(request.run === undefined ? {} : { run: request.run }),
  ...extra,
});

describe('repeated recordings', () => {
  it('keeps the first repetition’s file name, so earlier recordings still read', () => {
    expect(recordingPath('d', 'p', 'bare')).toBe(join('d', 'bare', 'p.json'));
    expect(recordingPath('d', 'p', 'bare', 1)).toBe(join('d', 'bare', 'p.json'));
    expect(recordingPath('d', 'p', 'understudy', 3)).toBe(join('d', 'understudy', 'p.run3.json'));
  });

  it('writes each repetition where the reader will look for it', () => {
    const a = response({ prompt: P0, condition: 'bare', context: '' }, { run: 1 });
    const b = { ...a, run: 2, code: 'second' };
    record(dir, a);
    record(dir, b);
    expect(existsSync(recordingPath(dir, a.promptId, 'bare', 1))).toBe(true);
    expect(readFileSync(recordingPath(dir, a.promptId, 'bare', 2), 'utf8')).toContain('second');
  });

  it('reads them back by repetition', async () => {
    const prompt = P0;
    record(dir, response({ prompt, condition: 'bare', context: '' }, { run: 1, code: 'one' }));
    record(dir, response({ prompt, condition: 'bare', context: '' }, { run: 2, code: 'two' }));
    const agent = new RecordedAgent(dir);
    expect((await agent.run({ prompt, condition: 'bare', context: '', run: 2 })).code).toBe('two');
    expect((await agent.run({ prompt, condition: 'bare', context: '' })).code).toBe('one');
  });

  it('lists every missing repetition, naming the file', () => {
    const ids = noMutation.map((p) => p.id);
    record(dir, response({ prompt: P0, condition: 'bare', context: '' }));
    const missing = missingRecordings(dir, ids, ['bare'], 2);
    expect(missing).toEqual([
      { promptId: ids[0], condition: 'bare', run: 2 },
      { promptId: ids[1], condition: 'bare', run: 1 },
      { promptId: ids[1], condition: 'bare', run: 2 },
    ]);
  });

  it('counts the repetitions every prompt and condition has, and no more', () => {
    const ids = noMutation.map((p) => p.id);
    const write = (promptId: string, condition: 'bare' | 'understudy', run: number) =>
      record(dir, {
        promptId,
        condition,
        model: 'm',
        code: 'x',
        run,
      });
    expect(detectRuns(dir, ids, ['bare', 'understudy'])).toBe(1);

    for (const id of ids) for (const c of ['bare', 'understudy'] as const) write(id, c, 1);
    expect(detectRuns(dir, ids, ['bare', 'understudy'])).toBe(1);

    for (const id of ids) for (const c of ['bare', 'understudy'] as const) write(id, c, 2);
    // One prompt has a third, the others do not: the sample is still two.
    write(ids[0] ?? '', 'bare', 3);
    expect(detectRuns(dir, ids, ['bare', 'understudy'])).toBe(2);
  });

  it('asks the model for every repetition, keeps what is on disk, and stops where it fails', async () => {
    const asked: string[] = [];
    const agent: Agent = {
      name: 'stub',
      run(request) {
        asked.push(`${request.condition}/${request.prompt.id}#${String(request.run)}`);
        if (
          request.prompt.id === noMutation[1]?.id &&
          request.run === 2 &&
          request.condition === 'understudy'
        ) {
          return Promise.reject(new Error('rate limited'));
        }
        return Promise.resolve(response(request));
      },
    };

    const first = await recordRun({ dir, projectRoot: dir, agent, prompts: noMutation, runs: 2 });
    expect(first.failed).toEqual({ promptId: noMutation[1]?.id, condition: 'understudy' });
    // 2 prompts × 2 runs for bare, then understudy up to and including the call that fails.
    expect(asked).toHaveLength(8);
    // Repetition outermost within a condition: every prompt is answered once before any twice.
    expect(asked.slice(0, 4)).toEqual([
      `bare/${noMutation[0]?.id}#1`,
      `bare/${noMutation[1]?.id}#1`,
      `bare/${noMutation[0]?.id}#2`,
      `bare/${noMutation[1]?.id}#2`,
    ]);

    asked.length = 0;
    const retry: Agent = {
      name: 'stub',
      run: (request) => (asked.push(String(request.run)), Promise.resolve(response(request))),
    };
    const second = await recordRun({
      dir,
      projectRoot: dir,
      agent: retry,
      prompts: noMutation,
      runs: 2,
    });
    expect(second.failed).toBeUndefined();
    expect(second.kept).toBe(7);
    expect(asked).toEqual(['2']);
  });

  it('stamps each answer with its repetition', async () => {
    const agent: Agent = { name: 'stub', run: (request) => Promise.resolve(response(request)) };
    await recordRun({ dir, projectRoot: dir, agent, prompts: noMutation.slice(0, 1), runs: 2 });
    const second = JSON.parse(
      readFileSync(recordingPath(dir, noMutation[0]?.id ?? '', 'bare', 2), 'utf8'),
    ) as AgentResponse;
    expect(second.run).toBe(2);
  });
});

describe('spread', () => {
  it('is the least, the middle and the most', () => {
    expect(spread([0.5, 0.25, 1])).toEqual({ min: 0.25, median: 0.5, max: 1 });
    expect(spread([1, 3])).toEqual({ min: 1, median: 2, max: 3 });
    expect(spread([0.4])).toEqual({ min: 0.4, median: 0.4, max: 0.4 });
  });

  it('is nothing for no values: there is no honest minimum of nothing', () => {
    expect(spread([])).toBeUndefined();
  });
});

describe('what a result is a result of', () => {
  it('names the commit, the tool versions and the environment', () => {
    const metadata = collectMetadata({
      repoRoot: REPO,
      demoRoot: join(REPO, 'examples', 'demo-app'),
    });
    expect(metadata.node).toBe(process.version);
    expect(metadata.os).toMatch(/\(.+\)$/);
    expect(metadata.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof metadata.dirty).toBe('boolean');
    expect(metadata.understudyVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(metadata.playwrightVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(metadata.playwrightCliVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('says what it does not know instead of inventing it', () => {
    const metadata = collectMetadata({ repoRoot: dir, demoRoot: dir });
    expect(metadata.commit).toBeUndefined();
    expect(metadata.dirty).toBeUndefined();
    expect(metadata.understudyVersion).toBeUndefined();
  });
});

describe('several runs of one set', () => {
  /** Passes in run 1 for the understudy condition only, and varies from there. */
  class Scripted implements Executor {
    constructor(private readonly passes: (input: ExecutionInput, call: number) => boolean) {}
    calls = 0;
    execute(input: ExecutionInput): Promise<ExecutionResult> {
      this.calls += 1;
      const passed = this.passes(input, this.calls);
      return Promise.resolve({
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
        durationMs: 1,
      });
    }
  }

  const stub = (extra: Partial<AgentResponse> = {}): Agent => ({
    name: 'stub',
    run: (request) => Promise.resolve(response(request, extra)),
  });

  it('asks for each repetition and keeps each answer’s own repetition number', async () => {
    const seen: (number | undefined)[] = [];
    const agent: Agent = {
      name: 'stub',
      run: (request) => (seen.push(request.run), Promise.resolve(response(request))),
    };
    const result = await runBenchmark({
      projectRoot: dir,
      agent,
      rules,
      prompts: noMutation,
      runs: 3,
    });

    expect(result.runs).toBe(3);
    // 2 prompts × 3 runs × 2 conditions
    expect(seen).toHaveLength(12);
    expect(result.conditions[0]?.samples.map((s) => s.run)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('shows how much the runs differ, as rates, when there is more than one', async () => {
    // Run 1 passes both prompts, run 2 one, run 3 none: 100%, 50%, 0%.
    const script = (input: ExecutionInput, call: number): boolean => {
      const withinCondition = (call - 1) % 6;
      const run = Math.floor(withinCondition / 2) + 1;
      const first = input.promptId === noMutation[0]?.id;
      return run === 1 || (run === 2 && first);
    };
    const result = await runBenchmark({
      projectRoot: dir,
      agent: stub(),
      rules,
      prompts: noMutation,
      runs: 3,
      executor: new Scripted(script),
    });
    const bare = result.conditions[0];
    expect(bare?.perRun?.map((r) => r.passedFirstRunRate)).toEqual([1, 0.5, 0]);
    expect(bare?.spread?.passedFirstRun).toEqual({ min: 0, median: 0.5, max: 1 });
    expect(bare?.execution).toMatchObject({ samples: 6, passedFirstRun: 3 });

    const text = formatReport(result);
    expect(text).toContain('passed first run 3/6');
    expect(text).toContain('(per run: min 0%, median 50%, max 100%)');
    expect(text).toContain('× 3 runs');
  });

  it('shows no spread for a single run: one value has none', async () => {
    const result = await runBenchmark({
      projectRoot: dir,
      agent: stub(),
      rules,
      prompts: noMutation,
      executor: new Scripted(() => true),
    });
    expect(result.conditions[0]?.spread).toBeUndefined();
    expect(formatReport(result)).not.toContain('per run:');
  });

  it('sums the tokens answers report, and says when none did', async () => {
    const withUsage = await runBenchmark({
      projectRoot: dir,
      agent: stub({ usage: { inputTokens: 100, outputTokens: 40 }, durationMs: 1500 }),
      rules,
      prompts: noMutation,
      runs: 2,
    });
    expect(withUsage.conditions[0]?.usage).toEqual({
      inputTokens: 400,
      outputTokens: 160,
      answers: 4,
    });
    expect(withUsage.conditions[0]?.modelMilliseconds).toBe(6000);
    expect(withUsage.notMeasured.map((n) => n.metric)).not.toContain('token usage');

    const without = await runBenchmark({
      projectRoot: dir,
      agent: stub(),
      rules,
      prompts: noMutation,
    });
    expect(without.conditions[0]?.usage).toBeUndefined();
    expect(without.notMeasured.map((n) => n.metric)).toContain('token usage');
  });

  it('lists what the instrument cannot measure, never as zero', async () => {
    const result = await runBenchmark({
      projectRoot: dir,
      agent: stub(),
      rules,
      prompts: noMutation,
    });
    expect(result.notMeasured.map((n) => n.metric)).toEqual(
      expect.arrayContaining([
        'browser exploration count',
        'knowledge reuse rate',
        'repair iterations',
        'flaky rerun rate',
      ]),
    );
    const text = formatReport(result);
    expect(text).toContain('Not measured (stated, not shown as zero):');
    expect(text).toContain('browser exploration count: not measured');
  });

  it('records the models that answered, the time it took, and when it started', async () => {
    const result = await runBenchmark({
      projectRoot: dir,
      agent: stub(),
      rules,
      prompts: noMutation,
    });
    expect(result.model).toBe('m-1');
    expect(Date.parse(result.startedAt)).not.toBeNaN();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('carries the metadata it was given into the report', async () => {
    const result = await runBenchmark({
      projectRoot: dir,
      agent: stub(),
      rules,
      prompts: noMutation,
      metadata: {
        commit: 'abcdef0123456789abcdef0123456789abcdef01',
        dirty: true,
        understudyVersion: '0.8.0',
        playwrightVersion: '1.63.0',
        node: 'v24.0.0',
        os: 'win32 test (x64)',
      },
    });
    const text = formatReport(result);
    expect(text).toContain('Commit abcdef0123 (uncommitted changes)');
    expect(text).toContain(
      'understudy 0.8.0 · @playwright/test 1.63.0 · node v24.0.0 · win32 test (x64)',
    );
  });
});

describe('answers nobody’s model wrote', () => {
  it('say so at the top of every report', async () => {
    // `recordedAt` absent, as in the fixtures: nothing here was produced by a model.
    const agent: Agent = {
      name: 'fixture',
      run: (request) =>
        Promise.resolve({
          promptId: request.prompt.id,
          condition: request.condition,
          model: 'fixture',
          code: "test('t', async () => {});",
        }),
    };
    const result = await runBenchmark({ projectRoot: dir, agent, rules, prompts: noMutation });

    expect(result.handWrittenAnswers).toBe(4);
    expect(formatReport(result)).toContain(
      '4 answer(s) here are hand-written fixtures, not model output',
    );
    expect(formatMarkdown(result)).toMatch(/^# Benchmark report\n\n> \*\*NOTE: 4 answer\(s\)/);
  });

  it('are not mentioned when a model wrote them', async () => {
    const agent: Agent = { name: 'live', run: (request) => Promise.resolve(response(request)) };
    const result = await runBenchmark({ projectRoot: dir, agent, rules, prompts: noMutation });
    expect(result.handWrittenAnswers).toBe(0);
    expect(formatReport(result)).not.toContain('hand-written');
  });
});

describe('the report as a document', () => {
  const agent: Agent = {
    name: 'live',
    run: (request) => Promise.resolve(response(request)),
  };

  class Mixed implements Executor {
    execute(input: ExecutionInput): Promise<ExecutionResult> {
      // The first prompt does not compile; the rest pass, and nothing notices the defect.
      const broken = input.promptId === noMutation[0]?.id;
      return Promise.resolve({
        compile: broken
          ? {
              ok: false,
              errors: ['tests/a.spec.ts(3,5): TS2339 Property x | y does not exist'],
              filesChecked: 1,
            }
          : { ok: true, errors: [], filesChecked: 1 },
        run: {
          status: broken ? 'failed' : 'passed',
          total: 1,
          passed: broken ? 0 : 1,
          failed: broken ? 1 : 0,
          timedOut: 0,
          skipped: 0,
          failures: broken ? ['login: Timeout 2000ms exceeded.'] : [],
        },
        durationMs: 1,
      });
    }
  }

  async function sample() {
    writeRouteMap(dir, {
      schemaVersion: 2,
      route: '/login',
      title: 'Sign in',
      exploredAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
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
      ],
    });
    return runBenchmark({
      projectRoot: dir,
      agent,
      rules,
      prompts: [...noMutation, ...withMutation],
      promptSetVersion: 2,
      runs: 2,
      executor: new Mixed(),
      metadata: { commit: '0123456789abcdef0123456789abcdef01234567', node: 'v24', os: 'test' },
    });
  }

  it('puts the two conditions side by side, with the sample size beside every number', async () => {
    const md = formatMarkdown(await sample());
    expect(md).toContain('| | without Understudy | with Understudy |');
    expect(md).toContain('| Answers | 6 | 6 |');
    expect(md).toMatch(/\| Compiled \| 4\/6 \| 4\/6 \|/);
    expect(md).toContain('| Repetitions | 2 per prompt and condition |');
    expect(md).toContain('| Commit | `0123456789` |');
  });

  it('lists every failure, each with the recording it came from', async () => {
    const md = formatMarkdown(await sample());
    // 1 broken prompt × 2 runs × 2 conditions, plus the missed defects (test passes with it on).
    expect(md).toContain('### bare · ' + String(noMutation[0]?.id) + ' · run 1');
    expect(md).toContain('Recording: `bare/' + String(noMutation[0]?.id) + '.json`');
    expect(md).toContain('Recording: `understudy/' + String(noMutation[0]?.id) + '.run2.json`');
    expect(md).toContain('Did not compile:');
    expect(md).toContain('login: Timeout 2000ms exceeded.');
    expect(md).toContain('Passed even with `');
  });

  it('escapes what would break a table', async () => {
    const md = formatMarkdown(await sample());
    expect(md).toContain('TS2339 Property x \\| y does not exist');
  });

  it('says what was not measured, and what the numbers cannot show', async () => {
    const md = formatMarkdown(await sample());
    expect(md).toContain('## Not measured');
    expect(md).toContain('- **browser exploration count**');
    expect(md).toContain('## What this cannot show');
    expect(md).toContain('The understudy condition is handed everything');
    expect(md).toContain('A caught defect is not a verified reason');
  });

  it('does not report a failure it did not have', async () => {
    const clean = await runBenchmark({
      projectRoot: dir,
      agent,
      rules,
      prompts: noMutation.slice(1),
      executor: {
        execute: () =>
          Promise.resolve({
            compile: { ok: true, errors: [], filesChecked: 1 },
            run: {
              status: 'passed',
              total: 1,
              passed: 1,
              failed: 0,
              timedOut: 0,
              skipped: 0,
              failures: [],
            },
            durationMs: 1,
          }),
      },
    });
    expect(formatMarkdown(clean)).toContain('None: every answer compiled and passed');
  });
});

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

describe.skipIf(!existsSync(CLI))('the built command', () => {
  function recordings(runs: number): string {
    const root = join(dir, 'rec');
    for (const condition of ['bare', 'understudy'] as const) {
      mkdirSync(join(root, condition), { recursive: true });
      for (let run = 1; run <= runs; run += 1) {
        for (const prompt of noMutation) {
          writeFileSync(
            recordingPath(root, prompt.id, condition, run),
            JSON.stringify({
              promptId: prompt.id,
              condition,
              model: 'fixture',
              code: "test('t', () => {});",
              run,
            }),
          );
        }
      }
    }
    return root;
  }

  const score = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args, '--rules', join(REPO, 'rules')], {
      encoding: 'utf8',
      cwd: dir,
    });

  it('finds how many repetitions there are, and scores all of them', () => {
    const root = recordings(2);
    const result = score(
      root,
      '--project',
      dir,
      '--prompt-set',
      '2',
      '--prompts',
      noMutation.map((p) => p.id).join(','),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('× 2 runs');
    expect(result.stdout).toContain('hand-written fixtures');
  });

  it('refuses a run count with a repetition missing, naming the file', () => {
    const root = recordings(1);
    const result = score(
      root,
      '--project',
      dir,
      '--prompt-set',
      '2',
      '--runs',
      '2',
      '--prompts',
      noMutation[0]?.id ?? '',
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`bare/${String(noMutation[0]?.id)}.run2.json`);
  });

  it('rejects nonsense for --runs', () => {
    expect(score(recordings(1), '--project', dir, '--runs', '0').status).toBe(2);
    expect(score(recordings(1), '--project', dir, '--runs', 'many').status).toBe(2);
  });

  it('writes report.md and report.json when asked', () => {
    const root = recordings(1);
    const out = join(dir, 'out');
    const result = score(
      root,
      '--project',
      dir,
      '--prompt-set',
      '2',
      '--prompts',
      noMutation.map((p) => p.id).join(','),
      '--report',
      out,
    );
    expect(result.status).toBe(0);
    expect(readFileSync(join(out, 'report.md'), 'utf8')).toContain('# Benchmark report');
    const json = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as {
      runs: number;
      notMeasured: unknown[];
    };
    expect(json.runs).toBe(1);
    expect(json.notMeasured.length).toBeGreaterThan(0);
  });
});
