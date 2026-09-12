#!/usr/bin/env node
/**
 * Bakes rules/ into the MCP server, which runs inside somebody else's project
 * where there is no rules/ to read and neither the CLI nor the plugin is
 * necessarily installed.
 *
 * Three published packages therefore carry a copy. They ship independently and
 * each has to work alone, so the duplication is deliberate — `pnpm sync:check`
 * compares all three against rules/ so they cannot disagree.
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
// Regenerate: pnpm --filter @understudy/mcp generate
//
// The rules travel with the package, since the server runs where rules/ does not
// exist. Committed so a constitution change is visible here in review.

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
      'src/generated/rules.ts is missing. Run: pnpm --filter @understudy/mcp generate\n',
    );
    process.exit(1);
  }
  if (current !== formatted) {
    process.stderr.write(
      'src/generated/rules.ts is out of date with rules/.\nRun: pnpm --filter @understudy/mcp generate\n',
    );
    process.exit(1);
  }
  process.stdout.write('bundled MCP rules are in sync with rules/.\n');
} else {
  writeFileSync(target, formatted, 'utf8');
  process.stdout.write(
    `wrote ${rules.constitution.rules.length} rules, ${rules.tags.tags.length} tags and ` +
      `${rules.ownership.topics.length} topics to src/generated/rules.ts\n`,
  );
}
