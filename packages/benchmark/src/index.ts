/**
 * @understudy/benchmark — does the layer change what an assistant writes?
 *
 * Two comparisons, never absolutes: constitution violations per generated file,
 * and the share of selectors naming something real. Same prompts, same model,
 * layer present and absent.
 */

export {
  CONDITIONS,
  detectRuns,
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

export {
  PROMPTS,
  PROMPT_SET_V2_VERSION,
  PROMPT_SET_VERSION,
  PROMPT_SETS,
  PROMPTS_V1,
  PROMPTS_V2,
  promptSet,
  promptsExercising,
  type Prompt,
  type PromptSet,
} from './prompts.js';

export {
  summariseExecution,
  type CompileResult,
  type ExecutionInput,
  type ExecutionResult,
  type ExecutionSummary,
  type Executor,
  type RunResult,
  type RunStatus,
} from './execution.js';
export { compileFiles } from './compile.js';
export { DemoExecutor, type DemoExecutorOptions } from './executor.js';
export { startDemo, type RunningDemo } from './demo-server.js';
export { summarisePlaywrightReport, type PlaywrightJsonReport } from './playwright-run.js';
export { safeWorkspacePath, UnsafePathError, writeWorkspace } from './workspace.js';

export {
  scoreCompliance,
  scoreGrounding,
  scoreLocators,
  type ComplianceScore,
  type GeneratedFile,
  type GroundingScore,
  type LocatorScore,
} from './scoring.js';

export {
  buildContext,
  compare,
  runBenchmark,
  type BenchmarkResult,
  type Comparison,
  type ConditionResult,
  type MutationCheck,
  type MutationOutcome,
  type MutationSummary,
  type NotMeasured,
  type RunOptions,
  type RunSummary,
  type SampleResult,
  type TokenUsage,
} from './runner.js';

export { formatMarkdown, formatReport, toJson } from './report.js';
export {
  collectMetadata,
  spread,
  type MetadataSources,
  type RunMetadata,
  type Spread,
} from './metadata.js';
