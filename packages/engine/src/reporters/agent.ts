import type { Diagnostic } from '../diagnostic.js';
import type { Rule } from '../schema/constitution.js';
import type { Reporter } from './index.js';

/**
 * Output written to be read by a coding agent. Three differences from `pretty`:
 *
 * 1. Grouped by rule, not by file — repeated guidance costs context and makes an
 *    agent patch occurrences one at a time instead of changing its approach.
 * 2. The corrected example appears once per rule: a blocked write with no
 *    demonstrated alternative is what makes an agent route around the rule.
 * 3. Occurrence lists are capped and the remainder counted. Context budget is a
 *    functional requirement, not a nicety.
 */

const MAX_OCCURRENCES_SHOWN = 10;

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

function renderRule(rule: Rule, occurrences: readonly Diagnostic[]): string {
  const out: string[] = [];
  const label = rule.severity === 'error' ? 'BLOCKED' : 'WARNING';

  out.push(`## ${label}: ${rule.id} (${rule.tier})`);
  out.push('');
  out.push(`What is wrong: ${oneLine(rule.title)}.`);
  out.push(`Why: ${oneLine(rule.rationale)}`);
  out.push(`Do this instead: ${oneLine(rule.message)}`);
  out.push('');
  out.push('```ts');
  out.push('// wrong');
  out.push(rule.examples.bad.trimEnd());
  out.push('// right');
  out.push(rule.examples.good.trimEnd());
  out.push('```');
  out.push('');

  const shown = occurrences.slice(0, MAX_OCCURRENCES_SHOWN);
  out.push(`Occurrences (${occurrences.length}):`);
  for (const d of shown) {
    out.push(`- ${d.file}:${d.line}:${d.column}  ${d.snippet}`);
  }
  if (occurrences.length > shown.length) {
    out.push(`- …and ${occurrences.length - shown.length} more of the same rule.`);
  }

  if (rule.autofix) {
    out.push('');
    out.push('This rule is autofixable: `npx eslint --fix` resolves every occurrence.');
  }

  return out.join('\n');
}

export const agentReporter: Reporter = ({ result, constitution }) => {
  if (result.diagnostics.length === 0 && result.skipped.length === 0) {
    return 'No constitution violations. Proceed.';
  }

  const byRule = new Map<string, Diagnostic[]>();
  for (const d of result.diagnostics) {
    const list = byRule.get(d.ruleId);
    if (list) list.push(d);
    else byRule.set(d.ruleId, [d]);
  }

  const rules = new Map(constitution.rules.map((r) => [r.id, r]));
  const sections: string[] = [];

  // Errors first: what blocks the agent before what merely advises it.
  const ordered = [...byRule.entries()].sort(([a], [b]) => {
    const ra = rules.get(a);
    const rb = rules.get(b);
    const weight = (r: Rule | undefined) => (r?.severity === 'error' ? 0 : 1);
    return weight(ra) - weight(rb) || a.localeCompare(b);
  });

  for (const [ruleId, occurrences] of ordered) {
    const rule = rules.get(ruleId);
    if (rule) sections.push(renderRule(rule, occurrences));
  }

  if (result.skipped.length > 0) {
    sections.push(
      [
        '## NOT CHECKED',
        '',
        'These files failed to parse, so no rule ran against them. They are not known to be clean.',
        ...result.skipped.map((s) => `- ${s.file}: ${oneLine(s.reason)}`),
      ].join('\n'),
    );
  }

  return [
    `Understudy checked ${result.filesAnalyzed} files against the project constitution.`,
    'Fix these before continuing. Do not disable the rule or work around it — each entry names the correct alternative.',
    '',
    ...sections,
  ].join('\n\n');
};
