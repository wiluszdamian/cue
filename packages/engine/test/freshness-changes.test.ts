import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  changedFiles,
  findProductRoot,
  hashContent,
  workingTreeFiles,
} from '../src/agent-kb/working-tree.js';
import { extract } from '../src/agent-kb/extract/run.js';
import {
  affectedBy,
  computeFreshness,
  type FileStateProvider,
} from '../src/knowledge/freshness.js';

const NOW = new Date('2026-10-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number): string => new Date(NOW.getTime() - days * DAY).toISOString();

const filesAre = (state: Record<string, string | undefined>): FileStateProvider => ({
  hashOf: (path) => state[path],
});

const depends = (...entries: [string, string | undefined][]) => ({
  files: entries.map(([path, hash]) => (hash === undefined ? { path } : { path, hash })),
});

describe('freshness from age alone', () => {
  it('is fresh, ageing or stale by how long ago it was confirmed', () => {
    expect(computeFreshness({ verifiedAt: ago(1) }, NOW)).toEqual({
      freshness: 'fresh',
      reasons: [],
    });
    expect(computeFreshness({ verifiedAt: ago(10) }, NOW)).toEqual({
      freshness: 'ageing',
      reasons: ['last confirmed 10 days ago'],
    });
    expect(computeFreshness({ verifiedAt: ago(45) }, NOW)).toEqual({
      freshness: 'stale',
      reasons: ['not confirmed for 45 days'],
    });
  });

  it('calls a fact that was never confirmed stale: an undated claim is not a recent one', () => {
    expect(computeFreshness({}, NOW).freshness).toBe('stale');
  });
});

describe('freshness from what changed', () => {
  const fact = (days: number, files: ReturnType<typeof depends>) => ({
    verifiedAt: ago(days),
    dependencies: files,
  });

  it('is possibly stale when a file it depends on has changed, and says which', () => {
    const verdict = computeFreshness(
      fact(1, depends(['src/Password.tsx', 'old'])),
      NOW,
      filesAre({ 'src/Password.tsx': 'new' }),
    );
    expect(verdict.freshness).toBe('possibly-stale');
    expect(verdict.reasons).toEqual([
      'src/Password.tsx changed since it was confirmed (2026-09-30)',
    ]);
  });

  it('is possibly stale when the file is gone', () => {
    const verdict = computeFreshness(fact(1, depends(['src/Gone.tsx', 'old'])), NOW, filesAre({}));
    expect(verdict.freshness).toBe('possibly-stale');
    expect(verdict.reasons[0]).toContain('src/Gone.tsx no longer exists');
  });

  it('is not disturbed by a file that has not changed', () => {
    const verdict = computeFreshness(
      fact(1, depends(['src/Same.tsx', 'h'])),
      NOW,
      filesAre({ 'src/Same.tsx': 'h' }),
    );
    expect(verdict).toEqual({ freshness: 'fresh', reasons: [] });
  });

  it('is not disturbed by a change to something it does not depend on', () => {
    const verdict = computeFreshness(
      fact(1, depends(['src/Mine.tsx', 'h'])),
      NOW,
      filesAre({ 'src/Mine.tsx': 'h', 'src/Other.tsx': 'something else entirely' }),
    );
    expect(verdict.freshness).toBe('fresh');
  });

  it('judges nothing about a dependency recorded without a hash, or a provider it was not given', () => {
    expect(
      computeFreshness(
        fact(1, depends(['src/A.tsx', undefined])),
        NOW,
        filesAre({ 'src/A.tsx': 'x' }),
      ).freshness,
    ).toBe('fresh');
    expect(computeFreshness(fact(1, depends(['src/A.tsx', 'h'])), NOW).freshness).toBe('fresh');
  });

  it('reports every changed file, not only the first', () => {
    const verdict = computeFreshness(
      fact(1, depends(['a.tsx', '1'], ['b.tsx', '2'], ['c.tsx', '3'])),
      NOW,
      filesAre({ 'a.tsx': 'x', 'b.tsx': '2', 'c.tsx': undefined }),
    );
    expect(verdict.reasons.map((r) => r.split(' ')[0])).toEqual(['a.tsx', 'c.tsx']);
  });

  it('takes the worse of age and change, and keeps both reasons', () => {
    const old = computeFreshness(
      fact(60, depends(['a.tsx', '1'])),
      NOW,
      filesAre({ 'a.tsx': 'changed' }),
    );
    // Stale by age outranks possibly stale by change.
    expect(old.freshness).toBe('stale');
    expect(old.reasons).toHaveLength(2);

    const ageing = computeFreshness(
      fact(10, depends(['a.tsx', '1'])),
      NOW,
      filesAre({ 'a.tsx': 'changed' }),
    );
    // Possibly stale by change outranks ageing.
    expect(ageing.freshness).toBe('possibly-stale');
    expect(ageing.reasons).toHaveLength(2);
  });
});

describe('which facts a change reaches', () => {
  const facts = [
    { id: 'a', dependencies: depends(['src/A.tsx', 'h']) },
    { id: 'b', dependencies: depends(['src/B.tsx', 'h'], ['src/Shared.tsx', 'h']) },
    { id: 'c', dependencies: depends(['src/Shared.tsx', 'h']) },
    { id: 'd' },
  ];

  it('finds only those that depend on a changed file, and leaves the rest alone', () => {
    expect(affectedBy(facts, ['src/A.tsx']).map((f) => f.id)).toEqual(['a']);
    expect(affectedBy(facts, ['src/Shared.tsx']).map((f) => f.id)).toEqual(['b', 'c']);
    expect(affectedBy(facts, ['src/Unrelated.tsx'])).toEqual([]);
    expect(affectedBy(facts, [])).toEqual([]);
  });

  it('matches paths exactly, with either slash', () => {
    expect(affectedBy(facts, ['A.tsx'])).toEqual([]);
    expect(affectedBy(facts, ['src\\A.tsx']).map((f) => f.id)).toEqual(['a']);
  });
});

describe('the product’s files, as they are now', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'understudy-tree-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const write = (path: string, text: string): void => {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text, 'utf8');
  };

  it('hashes a file the way `extract` recorded it, whatever its line endings', () => {
    write('src/a.tsx', 'one\r\ntwo\r\n');
    expect(workingTreeFiles(root).hashOf('src/a.tsx')).toBe(hashContent('one\ntwo\n'));
  });

  it('is nothing for a file that is not there, or is a directory', () => {
    mkdirSync(join(root, 'src'));
    const files = workingTreeFiles(root);
    expect(files.hashOf('src/missing.tsx')).toBeUndefined();
    expect(files.hashOf('src')).toBeUndefined();
  });

  it('sees a change made after it first looked only if asked again with a fresh provider', () => {
    write('a.tsx', 'v1');
    const before = workingTreeFiles(root).hashOf('a.tsx');
    write('a.tsx', 'v2');
    expect(workingTreeFiles(root).hashOf('a.tsx')).not.toBe(before);
  });

  it('agrees with the hashes `extract` writes, so an unchanged file is not reported', () => {
    const project = mkdtempSync(join(tmpdir(), 'understudy-proj-'));
    try {
      write('app/Login.tsx', '<button data-testid="login-submit">Log in</button>\r\n');
      extract({ projectRoot: project, sourceRoot: root });
      const recorded = JSON.parse(
        readFileSync(join(project, '.agent-kb', 'product', 'sources.json'), 'utf8'),
      ) as { files: { path: string; hash: string }[]; source: string };
      const entry = recorded.files.find((f) => f.path === 'app/Login.tsx');
      expect(entry?.hash).toBe(workingTreeFiles(root).hashOf('app/Login.tsx'));
      expect(findProductRoot(project)).toBe(recorded.source);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  describe('finding the product', () => {
    it('prefers what it is told, if it is there', () => {
      expect(findProductRoot(tmpdir(), root)).toBe(root);
      expect(findProductRoot(tmpdir(), join(root, 'nowhere'))).toBeUndefined();
    });

    it('is nothing when no extract has been run', () => {
      expect(findProductRoot(root)).toBeUndefined();
    });
  });

  describe('what changed in git', () => {
    const git = (...args: string[]): void => {
      const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd: root,
        encoding: 'utf8',
      });
      if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
    };

    it('lists the files changed over a range, relative to the product', () => {
      git('init', '-q');
      write('src/A.tsx', '1');
      write('src/B.tsx', '1');
      git('add', '.');
      git('commit', '-q', '-m', 'one');
      write('src/A.tsx', '2');
      write('docs/new.md', 'x');
      git('add', '.');
      git('commit', '-q', '-m', 'two');

      expect(changedFiles('HEAD~1..HEAD', root)).toEqual({
        ok: true,
        files: ['docs/new.md', 'src/A.tsx'],
      });
      expect(changedFiles('HEAD..HEAD', root)).toEqual({ ok: true, files: [] });
    });

    it('is relative to where the product is, when that is a folder of a larger repository', () => {
      git('init', '-q');
      write('app/src/A.tsx', '1');
      write('other/B.tsx', '1');
      git('add', '.');
      git('commit', '-q', '-m', 'one');
      write('app/src/A.tsx', '2');
      write('other/B.tsx', '2');
      git('add', '.');
      git('commit', '-q', '-m', 'two');

      expect(changedFiles('HEAD~1..HEAD', join(root, 'app'))).toEqual({
        ok: true,
        files: ['src/A.tsx'],
      });
    });

    it('says why, rather than throwing, for a range git does not know', () => {
      git('init', '-q');
      const result = changedFiles('nonsense..range', root);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('git diff nonsense..range failed');
    });

    it('does not let a range become an option', () => {
      const result = changedFiles('--output=/tmp/x', root);
      expect(result).toEqual({ ok: false, reason: '"--output=/tmp/x" is not a git range' });
    });

    it('says so when the product is not a git checkout', () => {
      const result = changedFiles('HEAD~1..HEAD', root);
      expect(result.ok).toBe(false);
    });
  });
});
