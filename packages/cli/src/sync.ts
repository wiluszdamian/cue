import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Rules } from '@understudy/engine';
import { countChanges, renderDiff } from './diff.js';
import { apply, plan, trackedContent, type DesiredFile, type Plan } from './install.js';
import { resolveRules } from './init.js';
import {
  readManifest,
  recordFile,
  writeManifest,
  type ManagedFile,
  type Manifest,
} from './manifest.js';
import type { Detection } from './package-manager.js';
import { getTarget, resolveTargets } from './targets/index.js';

/**
 * `sync` — bring the files Understudy manages back in line with `rules/`. It
 * regenerates what the installed targets produce and never changes which targets
 * those are. Same protection as `init`: an edited file is reported, not rewritten.
 */

export interface SyncOptions {
  readonly projectRoot: string;
  readonly detection: Detection;
  readonly understudyVersion: string;
  readonly force?: boolean;
}

/**
 * Whether the scaffold was taken at install time. Guessing hands a `--bare`
 * project the layout it declined, or calls every scaffold file an orphan.
 */
function hasScaffold(manifest: Manifest): boolean {
  return manifest.files.some((f) => f.path === 'playwright.config.ts');
}

export class NotInstalledError extends Error {
  constructor() {
    super(
      'Understudy is not installed in this project, so there is nothing to sync.\nRun: understudy init',
    );
    this.name = 'NotInstalledError';
  }
}

export interface SyncChange {
  readonly path: string;
  readonly kind: 'create' | 'update' | 'conflict' | 'occupied' | 'orphan';
  readonly diff?: string;
  readonly summary?: string;
  readonly reason?: string;
}

export interface SyncReport {
  readonly changes: readonly SyncChange[];
  readonly unchanged: number;
  readonly stale: number;
  readonly conflicts: number;
  readonly plan: Plan;
  readonly orphans: readonly ManagedFile[];
  readonly manifest: Manifest;
  readonly rules: Rules;
}

function currentContent(projectRoot: string, file: DesiredFile): string | undefined {
  const absolute = join(projectRoot, file.path);
  if (!existsSync(absolute)) return undefined;
  return trackedContent(file, readFileSync(absolute, 'utf8'));
}

/** In the manifest but wanted by no target. Reported, so ghosts do not accumulate. */
function findOrphans(manifest: Manifest, desired: readonly DesiredFile[]): ManagedFile[] {
  const wanted = new Set(desired.map((f) => f.path));
  const installed = new Set(manifest.targets);
  return manifest.files.filter((f) => installed.has(f.target) && !wanted.has(f.path));
}

export function planSync(options: SyncOptions): SyncReport {
  const manifest = readManifest(options.projectRoot);
  if (!manifest) throw new NotInstalledError();

  const rules = resolveRules(options.projectRoot);

  // Only what is already installed. Adding a target is `add`, not `sync`.
  const targets = resolveTargets(manifest.targets);
  const desired: DesiredFile[] = targets.flatMap((target) =>
    target.files({
      projectRoot: options.projectRoot,
      packageManager: options.detection.manager,
      rules,
      understudyVersion: options.understudyVersion,
      scaffold: hasScaffold(manifest),
    }),
  );

  const prepared = plan(options.projectRoot, desired, manifest);
  const changes: SyncChange[] = [];
  let unchanged = 0;

  for (const planned of prepared.files) {
    const { file, action } = planned;

    if (action === 'unchanged') {
      unchanged += 1;
      continue;
    }

    if (action === 'create') {
      changes.push({
        path: file.path,
        kind: 'create',
        summary: file.reason,
      });
      continue;
    }

    if (action === 'conflict' && options.force !== true) {
      changes.push({
        path: file.path,
        kind: 'conflict',
        reason: 'you have edited this file — sync will leave it alone (--force overrides)',
      });
      continue;
    }

    if (action === 'occupied') {
      changes.push({
        path: file.path,
        kind: 'occupied',
        reason: 'a file that is not ours already sits at this path',
      });
      continue;
    }

    // The diff matters most for a --force conflict: it is the only time the user
    // is about to discard something they wrote.
    const before = currentContent(options.projectRoot, file) ?? '';
    const { added, removed } = countChanges(before, file.content);
    changes.push({
      path: file.path,
      kind: 'update',
      diff: renderDiff(before, file.content),
      summary: `+${added} -${removed}`,
    });
  }

  const orphans = findOrphans(manifest, desired);
  for (const orphan of orphans) {
    changes.push({
      path: orphan.path,
      kind: 'orphan',
      reason: 'no longer produced by any installed target',
    });
  }

  return {
    changes,
    unchanged,
    stale: changes.filter((c) => c.kind === 'create' || c.kind === 'update').length,
    conflicts: changes.filter((c) => c.kind === 'conflict').length,
    plan: prepared,
    orphans,
    manifest,
    rules,
  };
}

export interface SyncResult {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
}

export function runSync(options: SyncOptions, report: SyncReport): SyncResult {
  const result = apply(report.plan, {
    projectRoot: options.projectRoot,
    understudyVersion: options.understudyVersion,
    ...(options.force === true ? { force: true } : {}),
  });

  let manifest: Manifest = {
    ...report.manifest,
    understudyVersion: options.understudyVersion,
  };
  for (const entry of result.entries) manifest = recordFile(manifest, entry);
  writeManifest(options.projectRoot, manifest);

  return {
    written: result.written,
    skipped: result.skipped.map((s) => s.file.path),
  };
}

const LABEL: Record<SyncChange['kind'], string> = {
  create: 'new     ',
  update: 'update  ',
  conflict: 'SKIP    ',
  occupied: 'SKIP    ',
  orphan: 'orphan  ',
};

export function formatSyncReport(report: SyncReport, targets: readonly string[]): string {
  const lines: string[] = [''];

  if (report.changes.length === 0) {
    lines.push(`Everything is current — ${report.unchanged} managed file(s) match rules/.`);
    return lines.join('\n');
  }

  lines.push(`Targets: ${targets.join(', ')}`);
  lines.push('');

  for (const change of report.changes) {
    lines.push(
      `  ${LABEL[change.kind]} ${change.path}${change.summary ? `   ${change.summary}` : ''}`,
    );
    if (change.reason) lines.push(`            ${change.reason}`);
    if (change.diff) {
      lines.push(change.diff);
      lines.push('');
    }
  }

  if (report.orphans.length > 0) {
    lines.push(`  Orphans are not deleted automatically. Remove them by hand, or reinstall the`);
    lines.push(`  target with \`understudy remove <target> && understudy add <target>\`.`);
    lines.push('');
  }

  lines.push(
    `${report.stale} file(s) to write, ${report.unchanged} already current` +
      (report.conflicts > 0 ? `, ${report.conflicts} left alone because you edited them` : '') +
      '.',
  );

  return lines.join('\n');
}

/** An edited file is not a failure; only content that no longer matches rules/ is. */
export function checkExitCode(report: SyncReport): number {
  return report.stale > 0 ? 1 : 0;
}

export { getTarget };
