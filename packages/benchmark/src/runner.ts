import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  indexKnowledge,
  loadKnowledge,
  readAllRouteMaps,
  type KnowledgeIndex,
  type Rules,
} from '@understudy/engine';
import { CONDITIONS, type Agent, type AgentResponse, type Condition } from './agent.js';
import {
  summariseExecution,
  type ExecutionResult,
  type ExecutionSummary,
  type Executor,
} from './execution.js';
import { spread, type RunMetadata, type Spread } from './metadata.js';
import { PROMPTS, PROMPT_SET_VERSION, type Prompt } from './prompts.js';
import {
  scoreCompliance,
  scoreGrounding,
  scoreLocators,
  type ComplianceScore,
  type GeneratedFile,
  type GroundingScore,
  type LocatorScore,
} from './scoring.js';

/**
 * Running the whole set and comparing the two conditions.
 *
 * The comparison is the point: an absolute violation count is not comparable with
 * anybody else's, but the same prompts and model with the layer present and
 * absent are. No clear difference means the premise is wrong.
 */

/**
 * Did a test that passed on the correct application fail once a defect was put into
 * it? `detected` means it failed; whether it failed for the intended reason is not
 * checked here and is for a person to read.
 */
export type MutationOutcome = 'detected' | 'missed' | 'not-applicable';

export interface MutationCheck {
  readonly id: string;
  readonly outcome: MutationOutcome;
}

export interface MutationSummary {
  /** Answers to a prompt that names a defect. */
  readonly eligible: number;
  readonly detected: number;
  readonly missed: number;
  /** The test did not pass on the correct application, so there was nothing to break. */
  readonly notApplicable: number;
}

/** One answer, scored every way it can be. */
export interface SampleResult {
  readonly promptId: string;
  readonly condition: Condition;
  /** Which repetition, from 1. */
  readonly run: number;
  /** Where each generated file went. */
  readonly files: readonly string[];
  readonly compliance: ComplianceScore;
  /** Against the knowledge base, with route context. Present when one was used. */
  readonly locators?: LocatorScore;
  /** Present when the answer was compiled and run. */
  readonly execution?: ExecutionResult;
  /** Present when the prompt names a defect and the answer was run. */
  readonly mutation?: MutationCheck;
}

/** One repetition of the whole set in one condition, as fractions so runs can be compared. */
export interface RunSummary {
  readonly run: number;
  readonly execution?: ExecutionSummary;
  readonly passedFirstRunRate?: number;
  readonly compileRate?: number;
  readonly validLocatorRate?: number;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** How many answers reported usage at all. */
  readonly answers: number;
}

export interface ConditionResult {
  readonly condition: Condition;
  readonly compliance: ComplianceScore;
  readonly grounding: GroundingScore;
  readonly responses: readonly AgentResponse[];
  readonly samples: readonly SampleResult[];
  /** Every locator in the condition, judged by the checker. */
  readonly locators?: LocatorScore;
  /** Compile and first-run numbers. Present only when the answers were executed. */
  readonly execution?: ExecutionSummary;
  readonly mutations?: MutationSummary;
  /** One entry per repetition. Present when answers were executed or locators judged. */
  readonly perRun?: readonly RunSummary[];
  /** How much the repetitions differ, when there is more than one. */
  readonly spread?: {
    readonly passedFirstRun?: Spread;
    readonly compile?: Spread;
    readonly validLocators?: Spread;
  };
  /** Undefined when no answer reported usage: not recorded, which is not zero. */
  readonly usage?: TokenUsage;
  readonly modelMilliseconds?: number;
}

/** A metric the instrument does not produce, and why. Printed rather than shown as 0. */
export interface NotMeasured {
  readonly metric: string;
  readonly reason: string;
}

