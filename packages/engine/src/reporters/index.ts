import type { AnalysisResult } from '../diagnostic.js';
import type { Constitution } from '../schema/constitution.js';

export interface ReportContext {
  readonly result: AnalysisResult;
  readonly constitution: Constitution;
  /** Absolute path the diagnostic paths are relative to. */
  readonly root: string;
}

export type Reporter = (ctx: ReportContext) => string;

export { prettyReporter } from './pretty.js';
export { jsonReporter } from './json.js';
export { sarifReporter } from './sarif.js';
export { githubReporter } from './github.js';
export { agentReporter } from './agent.js';

import { prettyReporter } from './pretty.js';
import { jsonReporter } from './json.js';
import { sarifReporter } from './sarif.js';
import { githubReporter } from './github.js';
import { agentReporter } from './agent.js';

export const REPORTERS = {
  pretty: prettyReporter,
  json: jsonReporter,
  sarif: sarifReporter,
  github: githubReporter,
  agent: agentReporter,
} as const satisfies Record<string, Reporter>;

export type ReporterName = keyof typeof REPORTERS;

export const REPORTER_NAMES = Object.keys(REPORTERS) as ReporterName[];

export function getReporter(name: string): Reporter {
  const reporter = (REPORTERS as Record<string, Reporter | undefined>)[name];
  if (!reporter) {
    throw new Error(`unknown reporter "${name}". Available: ${REPORTER_NAMES.join(', ')}`);
  }
  return reporter;
}
