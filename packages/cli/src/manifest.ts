import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { adoptOwner } from '@wiluszdamian/cue-engine';
import { z } from 'zod';
import { TARGET_IDS, type TargetId } from './agents.js';

/**
 * The record of what `init` wrote. Without it, `remove` deletes by convention and
 * takes a file the user wrote. Each entry hashes the content as Cue wrote
 * it, so a hash that no longer matches means the file is the user's from now on.
 */

export const MANIFEST_PATH = '.cue/install.json';
export const MANIFEST_SCHEMA_VERSION = 1;

/**
 * `created` — the whole file is ours; removing the target deletes it.
 * `region`  — the user's file, with a marked span of ours inside it. The only way
 *             an existing file is touched, so removal is an exact reversal.
 */
export const FileKindSchema = z.enum(['created', 'region']);

export const ManagedFileSchema = z.strictObject({
  path: z.string().min(1),
  hash: z.string().regex(/^[a-f0-9]{64}$/, 'expected a sha256 hex digest'),
  target: z.enum(TARGET_IDS),
  kind: FileKindSchema,
  region: z.strictObject({ begin: z.string().min(1), end: z.string().min(1) }).optional(),
  generatedBy: z.string().min(1),
  writtenAt: z.string().min(1),
});

export const ManifestSchema = z.strictObject({
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION),
  cueVersion: z.string().min(1),
  packageManager: z.string().min(1),
  targets: z.array(z.enum(TARGET_IDS)),
  files: z.array(ManagedFileSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type FileKind = z.infer<typeof FileKindSchema>;
export type ManagedFile = z.infer<typeof ManagedFileSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

export function hashContent(content: string): string {
  // Normalised so a CRLF checkout does not read as a hand edit.
  return createHash('sha256').update(content.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

export function emptyManifest(cueVersion: string, packageManager: string): Manifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    cueVersion,
    packageManager,
    targets: [],
    files: [],
    createdAt: now,
    updatedAt: now,
  };
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

export function readManifest(projectRoot: string): Manifest | undefined {
  const file = join(projectRoot, MANIFEST_PATH);
  if (!existsSync(file)) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ManifestError(
      `${MANIFEST_PATH} is not valid JSON (${error instanceof Error ? error.message : String(error)}).\n` +
        `Delete it to start fresh — you will lose the record of what init wrote, so\n` +
        `remove and upgrade will no longer be able to clean up precisely.`,
    );
  }

  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new ManifestError(
      `${MANIFEST_PATH} does not match the expected shape:\n` +
        result.error.issues
          .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('\n'),
    );
  }
  return result.data;
}

export function writeManifest(projectRoot: string, manifest: Manifest): void {
  const file = join(projectRoot, MANIFEST_PATH);
  mkdirSync(dirname(file), { recursive: true });
  const next: Manifest = {
    ...manifest,
    files: [...manifest.files].sort((a, b) => a.path.localeCompare(b.path)),
    targets: [...manifest.targets].sort(),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  adoptOwner(file, projectRoot);
}

export type FileState =
  | { readonly kind: 'absent' }
  /** Ours, byte-identical to what we wrote. Safe to rewrite. */
  | { readonly kind: 'managed-clean'; readonly entry: ManagedFile }
  /** Ours originally, edited since. Never overwrite without asking. */
  | { readonly kind: 'managed-modified'; readonly entry: ManagedFile }
  /** Present but not ours. Never touch except through a marked region. */
  | { readonly kind: 'foreign' };

export function inspectFile(
  projectRoot: string,
  path: string,
  manifest: Manifest | undefined,
): FileState {
  const absolute = join(projectRoot, path);
  const entry = manifest?.files.find((f) => f.path === path);

  if (!existsSync(absolute)) return { kind: 'absent' };
  if (!entry) return { kind: 'foreign' };

  const actual = hashContent(readFileSync(absolute, 'utf8'));
  return actual === entry.hash
    ? { kind: 'managed-clean', entry }
    : { kind: 'managed-modified', entry };
}

export function recordFile(manifest: Manifest, file: ManagedFile): Manifest {
  return {
    ...manifest,
    files: [...manifest.files.filter((f) => f.path !== file.path), file],
  };
}

export function forgetFile(manifest: Manifest, path: string): Manifest {
  return { ...manifest, files: manifest.files.filter((f) => f.path !== path) };
}

export function filesForTarget(manifest: Manifest, target: TargetId): ManagedFile[] {
  return manifest.files.filter((f) => f.target === target);
}
