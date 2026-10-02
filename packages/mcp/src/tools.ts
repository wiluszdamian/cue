import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  estimateTokens,
  findProductRoot,
  formatLocatorAnswer,
  loadRules,
  resolveLocator,
  whoOwns,
  workingTreeFiles,
  type Rule,
  type Rules,
} from '@understudy/engine';
import { CONSTITUTION, OWNERSHIP, TAGS } from './generated/rules.js';

/**
 * The tools as plain functions, so behaviour is testable without a transport
 * and the budgets below can be asserted against every reachable output.
 *
 * All of them are point lookups: a tool that returns a wall of text competes with
 * the work. Browser exploration goes through `playwright-cli` instead.
 */

/** Paid out of the context the real task needs, so the ceiling is asserted, not intended. */
export const TOKEN_BUDGET = {
  explain_rule: 400,
  resolve_owner: 300,
  resolve_locator: 350,
  resolve_route: 350,
  resolve_api: 350,
  get_evidence: 300,
  get_freshness: 250,
  find_knowledge: 350,
  /** The most a caller may ask for; a smaller `maxTokens` is honoured below this. */
  get_context: 3000,
} as const;

export { estimateTokens };

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

export interface ToolContext {
  readonly rules: Rules;
  readonly projectRoot: string;
}

/**
 * From `rules/` when the project has one, the bundled copy otherwise — which is
 * the normal case. An earlier version crashed on startup there, and a stdio
 * client reports that only as "connection closed".
 */
export function loadContext(projectRoot: string, rulesDir?: string): ToolContext {
  const local = rulesDir ?? join(projectRoot, 'rules');

  if (existsSync(join(local, 'constitution.yaml'))) {
    try {
      return { rules: loadRules(local), projectRoot };
    } catch {
      // A malformed local rules/ must not take the server down with it.
    }
  }

  return {
    rules: { constitution: CONSTITUTION, tags: TAGS, ownership: OWNERSHIP, dir: local },
    projectRoot,
  };
}

// ------------------------------------------------------------- explain_rule

function renderRule(rule: Rule): string {
  const lines = [
    `${rule.id} · ${rule.tier} · ${rule.severity}`,
    '',
    `Why: ${oneLine(rule.rationale)}`,
    `Instead: ${oneLine(rule.message)}`,
    '',
    'wrong:',
    rule.examples.bad.trimEnd(),
    'right:',
    rule.examples.good.trimEnd(),
  ];

  if (rule.detector.kind === 'manual') {
    // An agent told a rule is enforced will iterate against the linter, and no
    // linter can check this one.
    lines.push('', 'Not mechanically enforced — checked in review, binding all the same.');
  }
  if (rule.detector.kind === 'knowledge') {
    // The linter is silent where there is no .agent-kb, and silent about what the code
    // cannot decide; an agent should not read that silence as a clean bill.
    lines.push(
      '',
      'Checked against .agent-kb only, and only getByRole/getByTestId/getByLabel with literal',
      'arguments. Silence means nothing was found, not that everything was checked: run `understudy check`.',
    );
  }
  return lines.join('\n');
}

export function explainRule(context: ToolContext, ruleId: string): string {
  const rule = context.rules.constitution.rules.find((r) => r.id === ruleId);
  if (!rule) {
    // The list is short: naming every rule beats a second round trip.
    return [
      `No rule called "${ruleId}".`,
      '',
      `Rules: ${context.rules.constitution.rules.map((r) => r.id).join(', ')}`,
    ].join('\n');
  }
  return renderRule(rule);
}

// ------------------------------------------------------------ resolve_owner

export function resolveOwner(context: ToolContext, topic: string): string {
  const answer = whoOwns(context.rules.ownership, topic);

  if (answer.kind === 'unowned') {
    return [
      `No owner is declared for "${topic}".`,
      '',
      'This is a gap in rules/ownership.yaml, not an open question. Say the topic',
      'is unowned and ask — do not pick a convention on the spot.',
    ].join('\n');
  }

  const { best, contested, alternatives } = answer;
  const lines = [
    `Topic: ${best.topic.topic}`,
    `Owner: ${best.owner.id} (${best.owner.kind})`,
    best.topic.precedence === 'absolute'
      ? 'Precedence: ABSOLUTE — beats any other source that says otherwise.'
      : 'Precedence: default — unless an absolute owner also covers this.',
    ...(best.topic.channel === undefined ? [] : [`Use via: ${best.topic.channel}`]),
    '',
    `Do: ${oneLine(best.owner.consult)}`,
  ];

  if (best.topic.note !== undefined) lines.push(`Note: ${oneLine(best.topic.note)}`);
  if (contested && alternatives[0]) {
    lines.push(
      '',
      `Contested with "${alternatives[0].topic.topic}" (${alternatives[0].owner.id}).`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------- resolve_locator

export function resolveLocatorTool(context: ToolContext, element: string, route?: string): string {
  const productRoot = findProductRoot(context.projectRoot);
  return formatLocatorAnswer(
    resolveLocator({
      projectRoot: context.projectRoot,
      query: element,
      route,
      files: productRoot === undefined ? undefined : workingTreeFiles(productRoot),
    }),
  );
}

export {
  findKnowledge,
  getContext,
  getEvidence,
  getFreshness,
  resolveApi,
  resolveRoute,
} from './knowledge-tools.js';
