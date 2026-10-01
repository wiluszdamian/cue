import type { KbElement, KbLink } from '../../schema/agent-kb.js';

/**
 * What a browser tool printed, before anyone has interpreted it. Keeping this
 * separate from the observation is the point: the text format belongs to somebody
 * else and changes without notice, so only one module per format may read it.
 */
export interface RawSnapshot {
  readonly text: string;
  /** From `playwright-cli --version`, when the driver could ask. Named in errors. */
  readonly cliVersion?: string;
  readonly capturedAt: string;
}

/** What a page looked like, in terms the knowledge base understands. */
export interface NormalizedBrowserObservation {
  readonly url?: string;
  readonly title: string;
  /** The raw accessibility tree, hashed so drift is detectable without a diff. */
  readonly tree: string;
  readonly elements: readonly KbElement[];
  readonly links: readonly KbLink[];
  /** The format that produced this, e.g. `playwright-cli/markdown-yaml@1`. */
  readonly format: string;
  /** Lines the parser did not understand. Reported, never silently dropped. */
  readonly warnings: readonly string[];
}

/** Kept under its old name for the callers that predate the split. */
export type ParsedSnapshot = NormalizedBrowserObservation;

export interface SnapshotFormat {
  readonly id: string;
  detect(raw: RawSnapshot): boolean;
  parse(raw: RawSnapshot): NormalizedBrowserObservation;
}
