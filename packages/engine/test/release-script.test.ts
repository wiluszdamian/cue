import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * A release is one number. The script that keeps the tag, VERSION, the changelog and the
 * manifests together is run here against a small copy of a repository.
 */

const SCRIPT = join(import.meta.dirname, '..', '..', '..', 'scripts', 'release.mjs');

let root: string;

function write(path: string, text: string): void {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, text);
}

const manifest = (name: string, version: string): string =>
  `{\n  "name": "${name}",\n  "version": "${version}",\n  "private": true\n}\n`;

const run = (...args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, ...args, '--root', root], { encoding: 'utf8' });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cue-release-'));
  write('VERSION', '0.8.0\n');
  write('package.json', manifest('root', '0.8.0'));
  write('packages/a/package.json', manifest('a', '0.8.0'));
  write('packages/b/package.json', manifest('b', '0.8.0'));
  write('examples/demo/package.json', manifest('demo', '0.8.0'));
  write(
    'CHANGELOG.md',
    '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A thing.\n\n## [0.8.0] - 2026-09-01\n\n- Older.\n',
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('bump', () => {
  it('moves every version and dates the changelog', () => {
    const result = run('bump', '0.9.0');
    expect(result.status, result.stderr).toBe(0);

    expect(readFileSync(join(root, 'VERSION'), 'utf8')).toBe('0.9.0\n');
    for (const file of [
      'package.json',
      'packages/a/package.json',
      'packages/b/package.json',
      'examples/demo/package.json',
    ]) {
      expect(readFileSync(join(root, file), 'utf8'), file).toContain('"version": "0.9.0"');
    }
    const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toMatch(
      /## \[Unreleased\]\n\n## \[0\.9\.0\] - \d{4}-\d{2}-\d{2}\n\n### Added/,
    );
    expect(changelog).toContain('## [0.8.0] - 2026-09-01');
  });

  it('refuses something that is not a version, and a version it already is', () => {
    expect(run('bump', 'soon').status).toBe(1);
    expect(run('bump', '0.8.0').status).toBe(1);
  });

  it('accepts a pre-release', () => {
    expect(run('bump', '1.0.0-rc.1').status).toBe(0);
  });
});

describe('check', () => {
  it('passes once the release has been prepared, with or without the v', () => {
    run('bump', '0.9.0');
    expect(run('check', 'v0.9.0').status).toBe(0);
    expect(run('check', '0.9.0').status).toBe(0);
  });

  it('names what disagrees with the tag', () => {
    run('bump', '0.9.0');
    write('packages/b/package.json', manifest('b', '0.8.0'));
    const result = run('check', 'v0.9.0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('packages/b/package.json says 0.8.0');
    expect(result.stderr).toContain('node scripts/release.mjs bump 0.9.0');
  });

  it('fails a tag that nobody prepared', () => {
    const result = run('check', 'v0.9.0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('VERSION says 0.8.0');
    expect(result.stderr).toContain('no section for 0.9.0');
  });

  it('fails when the changelog section is empty', () => {
    run('bump', '0.9.0');
    write(
      'CHANGELOG.md',
      '# Changelog\n\n## [Unreleased]\n\n## [0.9.0] - 2026-10-02\n\n## [0.8.0] - 2026-09-01\n\n- Older.\n',
    );
    expect(run('check', 'v0.9.0').stderr).toContain('is empty');
  });
});

describe('notes', () => {
  it('prints that version and nothing of its neighbours', () => {
    run('bump', '0.9.0');
    const result = run('notes', '0.9.0');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('- A thing.');
    expect(result.stdout).not.toContain('Older.');
  });

  it('fails for a version with no notes', () => {
    expect(run('notes', '3.0.0').status).toBe(1);
  });
});

describe('this repository', () => {
  it('is consistent with its own tag right now', () => {
    const repo = join(import.meta.dirname, '..', '..', '..');
    const version = readFileSync(join(repo, 'VERSION'), 'utf8').trim();
    // The changelog section for the current version may not exist yet (unreleased work);
    // the manifests and VERSION must still agree.
    const copy = mkdtempSync(join(tmpdir(), 'cue-release-self-'));
    try {
      for (const file of ['VERSION', 'package.json']) cpSync(join(repo, file), join(copy, file));
      const result = spawnSync(process.execPath, [SCRIPT, 'check', version, '--root', copy], {
        encoding: 'utf8',
      });
      expect(result.stderr).not.toContain('VERSION says');
      expect(result.stderr).not.toContain('package.json says');
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});
