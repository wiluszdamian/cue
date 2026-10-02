import type { Severity } from './schema/constitution.js';

/**
 * The one shape every reporter consumes. Positions are 1-based for line and
 * column, matching what editors, ESLint and SARIF all expect.
 */
export interface Diagnostic {
  readonly ruleId: string;
  /** Path as given to `analyze`, normalised to forward slashes. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly severity: Severity;
  /** The constitution's message, verbatim — written to be read by an agent. */
  readonly message: string;
  readonly docsUrl: string;
  /** The offending source text, for reporters that quote it. */
  readonly snippet: string;
  readonly fix?: Fix;
}

/** A byte-range replacement. Applied by the ESLint plugin, not by the engine. */
export interface Fix {
  readonly range: readonly [start: number, end: number];
  readonly text: string;
  readonly description: string;
}

export interface AnalysisSkip {
  readonly file: string;
  readonly reason: string;
}

export interface NotChecked {
  readonly ruleId: string;
  readonly reason: string;
}

export interface AnalysisResult {
  readonly diagnostics: readonly Diagnostic[];
  /** Files that could not be parsed. Never silently dropped. */
  readonly skipped: readonly AnalysisSkip[];
  /**
   * Rules that could not run at all, and why: a rule that checks against the
   * knowledge base, given none. Reported so that "no findings" is never mistaken
   * for "checked and clean".
   */
  readonly notChecked: readonly NotChecked[];
  readonly filesAnalyzed: number;
  readonly durationMs: number;
}

export function countBySeverity(diagnostics: readonly Diagnostic[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return { errors, warnings };
}

/** Stable ordering, so snapshots and CI output do not churn on directory order. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.column - b.column ||
      a.ruleId.localeCompare(b.ruleId),
  );
}
