import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TargetId } from './agents.js';
import { hashContent, type FileState, type Manifest, type ManagedFile } from './manifest.js';

/**
 * Turning a target's desired files into changes on disk, under one rule: a file
 * the user has edited is never overwritten without being asked.
 */

export interface DesiredFile {
  readonly path: string;
  readonly target: TargetId;
  /** Whole-file content, or the region body when `region` is set. */
  readonly content: string;
  /** The only way an existing file is modified, so removal is an exact reversal. */
  readonly region?: { readonly begin: string; readonly end: string };
  readonly reason: string;
}

export type PlanAction =
  | 'create'
  | 'update'
  | 'unchanged'
  /** Ours, but hand-edited since. Left alone and reported. */
  | 'conflict'
  /** Someone else's whole file sits at that path. Left alone and reported. */
  | 'occupied';

export interface PlannedFile {
  readonly file: DesiredFile;
  readonly action: PlanAction;
  readonly state: FileState;
}

export interface Plan {
  readonly files: readonly PlannedFile[];
}

export function extractRegion(content: string, begin: string, end: string): string | undefined {
  const start = content.indexOf(begin);
  if (start === -1) return undefined;
  const stop = content.indexOf(end, start + begin.length);
  if (stop === -1) return undefined;
  return content.slice(start + begin.length, stop);
}

function withRegion(content: string, begin: string, end: string, body: string): string {
  const start = content.indexOf(begin);
  const stop = start === -1 ? -1 : content.indexOf(end, start + begin.length);

  if (start === -1 || stop === -1) {
    // First time: append the region rather than guessing where it belongs.
    const separator = content.length === 0 || content.endsWith('\n') ? '' : '\n';
    return `${content}${separator}\n${begin}${body}${end}\n`;
  }
  return content.slice(0, start + begin.length) + body + content.slice(stop);
}

/** A region hashes only our span, so edits elsewhere are not read as tampering. */
export function trackedContent(file: DesiredFile, onDisk: string): string | undefined {
  if (!file.region) return onDisk;
  return extractRegion(onDisk, file.region.begin, file.region.end);
}

export function inspect(
  projectRoot: string,
  file: DesiredFile,
  manifest: Manifest | undefined,
): FileState {
  const absolute = join(projectRoot, file.path);
  const entry = manifest?.files.find((f) => f.path === file.path);

  if (!existsSync(absolute)) return { kind: 'absent' };

  const onDisk = readFileSync(absolute, 'utf8');
  const tracked = trackedContent(file, onDisk);

  // Markers gone means nothing of ours is left to protect: treat it as fresh.
  if (entry === undefined || tracked === undefined) return { kind: 'foreign' };

  return hashContent(tracked) === entry.hash
    ? { kind: 'managed-clean', entry }
    : { kind: 'managed-modified', entry };
}

export function planFile(
  projectRoot: string,
  file: DesiredFile,
  manifest: Manifest | undefined,
): PlannedFile {
  const state = inspect(projectRoot, file, manifest);

  switch (state.kind) {
    case 'absent':
      return { file, action: 'create', state };

    case 'managed-modified':
      return { file, action: 'conflict', state };

    case 'foreign':
      // A region can be added to a file we do not own. A whole file cannot.
      return { file, action: file.region ? 'update' : 'occupied', state };

    case 'managed-clean': {
      const onDisk = readFileSync(join(projectRoot, file.path), 'utf8');
      const current = trackedContent(file, onDisk);
      return { file, action: current === file.content ? 'unchanged' : 'update', state };
    }
  }
}

export function plan(
  projectRoot: string,
  files: readonly DesiredFile[],
  manifest: Manifest | undefined,
): Plan {
  return { files: files.map((file) => planFile(projectRoot, file, manifest)) };
}

export interface ApplyOptions {
  readonly projectRoot: string;
  readonly understudyVersion: string;
  /** Overwrite conflicts. Only ever set from an explicit user instruction. */
  readonly force?: boolean;
}

export interface ApplyResult {
  readonly written: readonly string[];
  readonly skipped: readonly PlannedFile[];
  readonly entries: readonly ManagedFile[];
}

export function apply(plan: Plan, options: ApplyOptions): ApplyResult {
  const written: string[] = [];
  const skipped: PlannedFile[] = [];
  const entries: ManagedFile[] = [];
  const now = new Date().toISOString();

  for (const planned of plan.files) {
    const { file, action } = planned;

    const blocked = (action === 'conflict' && options.force !== true) || action === 'occupied';
    if (blocked) {
      skipped.push(planned);
      continue;
    }

    const absolute = join(options.projectRoot, file.path);
    mkdirSync(dirname(absolute), { recursive: true });

    if (file.region) {
      const existing = existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
      writeFileSync(
        absolute,
        withRegion(existing, file.region.begin, file.region.end, file.content),
        'utf8',
      );
    } else if (action !== 'unchanged') {
      writeFileSync(absolute, file.content, 'utf8');
    }

    if (action !== 'unchanged') written.push(file.path);

    entries.push({
      path: file.path,
      hash: hashContent(file.content),
      target: file.target,
      kind: file.region ? 'region' : 'created',
      ...(file.region ? { region: file.region } : {}),
      generatedBy: options.understudyVersion,
      writtenAt: now,
    });
  }

  return { written, skipped, entries };
}

export interface RemovalResult {
  readonly removed: readonly string[];
  /** Left in place because the user had edited them. */
  readonly kept: readonly { readonly path: string; readonly reason: string }[];
}

/** Undoes what a target installed, from the manifest. An edited file is kept and reported. */
export function removeFiles(
  projectRoot: string,
  files: readonly ManagedFile[],
  options: { readonly force?: boolean } = {},
): RemovalResult {
  const removed: string[] = [];
  const kept: { path: string; reason: string }[] = [];

  for (const entry of files) {
    const absolute = join(projectRoot, entry.path);
    if (!existsSync(absolute)) {
      removed.push(entry.path);
      continue;
    }

    const onDisk = readFileSync(absolute, 'utf8');

    if (entry.kind === 'region' && entry.region) {
      const body = extractRegion(onDisk, entry.region.begin, entry.region.end);
      if (body === undefined) {
        kept.push({ path: entry.path, reason: 'our region is no longer present' });
        continue;
      }
      if (hashContent(body) !== entry.hash && options.force !== true) {
        kept.push({ path: entry.path, reason: 'the region was edited by hand' });
        continue;
      }
      const start = onDisk.indexOf(entry.region.begin);
      const stop = onDisk.indexOf(entry.region.end, start) + entry.region.end.length;
      const stripped = `${onDisk.slice(0, start)}${onDisk.slice(stop)}`.replace(/\n{3,}/g, '\n\n');

      // Whitespace-only means nothing of the user's is lost, and an empty husk is
      // not a clean uninstall.
      if (stripped.trim().length === 0) rmSync(absolute);
      else writeFileSync(absolute, stripped, 'utf8');

      removed.push(entry.path);
      continue;
    }

    if (hashContent(onDisk) !== entry.hash && options.force !== true) {
      kept.push({ path: entry.path, reason: 'edited by hand since it was written' });
      continue;
    }

    rmSync(absolute);
    removed.push(entry.path);
  }

  return { removed, kept };
}
