import type { Spread } from './metadata.js';
import {
  compare,
  type BenchmarkResult,
  type ConditionResult,
  type SampleResult,
} from './runner.js';

/**
 * Written for a sceptical reader: the sample size sits next to every number, a
 * percentage it cannot support is never printed, a metric that was not measured
 * says so instead of showing zero, and a result that does not favour Cue
 * says so plainly.
 */

const percent = (value: number | undefined): string =>
  value === undefined ? 'n/a' : `${(value * 100).toFixed(0)}%`;

const rounded = (value: number): string => value.toFixed(2);

const range = (value: Spread | undefined): string =>
  value === undefined
    ? ''
    : ` (per run: min ${percent(value.min)}, median ${percent(value.median)}, max ${percent(value.max)})`;

/** Said at the top of anything printed from answers nobody's model wrote. */
function handWrittenBanner(result: BenchmarkResult): string | undefined {
  if (result.handWrittenAnswers === 0) return undefined;
  return (
    `NOTE: ${String(result.handWrittenAnswers)} answer(s) here are hand-written fixtures, not model output. ` +
    'This exercises the instrument; it is not a result and says nothing about whether Cue helps.'
  );
}

function metadataLines(result: BenchmarkResult): string[] {
  const m = result.metadata;
  if (m === undefined) return [];
  const tools = [
    m.cueVersion === undefined ? undefined : `cue ${m.cueVersion}`,
    m.playwrightVersion === undefined ? undefined : `@playwright/test ${m.playwrightVersion}`,
    m.playwrightCliVersion === undefined ? undefined : `@playwright/cli ${m.playwrightCliVersion}`,
    `node ${m.node}`,
  ].filter((part): part is string => part !== undefined);
  return [
    ...(m.commit === undefined
      ? []
      : [`Commit ${m.commit.slice(0, 10)}${m.dirty === true ? ' (uncommitted changes)' : ''}`]),
    `${tools.join(' · ')} · ${m.os}`,
  ];
}

function mutationLine(condition: ConditionResult): string | undefined {
  const m = condition.mutations;
  if (m === undefined) return undefined;
  return (
    `  ${condition.condition.padEnd(10)} ${String(m.detected)}/${String(m.eligible)}` +
    (m.missed > 0 ? ` · ${String(m.missed)} missed` : '') +
    (m.notApplicable > 0
      ? ` · ${String(m.notApplicable)} had nothing to break (did not pass on the correct application)`
      : '')
  );
}

