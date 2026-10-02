import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatLocatorAnswer, resolveLocator } from '../src/agent-kb/resolve-locator.js';
import { writeRouteMap } from '../src/agent-kb/store.js';
import { extract } from '../src/agent-kb/extract/run.js';
import { hashContent, workingTreeFiles } from '../src/agent-kb/working-tree.js';
import { indexKnowledge } from '../src/knowledge/query.js';
import { loadKnowledge } from '../src/agent-kb/load-knowledge.js';
import { analyzeLocators } from '../src/verification/locator-analyzer.js';

/**
 * A locator read from code that has since been rewritten is still in the map, and
 * still fresh by the calendar. The answer has to say it may be wrong, and why.
 */

const NOW = new Date('2026-10-01T12:00:00Z');
const AT = '2026-09-30T12:00:00.000Z';

let product: string;
let project: string;

const writeProduct = (path: string, text: string): void => {
  const full = join(product, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, 'utf8');
};

beforeEach(() => {
  product = mkdtempSync(join(tmpdir(), 'understudy-lc-product-'));
  project = mkdtempSync(join(tmpdir(), 'understudy-lc-project-'));
  writeProduct('app/Login.tsx', '<button data-testid="login-submit">Log in</button>\n');
  extract({ projectRoot: project, sourceRoot: product, now: new Date(AT) });

  // Surveyed, with the element confirmed by its test id: so it depends on that file.
  writeRouteMap(project, {
    schemaVersion: 2,
    route: '/login',
    title: 'Sign in',
    exploredAt: AT,
    verifiedAt: AT,
    snapshotHash: 'h',
    links: [],
    gaps: [],
    elements: [
      {
        role: 'button',
        name: 'Log in',
        locator: "getByRole('button', { name: 'Log in' })",
        confidence: 'runtime-only',
      },
    ],
  });
});

afterEach(() => {
  rmSync(product, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

const ask = (files = workingTreeFiles(product)) =>
  resolveLocator({ projectRoot: project, query: 'log in button', now: NOW, files });

describe('looking a locator up', () => {
  it('has nothing to add while the code is as it was', () => {
    const answer = ask();
    if (answer.kind !== 'found') throw new Error('expected an answer');
    expect(answer.changes).toEqual([]);
    expect(formatLocatorAnswer(answer)).not.toContain('Changed:');
  });

  it('says a file it was read from changed, naming it, once the code is rewritten', () => {
    writeProduct('app/Login.tsx', '<button data-testid="login-submit">Sign in</button>\n');
    const answer = ask();
    if (answer.kind !== 'found') throw new Error('expected an answer');

    expect(answer.freshness).toBe('fresh');
    expect(answer.changes).toEqual([`app/Login.tsx changed since it was confirmed (2026-09-30)`]);
    expect(answer.advice).toContain('A file it was read from has changed');
    expect(formatLocatorAnswer(answer)).toContain(
      'Changed:    app/Login.tsx changed since it was confirmed',
    );
  });

  it('says nothing about code when it was not given the product to compare with', () => {
    writeProduct('app/Login.tsx', 'rewritten\n');
    const answer = resolveLocator({ projectRoot: project, query: 'log in button', now: NOW });
    if (answer.kind !== 'found') throw new Error('expected an answer');
    expect(answer.changes).toEqual([]);
  });

  it('keeps the answer short when several files changed: the first, and how many more', () => {
    writeProduct('app/Login.tsx', 'rewritten\n');
    const answer = ask();
    if (answer.kind !== 'found') throw new Error('expected an answer');
    const one = formatLocatorAnswer(answer);
    expect(one.split('\n').filter((line) => line.startsWith('Changed:'))).toHaveLength(1);
    expect(one).not.toContain('more)');
  });
});

describe('checking a test', () => {
  const index = () => indexKnowledge(loadKnowledge(project, NOW).kb);
  const source =
    "test('t', async ({ page }) => { await page.goto('/login'); page.getByRole('button', { name: 'Log in' }); });";

  it('is known while the code is as it was', () => {
    const [finding] = analyzeLocators({
      filePath: 'a.spec.ts',
      source,
      index: index(),
      now: NOW,
      files: workingTreeFiles(product),
    });
    expect(finding?.verdict).toBe('known');
  });

  it('calls a match read from rewritten code stale, and names the file', () => {
    writeProduct('app/Login.tsx', 'rewritten\n');
    const [finding] = analyzeLocators({
      filePath: 'a.spec.ts',
      source,
      index: index(),
      now: NOW,
      files: workingTreeFiles(product),
    });
    expect(finding?.verdict).toBe('stale');
    expect(finding?.suggestion).toContain('the code it was read from may have changed');
    expect(finding?.suggestion).toContain('app/Login.tsx changed since it was confirmed');
    expect(finding?.suggestion).toContain('understudy survey <url>/login');
  });

  it('is unchanged when it is not given the files: age and failed checks are all it knew', () => {
    writeProduct('app/Login.tsx', 'rewritten\n');
    const [finding] = analyzeLocators({ filePath: 'a.spec.ts', source, index: index(), now: NOW });
    expect(finding?.verdict).toBe('known');
  });
});

it('hashes what extract recorded, so an untouched file is never reported', () => {
  expect(workingTreeFiles(product).hashOf('app/Login.tsx')).toBe(
    hashContent('<button data-testid="login-submit">Log in</button>\n'),
  );
});
