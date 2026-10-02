import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { compileFiles } from './compile.js';
import { startDemo, type RunningDemo } from './demo-server.js';
import type { ExecutionInput, ExecutionResult, Executor, RunResult } from './execution.js';
import { runPlaywright } from './playwright-run.js';
import { UnsafePathError, writeWorkspace } from './workspace.js';

/**
 * Runs generated tests against the demo application. One application instance is
 * shared by every sample that wants the same mutations, and replaced when the next
 * sample wants different ones.
 */

export interface DemoExecutorOptions {
  /** `examples/demo-app` in this repository. */
  readonly demoRoot: string;
  /** Leave each workspace on disk afterwards, to look at what was written. */
  readonly keep?: boolean;
}

const DID_NOT_RUN = (note: string): RunResult => ({
  status: 'did-not-run',
  total: 0,
  passed: 0,
  failed: 0,
  timedOut: 0,
  skipped: 0,
  failures: [],
  note,
});

export class DemoExecutor implements Executor {
  private server: { mutations: string; demo: RunningDemo } | undefined;

  constructor(private readonly options: DemoExecutorOptions) {}

  private async serverFor(mutations: string): Promise<RunningDemo> {
    if (this.server?.mutations === mutations) return this.server.demo;
    await this.close();
    const demo = await startDemo(this.options.demoRoot, mutations);
    this.server = { mutations, demo };
    return demo;
  }

  async execute(input: ExecutionInput): Promise<ExecutionResult> {
    const started = performance.now();
    // Inside the demo application, so its node_modules (Playwright, types) resolve by
    // walking up; gitignored.
    const parent = join(this.options.demoRoot, '.benchmark');
    mkdirSync(parent, { recursive: true });
    const workspace = mkdtempSync(join(parent, `${input.promptId}-${input.condition}-`));

    try {
      let written: string[];
      try {
        written = writeWorkspace(workspace, input.files);
      } catch (error) {
        if (!(error instanceof UnsafePathError)) throw error;
        return {
          compile: { ok: false, errors: [error.message], filesChecked: 0 },
          run: DID_NOT_RUN('the answer named a path that is not allowed'),
          durationMs: Math.round(performance.now() - started),
        };
      }

      const compile = compileFiles(workspace, written, this.options.demoRoot);
      const demo = await this.serverFor(input.mutation ?? '');
      const run = runPlaywright({
        workspace,
        demoRoot: this.options.demoRoot,
        specs: written,
        baseUrl: demo.baseUrl,
      });
      return { compile, run, durationMs: Math.round(performance.now() - started) };
    } finally {
      if (this.options.keep !== true) rmSync(workspace, { recursive: true, force: true });
    }
  }

  async close(): Promise<void> {
    const running = this.server;
    this.server = undefined;
    await running?.demo.stop();
  }
}
