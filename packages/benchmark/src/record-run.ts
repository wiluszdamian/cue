import { existsSync } from 'node:fs';
import { CONDITIONS, record, recordingPath, type Agent, type Condition } from './agent.js';
import { PROMPTS, type Prompt } from './prompts.js';
import { buildContext } from './runner.js';

/**
 * Producing a run: every prompt, in both conditions, written to disk as it
 * arrives.
 *
 * A run is minutes of paid calls, so each answer is written before the next is
 * asked, and nothing already recorded is overwritten. Re-running fills the gaps
 * instead of paying again — and a recording that changes under a published
 * result is how a benchmark stops being reproducible.
 */

export interface RecordOptions {
  readonly dir: string;
  readonly projectRoot: string;
  readonly agent: Agent;
  readonly prompts?: readonly Prompt[];
  readonly conditions?: readonly Condition[];
  /** Ask again for answers that are already on disk, replacing them. */
  readonly force?: boolean;
  /** How many answers to ask for per prompt and condition. Defaults to 1. */
  readonly runs?: number;
  readonly log?: (line: string) => void;
}

export interface RecordSummary {
  readonly written: readonly string[];
  /** Already on disk, so not asked for again. */
  readonly kept: number;
  /** The prompt and condition that failed, if one did. */
  readonly failed?: { readonly promptId: string; readonly condition: Condition };
}

export async function recordRun(options: RecordOptions): Promise<RecordSummary> {
  const prompts = options.prompts ?? PROMPTS;
  const conditions = options.conditions ?? CONDITIONS;
  const log = options.log ?? (() => undefined);
  const runs = options.runs ?? 1;

  const written: string[] = [];
  let kept = 0;

  // Condition outermost: a run that dies halfway leaves one complete set, which
  // is a comparison waiting for its other half. Two half-sets are nothing.
  for (const condition of conditions) {
    const context = buildContext(options.projectRoot, condition);

    // Repetition outermost within a condition: stopping early leaves every prompt
    // answered once, rather than the first few answered five times.
    for (let run = 1; run <= runs; run += 1) {
      for (const prompt of prompts) {
        const label = `${condition}/${prompt.id}${runs > 1 ? ` #${String(run)}` : ''}`;
        const path = recordingPath(options.dir, prompt.id, condition, run);
        if (options.force !== true && existsSync(path)) {
          kept += 1;
          log(`  kept     ${label}`);
          continue;
        }

        try {
          const response = await options.agent.run({ prompt, condition, context, run });
          written.push(record(options.dir, { ...response, run }));
          log(`  recorded ${label}`);
        } catch (error) {
          log(`  FAILED   ${label}: ${message(error)}`);
          return { written, kept, failed: { promptId: prompt.id, condition } };
        }
      }
    }
  }

  return { written, kept };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
