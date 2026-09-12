import { compare, type BenchmarkResult } from './runner.js';

/**
 * Written for a sceptical reader: the sample size sits next to every number, a
 * percentage it cannot support is never printed, and a result that does not
 * favour Understudy says so plainly.
 */

const percent = (value: number | undefined): string =>
  value === undefined ? 'n/a' : `${(value * 100).toFixed(0)}%`;

const rounded = (value: number): string => value.toFixed(2);

export function formatReport(result: BenchmarkResult): string {
  const comparison = compare(result);
  const lines: string[] = [''];

  lines.push(
    `Prompt set v${String(result.promptSetVersion)} · ${String(result.prompts)} prompts · ${result.agent} (${result.model})`,
  );
  lines.push(
    result.surveyedRoutes.length > 0
      ? `Knowledge base: ${result.surveyedRoutes.join(', ')}`
      : 'Knowledge base: empty — the grounding number cannot mean anything yet',
  );
  lines.push('');

  lines.push('Constitution violations per generated file');
  lines.push(`  without Understudy   ${rounded(comparison.violationsPerFile.bare)}`);
  lines.push(`  with Understudy      ${rounded(comparison.violationsPerFile.understudy)}`);
  lines.push('');

  lines.push('Selectors naming something that actually exists');
  lines.push(`  without Understudy   ${percent(comparison.groundedRate.bare)}`);
  lines.push(`  with Understudy      ${percent(comparison.groundedRate.understudy)}`);
  lines.push('');

  for (const condition of result.conditions) {
    lines.push(`${condition.condition}:`);
    lines.push(
      `  ${String(condition.compliance.violations)} violation(s) across ${String(condition.compliance.files)} file(s)` +
        (condition.compliance.unparsed > 0
          ? `, ${String(condition.compliance.unparsed)} file(s) did not parse`
          : ''),
    );
    for (const rule of condition.compliance.byRule.slice(0, 5)) {
      lines.push(`    ${String(rule.count).padStart(3)} × ${rule.ruleId}`);
    }
    if (condition.grounding.invented > 0) {
      lines.push(`  invented ${String(condition.grounding.invented)} selector(s):`);
      for (const locator of condition.grounding.inventedLocators.slice(0, 5)) {
        lines.push(`    ${locator}`);
      }
    }
    lines.push('');
  }

  // A benchmark that only ever confirms its author is not a benchmark.
  lines.push(
    comparison.supportsPremise
      ? 'Both metrics moved in Understudy’s favour on this sample.'
      : 'This sample does NOT show Understudy helping on both metrics. Before explaining it away: the blueprint is explicit that no measurable difference means the premise is false.',
  );
  lines.push(
    `Sample of ${String(result.prompts)} prompts on one model. Enough to notice a large effect, not enough to publish.`,
  );

  return lines.join('\n');
}

export function toJson(result: BenchmarkResult): string {
  return `${JSON.stringify(
    {
      ...result,
      comparison: compare(result),
      // Recorded so a result can be re-scored later and still be compared.
      scoredAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`;
}
