#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadRules } from '@understudy/engine';
import { CONDITIONS, detectRuns, missingRecordings, RecordedAgent } from './agent.js';
import { ClaudeAgent, DEFAULT_MODEL } from './live-agent.js';
import { DemoExecutor } from './executor.js';
import { PROMPT_SETS, promptSet, type Prompt } from './prompts.js';
import { recordRun } from './record-run.js';
import { collectMetadata } from './metadata.js';
import { formatMarkdown, formatReport, toJson } from './report.js';
import { runBenchmark } from './runner.js';

/**
 * Two jobs, deliberately separate. `record` calls a model and costs money;
 * scoring does not. That asymmetry is the point — anyone can re-score somebody
 * else's run, or their own after a rule changes, without paying again.
 */

const USAGE = `understudy-benchmark <recordings-dir> [options]        score a recorded run
understudy-benchmark record <recordings-dir> [options]  ask a model, and write the run

  --project <path>   the project whose AGENTS.md and .agent-kb to use
  --rules <path>     rules directory (default: <project>/rules)
  --json <file>      also write the full result as JSON            (scoring)
  --report <dir>     write report.md and report.json into this directory   (scoring)
  --runs <n>         repetitions per prompt and condition: to ask for (record, default 1),
                     or to score (default: as many as every prompt has recordings for)
  --prompt-set <n>   which prompt set: 1 (default; scored, never run) or 2 (the demo application)
  --prompts <a,b>    limit to these prompts, rather than the whole set
  --execute          compile and run each answer against the demo application   (scoring)
  --demo <path>      the demo application (default: ./examples/demo-app)        (--execute)
  --keep-workspaces  leave each answer's files on disk after running it         (--execute)
  --model <id>       model to record with (default: ${DEFAULT_MODEL})
  --force            re-ask for answers already on disk            (record)
`;

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function chosenSet(): { version: number; prompts: readonly Prompt[] } | undefined {
  const version = Number(flag('prompt-set') ?? '1');
  return promptSet(version);
}

/** Prompts named by `--prompts`, or the whole set. Undefined when none matched. */
function selectedPrompts(): readonly Prompt[] | undefined {
  const set = chosenSet();
  if (set === undefined) return undefined;

  const only = flag('prompts')
    ?.split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (only === undefined) return set.prompts;

  const prompts = set.prompts.filter((prompt) => only.includes(prompt.id));
  return prompts.length === 0 ? undefined : prompts;
}

/** A whole number of at least 1, or undefined when the flag is absent or nonsense. */
function runsFlag(): number | undefined {
  const raw = flag('runs');
  if (raw === undefined) return undefined;
  const runs = Number(raw);
  return Number.isInteger(runs) && runs >= 1 ? runs : undefined;
}

async function score(recordings: string, projectRoot: string): Promise<number> {
  const rules = loadRules(flag('rules') ?? resolve(projectRoot, 'rules'));
  const prompts = selectedPrompts();
  if (prompts === undefined) return unknownPrompt();

  if (flag('runs') !== undefined && runsFlag() === undefined) {
    process.stderr.write('--runs takes a whole number of at least 1.\n');
    return 2;
  }
  const ids = prompts.map((prompt) => prompt.id);
  const runs = runsFlag() ?? detectRuns(recordings, ids, CONDITIONS);

  // Every gap at once. Scoring only the prompts that happen to have recordings
  // would shrink the sample without saying so.
  const missing = missingRecordings(recordings, ids, CONDITIONS, runs);
  if (missing.length > 0) {
    const recordable = prompts
      .filter((prompt) => !missing.some((gap) => gap.promptId === prompt.id))
      .map((prompt) => prompt.id);

    process.stderr.write(
      [
        `${String(missing.length)} recording(s) missing:`,
        ...missing.map(
          (gap) =>
            `  ${gap.condition}/${gap.promptId}${gap.run > 1 ? `.run${String(gap.run)}` : ''}.json`,
        ),
        '',
        'Record them:',
        `  understudy-benchmark record ${recordings} --project ${projectRoot}`,
        '',
        'Or narrow the run deliberately:',
        `  --prompts ${recordable.join(',')}`,
        '',
      ].join('\n'),
    );
    return 1;
  }

  const set = chosenSet();
  const demoRoot = resolve(flag('demo') ?? 'examples/demo-app');
  const executor = has('execute')
    ? new DemoExecutor({ demoRoot, keep: has('keep-workspaces') })
    : undefined;

  const result = await runBenchmark({
    projectRoot,
    agent: new RecordedAgent(recordings),
    rules,
    prompts,
    promptSetVersion: set?.version ?? 1,
    runs,
    metadata: collectMetadata({ repoRoot: resolve(flag('repo') ?? process.cwd()), demoRoot }),
    ...(executor === undefined ? {} : { executor }),
    judgeLocators: (set?.version ?? 1) >= 2,
  });

  process.stdout.write(`${formatReport(result)}\n`);

  const json = flag('json');
  if (json !== undefined) writeFileSync(resolve(json), toJson(result), 'utf8');

  const report = flag('report');
  if (report !== undefined) {
    mkdirSync(resolve(report), { recursive: true });
    writeFileSync(join(resolve(report), 'report.md'), `${formatMarkdown(result)}\n`, 'utf8');
    writeFileSync(join(resolve(report), 'report.json'), toJson(result), 'utf8');
    process.stdout.write(`\nReport written to ${resolve(report)}\n`);
  }

  return 0;
}

