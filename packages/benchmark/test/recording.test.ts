import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordingPath, type AgentRequest, type AgentResponse } from '../src/agent.js';
import { ClaudeAgent, INSTRUCTIONS, parseFiles, systemPrompt } from '../src/live-agent.js';
import { PROMPTS } from '../src/prompts.js';
import { recordRun } from '../src/record-run.js';

/**
 * Tests for the recording half of the benchmark.
 *
 * Everything here runs without a key and without a network call: the model is a
 * seam, and the two things that actually decide anything — the wrapper around
 * the prompt and the parsing of the answer — are pure functions.
 */

const prompt = PROMPTS[0];
if (prompt === undefined) throw new Error('the prompt set is empty');

const request = (condition: 'bare' | 'cue', context: string): AgentRequest => ({
  prompt,
  condition,
  context,
});

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cue-record-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('what is asked of the model', () => {
  it('never names a rule, so the wrapper is not the thing being measured', () => {
    // Advice here would be handed to the bare condition too, which is the layer's
    // entire job. The prompt set is checked for the same giveaways elsewhere.
    const text = INSTRUCTIONS.toLowerCase();
    for (const giveaway of [
      'cue',
      'constitution',
      'page object',
      'tag',
      'locator',
      'wait',
      'assert',
      'fixture',
    ]) {
      expect(text, `the instructions mention "${giveaway}"`).not.toContain(giveaway);
    }
  });

  it('is word for word the same in both conditions', () => {
    const bare = systemPrompt(request('bare', ''));
    const withLayer = systemPrompt(request('cue', '# AGENTS.md\n\nrules here'));
    expect(bare).toBe(INSTRUCTIONS);
    expect(withLayer).toContain(INSTRUCTIONS);
    // The only difference is the project's own files, verbatim.
    expect(withLayer).toContain('# AGENTS.md');
  });

  it('hands the bare condition nothing but the instructions', () => {
    expect(systemPrompt(request('bare', '   '))).toBe(INSTRUCTIONS);
  });
});

describe('reading the files back out of an answer', () => {
  it('takes the path the model wrote above each block', () => {
    const files = parseFiles(
      [
        'Here you go.',
        '',
        'File: tests/app/functional/login.spec.ts',
        '```ts',
        "test('x', () => {});",
        '```',
        '',
        'File: pages/app/login.page.ts',
        '```typescript',
        'export class LoginPage {}',
        '```',
      ].join('\n'),
      prompt.id,
    );

    expect(files).toEqual([
      { path: 'tests/app/functional/login.spec.ts', source: "test('x', () => {});" },
      { path: 'pages/app/login.page.ts', source: 'export class LoginPage {}' },
    ]);
  });

  it('survives the decoration a chat model puts around a heading', () => {
    const files = parseFiles(
      ['**File:** `tests/a.spec.ts`', '```ts', 'const a = 1;', '```'].join('\n'),
      prompt.id,
    );
    expect(files).toEqual([{ path: 'tests/a.spec.ts', source: 'const a = 1;' }]);
  });

  it('falls back to the conventional spec path when no path is given', () => {
    // Dropping an unlabelled answer would quietly shrink the sample in whichever
    // condition was worse at following instructions.
    const files = parseFiles('```ts\nconst a = 1;\n```', prompt.id);
    expect(files).toEqual([
      { path: `tests/app/functional/${prompt.id}.spec.ts`, source: 'const a = 1;' },
    ]);
  });

  it('keeps prose with no code at all, so it scores as unparsed rather than clean', () => {
    const files = parseFiles('I would not write that test.', prompt.id);
    expect(files).toHaveLength(1);
    expect(files[0]?.source).toContain('I would not write that test.');
  });
});

describe('one call to the agent', () => {
  it('records the model, the condition and the files', async () => {
    const agent = new ClaudeAgent({
      complete: ({ system, user }) => {
        expect(user).toBe(prompt.text);
        expect(system).toContain('AGENTS.md says');
        return Promise.resolve({
          text: 'File: tests/a.spec.ts\n```ts\nconst a = 1;\n```',
          model: 'claude-opus-5',
        });
      },
    });

    const response = await agent.run(request('cue', 'AGENTS.md says things'));

    expect(response.promptId).toBe(prompt.id);
    expect(response.condition).toBe('cue');
    expect(response.model).toBe('claude-opus-5');
    expect(response.files).toEqual([{ path: 'tests/a.spec.ts', source: 'const a = 1;' }]);
    // A real run is dated; the hand-written fixtures are not.
    expect(response.recordedAt).toBeDefined();
  });
});

describe('recording a whole run', () => {
  const stub = (calls: string[]) => ({
    name: 'stub',
    run: (input: AgentRequest): Promise<AgentResponse> => {
      calls.push(`${input.condition}/${input.prompt.id}`);
      return Promise.resolve({
        promptId: input.prompt.id,
        condition: input.condition,
        code: 'const a = 1;',
        model: 'stub',
      });
    },
  });

  const two = PROMPTS.slice(0, 2);

  it('writes every prompt in both conditions', async () => {
    const calls: string[] = [];
    const summary = await recordRun({ dir, projectRoot: dir, agent: stub(calls), prompts: two });

    expect(summary.written).toHaveLength(4);
    expect(calls).toHaveLength(4);
    expect(readFileSync(recordingPath(dir, two[0]?.id ?? '', 'bare'), 'utf8')).toContain('"bare"');
  });

  it('fills the gaps rather than paying again for what is on disk', async () => {
    const first = await recordRun({ dir, projectRoot: dir, agent: stub([]), prompts: two });
    expect(first.written).toHaveLength(4);

    const calls: string[] = [];
    const again = await recordRun({ dir, projectRoot: dir, agent: stub(calls), prompts: two });

    expect(calls).toEqual([]);
    expect(again.kept).toBe(4);
    expect(again.written).toEqual([]);
  });

  it('re-asks only when told to', async () => {
    await recordRun({ dir, projectRoot: dir, agent: stub([]), prompts: two });
    const calls: string[] = [];
    await recordRun({ dir, projectRoot: dir, agent: stub(calls), prompts: two, force: true });
    expect(calls).toHaveLength(4);
  });

  it('keeps what it already paid for when a call fails', async () => {
    // A run is several minutes of paid calls. Losing the finished ones because
    // the ninth failed is the difference between resuming and starting again.
    let calls = 0;
    const flaky = {
      name: 'flaky',
      run: (input: AgentRequest): Promise<AgentResponse> => {
        calls += 1;
        if (calls === 2) return Promise.reject(new Error('rate limited'));
        return Promise.resolve({
          promptId: input.prompt.id,
          condition: input.condition,
          code: 'const a = 1;',
          model: 'stub',
        });
      },
    };

    const lines: string[] = [];
    const summary = await recordRun({
      dir,
      projectRoot: dir,
      agent: flaky,
      prompts: two,
      log: (line) => lines.push(line),
    });

    expect(summary.written).toHaveLength(1);
    expect(summary.failed).toEqual({ promptId: two[1]?.id, condition: 'bare' });
    expect(lines.join('\n')).toContain('rate limited');
  });

  it('leaves a recording somebody wrote by hand alone', async () => {
    const path = recordingPath(dir, two[0]?.id ?? '', 'bare');
    mkdirSync(join(dir, 'bare'), { recursive: true });
    writeFileSync(path, '{"hand written": true}', 'utf8');

    await recordRun({ dir, projectRoot: dir, agent: stub([]), prompts: two });

    expect(readFileSync(path, 'utf8')).toBe('{"hand written": true}');
  });
});
