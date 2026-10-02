import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeRunner, type ProcessRunner, type RunResult } from '../src/browser/process.js';
import { existsOnPath, resolvePlaywrightCli } from '../src/browser/resolve.js';
import { createPlaywrightCliDriver, PlaywrightCliDriver, SurveyError } from '../src/survey.js';

/** Contains a space on purpose: a path that survives only unquoted is the bug. */
const ECHO = join(import.meta.dirname, 'fixtures', 'fake cli', 'echo-args.mjs');

const TRICKY_URLS = [
  'http://x.test/a?b=1&c=2',
  'http://x.test/a?q=%20%26%22',
  'http://x.test/a?x=^&y=|',
  'http://x.test/a b?c=d;e',
  'http://x.test/a?$HOME=`id`',
];

describe('nodeRunner', () => {
  it.each(TRICKY_URLS)('delivers %s as exactly one argument', (url) => {
    const result = nodeRunner.run(process.execPath, [ECHO, 'open', url]);
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.stdout)).toEqual(['open', url]);
  });

  it('reports a missing executable as an error, not an exception', () => {
    const result = nodeRunner.run(join(import.meta.dirname, 'no such program'), []);
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('reports a non-zero exit with its stderr', () => {
    const result = nodeRunner.run(process.execPath, [
      '-e',
      'console.error("boom");process.exit(3)',
    ]);
    expect(result).toMatchObject({ ok: false, status: 3 });
    expect(result.stderr).toContain('boom');
  });
});

describe('PlaywrightCliDriver', () => {
  const command = { executable: 'node', prefixArgs: ['cli.js'], via: 'explicit' } as const;

  it('passes the URL as a single array element, after the prefix arguments', () => {
    const calls: string[][] = [];
    const runner: ProcessRunner = {
      run(executable, args): RunResult {
        calls.push([executable, ...args]);
        const stdout = args.includes('--version') ? '0.1.22\n' : 'out';
        return { ok: true, status: 0, stdout, stderr: '' };
      },
    };
    const url = 'http://x.test/a?b=1&c=2';
    const result = new PlaywrightCliDriver(command, runner).capture(url);

    expect(result).toEqual({ ok: true, output: 'out', cliVersion: '0.1.22' });
    expect(calls).toEqual([
      ['node', 'cli.js', 'open', url],
      ['node', 'cli.js', 'snapshot'],
      ['node', 'cli.js', 'close'],
      ['node', 'cli.js', '--version'],
    ]);
  });

  it('stops after a failed open and says why', () => {
    const calls: string[][] = [];
    const runner: ProcessRunner = {
      run(executable, args) {
        calls.push([executable, ...args]);
        return { ok: false, status: 1, stdout: '', stderr: 'no browser' };
      },
    };
    const result = new PlaywrightCliDriver(command, runner).capture('http://x.test');
    expect(result).toEqual({ ok: false, reason: 'no browser' });
    expect(calls).toHaveLength(1);
  });

  it('drives a real script in a directory with a space', () => {
    const resolved = resolvePlaywrightCli(process.cwd(), ECHO);
    if (resolved === undefined) throw new Error('the fixture script should resolve');
    const result = new PlaywrightCliDriver(resolved).capture('http://x.test/a?b=1&c=2');
    // The echo script prints the arguments of the call, and `snapshot` is the one returned.
    expect(result).toMatchObject({ ok: true, output: '["snapshot"]' });
  });
});

describe('resolvePlaywrightCli', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cue cli-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('runs an explicit .mjs through node', () => {
    expect(resolvePlaywrightCli(root, ECHO)).toEqual({
      executable: process.execPath,
      prefixArgs: [ECHO],
      via: 'explicit',
    });
  });

  it('returns nothing for an explicit path that does not exist', () => {
    expect(resolvePlaywrightCli(root, join(root, 'nope.js'))).toBeUndefined();
  });

  it('finds the project-local @playwright/cli, also from a nested directory', () => {
    const pkg = join(root, 'node_modules', '@playwright', 'cli');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({ bin: { 'playwright-cli': 'bin.js' } }),
    );
    writeFileSync(join(pkg, 'bin.js'), '');
    const nested = join(root, 'apps', 'web');
    mkdirSync(nested, { recursive: true });

    expect(resolvePlaywrightCli(nested, undefined, { pathEnv: '' })).toEqual({
      executable: process.execPath,
      prefixArgs: [join(pkg, 'bin.js')],
      via: 'local-package',
    });
  });

  it('reads the script out of a Windows .cmd shim instead of spawning it', () => {
    const bin = join(root, 'bin');
    const pkg = join(root, 'lib', 'cli');
    mkdirSync(bin, { recursive: true });
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'bin.js'), '');
    writeFileSync(
      join(bin, 'playwright-cli.cmd'),
      '@ECHO off\r\nSETLOCAL\r\nSET dp0=%~dp0\r\n"%_prog%"  "%dp0%\\..\\lib\\cli\\bin.js" %*\r\n',
    );

    const resolved = resolvePlaywrightCli(root, undefined, {
      platform: 'win32',
      pathEnv: bin,
      pathExt: '.EXE;.CMD',
    });
    expect(resolved).toEqual({
      executable: process.execPath,
      prefixArgs: [join(pkg, 'bin.js')],
      via: 'path',
    });
  });

  it('refuses a .cmd shim it cannot read rather than falling back to a shell', () => {
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'playwright-cli.cmd'), '@ECHO off\r\nplaywright-cli-real %*\r\n');

    expect(
      resolvePlaywrightCli(root, undefined, { platform: 'win32', pathEnv: bin, pathExt: '.CMD' }),
    ).toBeUndefined();
  });

  it('looks for a program on PATH without running it', () => {
    const bin = join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'tool.exe'), '');
    writeFileSync(join(bin, 'posix-tool'), '');

    expect(existsOnPath('tool', { platform: 'win32', pathEnv: bin, pathExt: '.EXE;.CMD' })).toBe(
      true,
    );
    expect(existsOnPath('posix-tool', { platform: 'linux', pathEnv: bin })).toBe(true);
    expect(existsOnPath('absent', { platform: 'linux', pathEnv: bin })).toBe(false);
  });

  it('explains how to install when nothing is found', () => {
    const previous = process.env['PATH'];
    process.env['PATH'] = '';
    try {
      expect(() => createPlaywrightCliDriver(root)).toThrow(SurveyError);
      expect(() => createPlaywrightCliDriver(root)).toThrow(/@playwright\/cli/);
    } finally {
      if (previous === undefined) delete process.env['PATH'];
      else process.env['PATH'] = previous;
    }
  });
});

describe('no shell anywhere', () => {
  it('never spawns with shell: true', () => {
    const packages = join(import.meta.dirname, '..', '..');
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts') && /shell:\s*true/.test(readFileSync(path, 'utf8'))) {
          offenders.push(path);
        }
      }
    };
    for (const pkg of readdirSync(packages)) {
      const src = join(packages, pkg, 'src');
      if (statSync(join(packages, pkg)).isDirectory()) {
        try {
          walk(src);
        } catch {
          // A package without src/.
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
