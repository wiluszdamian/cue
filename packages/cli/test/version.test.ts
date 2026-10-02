import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

describe('cue --version', () => {
  // The version used to be a literal in cli.ts that the release bump did not touch.
  const release = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();

  it.each([['--version'], ['version']])('%s prints the release in VERSION', (arg) => {
    expect(execFileSync(process.execPath, [CLI, arg], { encoding: 'utf8' }).trim()).toBe(release);
  });
});
