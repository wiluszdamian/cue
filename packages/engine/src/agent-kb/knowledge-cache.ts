import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { indexKnowledge, type KnowledgeIndex } from '../knowledge/index.js';
import { loadKnowledge } from './load-knowledge.js';

/**
 * A long-lived process — an editor's ESLint server — asks the same question for
 * every file it lints, and re-reading `.agent-kb` each time would make the rule
 * unusable. The index is kept until a file under `.agent-kb` changes.
 */

const KB_DIR = '.agent-kb';

/** The nearest directory above `startDir` (or `startDir` itself) that holds an `.agent-kb`. */
export function findKnowledgeRoot(startDir: string): string | undefined {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, KB_DIR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Every file's modification time under `.agent-kb`, folded into one string. */
function signatureOf(root: string): string {
  const parts: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        try {
          parts.push(`${entry.name}:${String(statSync(path).mtimeMs)}`);
        } catch {
          // Removed while looking: the next call sees the difference.
        }
      }
    }
  };
  walk(join(root, KB_DIR));
  return parts.join('|');
}

interface Cached {
  readonly index: KnowledgeIndex;
  readonly signature: string;
  checkedAt: number;
}

const cache = new Map<string, Cached>();

/** Looking at the files costs a few stats; once a second is plenty for an editor. */
const RECHECK_AFTER_MS = 1000;

/** For tests: forget everything cached. */
export function clearKnowledgeCache(): void {
  cache.clear();
}

export function cachedKnowledgeIndex(root: string, now: number = Date.now()): KnowledgeIndex {
  const held = cache.get(root);
  if (held !== undefined && now - held.checkedAt < RECHECK_AFTER_MS) return held.index;

  const signature = signatureOf(root);
  if (held?.signature === signature) {
    held.checkedAt = now;
    return held.index;
  }

  const index = indexKnowledge(loadKnowledge(root).kb);
  cache.set(root, { index, signature, checkedAt: now });
  return index;
}
