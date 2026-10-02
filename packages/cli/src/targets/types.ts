import type { Rules } from '@wiluszdamian/cue-engine';
import type { TargetId } from '../agents.js';
import type { DesiredFile } from '../install.js';
import type { PackageManager } from '../package-manager.js';

/**
 * What one agent needs beyond the baseline.
 *
 * `AGENTS.md` is the floor, not an option: Codex, Cursor, OpenCode, Gemini and
 * Grok read it natively, so five of six agents need no adapter and Claude Code
 * is the only one with its own instruction file.
 *
 * Keeping this thin is the point: each agent changes its config format on its own
 * schedule, and that churn is a standing tax.
 */

export interface TargetContext {
  readonly projectRoot: string;
  readonly packageManager: PackageManager;
  readonly rules: Rules;
  readonly cueVersion: string;
  /** Default true; `--bare` turns it off for a repository that already has a suite. */
  readonly scaffold?: boolean;
}

export interface Target {
  readonly id: TargetId;
  readonly name: string;
  /** One line, shown in the target picker. */
  readonly summary: string;
  /** Installed unconditionally, and cannot be removed. */
  readonly baseline?: boolean;
  /**
   * What this target cannot do. `doctor` prints these: an agent silently
   * half-configured is worse than one known to be unsupported.
   */
  readonly limitations?: readonly string[];
  files(context: TargetContext): DesiredFile[];
}