export function formatReport(result: BenchmarkResult): string {
  const comparison = compare(result);
  const lines: string[] = [''];

  lines.push(
    `Prompt set v${String(result.promptSetVersion)} · ${String(result.prompts)} prompts` +
      (result.runs > 1 ? ` × ${String(result.runs)} runs` : '') +
      ` · ${result.agent} (${result.model})`,
  );
  lines.push(...metadataLines(result));
  lines.push(
    result.surveyedRoutes.length > 0
      ? `Knowledge base: ${result.surveyedRoutes.join(', ')}`
      : 'Knowledge base: empty — the grounding number cannot mean anything yet',
  );
  const banner = handWrittenBanner(result);
  if (banner !== undefined) lines.push('', banner);
  lines.push('');

  lines.push('Constitution violations per generated file');
  lines.push(`  without Cue   ${rounded(comparison.violationsPerFile.bare)}`);
  lines.push(`  with Cue      ${rounded(comparison.violationsPerFile.cue)}`);
  lines.push('');

  lines.push('Selectors naming something that actually exists');
  lines.push(`  without Cue   ${percent(comparison.groundedRate.bare)}`);
  lines.push(`  with Cue      ${percent(comparison.groundedRate.cue)}`);
  lines.push('');

  if (result.conditions.some((condition) => condition.execution !== undefined)) {
    lines.push('Compiled and run against the demo application (first run, no retries)');
    for (const condition of result.conditions) {
      const e = condition.execution;
      if (e === undefined) continue;
      lines.push(
        `  ${condition.condition.padEnd(10)} compiled ${String(e.compiled)}/${String(e.samples)} · ` +
          `passed first run ${String(e.passedFirstRun)}/${String(e.samples)}` +
          (e.failedRun > 0 ? ` · ${String(e.failedRun)} failed` : '') +
          (e.didNotRun > 0 ? ` · ${String(e.didNotRun)} did not run` : '') +
          range(condition.spread?.passedFirstRun),
      );
    }
    lines.push('');
  }

  if (result.conditions.some((condition) => condition.mutations !== undefined)) {
    lines.push('Caught the defect put into the application');
    for (const condition of result.conditions) {
      const line = mutationLine(condition);
      if (line !== undefined) lines.push(line);
    }
    lines.push(
      '  (detected = the test failed with the defect on; not whether it failed for the intended reason)',
      '',
    );
  }

  if (result.conditions.some((condition) => condition.locators !== undefined)) {
    lines.push('Locators, as the checker judges them (right element, right page, unique)');
    for (const condition of result.conditions) {
      const l = condition.locators;
      if (l === undefined) continue;
      if (result.surveyedRoutes.length === 0) {
        // Everything would read as invented, which says nothing about the answers.
        lines.push(
          `  ${condition.condition.padEnd(10)} not judged: the knowledge base is empty (${String(l.total)} locator(s))`,
        );
        continue;
      }
      lines.push(
        `  ${condition.condition.padEnd(10)} ${String(l.known)}/${String(l.judged)} valid (${percent(l.validRate)})` +
          ` · ${String(l.unknown)} invented · ${String(l.wrongRoute)} wrong route · ${String(l.ambiguous)} ambiguous` +
          ` · ${String(l.undecidable)} not judged` +
          range(condition.spread?.validLocators),
      );
    }
    lines.push('');
  }

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
    if (condition.usage !== undefined) {
      lines.push(
        `  ${String(condition.usage.inputTokens)} input / ${String(condition.usage.outputTokens)} output tokens over ${String(condition.usage.answers)} answer(s)`,
      );
    }
    for (const sample of condition.samples) {
      const e = sample.execution;
      if (e === undefined || (e.compile.ok && e.run.status === 'passed')) continue;
      lines.push(
        `  ${sampleLabel(sample, result.runs)}: ${e.compile.ok ? '' : 'does not compile; '}${e.run.status}` +
          (e.run.note === undefined ? '' : ` (${e.run.note})`),
      );
      for (const message of [...e.compile.errors.slice(0, 2), ...e.run.failures.slice(0, 2)]) {
        lines.push(`      ${message}`);
      }
    }
    if (condition.grounding.invented > 0) {
      lines.push(`  invented ${String(condition.grounding.invented)} selector(s):`);
      for (const locator of condition.grounding.inventedLocators.slice(0, 5)) {
        lines.push(`    ${locator}`);
      }
    }
    lines.push('');
  }

  lines.push('Not measured (stated, not shown as zero):');
  for (const item of result.notMeasured) lines.push(`  ${item.metric}: ${item.reason}`);
  lines.push('');

  // A benchmark that only ever confirms its author is not a benchmark.
  lines.push(
    comparison.supportsPremise
      ? 'Both metrics moved in Cue’s favour on this sample.'
      : 'This sample does NOT show Cue helping on both metrics. Before explaining it away: the blueprint is explicit that no measurable difference means the premise is false.',
  );
  lines.push(
    `Sample of ${String(result.prompts)} prompts${result.runs > 1 ? ` × ${String(result.runs)} runs` : ''} on ${result.model}. Enough to notice a large effect, not enough to publish.`,
  );

  return lines.join('\n');
}

function sampleLabel(sample: SampleResult, runs: number): string {
  return runs > 1 ? `${sample.promptId} #${String(sample.run)}` : sample.promptId;
}

// ---------------------------------------------------------------- markdown

const cell = (value: string): string => value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** Where a sample's answer is stored, relative to the recordings directory. */
function recordingOf(sample: SampleResult): string {
  return `${sample.condition}/${sample.promptId}${sample.run > 1 ? `.run${String(sample.run)}` : ''}.json`;
}

function ofPrompt(condition: ConditionResult, promptId: string): SampleResult[] {
  return condition.samples.filter((sample) => sample.promptId === promptId);
}

function fraction(count: number, of: number): string {
  return of === 0 ? 'n/a' : `${String(count)}/${String(of)}`;
}

