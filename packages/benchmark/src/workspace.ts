import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { GeneratedFile } from './scoring.js';

/**
 * Putting a model's files on disk. The paths come from its answer, so they are
 * input: one that climbs out of the workspace, or replaces the harness's own
 * files, is refused rather than written.
 */

export class UnsafePathError extends Error {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`Refusing to write "${path}": ${reason}.`);
    this.name = 'UnsafePathError';
  }
}

/** Files the harness writes itself; a generated file may not stand in for them. */
const RESERVED = new Set(['playwright.config.ts', 'results.json', 'package.json', 'tsconfig.json']);

/** The path inside `workspace`, or an `UnsafePathError`. Always with the OS separator. */
export function safeWorkspacePath(workspace: string, path: string): string {
  const cleaned = path.trim().replaceAll('\\', '/');
  if (cleaned === '') throw new UnsafePathError(path, 'the path is empty');
  if (isAbsolute(cleaned) || /^[a-zA-Z]:/.test(cleaned) || cleaned.startsWith('/')) {
    throw new UnsafePathError(path, 'the path is absolute');
  }
  if (cleaned.split('/').includes('..')) {
    throw new UnsafePathError(path, 'the path leaves the workspace');
  }

  const root = resolve(workspace);
  const target = resolve(root, cleaned);
  const inside = relative(root, target);
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    throw new UnsafePathError(path, 'the path leaves the workspace');
  }
  if (RESERVED.has(inside.split(sep).join('/'))) {
    throw new UnsafePathError(path, 'that file belongs to the harness');
  }
  return target;
}

/** Writes every file, or none: a refused path is found before anything is created. */
export function writeWorkspace(workspace: string, files: readonly GeneratedFile[]): string[] {
  const targets = files.map((file) => ({ file, target: safeWorkspacePath(workspace, file.path) }));
  for (const { file, target } of targets) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.source, 'utf8');
  }
  return targets.map(({ target }) => relative(workspace, target).split(sep).join('/'));
}
