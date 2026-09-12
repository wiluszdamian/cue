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
    const path = recordingPath(this.dir, request.prompt.id, request.condition);
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
): { promptId: string; condition: Condition }[] {
  const missing: { promptId: string; condition: Condition }[] = [];
  for (const promptId of promptIds) {
    for (const condition of conditions) {
      if (!existsSync(recordingPath(dir, promptId, condition)))
        missing.push({ promptId, condition });
    }
  }
  return missing;
}

export function recordingPath(dir: string, promptId: string, condition: Condition): string {
  return join(dir, condition, `${promptId}.json`);
}

export function record(dir: string, response: AgentResponse): string {
  const path = recordingPath(dir, response.promptId, response.condition);
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
