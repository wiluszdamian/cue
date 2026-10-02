import type { Diagnostic } from '../diagnostic.js';
import type { Severity } from '../schema/constitution.js';
import type { LocatorFinding, LocatorVerdict } from './locator-analyzer.js';

/**
 * Turning a finding into the diagnostic every reporter, the SARIF writer and the
 * lint rule already understand. The one place that decides how bad each verdict is.
 */

/** The rule this belongs to. The constitution states it; this is what enforces it. */
export const KNOWLEDGE_RULE_ID = 'selectors-from-agent-kb';

/** Verdicts that are findings. `known` is fine and `undecidable` is not judged. */
export const REPORTED_VERDICTS: ReadonlySet<LocatorVerdict> = new Set([
  'unknown',
  'wrong-route',
  'ambiguous',
  'stale',
  'unverified',
]);

/**
 * An invented locator, or a real one on the wrong page, fails at runtime. The
 * others work today and may not tomorrow, or may need narrowing.
 */
export function severityOf(verdict: LocatorVerdict): Severity {
  return verdict === 'unknown' || verdict === 'wrong-route' ? 'error' : 'warn';
}

export function findingToDiagnostic(
  finding: LocatorFinding,
  file: string,
  docsUrl: string,
): Diagnostic | undefined {
  if (!REPORTED_VERDICTS.has(finding.verdict)) return undefined;
  return {
    ruleId: KNOWLEDGE_RULE_ID,
    file,
    line: finding.line,
    column: finding.column,
    endLine: finding.endLine,
    endColumn: finding.endColumn,
    severity: severityOf(finding.verdict),
    message: finding.suggestion,
    docsUrl,
    snippet: finding.expression,
  };
}
