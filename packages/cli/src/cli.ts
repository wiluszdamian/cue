#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { isTargetId } from './agents.js';
import { COMMANDS } from './commands.js';
import { formatReport, runChecks, summarise } from './doctor.js';
import { describePlan, planInit, resolveRules, runInit } from './init.js';
import { removeFiles } from './install.js';
import {
  filesForTarget,
  forgetFile,
  ManifestError,
  readManifest,
  writeManifest,
} from './manifest.js';
import { detectPackageManager } from './package-manager.js';
import {
  FileDriver,
  formatSurveyResult,
  createPlaywrightCliDriver,
  survey,
  SurveyError,
} from './survey.js';
import { changedFiles, findProductRoot, workingTreeFiles } from '@understudy/engine';
import { productFiles } from './product-files.js';
import {
  CHECK_FORMATS,
  check,
  formatCheck,
  locatorCheckExitCode,
  type CheckFormat,
} from './check.js';
import { decideConfirmation, REFUSED_MESSAGE } from './confirm.js';
import { formatVerifyReport, verify, verifyExitCode, type CiMode } from './verify.js';
import {
  extract,
  formatExtractResult,
  formatLocatorAnswer,
  resolveLocator,
} from '@understudy/engine';
import { checkExitCode, formatSyncReport, NotInstalledError, planSync, runSync } from './sync.js';
import { getTarget, optionalTargets, TARGETS } from './targets/index.js';

const VERSION = '0.8.0';

const USAGE = `understudy <command> [options]

  init                 install Understudy in this project
  doctor               check that everything is wired up
  sync                 rewrite managed files from the current rules
  add <target>         add an agent target
  remove <target>      remove an agent target and its files
  list                 show available and installed targets
  explain <rule-id>    why a rule exists, and what to do instead
  survey <url>         map a live route into .agent-kb
  extract              read the product source into .agent-kb
  check [files...]     check the locators in tests against the knowledge base
  verify               check the map against the application (and say what was not checked)
  verify-map           old name for verify
  locator <element>    look up a selector, with freshness and confidence
  uninstall            remove everything init installed

Options
  --target <a,b>       explicit target list for init
  --all                every agent detected in this project
  --baseline-only      AGENTS.md and shared setup only
  --bare               skip the Playwright suite skeleton
  --yes                do not prompt
  --force              overwrite files that were edited by hand
  --ci[=advisory|strict] non-zero exit: doctor errors; verify drift (strict: also unverified)
  --json               print the verify report as JSON
  --format <name>      check output: human | agent | json | sarif | github
  --check              report drift without writing (sync)
  --offline            skip checks that need the network
  --from <file>        survey from a captured snapshot instead of a browser
  --playwright-cli <p> use this playwright-cli (a script or executable) for survey/verify
  --source <path>      where the product source lives (extract)
  --adapter <a,b>      restrict extract to named adapters
  --base-url <url>     environment to verify the map against
  --env <name>         name this environment (staging) in what survey and verify record
  --source <path>      the product source, to see whether code behind the map changed (verify)
  --affected-by <range> check only the routes read from files changed over this git range (verify)
  --route <path[,path]> restrict locator or verify to these routes (verify: the rest count as not checked)
  --refresh            mark unchanged routes as verified now
  --package-manager <npm|pnpm|yarn|bun>
  --cwd <path>         project root (default: current directory)

Targets
${[...TARGETS.values()].map((t) => `  ${t.id.padEnd(14)} ${t.summary}`).join('\n')}

All commands: ${COMMANDS.join(', ')}
`;

interface Args {
  readonly command: string | undefined;
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | true>>;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split('=', 2);
    if (name === undefined || name.length === 0) continue;
    if (inline !== undefined) {
      flags[name] = inline;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next;
      i += 1;
    } else {
      flags[name] = true;
    }
  }

  return { command: positional[0], positional: positional.slice(1), flags };
}

