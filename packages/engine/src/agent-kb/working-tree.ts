import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { FileStateProvider } from '../knowledge/index.js';
import { PRODUCT_DIR } from './paths.js';

/**
 * The product's files as they are now, for deciding whether what a fact was read
 * from has changed. All the I/O the freshness model leaves out lives here.
 */

/** The hash `extract` records for a file, so the two can be compared. */
export function hashContent(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

/** Hashes files under `productRoot` as they are now, remembering each for the life of the provider. */
export function workingTreeFiles(productRoot: string): FileStateProvider {
  const seen = new Map<string, string | undefined>();
  return {
    hashOf(path) {
      if (seen.has(path)) return seen.get(path);
      const absolute = isAbsolute(path) ? path : join(productRoot, path);
      let hash: string | undefined;
      try {
        hash = statSync(absolute).isFile()
          ? hashContent(readFileSync(absolute, 'utf8'))
          : undefined;
      } catch {
        hash = undefined;
      }
      seen.set(path, hash);
      return hash;
    },
  };
}

/**
 * Where the product's source is. An explicit `--source` wins; otherwise the place
 * `extract` read it from, if that is still there. A different checkout of the same
 * project (CI, a colleague's machine) will not have it, and says so by returning
 * nothing rather than comparing against the wrong tree.
 */
export function findProductRoot(projectRoot: string, explicit?: string): string | undefined {
  if (explicit !== undefined) {
    const root = resolve(projectRoot, explicit);
    return existsSync(root) ? root : undefined;
  }

  try {
    const sources = JSON.parse(
      readFileSync(join(projectRoot, PRODUCT_DIR, 'sources.json'), 'utf8'),
    ) as { source?: unknown };
    if (typeof sources.source === 'string' && existsSync(sources.source)) return sources.source;
  } catch {
    // No extract has been run, or its record is unreadable.
  }
  return undefined;
}

export type ChangedFiles = { ok: true; files: string[] } | { ok: false; reason: string };

/**
 * The files that changed over a git range, relative to `productRoot` with forward
 * slashes — the form dependencies are recorded in. Run without a shell.
 */
export function changedFiles(range: string, productRoot: string): ChangedFiles {
  // A range that starts with a dash is an option, not a revision.
  if (range.startsWith('-')) return { ok: false, reason: `"${range}" is not a git range` };

  const result = spawnSync('git', ['diff', '--name-only', '--relative', range, '--'], {
    cwd: productRoot,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error !== undefined) {
    return { ok: false, reason: `git could not be run: ${result.error.message}` };
  }
  if (result.status !== 0) {
    const why = result.stderr.trim().split('\n')[0] ?? 'unknown error';
    return { ok: false, reason: `git diff ${range} failed in ${productRoot}: ${why}` };
  }
  return {
    ok: true,
    files: result.stdout
      .split('\n')
      .map((line) => line.trim().replaceAll('\\', '/'))
      .filter((line) => line.length > 0),
  };
}