export interface BenchmarkResult {
  readonly promptSetVersion: number;
  readonly prompts: number;
  /** Repetitions of each prompt in each condition. */
  readonly runs: number;
  readonly agent: string;
  /** Every model that produced an answer, joined; usually one. */
  readonly model: string;
  readonly conditions: readonly ConditionResult[];
  /** Routes the knowledge base had at scoring time. Context for the numbers. */
  readonly surveyedRoutes: readonly string[];
  readonly metadata?: RunMetadata;
  readonly startedAt: string;
  readonly durationMs: number;
  /**
   * Answers with no `recordedAt`: written by hand, not by a model. Any number here
   * above zero means the result is a test of the instrument, not a measurement.
   */
  readonly handWrittenAnswers: number;
  readonly notMeasured: readonly NotMeasured[];
}

/** Assembled from the actual files rather than paraphrased, so this tests what ships. */
export function buildContext(projectRoot: string, condition: Condition): string {
  if (condition === 'bare') return '';

  const parts: string[] = [];

  const agentsFile = join(projectRoot, 'AGENTS.md');
  if (existsSync(agentsFile)) parts.push(readFileSync(agentsFile, 'utf8'));

  const maps = readAllRouteMaps(projectRoot);
  if (maps.length > 0) {
    parts.push(
      '# What is known about this application\n\n' +
        maps
          .map(({ map, freshness }) =>
            [
              `## ${map.route} — ${map.title} (${freshness})`,
              ...map.elements.map(
                (element) =>
                  `- ${element.role} "${element.name ?? ''}" → \`${element.locator}\`` +
                  (element.testId === undefined ? '' : ` (data-testid: ${element.testId})`),
              ),
            ].join('\n'),
          )
          .join('\n\n'),
    );
  }

  return parts.join('\n\n---\n\n');
}

export interface RunOptions {
  readonly projectRoot: string;
  readonly agent: Agent;
  readonly rules: Rules;
  /** Defaults to the full set. Narrow it while iterating. */
  readonly prompts?: readonly Prompt[];
  /** Which prompt set `prompts` belongs to, recorded with the result. Defaults to 1. */
  readonly promptSetVersion?: number;
  /** Repetitions of every prompt in every condition. Defaults to 1. */
  readonly runs?: number;
  /**
   * Compiles and runs each answer. Without one the answers are scored statically,
   * as they always were.
   */
  readonly executor?: Executor;
  /** Judge locators against `.agent-kb`. Always on when answers are executed. */
  readonly judgeLocators?: boolean;
  /** Versions and environment, collected by the caller, printed with the numbers. */
  readonly metadata?: RunMetadata;
  readonly now?: Date;
}

/** What this instrument cannot see, said every time so an absence is never read as a zero. */
function notMeasured(executed: boolean, anyUsage: boolean): NotMeasured[] {
  const completion = 'the agent answers once, in a single completion, with no tools';
  return [
    {
      metric: 'browser exploration count',
      reason: `not measured: ${completion}, so it never explores`,
    },
    {
      metric: 'knowledge reuse rate',
      reason: `not measured: ${completion}; the knowledge base is handed to it whole`,
    },
    {
      metric: 'repair iterations',
      reason: 'not measured: an answer is never sent back with its errors',
    },
    {
      metric: 'flaky rerun rate',
      reason: executed
        ? 'not measured: each answer is run once, with no retries'
        : 'not measured: the answers were not run',
    },
    ...(anyUsage
      ? []
      : [{ metric: 'token usage', reason: 'not recorded: these answers carry no usage' }]),
  ];
}

const sum = (values: readonly number[]): number => values.reduce((total, v) => total + v, 0);