const asString = (value: string | true | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

function readPackageJson(root: string): unknown {
  const file = join(root, 'package.json');
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

type Answer = 'yes' | 'no' | 'refused';

async function confirm(question: string, assumeYes: boolean): Promise<Answer> {
  const decision = decideConfirmation(assumeYes, process.stdin.isTTY);
  if (decision === 'proceed') return 'yes';
  if (decision === 'refuse') return 'refused';

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} [Y/n] `)).trim().toLowerCase();
    return answer === '' || answer === 'y' || answer === 'yes' ? 'yes' : 'no';
  } finally {
    rl.close();
  }
}

async function main(): Promise<number> {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));
  const out = (text: string): void => void process.stdout.write(`${text}\n`);
  const err = (text: string): void => void process.stderr.write(`${text}\n`);

  if (command === undefined || command === 'help' || flags['help'] !== undefined) {
    out(USAGE);
    return command === undefined ? 1 : 0;
  }

  if (command === 'version' || flags['version'] !== undefined) {
    out(VERSION);
    return 0;
  }

  const projectRoot = asString(flags['cwd']) ?? process.cwd();
  const detection = detectPackageManager({
    cwd: projectRoot,
    userAgent: process.env['npm_config_user_agent'],
    packageJson: readPackageJson(projectRoot),
    override: asString(flags['package-manager']),
  });
  const assumeYes = flags['yes'] === true;

  switch (command) {
    case 'init':
    case 'add': {
      const targetList =
        command === 'add'
          ? positional
          : asString(flags['target'])
              ?.split(',')
              .map((t) => t.trim())
              .filter((t) => t.length > 0);

      if (command === 'add' && targetList?.length === 0) {
        err(
          `add needs a target. Available: ${optionalTargets()
            .map((t) => t.id)
            .join(', ')}`,
        );
        return 2;
      }

      const existing = readManifest(projectRoot)?.targets ?? [];
      const prepared = planInit({
        projectRoot,
        detection,
        understudyVersion: VERSION,
        ...(command === 'add'
          ? { targets: [...existing, ...positional] }
          : targetList
            ? { targets: targetList }
            : {}),
        ...(flags['all'] === true ? { all: true } : {}),
        ...(flags['baseline-only'] === true ? { baselineOnly: true } : {}),
        ...(flags['bare'] === true ? { bare: true } : {}),
        ...(flags['force'] === true ? { force: true } : {}),
      });

      out(describePlan(prepared));
      out('');

      const answer = await confirm('Write these files?', assumeYes);
      if (answer === 'refused') {
        err(REFUSED_MESSAGE);
        return 1;
      }
      if (answer === 'no') {
        out('Nothing written.');
        return 0;
      }

      const result = runInit(
        {
          projectRoot,
          detection,
          understudyVersion: VERSION,
          ...(flags['force'] === true ? { force: true } : {}),
        },
        prepared,
      );

      out('');
      out(
        result.written.length > 0
          ? `Wrote ${result.written.length} file(s).`
          : 'Everything was already up to date.',
      );
      for (const skipped of result.skipped) {
        out(`  left alone: ${skipped.file.path}`);
      }
      out('');
      out('Next:');
      for (const step of result.nextSteps) out(`  ${step}`);
      return 0;
    }

    case 'sync': {
      const options = {
        projectRoot,
        detection,
        understudyVersion: VERSION,
        ...(flags['force'] === true ? { force: true } : {}),
      };
      const report = planSync(options);

      out(formatSyncReport(report, report.manifest.targets));

      if (flags['check'] !== undefined) {
        // Reporting only. `--check` exists so CI can fail on drift without a
        // build step quietly rewriting files under it.
        if (report.stale > 0) {
          out('');
          out('Run `understudy sync` to bring them up to date.');
        }
        return checkExitCode(report);
      }

      if (report.stale === 0) return 0;
      out('');
      const answer = await confirm('Apply these changes?', assumeYes);
      if (answer === 'refused') {
        err(REFUSED_MESSAGE);
        return 1;
      }
      if (answer === 'no') {
        out('Nothing written.');
        return 0;
      }

      const result = runSync(options, report);
      out('');
      out(`Wrote ${result.written.length} file(s).`);
      for (const path of result.skipped) out(`  left alone: ${path}`);
      return 0;
    }

    case 'survey': {
      const url = positional[0];
      if (url === undefined) {
        err('survey needs a URL, e.g. understudy survey https://staging.example.com/login');
        return 2;
      }
      const from = asString(flags['from']);
      const result = survey({
        projectRoot,
        url,
        environment: asString(flags['env']),
        driver:
          from === undefined
            ? createPlaywrightCliDriver(projectRoot, asString(flags['playwright-cli']))
            : new FileDriver(from),
      });
      out(formatSurveyResult(result));
      return 0;
    }

    case 'extract': {
      const source = asString(flags['source']) ?? positional[0];
      if (source === undefined) {
        err('extract needs --source <path>, pointing at the product source.');
        return 2;
      }
      const only = asString(flags['adapter'])
        ?.split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      out(
        formatExtractResult(
          extract({ projectRoot, sourceRoot: source, ...(only ? { only } : {}) }),
        ),
      );
      return 0;
    }

    case 'check': {
      const ci = flags['ci'];
      if (ci !== undefined && ci !== true && ci !== 'advisory' && ci !== 'strict') {
        err('--ci takes advisory or strict, e.g. --ci=strict');
        return 2;
      }
      const format = asString(flags['format']) ?? 'human';
      if (!(CHECK_FORMATS as readonly string[]).includes(format)) {
        err(`--format takes one of: ${CHECK_FORMATS.join(', ')}`);
        return 2;
      }
      const report = check({
        projectRoot,
        targets: positional,
        files: productFiles(projectRoot, asString(flags['source'])),
      });
      out(
        formatCheck(
          report,
          format as CheckFormat,
          resolveRules(projectRoot).constitution,
          projectRoot,
        ),
      );
      // Without --ci a check informs; with it, it can fail the build.
      return ci === undefined
        ? 0
        : locatorCheckExitCode(report, ci === 'strict' ? 'strict' : 'advisory');
    }

    case 'verify-map':
    case 'verify': {
      if (command === 'verify-map') {
        err('verify-map is now `understudy verify`; the old name will be removed.');
      }
      const ci = flags['ci'];
      if (ci !== undefined && ci !== true && ci !== 'advisory' && ci !== 'strict') {
        err('--ci takes advisory or strict, e.g. --ci=strict');
        return 2;
      }
      const baseUrl = asString(flags['base-url']);
      const from = asString(flags['from']);

      // Where the code behind the map is, to see whether it has changed since.
      const productRoot = findProductRoot(projectRoot, asString(flags['source']));
      const files = productRoot === undefined ? undefined : workingTreeFiles(productRoot);
      let changedPaths: string[] | undefined;
      const range = asString(flags['affected-by']);
      if (range !== undefined) {
        if (productRoot === undefined) {
          err('--affected-by reads git history in the product: pass --source <path> to it.');
          return 2;
        }
        const changed = changedFiles(range, productRoot);
        if (!changed.ok) {
          err(changed.reason);
          return 2;
        }
        changedPaths = changed.files;
      }

      const report = verify({
        projectRoot,
        baseUrl,
        files,
        changedPaths,
        environment: asString(flags['env']),
        driver:
          from !== undefined
            ? new FileDriver(from)
            : baseUrl === undefined
              ? undefined
              : createPlaywrightCliDriver(projectRoot, asString(flags['playwright-cli'])),
        ...(flags['refresh'] === true ? { refresh: true } : {}),
        ...(asString(flags['route']) === undefined
          ? {}
          : { only: (asString(flags['route']) ?? '').split(',').map((route) => route.trim()) }),
      });
      out(flags['json'] === true ? JSON.stringify(report, null, 2) : formatVerifyReport(report));
      if (ci === undefined) return 0;
      return verifyExitCode(report, (ci === 'strict' ? 'strict' : 'advisory') satisfies CiMode);
    }

    case 'locator': {
      const query = positional.join(' ');
      if (query.length === 0) {
        err('locator needs a description, e.g. understudy locator "log in button" --route /login');
        return 2;
      }
      out(
        formatLocatorAnswer(
          resolveLocator({
            projectRoot,
            query,
            route: asString(flags['route']),
            files: productFiles(projectRoot, asString(flags['source'])),
          }),
        ),
      );
      // An unknown element is a finding, not a crash: the output says which
      // route to survey.
      return 0;
    }

    case 'remove': {
      const id = positional[0];
      if (id === undefined || !isTargetId(id)) {
        err(
          `remove needs a target. Available: ${optionalTargets()
            .map((t) => t.id)
            .join(', ')}`,
        );
        return 2;
      }
      if (id === 'agents') {
        err('The baseline cannot be removed on its own — use `understudy uninstall`.');
        return 2;
      }

      const manifest = readManifest(projectRoot);
      if (!manifest) {
        err('Nothing to remove: Understudy is not installed in this project.');
        return 1;
      }

      const owned = filesForTarget(manifest, id);
      const removal = removeFiles(projectRoot, owned, {
        ...(flags['force'] === true ? { force: true } : {}),
      });

      let next = { ...manifest, targets: manifest.targets.filter((t) => t !== id) };
      for (const path of removal.removed) next = forgetFile(next, path);
      writeManifest(projectRoot, next);

      out(`Removed ${getTarget(id).name}: ${removal.removed.length} file(s).`);
      for (const kept of removal.kept) out(`  kept ${kept.path} — ${kept.reason}`);
      return 0;
    }

    case 'uninstall': {
      const manifest = readManifest(projectRoot);
      if (!manifest) {
        err('Understudy is not installed in this project.');
        return 1;
      }
      const answer = await confirm(
        `Remove all ${manifest.files.length} managed file(s)?`,
        assumeYes,
      );
      if (answer === 'refused') {
        err(REFUSED_MESSAGE);
        return 1;
      }
      if (answer === 'no') {
        out('Nothing removed.');
        return 0;
      }
      const removal = removeFiles(projectRoot, manifest.files, {
        ...(flags['force'] === true ? { force: true } : {}),
      });
      out(`Removed ${removal.removed.length} file(s).`);
      for (const kept of removal.kept) out(`  kept ${kept.path} — ${kept.reason}`);
      out(`\nThe manifest at .understudy/ is left for you to delete.`);
      return 0;
    }

    case 'list': {
      const manifest = readManifest(projectRoot);
      const installed = new Set(manifest?.targets ?? []);
      out('');
      for (const target of TARGETS.values()) {
        const mark = installed.has(target.id)
          ? 'installed'
          : target.baseline
            ? 'baseline '
            : '         ';
        out(`  [${mark}] ${target.id.padEnd(14)} ${target.summary}`);
      }
      out('');
      return 0;
    }

    case 'explain': {
      const id = positional[0];
      const rules = resolveRules(projectRoot);
      if (id === undefined) {
        for (const rule of rules.constitution.rules) out(`  ${rule.id.padEnd(26)} ${rule.title}`);
        return 0;
      }
      const rule = rules.constitution.rules.find((r) => r.id === id);
      if (!rule) {
        err(`No rule called "${id}". Run \`understudy explain\` for the list.`);
        return 2;
      }
      const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();
      out('');
      out(`${rule.id}  (${rule.tier}, ${rule.severity})`);
      out('');
      out(`  What: ${oneLine(rule.title)}`);
      out(`  Why:  ${oneLine(rule.rationale)}`);
      out(`  Do:   ${oneLine(rule.message)}`);
      out('');
      out('  wrong:');
      for (const line of rule.examples.bad.trimEnd().split('\n')) out(`    ${line}`);
      out('  right:');
      for (const line of rule.examples.good.trimEnd().split('\n')) out(`    ${line}`);
      out('');
      if (rule.detector.kind === 'manual') {
        out('  No linter can check this one. It is binding all the same.');
        out('');
      }
      return 0;
    }

    case 'doctor': {
      let rules;
      try {
        rules = resolveRules(projectRoot);
      } catch {
        rules = undefined;
      }

      const summary = summarise(
        runChecks({
          projectRoot,
          manifest: readManifest(projectRoot),
          rules,
          detection,
          understudyVersion: VERSION,
          ...(flags['offline'] === true ? { offline: true } : {}),
        }),
      );

      out(formatReport(summary));
      // Warnings never fail the build. A team that has to suppress warnings to
      // ship stops reading them, and then the errors go unread too.
      return flags['ci'] !== undefined && summary.errors > 0 ? 1 : 0;
    }

    default:
      err(`Unknown command "${command}".\n\n${USAGE}`);
      return 2;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // These two already read as advice to the user; anything else is a bug and
    // should not be dressed up as guidance.
    if (
      error instanceof ManifestError ||
      error instanceof NotInstalledError ||
      error instanceof SurveyError
    ) {
      process.stderr.write(`${error.message}\n`);
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
    process.exitCode = 2;
  });
