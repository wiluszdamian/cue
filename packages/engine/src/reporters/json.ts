import { countBySeverity } from '../diagnostic.js';
import type { Reporter } from './index.js';

/** Machine-readable, stable field order, safe to diff between runs. */
export const jsonReporter: Reporter = ({ result }) =>
  JSON.stringify(
    {
      schemaVersion: 1,
      summary: {
        ...countBySeverity(result.diagnostics),
        filesAnalyzed: result.filesAnalyzed,
        filesSkipped: result.skipped.length,
      },
      diagnostics: result.diagnostics,
      skipped: result.skipped,
    },
    null,
    2,
  );
