#!/usr/bin/env node
/**
 * Compares the newest release of each tool in compatibility.yaml with the range it
 * was tested against, and fails with a description when one has moved outside it.
 *
 * Run weekly by .github/workflows/upstream.yml, so the movement of tools this project
 * does not own is seen on a schedule and not when somebody's install breaks. It fails
 * the job rather than opening an issue: a red scheduled run already notifies the people
 * who watch the repository, and it needs no permission beyond reading.
 *
 * `UNDERSTUDY_UPSTREAM_VERSIONS='{"@playwright/cli":"0.2.0"}'` replaces the network
 * lookup, which is how the comparison is tested.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  describeUpstreamDrift,
  judgeVersions,
  loadCompatibility,
} from '../packages/engine/dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compatibility = loadCompatibility(join(root, 'compatibility.yaml'));

function newestRelease(name) {
  // No shell on Linux: `@playwright/cli` is an argument and nothing else. On Windows the
  // npm shim is a .cmd file, which only a shell can start.
  const windows = process.platform === 'win32';
  return execFileSync(windows ? 'npm.cmd' : 'npm', ['view', name, 'version'], {
    encoding: 'utf8',
    shell: windows,
  }).trim();
}

const faked = process.env['UNDERSTUDY_UPSTREAM_VERSIONS'];
const latest = {};
for (const tool of Object.keys(compatibility.tools)) {
  try {
    latest[tool] = faked === undefined ? newestRelease(tool) : (JSON.parse(faked)[tool] ?? '');
  } catch (error) {
    process.stderr.write(`could not look up ${tool}: ${String(error.message).split('\n')[0]}\n`);
    process.exit(2);
  }
}

const findings = judgeVersions(compatibility, latest);
for (const finding of findings) {
  process.stdout.write(
    `${finding.tool.padEnd(22)} newest ${finding.version.padEnd(10)} range ${finding.range.padEnd(18)} ${finding.verdict}\n`,
  );
}

const drift = describeUpstreamDrift(findings);
if (drift.length > 0) {
  process.stderr.write(`\n${drift.map((line) => `- ${line}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('\nEvery tool is inside the range it was tested against.\n');
