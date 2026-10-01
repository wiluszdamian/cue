import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decideConfirmation } from '../src/confirm.js';

describe('decideConfirmation', () => {
  it('proceeds with --yes, terminal or not', () => {
    expect(decideConfirmation(true, true)).toBe('proceed');
    expect(decideConfirmation(true, false)).toBe('proceed');
  });

  it('asks a person at a terminal', () => {
    expect(decideConfirmation(false, true)).toBe('ask');
  });

  it('refuses rather than saying yes when nobody can answer', () => {
    expect(decideConfirmation(false, false)).toBe('refuse');
  });
});

/**
 * The built binary, because the property is about the process: with no terminal
 * and no `--yes`, the plan is shown and nothing is written. Skipped until the
 * package has been built; CI builds before it tests.
 */
const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

describe.skipIf(!existsSync(CLI))('init without a terminal', () => {
  let project: string;

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'understudy-confirm-'));
    writeFileSync(join(project, 'package.json'), '{"name":"p","private":true}');
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  const run = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, 'init', '--cwd', project, ...args], {
      encoding: 'utf8',
      // A pipe, not a TTY.
      stdio: ['pipe', 'pipe', 'pipe'],
      input: '',
    });

  it('shows the plan, writes nothing and exits 1', () => {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('AGENTS.md');
    expect(result.stderr).toContain('Re-run with --yes');
    expect(readdirSync(project)).toEqual(['package.json']);
  });

  it('still applies the plan with --yes', () => {
    const result = run('--yes');
    expect(result.status).toBe(0);
    expect(readdirSync(project)).toContain('AGENTS.md');
  });
});
