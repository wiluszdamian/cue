#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { analyze, type SourceFile } from './analyze.js';
import { normalizePath } from './scope.js';
import { countBySeverity } from './diagnostic.js';
import { loadRules, RulesLoadError } from './loader.js';
import { formatAnswer, whoOwns } from './ownership.js';
import { getReporter, REPORTER_NAMES } from './reporters/index.js';
import { formatValidationProblems, validateRules } from './validate.js';

/**
 * A thin development entry point, not the product CLI.
 *
 * The user-facing `cue` binary (doctor, init, describe, explore) is a
 * later package. This one exists so `rules:validate` and the fixture tests can
 * run the engine from CI without a second layer in between.
 */

const USAGE = `cue-engine <command>

  validate  <rulesDir>              check rules/ loads and is internally consistent
  analyze   <rulesDir> [glob...]    run the constitution over files
  who-owns  <rulesDir> <question>   resolve a topic against the ownership table

Options
  --reporter <name>   ${REPORTER_NAMES.join(' | ')}   (default: pretty)
  --cwd <path>        root the globs and reported paths are relative to
  --max-warnings <n>  exit non-zero above this many warnings (default: unlimited)
`;

interface Args {
  readonly command: string | undefined;
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string>>;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=', 2);
      if (!name) continue;
      if (inline !== undefined) flags[name] = inline;
      else {
        i += 1;
        flags[name] = argv[i] ?? '';
      }
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0], positional: positional.slice(1), flags };
}

async function collect(cwd: string, patterns: readonly string[]): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const seen = new Set<string>();
  for await (const entry of glob([...patterns], { cwd, exclude: ['**/node_modules/**'] })) {
    const absolute = resolve(cwd, entry);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    files.push({
      path: normalizePath(relative(cwd, absolute)),
      text: readFileSync(absolute, 'utf8'),
    });
  }
  return files;
}

async function main(): Promise<number> {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  if (command === undefined || command === 'help' || flags.help !== undefined) {
    process.stdout.write(USAGE);
    return command === undefined ? 1 : 0;
  }

  const rulesDir = positional[0];
  if (rulesDir === undefined) {
    process.stderr.write(`${command} needs a path to the rules directory.\n\n${USAGE}`);
    return 2;
  }

  const rules = loadRules(rulesDir);
  const problems = validateRules(rules);

  if (problems.length > 0) {
    process.stderr.write(
      `rules/ loaded but is not internally consistent:\n${formatValidationProblems(problems)}\n`,
    );
    return 1;
  }

  if (command === 'validate') {
    const { rules: all } = rules.constitution;
    const enforceable = all.filter((r) => r.detector.kind !== 'manual').length;
    process.stdout.write(
      `rules/ is valid: ${all.length} rules (${enforceable} enforceable, ` +
        `${all.length - enforceable} manual), ${rules.tags.tags.length} tags, ` +
        `${rules.ownership.topics.length} topics across ${rules.ownership.owners.length} owners.\n`,
    );
    return 0;
  }

  if (command === 'who-owns') {
    const question = positional.slice(1).join(' ');
    if (question.length === 0) {
      process.stderr.write(`who-owns needs a question.\n\n${USAGE}`);
      return 2;
    }
    process.stdout.write(`${formatAnswer(whoOwns(rules.ownership, question))}\n`);
    // An unowned topic is a finding, not a crash: exit 0 so a script can ask
    // freely, and let the output say plainly that the table has a gap.
    return 0;
  }

  if (command !== 'analyze') {
    process.stderr.write(`unknown command "${command}".\n\n${USAGE}`);
    return 2;
  }

  const cwd = resolve(flags.cwd ?? process.cwd());
  const patterns = positional.slice(1);
  const files = await collect(cwd, patterns.length > 0 ? patterns : ['**/*.ts', '**/*.tsx']);

  const result = analyze({ files, constitution: rules.constitution, tags: rules.tags });
  const reporter = getReporter(flags.reporter ?? 'pretty');
  process.stdout.write(`${reporter({ result, constitution: rules.constitution, root: cwd })}\n`);

  const { errors, warnings } = countBySeverity(result.diagnostics);
  const maxWarnings =
    flags['max-warnings'] === undefined ? Infinity : Number(flags['max-warnings']);
  return errors > 0 || warnings > maxWarnings ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof RulesLoadError) process.stderr.write(`${error.message}\n`);
    else
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    process.exitCode = 2;
  });
