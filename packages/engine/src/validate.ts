import { parseSelector } from './detectors/esquery.js';
import { getFixer } from './detectors/fixers.js';
import { REFINEMENTS } from './detectors/refinements.js';
import type { Rules } from './loader.js';
import { whoOwns } from './ownership.js';

/**
 * The checks Zod cannot express, because they involve code rather than data: does
 * the selector parse, does the named refinement exist, does an autofixable rule
 * have a fixer. They run in CI on every change to rules/, which is what stops the
 * constitution claiming enforcement it does not have.
 */

export interface ValidationProblem {
  readonly ruleId: string;
  readonly field: string;
  readonly message: string;
}

/**
 * Each `skill` a rule cites must be claimed by a topic owned with absolute
 * precedence, or a rule can appear under a topic whose ownership nobody decided.
 */
function validateConstitutionIsOwned(rules: Rules): ValidationProblem[] {
  const problems: ValidationProblem[] = [];

  const claimed = new Map<string, string[]>();
  for (const topic of rules.ownership.topics) {
    for (const skill of topic.skills) {
      claimed.set(skill, [...(claimed.get(skill) ?? []), topic.topic]);
    }
  }

  const seen = new Set<string>();
  for (const rule of rules.constitution.rules) {
    if (seen.has(rule.skill)) continue;
    seen.add(rule.skill);

    const topics = claimed.get(rule.skill) ?? [];
    if (topics.length === 0) {
      problems.push({
        ruleId: rule.id,
        field: 'skill',
        message:
          `cites skill "${rule.skill}", which no topic in rules/ownership.yaml claims. ` +
          `Add it to the skills list of an cue-owned topic — a constitution rule ` +
          `on a topic nobody owns is the ambiguity the table exists to remove.`,
      });
      continue;
    }

    for (const name of topics) {
      const topic = rules.ownership.topics.find((t) => t.topic === name);
      if (!topic) continue;
      if (topic.owner !== 'cue' || topic.precedence !== 'absolute') {
        problems.push({
          ruleId: rule.id,
          field: 'skill',
          message:
            `cites skill "${rule.skill}", claimed by topic "${name}" which is owned by ` +
            `"${topic.owner}" at precedence "${topic.precedence}". Every topic the ` +
            `constitution covers must be cue-owned with absolute precedence.`,
        });
      }
    }
  }

  return problems;
}

/**
 * A topic nothing can reach never arbitrates. Catches a keyword list so narrow
 * that `whoOwns` misses the topic even when handed its own wording.
 */
function validateTopicsAreReachable(rules: Rules): ValidationProblem[] {
  const problems: ValidationProblem[] = [];

  for (const topic of rules.ownership.topics) {
    const answer = whoOwns(rules.ownership, topic.topic);
    if (answer.kind === 'unowned') {
      problems.push({
        ruleId: topic.topic,
        field: 'keywords',
        message:
          'no keyword matches the wording of the topic itself, so whoOwns can never reach it',
      });
    } else if (answer.best.topic.topic !== topic.topic) {
      problems.push({
        ruleId: topic.topic,
        field: 'keywords',
        message:
          `asking about this topic by name resolves to "${answer.best.topic.topic}" instead. ` +
          `The two topics overlap; make the keywords more specific or merge them.`,
      });
    }
  }

  return problems;
}

export function validateRules(rules: Rules): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const tagNames = new Set(rules.tags.tags.map((t) => t.name));

  for (const rule of rules.constitution.rules) {
    if (rule.detector.kind === 'ast') {
      try {
        parseSelector(rule.detector.selector);
      } catch (error) {
        problems.push({
          ruleId: rule.id,
          field: 'detector.selector',
          message: `not a valid esquery selector: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }

      if (rule.detector.refine && !(rule.detector.refine in REFINEMENTS)) {
        problems.push({
          ruleId: rule.id,
          field: 'detector.refine',
          message: `no refinement named "${rule.detector.refine}" is registered. Add it to packages/engine/src/detectors/refinements.ts.`,
        });
      }
    }

    if (rule.detector.kind === 'regex') {
      try {
        new RegExp(rule.detector.pattern, rule.detector.flags);
      } catch (error) {
        problems.push({
          ruleId: rule.id,
          field: 'detector.pattern',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (rule.autofix && !getFixer(rule.id)) {
      problems.push({
        ruleId: rule.id,
        field: 'autofix',
        message:
          'declared autofixable but no fixer is registered. Add one to packages/engine/src/detectors/fixers.ts, or set autofix: false.',
      });
    }

    // An undefined tag sends an agent chasing one that fails the rule being explained.
    for (const tag of rule.message.match(/@[a-z][a-z0-9-]*/g) ?? []) {
      if (!tagNames.has(tag) && !rule.message.includes(`${tag}(`)) {
        problems.push({
          ruleId: rule.id,
          field: 'message',
          message: `mentions "${tag}", which is not in rules/tags.yaml`,
        });
      }
    }
  }

  problems.push(...validateConstitutionIsOwned(rules));
  problems.push(...validateTopicsAreReachable(rules));

  return problems;
}

export function formatValidationProblems(problems: readonly ValidationProblem[]): string {
  return problems.map((p) => `  ${p.ruleId} · ${p.field}\n      ${p.message}`).join('\n');
}
