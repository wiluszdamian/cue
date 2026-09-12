#!/usr/bin/env node
/**
 * Watches for the day this repo can stop running two TypeScripts.
 *
 * TypeScript 7 removed the JavaScript compiler API, so `@typescript-eslint` —
 * the engine's parser and the basis of the whole plugin — caps its peer at
 * `typescript <6.1.0`, and the build runs on 7 while the linter runs on 6.0.3.
 *
 * A workaround nobody watches becomes permanent, so this fails loudly the moment
 * typescript-eslint accepts 7.
 *
 * Exit codes: 0 still needed · 1 can be removed · 2 could not check.
 */
import { spawnSync } from 'node:child_process';

const PACKAGES = ['typescript-eslint', '@typescript-eslint/typescript-estree'];

function peerRange(pkg) {
  // `npm` is a .cmd shim on Windows, which Node has refused to spawn directly
  // since v20, so this goes through a shell — as one string, since `shell: true`
  // concatenates an args array without escaping (DEP0190). Every part is a
  // constant from PACKAGES.
  const result = spawnSync(`npm view ${pkg} peerDependencies.typescript`, {
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

const findings = [];
for (const pkg of PACKAGES) {
  const range = peerRange(pkg);
  if (range === undefined) {
    process.stderr.write(`could not read the typescript peer range of ${pkg}\n`);
    process.exit(2);
  }
  findings.push({ pkg, range });
}

for (const { pkg, range } of findings) {
  process.stdout.write(`${pkg.padEnd(38)} typescript ${range}\n`);
}

// A range that still excludes 7 will say so explicitly; the current one is
// ">=4.8.4 <6.1.0". Anything mentioning 7 means support has landed.
const supportsSeven = findings.some(
  ({ range }) => /(^|[^.\d])7(\.|\s|$)/.test(range) && !/<\s*7/.test(range),
);

if (supportsSeven) {
  process.stderr.write(
    '\ntypescript-eslint now accepts TypeScript 7.\n\n' +
      'The two-compiler workaround can go:\n' +
      '  1. set `typescript` to ^7 in every package.json and drop the `typescript7` alias\n' +
      '  2. delete scripts/tsc7.mjs and point build/typecheck back at plain `tsc`\n' +
      '  3. delete this check and its CI job\n',
  );
  process.exit(1);
}

process.stdout.write('\nStill capped below 7 — the two-compiler setup is still required.\n');
