import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cachedKnowledgeIndex,
  clearKnowledgeCache,
  findKnowledgeRoot,
} from '../src/agent-kb/knowledge-cache.js';
import { writeRouteMap } from '../src/agent-kb/store.js';

let root: string;
beforeEach(() => {
  clearKnowledgeCache();
  root = mkdtempSync(join(tmpdir(), 'understudy-cache-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const survey = (names: string[]): unknown =>
  writeRouteMap(root, {
    schemaVersion: 2,
    route: '/login',
    title: 'Sign in',
    exploredAt: new Date().toISOString(),
    verifiedAt: new Date().toISOString(),
    snapshotHash: 'h',
    links: [],
    gaps: [],
    elements: names.map((name) => ({
      role: 'button',
      name,
      locator: `getByRole('button', { name: '${name}' })`,
      confidence: 'runtime-only' as const,
    })),
  });

describe('findKnowledgeRoot', () => {
  it('walks up to the nearest directory with an .agent-kb', () => {
    survey(['Log in']);
    const deep = join(root, 'tests', 'a', 'b');
    mkdirSync(deep, { recursive: true });
    expect(findKnowledgeRoot(deep)).toBe(root);
    expect(findKnowledgeRoot(root)).toBe(root);
  });

  it('finds nothing where there is none, even below a path that does not exist yet', () => {
    expect(findKnowledgeRoot(join(root, 'not', 'there'))).toBeUndefined();
  });
});

describe('cachedKnowledgeIndex', () => {
  it('serves the same index until something changes', () => {
    survey(['Log in']);
    const t0 = Date.now();
    const first = cachedKnowledgeIndex(root, t0);
    expect(cachedKnowledgeIndex(root, t0 + 5000)).toBe(first);
  });

  it('does not even look at the files again within a second', () => {
    survey(['Log in']);
    const t0 = Date.now();
    const first = cachedKnowledgeIndex(root, t0);
    survey(['Log in', 'Cancel']);
    expect(cachedKnowledgeIndex(root, t0 + 100)).toBe(first);
  });

  it('reads again once a file under .agent-kb has changed', () => {
    survey(['Log in']);
    const t0 = Date.now();
    const first = cachedKnowledgeIndex(root, t0);
    expect(first.allLocators()).toHaveLength(1);

    // A distinct modification time, whatever the file system's resolution.
    writeFileSync(join(root, '.agent-kb', 'touch.txt'), 'x');
    survey(['Log in', 'Cancel']);
    const second = cachedKnowledgeIndex(root, t0 + 5000);
    expect(second).not.toBe(first);
    expect(second.allLocators()).toHaveLength(2);
  });
});
