import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COMMANDS } from '../src/commands.js';
import { survey, type SnapshotDriver } from '../src/survey.js';

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cue-context-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function surveyLogin(): void {
  const snapshot = readFileSync(
    join(
      import.meta.dirname,
      '..',
      '..',
      'engine',
      'test',
      'snapshots',
      'playwright-cli@0.1.22',
      'login.txt',
    ),
    'utf8',
  );
  const driver: SnapshotDriver = { capture: () => ({ ok: true, output: snapshot }) };
  survey({ projectRoot: root, url: 'http://app.test/login', driver });
}

describe('the context command', () => {
  it('is a command the CLI knows', () => {
    expect(COMMANDS).toContain('context');
  });
});

describe.skipIf(!existsSync(CLI))('the built command', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args, '--cwd', root], { encoding: 'utf8', input: '' });

  it('answers about the surveyed page, with the policy', () => {
    surveyLogin();
    const result = run('context', 'log in');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Applicable route: /login');
    expect(result.stdout).toContain('## Policy');
  });

  it('says unknown and what to run when nothing matches', () => {
    surveyLogin();
    const result = run('context', 'reconcile the ledger');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('status: unknown');
    expect(result.stdout).toContain('cue survey --route');
  });

  it('holds to --max-tokens', () => {
    surveyLogin();
    const result = run('context', 'log in', '--max-tokens', '300');
    expect(Math.ceil(result.stdout.trimEnd().length / 4)).toBeLessThanOrEqual(300);
  });

  it('asks for a task, and for a whole number', () => {
    expect(run('context').status).toBe(2);
    expect(run('context', 'log in', '--max-tokens', 'lots').status).toBe(2);
  });

  it('writes nothing', () => {
    surveyLogin();
    const before = run('context', 'log in').stdout;
    expect(run('context', 'log in').stdout).toBe(before);
  });
});
