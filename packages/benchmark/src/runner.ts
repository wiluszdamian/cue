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

/** One answer, scored every way it can be. */
export interface SampleResult {
  readonly promptId: string;
  readonly condition: Condition;
  /** Where each generated file went. */
  readonly files: readonly string[];
  readonly compliance: ComplianceScore;
  /** Against the knowledge base, with route context. Present when one was used. */
  readonly locators?: LocatorScore;
  /** Present when the answer was compiled and run. */
  readonly execution?: ExecutionResult;
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
}

export interface BenchmarkResult {
  readonly promptSetVersion: number;
  readonly prompts: number;
  readonly agent: string;
  readonly model: string;
  readonly conditions: readonly ConditionResult[];
  /** Routes the knowledge base had at scoring time. Context for the numbers. */
  readonly surveyedRoutes: readonly string[];
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
  /**
   * Compiles and runs each answer. Without one the answers are scored statically,
   * as they always were.
   */
  readonly executor?: Executor;
  /** Judge locators against `.agent-kb`. Always on when answers are executed. */
  readonly judgeLocators?: boolean;
  readonly now?: Date;
}

export async function runBenchmark(options: RunOptions): Promise<BenchmarkResult> {
  const prompts = options.prompts ?? PROMPTS;
  const conditions: ConditionResult[] = [];
  let model = 'unknown';

  const index: KnowledgeIndex | undefined =
    options.executor !== undefined || options.judgeLocators === true
      ? indexKnowledge(loadKnowledge(options.projectRoot, options.now).kb)
      : undefined;

  try {
    for (const condition of CONDITIONS) {
      const responses: AgentResponse[] = [];
      const files: GeneratedFile[] = [];
      const samples: SampleResult[] = [];
      const executions: ExecutionResult[] = [];

      for (const prompt of prompts) {
        const response = await options.agent.run({
          prompt,
          condition,
          context: buildContext(options.projectRoot, condition),
        });
        responses.push(response);
        model = response.model;

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
        if (execution !== undefined) executions.push(execution);

        samples.push({
          promptId: prompt.id,
          condition,
          files: sampleFiles.map((file) => file.path),
          compliance: scoreCompliance(sampleFiles, options.rules.constitution, options.rules.tags),
          ...(index === undefined
            ? {}
            : { locators: scoreLocators(sampleFiles, index, options.now) }),
          ...(execution === undefined ? {} : { execution }),
        });
      }

      conditions.push({
        condition,
        compliance: scoreCompliance(files, options.rules.constitution, options.rules.tags),
        grounding: scoreGrounding(files, options.projectRoot),
        responses,
        samples,
        ...(index === undefined ? {} : { locators: scoreLocators(files, index, options.now) }),
        ...(options.executor === undefined ? {} : { execution: summariseExecution(executions) }),
      });
    }
  } finally {
    await options.executor?.close?.();
  }

  return {
    promptSetVersion: options.promptSetVersion ?? PROMPT_SET_VERSION,
    prompts: prompts.length,
    agent: options.agent.name,
    model,
    conditions,
    surveyedRoutes: readAllRouteMaps(options.projectRoot).map((m) => m.map.route),
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
