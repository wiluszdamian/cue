import type { Condition } from './agent.js';
import type { GeneratedFile } from './scoring.js';

/**
 * What happened when a generated test was actually used. A test that satisfies
 * every rule and names real elements can still fail to compile or fail to pass;
 * these are the numbers that say so, and none of them can be argued with.
 */

export interface CompileResult {
  readonly ok: boolean;
  /** The first few, as `file(line,col): TS1234 message`. */
  readonly errors: readonly string[];
  readonly filesChecked: number;
}

export type RunStatus = 'passed' | 'failed' | 'did-not-run';

export interface RunResult {
  readonly status: RunStatus;
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly timedOut: number;
  readonly skipped: number;
  /** The first few failure messages, trimmed. */
  readonly failures: readonly string[];
  /** Why nothing ran, when nothing did. */
  readonly note?: string;
}

export interface ExecutionResult {
  readonly compile: CompileResult;
  readonly run: RunResult;
  readonly durationMs: number;
}

export interface ExecutionInput {
  readonly promptId: string;
  readonly condition: Condition;
  readonly files: readonly GeneratedFile[];
  /** A defect to switch on in the application before running (see examples/demo-app). */
  readonly mutation?: string;
}

export interface Executor {
  execute(input: ExecutionInput): Promise<ExecutionResult>;
  /** Stops whatever the executor started. */
  close?(): Promise<void>;
}

export interface ExecutionSummary {
  readonly samples: number;
  readonly compiled: number;
  readonly compileFailed: number;
  /** Ran at least one test and none failed. */
  readonly passedFirstRun: number;
  readonly failedRun: number;
  readonly didNotRun: number;
  readonly durationMs: number;
}

export function summariseExecution(results: readonly ExecutionResult[]): ExecutionSummary {
  return {
    samples: results.length,
    compiled: results.filter((r) => r.compile.ok).length,
    compileFailed: results.filter((r) => !r.compile.ok).length,
    passedFirstRun: results.filter((r) => r.run.status === 'passed').length,
    failedRun: results.filter((r) => r.run.status === 'failed').length,
    didNotRun: results.filter((r) => r.run.status === 'did-not-run').length,
    durationMs: results.reduce((total, r) => total + r.durationMs, 0),
  };
}
