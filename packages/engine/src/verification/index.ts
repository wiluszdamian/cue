export {
  analyzeLocators,
  type AnalyzeLocatorsInput,
  type LocatorFinding,
  type LocatorVerdict,
  type NearestFact,
} from './locator-analyzer.js';

export {
  findingToDiagnostic,
  type DiagnosticOptions,
  KNOWLEDGE_RULE_ID,
  REPORTED_VERDICTS,
  severityOf,
} from './diagnostics.js';
