/**
 * @understudy/benchmark — does the layer change what an assistant writes?
 *
 * Two comparisons, never absolutes: constitution violations per generated file,
 * and the share of selectors naming something real. Same prompts, same model,
 * layer present and absent.
 */

export {
  CONDITIONS,
  extractCode,
  missingRecordings,
  record,
  RecordedAgent,
  recordingPath,
  type Agent,
  type AgentRequest,
  type AgentResponse,
  type Condition,
} from './agent.js';

export {
  anthropicCompletion,
  ClaudeAgent,
  DEFAULT_MODEL,
  defaultPath,
  INSTRUCTIONS,
  parseFiles,
  systemPrompt,
  type ClaudeAgentOptions,
  type Completion,
} from './live-agent.js';

export { recordRun, type RecordOptions, type RecordSummary } from './record-run.js';

export { PROMPTS, PROMPT_SET_VERSION, promptsExercising, type Prompt } from './prompts.js';

export {
  scoreCompliance,
  scoreGrounding,
  type ComplianceScore,
  type GeneratedFile,
  type GroundingScore,
} from './scoring.js';

export {
  buildContext,
  compare,
  runBenchmark,
  type BenchmarkResult,
  type Comparison,
  type ConditionResult,
  type RunOptions,
} from './runner.js';

export { formatReport, toJson } from './report.js';