/**
 * The report as a document: what was run and with what, the two conditions side by
 * side with their sample sizes, every failure (not a selection of them), what was
 * not measured, and what the numbers cannot show.
 */
export function formatMarkdown(result: BenchmarkResult): string {
  const bare = result.conditions.find((c) => c.condition === 'bare');
  const cue = result.conditions.find((c) => c.condition === 'cue');
  const out: string[] = ['# Benchmark report', ''];

  const banner = handWrittenBanner(result);
  if (banner !== undefined) out.push(`> **${banner}**`, '');

  out.push('## Run', '', '| | |', '| --- | --- |');
  out.push(
    `| Prompt set | v${String(result.promptSetVersion)} (${String(result.prompts)} prompts) |`,
  );
  out.push(`| Repetitions | ${String(result.runs)} per prompt and condition |`);
  out.push(`| Agent | ${result.agent} |`, `| Model | ${cell(result.model)} |`);
  const m = result.metadata;
  if (m !== undefined) {
    if (m.commit !== undefined) {
      out.push(
        `| Commit | \`${m.commit.slice(0, 10)}\`${m.dirty === true ? ' (uncommitted changes)' : ''} |`,
      );
    }
    if (m.cueVersion !== undefined) out.push(`| Cue | ${m.cueVersion} |`);
    if (m.playwrightVersion !== undefined)
      out.push(`| @playwright/test | ${m.playwrightVersion} |`);
    if (m.playwrightCliVersion !== undefined) {
      out.push(`| @playwright/cli | ${m.playwrightCliVersion} |`);
    }
    out.push(`| Node | ${m.node} |`, `| OS | ${cell(m.os)} |`);
  }
  out.push(
    `| Knowledge base | ${result.surveyedRoutes.length > 0 ? result.surveyedRoutes.map((r) => `\`${r}\``).join(', ') : 'empty'} |`,
    `| Started | ${result.startedAt} |`,
    `| Took | ${String(Math.round(result.durationMs / 1000))} s |`,
    '',
  );

  out.push('## Summary', '', '| | without Cue | with Cue |', '| --- | --- | --- |');
  const both = (label: string, pick: (c: ConditionResult) => string): void => {
    out.push(`| ${label} | ${bare ? pick(bare) : 'n/a'} | ${cue ? pick(cue) : 'n/a'} |`);
  };
  both('Answers', (c) => String(c.samples.length));
  if (result.conditions.some((c) => c.execution !== undefined)) {
    both('Compiled', (c) =>
      c.execution ? fraction(c.execution.compiled, c.execution.samples) : 'n/a',
    );
    both('Passed the first run', (c) =>
      c.execution
        ? `${fraction(c.execution.passedFirstRun, c.execution.samples)}${range(c.spread?.passedFirstRun)}`
        : 'n/a',
    );
  }
  if (result.conditions.some((c) => c.mutations !== undefined)) {
    both('Caught the defect put into the application', (c) =>
      c.mutations ? fraction(c.mutations.detected, c.mutations.eligible) : 'n/a',
    );
  }
  if (result.conditions.some((c) => c.locators !== undefined)) {
    const empty = result.surveyedRoutes.length === 0;
    both('Valid locators', (c) =>
      c.locators === undefined
        ? 'n/a'
        : empty
          ? 'not judged (empty knowledge base)'
          : `${fraction(c.locators.known, c.locators.judged)}${range(c.spread?.validLocators)}`,
    );
    both('Invented locators', (c) => (c.locators && !empty ? String(c.locators.unknown) : 'n/a'));
    both('Real, on the wrong route', (c) =>
      c.locators && !empty ? String(c.locators.wrongRoute) : 'n/a',
    );
    both('Ambiguous', (c) => (c.locators && !empty ? String(c.locators.ambiguous) : 'n/a'));
    both('Not judged (undecidable)', (c) => (c.locators ? String(c.locators.undecidable) : 'n/a'));
  }
  both('Constitution violations per file', (c) => rounded(c.compliance.violationsPerFile));
  both('Tokens in / out', (c) =>
    c.usage === undefined
      ? 'not recorded'
      : `${String(c.usage.inputTokens)} / ${String(c.usage.outputTokens)}`,
  );
  out.push('');

  const ids = [...new Set(result.conditions.flatMap((c) => c.samples.map((s) => s.promptId)))];
  if (result.conditions.some((c) => c.execution !== undefined)) {
    out.push(
      '## By prompt',
      '',
      '| Prompt | | compiled | passed first run | valid locators | caught the defect |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const id of ids) {
      for (const condition of result.conditions) {
        const samples = ofPrompt(condition, id);
        const executed = samples.flatMap((s) => (s.execution ? [s.execution] : []));
        const judged = samples.reduce((n, s) => n + (s.locators?.judged ?? 0), 0);
        const known = samples.reduce((n, s) => n + (s.locators?.known ?? 0), 0);
        const checks = samples.flatMap((s) => (s.mutation ? [s.mutation] : []));
        out.push(
          `| ${cell(id)} | ${condition.condition} | ` +
            `${fraction(executed.filter((e) => e.compile.ok).length, executed.length)} | ` +
            `${fraction(executed.filter((e) => e.run.status === 'passed').length, executed.length)} | ` +
            `${result.surveyedRoutes.length === 0 ? 'n/a' : fraction(known, judged)} | ` +
            `${checks.length === 0 ? '—' : fraction(checks.filter((c) => c.outcome === 'detected').length, checks.length)} |`,
        );
      }
    }
    out.push('');
  }

  // Every one, not a selection: an unfavourable run is the reason to keep the others honest.
  const failures = result.conditions.flatMap((condition) =>
    condition.samples.flatMap((sample) => {
      const e = sample.execution;
      const broken = e !== undefined && (!e.compile.ok || e.run.status !== 'passed');
      const missed = sample.mutation?.outcome === 'missed';
      return broken || missed ? [sample] : [];
    }),
  );
  out.push('## Failures', '');
  if (failures.length === 0) {
    out.push('None: every answer compiled and passed, and every defect was caught.', '');
  } else {
    out.push(`${String(failures.length)} answer(s). Each links to the recording it came from.`, '');
    for (const sample of failures) {
      const e = sample.execution;
      out.push(
        `### ${sample.condition} · ${sample.promptId}${result.runs > 1 ? ` · run ${String(sample.run)}` : ''}`,
        '',
      );
      out.push(`Recording: \`${recordingOf(sample)}\``, '');
      if (e !== undefined && !e.compile.ok) {
        out.push(
          'Did not compile:',
          ...e.compile.errors.map((error) => `- \`${cell(error)}\``),
          '',
        );
      }
      if (e !== undefined && e.run.status !== 'passed') {
        out.push(
          `Run: ${e.run.status}${e.run.note === undefined ? '' : ` (${e.run.note})`}`,
          ...e.run.failures.map((failure) => `- ${cell(failure)}`),
          '',
        );
      }
      if (sample.mutation?.outcome === 'missed') {
        out.push(
          `Passed even with \`${sample.mutation.id}\` switched on: the test does not notice that defect.`,
          '',
        );
      }
    }
  }

  out.push('## Not measured', '', 'Stated rather than shown as zero.', '');
  for (const item of result.notMeasured) out.push(`- **${item.metric}**: ${item.reason}`);
  out.push('');

  out.push(
    '## What this cannot show',
    '',
    '- **The cue condition is handed everything.** The whole of `AGENTS.md` and every surveyed route are put in the prompt. That is not how an agent meets Cue in use (it asks for what it needs through MCP or `cue locator`), so this is a lower bound on neither the benefit nor the cost.',
    '- **The application is small and written by the authors of the tool.** Results here say nothing about a real brownfield suite.',
    '- **A caught defect is not a verified reason.** `detected` means the test failed with the defect on; whether it failed for the intended reason is for a person to read from the recording.',
    '- **The checker does not follow clicks.** A real element asserted after navigating is reported as being on the wrong route.',
    `- **Sample size.** ${String(result.prompts)} prompts × ${String(result.runs)} run(s) on ${cell(result.model)}: enough to notice a large effect, not enough to publish.`,
    '',
  );

  const comparison = compare(result);
  out.push(
    '## Reading it',
    '',
    comparison.supportsPremise
      ? 'Both static metrics moved in Cue’s favour on this sample.'
      : 'This sample does **not** show Cue helping on both static metrics. No measurable difference means the premise is false, and this is not to be explained away.',
    '',
  );

  return out.join('\n');
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
