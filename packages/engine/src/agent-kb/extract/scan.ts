import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { hashContent } from '../working-tree.js';

/**
 * Reading a product repository that may not be yours. Three guarantees live here
 * rather than in each adapter: nothing is written, only known file types are
 * opened so a stray `.env` is never read, and file contents never leave this
 * module — adapters get lines and line numbers, never code to store.
 */

/** Extensions worth reading. Anything else is skipped without being opened. */
const READABLE = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
  '.html',
  '.astro',
  '.php',
  '.json',
  '.yaml',
  '.yml',
]);

/** Never descended into: build output, dependencies, `.git`, `.env*`. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'coverage',
  'vendor',
  '__pycache__',
  '.venv',
  'target',
]);

const SKIP_FILES = /^(\.env|\.env\..*|.*\.pem|.*\.key|.*\.p12|.*\.pfx)$/i;

/** Beyond this a file is almost certainly generated or vendored. */
const MAX_BYTES = 512 * 1024;

export interface SourceFileRef {
  readonly path: string;
  readonly lines: readonly string[];
  readonly hash: string;
}

export interface ScanResult {
  readonly files: readonly SourceFileRef[];
  /** Things worth telling the user about, rather than silently skipping. */
  readonly notes: readonly string[];
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export interface ScanOptions {
  /**
   * Directories to leave out, relative to the root (`resources/apps`) or a bare name
   * (`templates`). For nested projects that are not the product, such as app templates
   * with their own `package.json`, which framework detection would take for it.
   */
  readonly exclude?: readonly string[];
}

const normaliseExclude = (entry: string): string =>
  entry.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');

export function scanSource(root: string, limit = 5000, options: ScanOptions = {}): ScanResult {
  if (!existsSync(root)) {
    return { files: [], notes: [`no such directory: ${root}`] };
  }

  const files: SourceFileRef[] = [];
  const notes: string[] = [];
  const queue: string[] = [root];
  const excluded = (options.exclude ?? []).map(normaliseExclude).filter((e) => e.length > 0);
  const isExcluded = (name: string, path: string): boolean => {
    const rel = relative(root, path).split(sep).join('/');
    return excluded.some((e) =>
      e.includes('/') ? rel === e || rel.startsWith(`${e}/`) : e === name,
    );
  };

  for (let dir = queue.pop(); dir !== undefined && files.length < limit; dir = queue.pop()) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      // A note, not a failure: `extract` runs against permissions we do not control.
      notes.push(`could not read ${relative(root, dir) || '.'}`);
      continue;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (
          !SKIP_DIRS.has(entry.name) &&
          !entry.name.startsWith('.') &&
          !isExcluded(entry.name, path)
        ) {
          queue.push(path);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (SKIP_FILES.test(entry.name)) continue;
      if (!READABLE.has(extensionOf(entry.name))) continue;

      try {
        if (statSync(path).size > MAX_BYTES) continue;
        const text = readFileSync(path, 'utf8');
        files.push({
          path: relative(root, path).split(sep).join('/'),
          lines: text.split('\n'),
          hash: hashContent(text),
        });
      } catch {
        notes.push(`could not read ${relative(root, path)}`);
      }
    }
  }

  if (files.length >= limit) {
    notes.push(
      `stopped after ${String(limit)} files — the result is partial, and a narrower --source would be more accurate`,
    );
  }

  return { files, notes };
}

/** A `file:line` reference, which is what makes a claim checkable. */
export function reference(file: SourceFileRef, lineIndex: number): string {
  return `${file.path}:${String(lineIndex + 1)}`;
}
