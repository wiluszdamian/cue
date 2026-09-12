#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadRules } from '@understudy/engine';
import { CONDITIONS, missingRecordings, RecordedAgent } from './agent.js';
import { ClaudeAgent, DEFAULT_MODEL } from './live-agent.js';
import { PROMPTS } from './prompts.js';
import { recordRun } from './record-run.js';
import { formatReport, toJson } from './report.js';
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
  --prompts <a,b>    limit to these prompts, rather than the whole set
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

/** Prompts named by `--prompts`, or the whole set. Undefined when none matched. */
function selectedPrompts(): readonly (typeof PROMPTS)[number][] | undefined {
  const only = flag('prompts')
    ?.split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (only === undefined) return PROMPTS;

  const prompts = PROMPTS.filter((prompt) => only.includes(prompt.id));
  return prompts.length === 0 ? undefined : prompts;
}

async function score(recordings: string, projectRoot: string): Promise<number> {
  const rules = loadRules(flag('rules') ?? resolve(projectRoot, 'rules'));
  const prompts = selectedPrompts();
  if (prompts === undefined) return unknownPrompt();

  // Every gap at once. Scoring only the prompts that happen to have recordings
  // would shrink the sample without saying so.
  const missing = missingRecordings(
    recordings,
    prompts.map((prompt) => prompt.id),
    CONDITIONS,
  );
  if (missing.length > 0) {
    const recordable = prompts
      .filter((prompt) => !missing.some((gap) => gap.promptId === prompt.id))
      .map((prompt) => prompt.id);

    process.stderr.write(
      [
        `${String(missing.length)} recording(s) missing:`,
        ...missing.map((gap) => `  ${gap.condition}/${gap.promptId}.json`),
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

  const result = await runBenchmark({
    projectRoot,
    agent: new RecordedAgent(recordings),
    rules,
    prompts,
  });

  process.stdout.write(`${formatReport(result)}\n`);

  const json = flag('json');
  if (json !== undefined) writeFileSync(resolve(json), toJson(result), 'utf8');

  return 0;
}

async function recordCommand(recordings: string, projectRoot: string): Promise<number> {
  const prompts = selectedPrompts();
  if (prompts === undefined) return unknownPrompt();

  const model = flag('model') ?? DEFAULT_MODEL;

  // Said before anything is spent: the count is the only number that predicts the bill.
  process.stdout.write(
    `Recording ${String(prompts.length * CONDITIONS.length)} answer(s) — ` +
      `${String(prompts.length)} prompt(s) × ${String(CONDITIONS.length)} condition(s) — with ${model}.\n` +
      `Context comes from ${projectRoot}; answers go to ${recordings}.\n\n`,
  );

  const summary = await recordRun({
    dir: recordings,
    projectRoot,
    agent: new ClaudeAgent({ model }),
    prompts,
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
  process.stderr.write(`No prompt matched. Known: ${PROMPTS.map((p) => p.id).join(', ')}\n`);
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
