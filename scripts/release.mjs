#!/usr/bin/env node
/**
 * The parts of a release that have to agree with each other, in one place.
 *
 *   node scripts/release.mjs bump 0.9.0     set every version, date the changelog
 *   node scripts/release.mjs check v0.9.0   fail unless the tag, VERSION and every package say 0.9.0
 *   node scripts/release.mjs notes 0.9.0    print that version's changelog section
 *
 * A release is one number: the git tag, the VERSION file, the changelog heading and the
 * version of every package are the same, and the pinned MCP version that `init` writes into
 * other people's repositories is read from it. `check` runs first in the release workflow, so
 * a tag that disagrees with the code publishes nothing.
 *
 * `--root <dir>` points it at another checkout, which is how it is tested.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const rootFlag = args.indexOf('--root');
const root =
  rootFlag === -1
    ? join(dirname(fileURLToPath(import.meta.url)), '..')
    : resolve(args.splice(rootFlag, 2)[1] ?? '.');
const [command, rawVersion] = args;

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const version = (rawVersion ?? '').replace(/^v/, '');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** Every package.json that carries the release version: the root, packages/*, examples/*. */
function manifests() {
  const found = [join(root, 'package.json')];
  for (const group of ['packages', 'examples']) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name, 'package.json');
      if (entry.isDirectory() && existsSync(file)) found.push(file);
    }
  }
  return found;
}

const read = (file) => readFileSync(file, 'utf8');
const relative = (file) => file.slice(root.length + 1).replaceAll('\\', '/');

function changelogSection(text, wanted) {
  const heading = new RegExp(`^## \\[${wanted.replaceAll('.', '\\.')}\\].*$`, 'm');
  const start = heading.exec(text);
  if (start === null) return undefined;
  const rest = text.slice(start.index + start[0].length);
  const next = /^## \[/m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
}

if (command === 'bump') {
  if (!SEMVER.test(version))
    fail(`"${rawVersion ?? ''}" is not a version such as 0.9.0 or 1.0.0-rc.1`);

  const current = read(join(root, 'VERSION')).trim();
  if (current === version) fail(`The version is already ${version}.`);

  writeFileSync(join(root, 'VERSION'), `${version}\n`);
  for (const file of manifests()) {
    const text = read(file);
    const updated = text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
    if (updated !== text) writeFileSync(file, updated);
  }

  const changelogPath = join(root, 'CHANGELOG.md');
  const changelog = read(changelogPath);
  if (!changelog.includes('## [Unreleased]'))
    fail('CHANGELOG.md has no "## [Unreleased]" section.');
  const unreleased = changelogSection(changelog, 'Unreleased') ?? '';
  const date = new Date().toISOString().slice(0, 10);
  writeFileSync(
    changelogPath,
    changelog.replace('## [Unreleased]', `## [Unreleased]\n\n## [${version}] - ${date}`),
  );

  process.stdout.write(`${current} -> ${version}\n`);
  if (unreleased === '')
    process.stdout.write('Note: the changelog had nothing under Unreleased.\n');
  process.stdout.write(
    'Next: pnpm generate, review, commit, then tag and push (see CONTRIBUTING.md).\n',
  );
} else if (command === 'check') {
  if (!SEMVER.test(version)) fail(`"${rawVersion ?? ''}" is not a version such as v0.9.0`);

  const problems = [];
  const fileVersion = read(join(root, 'VERSION')).trim();
  if (fileVersion !== version) problems.push(`VERSION says ${fileVersion}`);

  for (const file of manifests()) {
    const said = /"version":\s*"([^"]+)"/.exec(read(file))?.[1];
    if (said !== version) problems.push(`${relative(file)} says ${said ?? 'nothing'}`);
  }

  const notes = changelogSection(read(join(root, 'CHANGELOG.md')), version);
  if (notes === undefined) problems.push(`CHANGELOG.md has no section for ${version}`);
  else if (notes === '') problems.push(`the CHANGELOG.md section for ${version} is empty`);

  if (problems.length > 0) {
    fail(
      `The tag is v${version}, but:\n${problems.map((p) => `  - ${p}`).join('\n')}\nRun: node scripts/release.mjs bump ${version}`,
    );
  }
  process.stdout.write(
    `v${version}: tag, VERSION, changelog and ${manifests().length} manifests agree.\n`,
  );
} else if (command === 'notes') {
  if (!SEMVER.test(version)) fail(`"${rawVersion ?? ''}" is not a version such as 0.9.0`);
  const notes = changelogSection(read(join(root, 'CHANGELOG.md')), version);
  if (notes === undefined || notes === '') fail(`CHANGELOG.md has no notes for ${version}`);
  process.stdout.write(`${notes}\n`);
} else {
  fail('usage: node scripts/release.mjs <bump|check|notes> <version> [--root <dir>]');
}
