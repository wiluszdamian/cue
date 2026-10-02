#!/usr/bin/env node
/**
 * Freezes rules/*.yaml into a TypeScript module inside the plugin.
 *
 * The plugin cannot read rules/ at runtime: it installs from npm into someone
 * else's repo, loads inside an editor's ESLint process, and has to survive
 * bundling. Baking it in at build time and committing the result makes drift
 * visible in review rather than only in CI; `--check` is what fails on it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRules, validateRules, formatValidationProblems } from '@wiluszdamian/cue-engine';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const rulesDir = join(repoRoot, 'rules');
const target = join(here, '..', 'src', 'generated', 'constitution.ts');

const rules = loadRules(rulesDir);
const problems = validateRules(rules);
if (problems.length > 0) {
  process.stderr.write(
    `rules/ is not internally consistent:\n${formatValidationProblems(problems)}\n`,
  );
  process.exit(1);
}

const banner = `// GENERATED FILE — do not edit.
//
// Source:    rules/constitution.yaml, rules/tags.yaml
// Regenerate: pnpm --filter @wiluszdamian/cue-eslint-plugin generate
//
// Committed on purpose: a constitution change shows up as a diff here in review,
// and the published package works without rules/.
`;

const body = `${banner}
import type { Constitution, TagSet } from '@wiluszdamian/cue-engine';

export const CONSTITUTION = ${JSON.stringify(rules.constitution, null, 2)} as unknown as Constitution;

export const TAGS = ${JSON.stringify(rules.tags, null, 2)} as unknown as TagSet;

export const CANONICAL_TAGS: readonly string[] = ${JSON.stringify(
  rules.tags.tags.map((t) => t.name),
)};
`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    process.stderr.write(
      `${target} is missing. Run: pnpm --filter @wiluszdamian/cue-eslint-plugin generate\n`,
    );
    process.exit(1);
  }
  if (current !== body) {
    process.stderr.write(
      'src/generated/constitution.ts is out of date with rules/.\n' +
        'Run: pnpm --filter @wiluszdamian/cue-eslint-plugin generate\n',
    );
    process.exit(1);
  }
  process.stdout.write('generated constitution is in sync with rules/.\n');
} else {
  writeFileSync(target, body, 'utf8');
  process.stdout.write(
    `wrote ${rules.constitution.rules.length} rules and ${rules.tags.tags.length} tags to src/generated/constitution.ts\n`,
  );
}
