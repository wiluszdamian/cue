import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAllRouteMaps, type Rules } from '@understudy/engine';
import { CONDITIONS, type Agent, type AgentResponse, type Condition } from './agent.js';
import { PROMPTS, PROMPT_SET_VERSION, type Prompt } from './prompts.js';
import {
  scoreCompliance,
  scoreGrounding,
  type ComplianceScore,
  type GeneratedFile,
  type GroundingScore,
} from './scoring.js';

/**
 * Running the whole set and comparing the two conditions.
 *
 * The comparison is the point: an absolute violation count is not comparable with
 * anybody else's, but the same prompts and model with the layer present and
 * absent are. No clear difference means the premise is wrong.
 */

export interface ConditionResult {
  readonly condition: Condition;
  readonly compliance: ComplianceScore;
  readonly grounding: GroundingScore;
  readonly responses: readonly AgentResponse[];
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
}

export async function runBenchmark(options: RunOptions): Promise<BenchmarkResult> {
  const prompts = options.prompts ?? PROMPTS;
  const conditions: ConditionResult[] = [];
  let model = 'unknown';

  for (const condition of CONDITIONS) {
    const responses: AgentResponse[] = [];
    const files: GeneratedFile[] = [];

    for (const prompt of prompts) {
      const response = await options.agent.run({
        prompt,
        condition,
        context: buildContext(options.projectRoot, condition),
      });
      responses.push(response);
      model = response.model;
      files.push(
        ...(response.files ?? [
          { path: `tests/app/functional/${prompt.id}.spec.ts`, source: response.code },
        ]),
      );
    }

    conditions.push({
      condition,
      compliance: scoreCompliance(files, options.rules.constitution, options.rules.tags),
      grounding: scoreGrounding(files, options.projectRoot),
      responses,
    });
  }

  return {
    promptSetVersion: PROMPT_SET_VERSION,
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
