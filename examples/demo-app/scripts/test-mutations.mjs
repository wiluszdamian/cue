import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { MUTATIONS } from '../mutations.mjs';

/**
 * Proves the reference tests catch something. For each mutation the suite runs
 * against a deliberately broken app, and it must fail: a mutation nothing notices
 * means the tests, not the app, are the weak part.
 *
 * Playwright's CLI is run as a Node script rather than through a shell.
 */

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');

function runSuite(mutation) {
  const result = spawnSync(process.execPath, [playwrightCli, 'test', '--reporter=dot'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: { ...process.env, DEMO_MUTATIONS: mutation },
  });
  return { passed: result.status === 0, output: `${result.stdout}${result.stderr}` };
}

const only = process.argv[2];
const targets = only === undefined ? MUTATIONS : [only];
const survivors = [];

for (const mutation of targets) {
  const { passed, output } = runSuite(mutation);
  process.stdout.write(`${passed ? 'SURVIVED' : 'caught  '}  ${mutation}\n`);
  if (passed) {
    survivors.push(mutation);
    process.stdout.write(`${output}\n`);
  }
}

if (survivors.length > 0) {
  process.stderr.write(`\nNo test failed for: ${survivors.join(', ')}\n`);
  process.exit(1);
}
process.stdout.write(`\nAll ${String(targets.length)} mutation(s) were caught.\n`);
