import { spawnSync } from 'node:child_process';

/**
 * Running an external program. The executable and its arguments travel
 * separately and are never joined into a string: a URL is user input, and a shell
 * would read `&`, `|` or `^` in it as syntax rather than as part of one argument.
 */

export interface RunResult {
  readonly ok: boolean;
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Spawn failure (not found, timeout), as opposed to a non-zero exit. */
  readonly error?: string;
}

export interface RunOptions {
  readonly timeoutMs?: number;
  readonly cwd?: string;
}

export interface ProcessRunner {
  run(executable: string, args: readonly string[], options?: RunOptions): RunResult;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export const nodeRunner: ProcessRunner = {
  run(executable, args, options = {}) {
    const result = spawnSync(executable, [...args], {
      encoding: 'utf8',
      // Never a shell. A `.cmd` shim cannot be spawned this way, which is why
      // resolve.ts finds the script behind it instead.
      shell: false,
      windowsHide: true,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    });

    return {
      ok: result.error === undefined && result.status === 0,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      ...(result.error === undefined ? {} : { error: result.error.message }),
    };
  },
};