async function recordCommand(recordings: string, projectRoot: string): Promise<number> {
  const prompts = selectedPrompts();
  if (prompts === undefined) return unknownPrompt();

  const model = flag('model') ?? DEFAULT_MODEL;
  if (flag('runs') !== undefined && runsFlag() === undefined) {
    process.stderr.write('--runs takes a whole number of at least 1.\n');
    return 2;
  }
  // One by default: every repetition is a paid call, and the count is printed first.
  const runs = runsFlag() ?? 1;

  // Said before anything is spent: the count is the only number that predicts the bill.
  process.stdout.write(
    `Recording up to ${String(prompts.length * CONDITIONS.length * runs)} answer(s) — ` +
      `${String(prompts.length)} prompt(s) × ${String(CONDITIONS.length)} condition(s)` +
      `${runs > 1 ? ` × ${String(runs)} runs` : ''} — with ${model}. ` +
      'Any already on disk are kept and not asked for again.\n' +
      `Context comes from ${projectRoot}; answers go to ${recordings}.\n\n`,
  );

  const summary = await recordRun({
    dir: recordings,
    projectRoot,
    agent: new ClaudeAgent({ model }),
    prompts,
    runs,
    force: has('force'),
    log: (line) => process.stdout.write(`${line}\n`),
  });

  process.stdout.write(
    `\n${String(summary.written.length)} recorded, ${String(summary.kept)} already on disk.\n`,
  );

  if (summary.failed !== undefined) {
    process.stderr.write(
      [
        '',
        `Stopped at ${summary.failed.condition}/${summary.failed.promptId}.`,
        'What is already recorded is kept — running the same command again asks only for the gaps.',
        '',
      ].join('\n'),
    );
    return 1;
  }

  process.stdout.write(
    `\nScore it:\n  understudy-benchmark ${recordings} --project ${projectRoot}\n`,
  );
  return 0;
}

function unknownPrompt(): number {
  const set = chosenSet();
  if (set === undefined) {
    process.stderr.write(
      `No prompt set "${flag('prompt-set') ?? ''}". Known: ${PROMPT_SETS.map((s) => String(s.version)).join(', ')}\n`,
    );
    return 2;
  }
  process.stderr.write(`No prompt matched. Known: ${set.prompts.map((p) => p.id).join(', ')}\n`);
  return 2;
}

async function main(): Promise<number> {
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const recording = positional[0] === 'record';
  const dir = positional[recording ? 1 : 0];

  if (dir === undefined) {
    process.stdout.write(USAGE);
    return 1;
  }

  const recordings = resolve(dir);
  const projectRoot = resolve(flag('project') ?? process.cwd());

  return recording ? recordCommand(recordings, projectRoot) : score(recordings, projectRoot);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