export async function runBenchmark(options: RunOptions): Promise<BenchmarkResult> {
  const startedAt = new Date();
  const prompts = options.prompts ?? PROMPTS;
  const runs = options.runs ?? 1;
  const conditions: ConditionResult[] = [];
  const models = new Set<string>();
  let handWritten = 0;
  let anyUsage = false;

  const index: KnowledgeIndex | undefined =
    options.executor !== undefined || options.judgeLocators === true
      ? indexKnowledge(loadKnowledge(options.projectRoot, options.now).kb)
      : undefined;

  try {
    for (const condition of CONDITIONS) {
      const responses: AgentResponse[] = [];
      const files: GeneratedFile[] = [];
      const samples: SampleResult[] = [];
      const context = buildContext(options.projectRoot, condition);

      for (let run = 1; run <= runs; run += 1) {
        for (const prompt of prompts) {
          const response = await options.agent.run({ prompt, condition, context, run });
          responses.push(response);
          models.add(response.model);
          if (response.recordedAt === undefined) handWritten += 1;
          if (response.usage !== undefined) anyUsage = true;

          const sampleFiles: GeneratedFile[] = [
            ...(response.files ?? [
              { path: `tests/app/functional/${prompt.id}.spec.ts`, source: response.code },
            ]),
          ];
          files.push(...sampleFiles);

          const execution =
            options.executor === undefined
              ? undefined
              : await options.executor.execute({
                  promptId: prompt.id,
                  condition,
                  files: sampleFiles,
                });

          samples.push({
            promptId: prompt.id,
            condition,
            run,
            files: sampleFiles.map((file) => file.path),
            compliance: scoreCompliance(
              sampleFiles,
              options.rules.constitution,
              options.rules.tags,
            ),
            ...(index === undefined
              ? {}
              : { locators: scoreLocators(sampleFiles, index, options.now) }),
            ...(execution === undefined ? {} : { execution }),
            ...(execution !== undefined && prompt.mutation !== undefined && options.executor
              ? {
                  mutation: await checkMutation(
                    options.executor,
                    prompt.id,
                    condition,
                    sampleFiles,
                    prompt.mutation,
                    execution,
                  ),
                }
              : {}),
          });
        }
      }

      conditions.push(
        summariseCondition({
          condition,
          options,
          responses,
          files,
          samples,
          runs,
          index,
        }),
      );
    }
  } finally {
    await options.executor?.close?.();
  }

  return {
    promptSetVersion: options.promptSetVersion ?? PROMPT_SET_VERSION,
    prompts: prompts.length,
    runs,
    agent: options.agent.name,
    model: [...models].join(', ') || 'unknown',
    conditions,
    surveyedRoutes: readAllRouteMaps(options.projectRoot).map((m) => m.map.route),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    handWrittenAnswers: handWritten,
    notMeasured: notMeasured(options.executor !== undefined, anyUsage),
  };
}

/** Put the defect in, run the same test again, and see whether it notices. */
async function checkMutation(
  executor: Executor,
  promptId: string,
  condition: Condition,
  files: readonly GeneratedFile[],
  mutation: string,
  clean: ExecutionResult,
): Promise<MutationCheck> {
  // A test that did not pass on the correct application has nothing to be broken.
  if (clean.run.status !== 'passed') return { id: mutation, outcome: 'not-applicable' };

  const mutated = await executor.execute({ promptId, condition, files, mutation });
  const outcome: MutationOutcome =
    mutated.run.status === 'failed'
      ? 'detected'
      : mutated.run.status === 'passed'
        ? 'missed'
        : 'not-applicable';
  return { id: mutation, outcome };
}

interface Gathered {
  readonly condition: Condition;
  readonly options: RunOptions;
  readonly responses: readonly AgentResponse[];
  readonly files: readonly GeneratedFile[];
  readonly samples: readonly SampleResult[];
  readonly runs: number;
  readonly index: KnowledgeIndex | undefined;
}

