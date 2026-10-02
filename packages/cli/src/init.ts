import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadRules, type Rules } from '@wiluszdamian/cue-engine';
import { detectAgents, type TargetId } from './agents.js';
import { CONSTITUTION, OWNERSHIP, TAGS } from './generated/rules.js';
import { apply, plan, type DesiredFile, type Plan, type PlannedFile } from './install.js';
import {
  emptyManifest,
  readManifest,
  recordFile,
  writeManifest,
  type Manifest,
} from './manifest.js';
import { addDevCommand, type Detection } from './package-manager.js';
import { getTarget, resolveTargets } from './targets/index.js';

/**
 * `init` — preflight, target selection, and writing files. Idempotent, because
 * every write goes through the plan/manifest path; and detection only suggests,
 * since a leftover `.cursor/` is not consent to write files.
 */

/** Here, `rules/` is the source of truth; everywhere else, the copy baked in at build time. */
export function resolveRules(projectRoot: string): Rules {
  const local = join(projectRoot, 'rules');
  if (existsSync(join(local, 'constitution.yaml'))) {
    try {
      return loadRules(local);
    } catch {
      // A malformed local rules/ must not stop init elsewhere; use the bundled copy.
    }
  }
  return {
    constitution: CONSTITUTION,
    tags: TAGS,
    ownership: OWNERSHIP,
    dir: local,
  };
}

export interface InitOptions {
  readonly projectRoot: string;
  readonly detection: Detection;
  readonly cueVersion: string;
  /** Explicit `--target` list. When absent, detection decides what to suggest. */
  readonly targets?: readonly string[];
  readonly all?: boolean;
  /** `--baseline-only`: AGENTS.md and the shared setup, nothing agent-specific. */
  readonly baselineOnly?: boolean;
  readonly force?: boolean;
  /** `--bare`: for a repository that already has a suite and wants the rules, not a second layout. */
  readonly bare?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Overridden in tests, so a result never depends on the agents installed locally. */
  readonly home?: string;
}

export interface InitPlan {
  readonly targets: readonly TargetId[];
  readonly suggested: readonly TargetId[];
  readonly rules: Rules;
  readonly plan: Plan;
  readonly manifest: Manifest;
}

export function planInit(options: InitOptions): InitPlan {
  const rules = resolveRules(options.projectRoot);
  const manifest =
    readManifest(options.projectRoot) ??
    emptyManifest(options.cueVersion, options.detection.manager);

  const detected = detectAgents({
    cwd: options.projectRoot,
    ...(options.env ? { env: options.env } : {}),
    ...(options.home !== undefined ? { home: options.home } : {}),
  });
  const suggested = detected.map((a) => a.id);

  let requested: readonly string[];
  if (options.baselineOnly === true) requested = [];
  else if (options.targets !== undefined) requested = options.targets;
  else if (options.all === true) requested = suggested;
  else {
    // Re-running keeps what is installed; a first run starts from what was detected.
    requested = manifest.targets.length > 0 ? [...manifest.targets, ...suggested] : suggested;
  }

  const targets = resolveTargets(requested);
  const files: DesiredFile[] = targets.flatMap((target) =>
    target.files({
      projectRoot: options.projectRoot,
      packageManager: options.detection.manager,
      rules,
      cueVersion: options.cueVersion,
      scaffold: options.bare !== true,
    }),
  );

  return {
    targets: targets.map((t) => t.id),
    suggested,
    rules,
    plan: plan(options.projectRoot, files, manifest),
    manifest,
  };
}

export interface InitResult {
  readonly written: readonly string[];
  readonly skipped: readonly PlannedFile[];
  readonly targets: readonly TargetId[];
  readonly nextSteps: readonly string[];
}

export function runInit(options: InitOptions, prepared: InitPlan): InitResult {
  const result = apply(prepared.plan, {
    projectRoot: options.projectRoot,
    cueVersion: options.cueVersion,
    wire: true,
    ...(options.force === true ? { force: true } : {}),
  });

  let manifest: Manifest = {
    ...prepared.manifest,
    cueVersion: options.cueVersion,
    packageManager: options.detection.manager,
    targets: [...prepared.targets],
  };
  for (const entry of result.entries) manifest = recordFile(manifest, entry);
  writeManifest(options.projectRoot, manifest);

  return {
    written: result.written,
    skipped: result.skipped,
    targets: prepared.targets,
    nextSteps: nextSteps(options, prepared),
  };
}

/** Explicit, never `postinstall`: Bun declines that hook for untrusted packages. */
function nextSteps(options: InitOptions, prepared: InitPlan): string[] {
  const { manager } = options.detection;
  const steps: string[] = [];

  steps.push(addDevCommand(manager, ['@wiluszdamian/cue-eslint-plugin', '@wiluszdamian/cue']));
  steps.push('npx playwright-cli install --skills   # the official Playwright skills');

  for (const id of prepared.targets) {
    for (const limitation of getTarget(id).limitations ?? []) steps.push(limitation);
  }

  steps.push('cue doctor   # confirm everything is wired up');
  return steps;
}

export function describePlan(prepared: InitPlan): string {
  const lines: string[] = [];

  lines.push(`Targets: ${prepared.targets.join(', ')}`);
  if (prepared.suggested.length > 0) {
    lines.push(`Detected in this project: ${prepared.suggested.join(', ')}`);
  } else {
    lines.push('No agent detected. The baseline applies to all of them anyway.');
  }
  lines.push('');

  const verbs: Record<PlannedFile['action'], string> = {
    create: 'create  ',
    update: 'update  ',
    unchanged: 'unchanged',
    conflict: 'SKIP    ',
    occupied: 'SKIP    ',
  };

  for (const planned of prepared.plan.files) {
    lines.push(`  ${verbs[planned.action]} ${planned.file.path}`);
    if (planned.action === 'conflict') {
      lines.push(
        '            you have edited this file — it will be left alone (--force overrides)',
      );
    } else if (planned.action === 'occupied') {
      lines.push('            this file already exists and is not ours — left alone');
    } else if (planned.action !== 'unchanged') {
      lines.push(`            ${planned.file.reason}`);
    }
  }

  return lines.join('\n');
}
