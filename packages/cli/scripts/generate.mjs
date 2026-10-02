#!/usr/bin/env node
/**
 * Bakes rules/, compatibility.yaml and VERSION into the CLI, the same way rules/ is baked into
 * the ESLint plugin.
 *
 * `cue init` runs inside somebody else's repository, where there is no rules/
 * directory and no compatibility.yaml to read. The constitution, the ownership table
 * and the tested tool versions therefore ship inside the published package. The
 * generated files are committed so a change to either source shows up as a reviewable
 * diff here, and `--check` keeps them honest.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import {
  formatValidationProblems,
  loadCompatibility,
  loadRules,
  validateRules,
} from '@wiluszdamian/cue-engine';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const generatedDir = join(here, '..', 'src', 'generated');

const rules = loadRules(join(repoRoot, 'rules'));
const problems = validateRules(rules);
if (problems.length > 0) {
  process.stderr.write(
    `rules/ is not internally consistent:\n${formatValidationProblems(problems)}\n`,
  );
  process.exit(1);
}
const compatibility = loadCompatibility(join(repoRoot, 'compatibility.yaml'));
const version = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();

const outputs = [
  {
    file: 'rules.ts',
    source: `// GENERATED FILE — do not edit.
//
// Source:     rules/constitution.yaml, rules/tags.yaml, rules/ownership.yaml
// Regenerate: pnpm --filter @wiluszdamian/cue generate
//
// The CLI runs in projects that have no rules/ directory, so the rules travel
// with the package. Committed on purpose: a constitution change should be
// visible here in review.

import type { Constitution, Ownership, TagSet } from '@wiluszdamian/cue-engine';

export const CONSTITUTION = ${JSON.stringify(rules.constitution, null, 2)} as unknown as Constitution;

export const TAGS = ${JSON.stringify(rules.tags, null, 2)} as unknown as TagSet;

export const OWNERSHIP = ${JSON.stringify(rules.ownership, null, 2)} as unknown as Ownership;
`,
    summary: `${rules.constitution.rules.length} rules, ${rules.tags.tags.length} tags and ${rules.ownership.topics.length} topics`,
  },
  {
    file: 'compatibility.ts',
    source: `// GENERATED FILE — do not edit.
//
// Source:     compatibility.yaml
// Regenerate: pnpm --filter @wiluszdamian/cue generate
//
// The versions of other people's tools this release was run against. They travel with
// the package because the MCP configuration \`init\` writes pins them, and \`doctor\`
// compares what a project has installed with them.

import type { Compatibility } from '@wiluszdamian/cue-engine';

export const COMPATIBILITY = ${JSON.stringify(compatibility, null, 2)} as unknown as Compatibility;
`,
    summary: `${Object.keys(compatibility.tools).length} tools`,
  },
  {
    file: 'version.ts',
    source: `// GENERATED FILE — do not edit.
//
// Source:     VERSION
// Regenerate: pnpm --filter @wiluszdamian/cue generate
//
// What \`cue --version\` prints and what \`init\` records in the manifest it writes.
// Generated so a release bump cannot leave it behind.

export const VERSION = ${JSON.stringify(version)};
`,
    summary: `version ${version}`,
  },
];

const check = process.argv.includes('--check');
let failed = false;

for (const output of outputs) {
  const target = join(generatedDir, output.file);
  const formatted = await prettier.format(output.source, {
    parser: 'typescript',
    ...(await prettier.resolveConfig(target)),
  });

  if (check) {
    let current;
    try {
      current = readFileSync(target, 'utf8');
    } catch {
      process.stderr.write(
        `src/generated/${output.file} is missing. Run: pnpm --filter @wiluszdamian/cue generate\n`,
      );
      failed = true;
      continue;
    }
    if (current !== formatted) {
      process.stderr.write(
        `src/generated/${output.file} is out of date with its source.\nRun: pnpm --filter @wiluszdamian/cue generate\n`,
      );
      failed = true;
    } else {
      process.stdout.write(`bundled CLI ${output.file} is in sync.\n`);
    }
  } else {
    writeFileSync(target, formatted, 'utf8');
    process.stdout.write(`wrote ${output.summary} to src/generated/${output.file}\n`);
  }
}

if (failed) process.exit(1);
