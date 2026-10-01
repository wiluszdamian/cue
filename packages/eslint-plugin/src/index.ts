import { readFileSync } from 'node:fs';
import type { TSESLint } from '@typescript-eslint/utils';
import { isEnforceable, type Rule } from '@understudy/engine';
import { buildRule, type UnderstudyRule } from './create-rule.js';
import { CANONICAL_TAGS, CONSTITUTION, TAGS } from './generated/constitution.js';

/**
 * The mechanical half of Understudy: every rule generated from
 * rules/constitution.yaml, so this is the same opinion made enforceable rather
 * than a second one. It runs with no agent involved — in CI, in an editor, and in
 * two years.
 */

const enforceable = CONSTITUTION.rules.filter(isEnforceable);

export const rules: Record<string, UnderstudyRule> = Object.fromEntries(
  enforceable.map((rule) => [rule.id, buildRule(rule)]),
);

/**
 * Rules the constitution declares but cannot check. Exposed so `doctor` and the
 * docs can state plainly which parts of the standard are enforced and which rest
 * on review — a standard that overstates its own teeth stops being believed.
 */
export const manualRules: readonly Rule[] = CONSTITUTION.rules.filter((r) => !isEnforceable(r));

/**
 * Read rather than written down, so it cannot drift from package.json. The same
 * relative path resolves from `src/` under test and from `dist/` once built.
 */
function packageVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const version = (manifest as { version?: unknown }).version;
  return typeof version === 'string' ? version : '0.0.0';
}

const plugin = {
  meta: { name: '@understudy/eslint-plugin', version: packageVersion() },
  rules,
} satisfies TSESLint.FlatConfig.Plugin;

type Severity = 'error' | 'warn';

function ruleSettings(
  pick: (rule: (typeof enforceable)[number]) => Severity,
): TSESLint.FlatConfig.Rules {
  return Object.fromEntries(enforceable.map((rule) => [`understudy/${rule.id}`, pick(rule)]));
}

/**
 * `recommended` uses each rule's own severity: warnings are the rules where a
 * considered exception is legitimate. `strict` promotes everything to error for
 * repos that would rather argue about the exception up front.
 */
export const configs = {
  recommended: [
    {
      name: 'understudy/recommended',
      plugins: { understudy: plugin },
      rules: ruleSettings((rule) => rule.severity),
    },
  ],
  strict: [
    {
      name: 'understudy/strict',
      plugins: { understudy: plugin },
      rules: ruleSettings(() => 'error'),
    },
  ],
} satisfies Record<string, TSESLint.FlatConfig.ConfigArray>;

export { CANONICAL_TAGS, CONSTITUTION, TAGS };
export default { ...plugin, configs };
