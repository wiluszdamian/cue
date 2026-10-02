import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prompt } from './prompts.js';

/**
 * Where the generated code comes from. Runs are recorded to disk: a number nobody
 * can reproduce is an anecdote, and a recording can be re-scored after a rule
 * changes without paying for the model again.
 */

/** `bare` is the assistant alone; `understudy` adds AGENTS.md and the knowledge base. */
export type Condition = 'bare' | 'understudy';

export const CONDITIONS: readonly Condition[] = ['bare', 'understudy'];

export interface AgentRequest {
  readonly prompt: Prompt;
  readonly condition: Condition;
  /** AGENTS.md and the relevant part of the knowledge base. Empty for `bare`. */
  readonly context: string;
  /** Which repetition of this prompt and condition, from 1. */
  readonly run?: number;
}

export interface GeneratedSource {
  /** Repo-relative, e.g. `tests/app/functional/login.spec.ts`. */
  readonly path: string;
  readonly source: string;
}

export interface AgentResponse {
  readonly promptId: string;
  readonly condition: Condition;
  readonly code: string;
  /** Paths matter: rules are scoped by directory, so a page object must not score as a spec. */
  readonly files?: readonly GeneratedSource[];
  readonly model: string;
  /** ISO-8601. Set by a live run; absent on the hand-written fixtures. */
  readonly recordedAt?: string;
  /** Which repetition this is, from 1. Absent on recordings made before there were any. */
  readonly run?: number;
  /** What the model reported using, when it reported anything. */
  readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number };
  /** How long the model took to answer. */
  readonly durationMs?: number;
}

export interface Agent {
  readonly name: string;
  run(request: AgentRequest): Promise<AgentResponse>;
}

/** Replays a recorded run: the tests' driver, and the way to re-score against changed rules. */
export class RecordedAgent implements Agent {
  readonly name = 'recorded';

  constructor(private readonly dir: string) {}

  run(request: AgentRequest): Promise<AgentResponse> {
    const path = recordingPath(this.dir, request.prompt.id, request.condition, request.run);
    if (!existsSync(path)) {
      throw new Error(
        `No recording for ${request.prompt.id} / ${request.condition} at ${path}.\n` +
          'Run the benchmark with a live agent first, or record this case by hand.',
      );
    }
    return Promise.resolve(JSON.parse(readFileSync(path, 'utf8')) as AgentResponse);
  }
}

/** Every gap at once: failing on the first sends somebody round the loop N times. */
export function missingRecordings(
  dir: string,
  promptIds: readonly string[],
  conditions: readonly Condition[],
  runs = 1,
): { promptId: string; condition: Condition; run: number }[] {
  const missing: { promptId: string; condition: Condition; run: number }[] = [];
  for (const promptId of promptIds) {
    for (const condition of conditions) {
      for (let run = 1; run <= runs; run += 1) {
        if (!existsSync(recordingPath(dir, promptId, condition, run))) {
          missing.push({ promptId, condition, run });
        }
      }
    }
  }
  return missing;
}

/**
 * How many repetitions every prompt and condition has, counted from the first: the
 * largest N for which all of them have recordings 1..N. At least 1 is assumed, since
 * "none" is for `missingRecordings` to report.
 */
export function detectRuns(
  dir: string,
  promptIds: readonly string[],
  conditions: readonly Condition[],
): number {
  let runs = 1;
  while (missingRecordings(dir, promptIds, conditions, runs + 1).length === 0) runs += 1;
  return runs;
}

/**
 * The first repetition keeps the name it has always had, so earlier recordings still
 * read; later ones are `<prompt>.run2.json` and so on.
 */
export function recordingPath(
  dir: string,
  promptId: string,
  condition: Condition,
  run = 1,
): string {
  return join(
    dir,
    condition,
    run === 1 ? `${promptId}.json` : `${promptId}.run${String(run)}.json`,
  );
}

export function record(dir: string, response: AgentResponse): string {
  const path = recordingPath(dir, response.promptId, response.condition, response.run);
  mkdirSync(join(dir, response.condition), { recursive: true });
  writeFileSync(path, `${JSON.stringify(response, null, 2)}\n`, 'utf8');
  return path;
}

/**
 * Strips the prose around the code. With no fence the whole response counts as
 * code, so an answer that explained instead of testing scores unparsed, not zero.
 */
export function extractCode(response: string): string {
  const fences = [...response.matchAll(/```(?:ts|typescript|javascript|js)?\r?\n([\s\S]*?)```/g)];
  if (fences.length === 0) return response.trim();
  return fences.map((match) => (match[1] ?? '').trim()).join('\n\n');
}