function summariseCondition(g: Gathered): ConditionResult {
  const { options, samples, index } = g;
  const executions = samples.flatMap((sample) => (sample.execution ? [sample.execution] : []));
  const executed = options.executor !== undefined;

  const perRun: RunSummary[] = [];
  if (executed || index !== undefined) {
    for (let run = 1; run <= g.runs; run += 1) {
      const these = samples.filter((sample) => sample.run === run);
      const ran = these.flatMap((sample) => (sample.execution ? [sample.execution] : []));
      const summary = executed ? summariseExecution(ran) : undefined;
      // Each answer was judged on its own; this repetition's rate is the sum of those.
      const judged = sum(these.map((sample) => sample.locators?.judged ?? 0));
      const known = sum(these.map((sample) => sample.locators?.known ?? 0));
      const locators = { validRate: judged === 0 ? undefined : known / judged };
      perRun.push({
        run,
        ...(summary === undefined ? {} : { execution: summary }),
        ...(summary === undefined || summary.samples === 0
          ? {}
          : {
              passedFirstRunRate: summary.passedFirstRun / summary.samples,
              compileRate: summary.compiled / summary.samples,
            }),
        ...(locators.validRate === undefined ? {} : { validLocatorRate: locators.validRate }),
      });
    }
  }

  const rates = (pick: (r: RunSummary) => number | undefined): number[] =>
    perRun.flatMap((r) => {
      const value = pick(r);
      return value === undefined ? [] : [value];
    });
  const spreads =
    g.runs > 1
      ? {
          passedFirstRun: spread(rates((r) => r.passedFirstRunRate)),
          compile: spread(rates((r) => r.compileRate)),
          validLocators: spread(rates((r) => r.validLocatorRate)),
        }
      : undefined;

  const checks = samples.flatMap((sample) => (sample.mutation ? [sample.mutation] : []));
  const usages = g.responses.flatMap((r) => (r.usage ? [r.usage] : []));
  const milliseconds = g.responses.flatMap((r) =>
    r.durationMs === undefined ? [] : [r.durationMs],
  );

  return {
    condition: g.condition,
    compliance: scoreCompliance(g.files, options.rules.constitution, options.rules.tags),
    grounding: scoreGrounding(g.files, options.projectRoot),
    responses: g.responses,
    samples,
    ...(index === undefined ? {} : { locators: scoreLocators(g.files, index, options.now) }),
    ...(executed ? { execution: summariseExecution(executions) } : {}),
    ...(checks.length === 0
      ? {}
      : {
          mutations: {
            eligible: checks.length,
            detected: checks.filter((c) => c.outcome === 'detected').length,
            missed: checks.filter((c) => c.outcome === 'missed').length,
            notApplicable: checks.filter((c) => c.outcome === 'not-applicable').length,
          },
        }),
    ...(perRun.length === 0 ? {} : { perRun }),
    ...(spreads === undefined
      ? {}
      : {
          spread: {
            ...(spreads.passedFirstRun === undefined
              ? {}
              : { passedFirstRun: spreads.passedFirstRun }),
            ...(spreads.compile === undefined ? {} : { compile: spreads.compile }),
            ...(spreads.validLocators === undefined
              ? {}
              : { validLocators: spreads.validLocators }),
          },
        }),
    ...(usages.length === 0
      ? {}
      : {
          usage: {
            inputTokens: sum(usages.map((u) => u.inputTokens ?? 0)),
            outputTokens: sum(usages.map((u) => u.outputTokens ?? 0)),
            answers: usages.length,
          },
        }),
    ...(milliseconds.length === 0 ? {} : { modelMilliseconds: sum(milliseconds) }),
  };
}

export interface Comparison {
  readonly violationsPerFile: { bare: number; understudy: number; change: number };
  readonly groundedRate: { bare: number | undefined; understudy: number | undefined };
  /** True when the layer measurably helped on both metrics. */
  readonly supportsPremise: boolean;
}

export function compare(result: BenchmarkResult): Comparison {
  const bare = result.conditions.find((c) => c.condition === 'bare');
  const understudy = result.conditions.find((c) => c.condition === 'understudy');

  const bareViolations = bare?.compliance.violationsPerFile ?? 0;
  const understudyViolations = understudy?.compliance.violationsPerFile ?? 0;
  const bareGrounded = bare?.grounding.groundedRate;
  const understudyGrounded = understudy?.grounding.groundedRate;

  return {
    violationsPerFile: {
      bare: bareViolations,
      understudy: understudyViolations,
      change: understudyViolations - bareViolations,
    },
    groundedRate: { bare: bareGrounded, understudy: understudyGrounded },
    supportsPremise:
      understudyViolations < bareViolations &&
      understudyGrounded !== undefined &&
      bareGrounded !== undefined &&
      understudyGrounded > bareGrounded,
  };
}
