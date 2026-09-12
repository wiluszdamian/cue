#!/usr/bin/env node
/**
 * Bakes rules/ into the CLI, the same way it is baked into the ESLint plugin.
 *
 * `understudy init` runs inside somebody else's repository, where there is no
 * rules/ directory to read. The constitution and the ownership table therefore
 * ship inside the published package. The generated file is committed so a change
 * to rules/ shows up as a reviewable diff here, and `--check` keeps it honest.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { formatValidationProblems, loadRules, validateRules } from '@understudy/engine';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const target = join(here, '..', 'src', 'generated', 'rules.ts');

const rules = loadRules(join(repoRoot, 'rules'));
const problems = validateRules(rules);
if (problems.length > 0) {
  process.stderr.write(
    `rules/ is not internally consistent:\n${formatValidationProblems(problems)}\n`,
  );
  process.exit(1);
}

const source = `// GENERATED FILE — do not edit.
//
// Source:     rules/constitution.yaml, rules/tags.yaml, rules/ownership.yaml
// Regenerate: pnpm --filter @understudy/cli generate
//
// The CLI runs in projects that have no rules/ directory, so the rules travel
// with the package. Committed on purpose: a constitution change should be
// visible here in review.

import type { Constitution, Ownership, TagSet } from '@understudy/engine';

export const CONSTITUTION = ${JSON.stringify(rules.constitution, null, 2)} as unknown as Constitution;

export const TAGS = ${JSON.stringify(rules.tags, null, 2)} as unknown as TagSet;

export const OWNERSHIP = ${JSON.stringify(rules.ownership, null, 2)} as unknown as Ownership;
`;

const formatted = await prettier.format(source, {
  parser: 'typescript',
  ...(await prettier.resolveConfig(target)),
});

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    process.stderr.write(
      'src/generated/rules.ts is missing. Run: pnpm --filter @understudy/cli generate\n',
    );
    process.exit(1);
  }
  if (current !== formatted) {
    process.stderr.write(
      'src/generated/rules.ts is out of date with rules/.\nRun: pnpm --filter @understudy/cli generate\n',
    );
    process.exit(1);
  }
  process.stdout.write('bundled CLI rules are in sync with rules/.\n');
} else {
  writeFileSync(target, formatted, 'utf8');
  process.stdout.write(
    `wrote ${rules.constitution.rules.length} rules, ${rules.tags.tags.length} tags and ` +
      `${rules.ownership.topics.length} topics to src/generated/rules.ts\n`,
  );
}
