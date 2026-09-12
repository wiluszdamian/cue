import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The docs are plain Markdown in the tree, so nothing builds them and nothing
 * would notice either of these:
 *
 * 1. **A command that cannot be pasted.** Windows `cmd` has no `#` comment, so a
 *    trailing note becomes two more arguments: a documented command with one was
 *    pasted from these docs and failed with "no such directory: docs\\#".
 * 2. **A link to a page that does not exist.** A relative link to a missing file
 *    is silent on GitHub and in an editor; only a reader finds it.
 */

const CONTENT = join(import.meta.dirname, '..', '..', '..', 'docs');

function markdownFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...markdownFiles(path));
    else if (entry.name.endsWith('.md')) found.push(path);
  }
  return found;
}

const pages = markdownFiles(CONTENT);
const short = (path: string): string => relative(CONTENT, path).split('\\').join('/');

/** Fenced blocks a reader is meant to copy and run. */
function shellBlocks(source: string): string[] {
  return [...source.matchAll(/```(?:bash|sh|shell)\r?\n([\s\S]*?)```/g)].map((m) => m[1] ?? '');
}

describe('the docs exist to be checked', () => {
  it('finds pages', () => {
    expect(pages.length).toBeGreaterThan(10);
  });
});

describe('every command can be pasted as-is', () => {
  it.each(pages.map((p) => [short(p), p] as const))('%s', (_name, path) => {
    const offenders: string[] = [];

    for (const block of shellBlocks(readFileSync(path, 'utf8'))) {
      for (const line of block.split('\n')) {
        const trimmed = line.trim();
        // A whole-line comment is fine — nobody pastes it expecting it to run.
        if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
        if (/\s#(\s|$)/.test(trimmed)) offenders.push(trimmed);
      }
    }

    expect(
      offenders,
      'A trailing "#" note is a comment in bash and two arguments in Windows cmd. ' +
        'Put the explanation in prose after the block instead.',
    ).toEqual([]);
  });
});

describe('every internal link goes somewhere', () => {
  const links = pages.flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    // Relative Markdown links only; an absolute URL is somebody else's problem.
    return [...source.matchAll(/\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g)]
      .filter((m) => !/^[a-z]+:/i.test(m[1] ?? ''))
      .map((m) => ({ from: short(path), dir: dirname(path), target: m[1] ?? '' }));
  });

  it('finds links to check', () => {
    expect(links.length).toBeGreaterThan(10);
  });

  it.each(links.map((l) => [`${l.from} -> ${l.target}`, l] as const))('%s', (_name, link) => {
    expect(existsSync(resolve(link.dir, link.target))).toBe(true);
  });
});

describe('the index is the only way in', () => {
  it('links into every section', () => {
    const index = readFileSync(join(CONTENT, 'index.md'), 'utf8');
    const sections = readdirSync(CONTENT, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name);

    for (const section of sections) {
      // Nothing generates a sidebar any more, so a page the index misses is a
      // page nobody can reach except by browsing the directory.
      expect(index, `docs/index.md does not link into ${section}/`).toContain(`${section}/`);
    }
  });
});
