import { markdownYamlV1 } from './markdown-yaml-v1.js';
import type { NormalizedBrowserObservation, RawSnapshot, SnapshotFormat } from './types.js';

/**
 * The seam between a browser tool and the knowledge base:
 *
 *     driver → RawSnapshot → SnapshotFormat → NormalizedBrowserObservation → survey
 *
 * A new Playwright CLI release that prints something else adds a format here; the
 * knowledge base never learns the difference. Text that no format recognises is an
 * error, because the alternative is an empty or partial map that reads as a claim
 * about the page.
 */

export { hashSnapshot, locatorFor, routeFromUrl, routeToFilename } from './shared.js';
export { MARKDOWN_YAML_V1 } from './markdown-yaml-v1.js';
export type {
  NormalizedBrowserObservation,
  ParsedSnapshot,
  RawSnapshot,
  SnapshotFormat,
} from './types.js';

/** Newest first, so a format that is a superset of an older one wins. */
export const SNAPSHOT_FORMATS: readonly SnapshotFormat[] = [markdownYamlV1];

export class UnsupportedSnapshotFormatError extends Error {
  constructor(
    readonly cliVersion: string | undefined,
    readonly supported: readonly string[],
  ) {
    super(
      `The browser tool's output is not a snapshot format Understudy understands` +
        `${cliVersion === undefined ? '' : ` (playwright-cli ${cliVersion})`}.\n` +
        `Supported: ${supported.join(', ')}.\n` +
        'Nothing was written. Install a supported @playwright/cli (see docs/help/troubleshooting.md),\n' +
        'or capture a snapshot another way and pass it with --from <file>.',
    );
    this.name = 'UnsupportedSnapshotFormatError';
  }
}

export function parseRawSnapshot(raw: RawSnapshot): NormalizedBrowserObservation {
  const format = SNAPSHOT_FORMATS.find((candidate) => candidate.detect(raw));
  if (format === undefined) {
    throw new UnsupportedSnapshotFormatError(
      raw.cliVersion,
      SNAPSHOT_FORMATS.map((candidate) => candidate.id),
    );
  }
  return format.parse(raw);
}

/**
 * Text in, observation out. Kept for callers that have no driver and so no CLI
 * version; new code should build a `RawSnapshot` and call `parseRawSnapshot`.
 */
export function parseSnapshot(output: string): NormalizedBrowserObservation {
  return parseRawSnapshot({ text: output, capturedAt: new Date().toISOString() });
}
