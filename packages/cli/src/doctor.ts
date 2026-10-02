import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Rules } from '@understudy/engine';
import { readAllRouteMaps, SURVEY_STALE_COMMAND } from '@understudy/engine';
import { detectAgents, type TargetId } from './agents.js';
import { inspect } from './install.js';
import { MANIFEST_PATH, type Manifest } from './manifest.js';
import { existsOnPath, resolvePlaywrightCli } from './browser/resolve.js';
import { addDevCommand, execCommand, type Detection } from './package-manager.js';
import { getTarget, resolveTargets } from './targets/index.js';

/**
 * Preflight: whether the environment is actually wired up.
 *
 * Every failure carries the command that fixes it; a check that could not run is
 * `unchecked` rather than passed, because a green tick for something never
 * verified is worse than an error; and an agent that cannot be wired up is said
 * to be unsupported rather than quietly skipped.
 */

export type CheckStatus = 'ok' | 'warn' | 'error' | 'unchecked';

export interface CheckResult {
  readonly id: string;
  readonly title: string;
  readonly status: CheckStatus;
  readonly detail: string;
  /** A command the user can copy. Required for anything not `ok`. */
  readonly fix?: string;
}

export interface DoctorContext {
  readonly projectRoot: string;
  readonly manifest: Manifest | undefined;
  readonly rules: Rules | undefined;
  readonly detection: Detection;
  readonly understudyVersion: string;
  readonly offline?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly home?: string;
}

function readPackageJson(projectRoot: string): Record<string, unknown> | undefined {
  const file = join(projectRoot, 'package.json');
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function dependencyNames(pkg: Record<string, unknown> | undefined): Set<string> {
  const names = new Set<string>();
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const section = pkg?.[field];
    if (typeof section === 'object' && section !== null) {
      for (const name of Object.keys(section)) names.add(name);
    }
  }
  return names;
}

const ESLINT_CONFIGS = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
];

// --------------------------------------------------------------------- checks

function checkInitialised(ctx: DoctorContext): CheckResult {
  if (ctx.manifest) {
    return {
      id: 'init',
      title: 'Understudy is installed',
      status: 'ok',
      detail: `${MANIFEST_PATH} lists ${ctx.manifest.files.length} managed files across ${ctx.manifest.targets.length} targets.`,
    };
  }
  return {
    id: 'init',
    title: 'Understudy is installed',
    status: 'error',
    detail: `No ${MANIFEST_PATH}. Nothing has been installed in this project yet.`,
    fix: 'understudy init',
  };
}

function checkPackageManager(ctx: DoctorContext): CheckResult {
  const { manager, evidence, confident } = ctx.detection;
  if (!confident) {
    return {
      id: 'package-manager',
      title: 'Package manager',
      status: 'warn',
      detail: `Could not tell — ${evidence}. Assuming ${manager}, so printed commands may be wrong.`,
      fix: 'understudy doctor --package-manager <npm|pnpm|yarn|bun>',
    };
  }
  return {
    id: 'package-manager',
    title: 'Package manager',
    status: 'ok',
    detail: `${manager} (from ${evidence})`,
  };
}

function checkEslintPlugin(ctx: DoctorContext): CheckResult {
  const deps = dependencyNames(readPackageJson(ctx.projectRoot));
  if (!deps.has('@understudy/eslint-plugin')) {
    return {
      id: 'eslint-plugin',
      title: 'ESLint plugin installed',
      status: 'error',
      // Without this the conventions are a document, which an agent talks itself past.
      detail:
        'The ESLint plugin is not a dependency. Without it nothing enforces the constitution — the rules become advice.',
      fix: addDevCommand(ctx.detection.manager, ['@understudy/eslint-plugin']),
    };
  }
  return {
    id: 'eslint-plugin',
    title: 'ESLint plugin installed',
    status: 'ok',
    detail: '@understudy/eslint-plugin is a dependency of this project.',
  };
}

function checkEslintWired(ctx: DoctorContext): CheckResult {
  const config = ESLINT_CONFIGS.find((name) => existsSync(join(ctx.projectRoot, name)));

  if (!config) {
    return {
      id: 'eslint-config',
      title: 'ESLint preset wired up',
      status: 'error',
      detail: 'No flat ESLint config found, so the plugin never runs.',
      fix: 'understudy init  # creates eslint.config.mjs',
    };
  }

  const content = readFileSync(join(ctx.projectRoot, config), 'utf8');
  if (!content.includes('@understudy/eslint-plugin') && !content.includes('understudy')) {
    return {
      id: 'eslint-config',
      title: 'ESLint preset wired up',
      status: 'error',
      detail: `${config} exists but does not reference the Understudy preset, so no rule is enforced.`,
      fix: `Add to ${config}:  import understudy from '@understudy/eslint-plugin';  …understudy.configs.recommended`,
    };
  }

  return {
    id: 'eslint-config',
    title: 'ESLint preset wired up',
    status: 'ok',
    detail: `${config} references the Understudy preset.`,
  };
}

function checkAgentsFile(ctx: DoctorContext): CheckResult {
  const path = join(ctx.projectRoot, 'AGENTS.md');
  if (!existsSync(path)) {
    return {
      id: 'agents-md',
      title: 'AGENTS.md present',
      status: 'error',
      detail: 'AGENTS.md is the always-loaded layer every agent reads. It is missing.',
      fix: 'understudy init',
    };
  }
  const content = readFileSync(path, 'utf8');
  if (!content.includes('BEGIN UNDERSTUDY')) {
    return {
      id: 'agents-md',
      title: 'AGENTS.md present',
      status: 'warn',
      detail:
        'AGENTS.md exists but contains no Understudy section, so no ownership table is loaded.',
      fix: 'understudy sync',
    };
  }
  return {
    id: 'agents-md',
    title: 'AGENTS.md present',
    status: 'ok',
    detail: 'AGENTS.md carries the Understudy section.',
  };
}

/** Generated from rules/, so agents keep following a table nobody updated. */
function checkContentFresh(ctx: DoctorContext): CheckResult {
  if (!ctx.manifest || !ctx.rules) {
    return {
      id: 'sync',
      title: 'Generated content is current',
      status: 'unchecked',
      detail: 'Needs both an install manifest and a readable rule set.',
      fix: 'understudy init',
    };
  }

  const stale: string[] = [];
  for (const id of ctx.manifest.targets) {
    const target = getTarget(id);
    for (const file of target.files({
      projectRoot: ctx.projectRoot,
      packageManager: ctx.detection.manager,
      rules: ctx.rules,
      understudyVersion: ctx.understudyVersion,
    })) {
      const state = inspect(ctx.projectRoot, file, ctx.manifest);
      if (state.kind === 'managed-modified') stale.push(`${file.path} (edited by hand)`);
      else if (state.kind === 'absent') stale.push(`${file.path} (missing)`);
    }
  }

  if (stale.length === 0) {
    return {
      id: 'sync',
      title: 'Generated content is current',
      status: 'ok',
      detail: 'Every managed file matches what Understudy would write.',
    };
  }

  return {
    id: 'sync',
    title: 'Generated content is current',
    status: 'warn',
    detail: `Diverged from what Understudy would write:\n${stale.map((s) => `      ${s}`).join('\n')}`,
    fix: 'understudy sync   # shows a diff before changing anything',
  };
}

function checkPlaywrightCli(ctx: DoctorContext): CheckResult {
  if (resolvePlaywrightCli(ctx.projectRoot) !== undefined || existsOnPath('playwright')) {
    return {
      id: 'playwright-cli',
      title: 'playwright-cli available',
      status: 'ok',
      detail: 'Found on PATH. Exploration and debugging are its job, not ours.',
    };
  }
  return {
    id: 'playwright-cli',
    title: 'playwright-cli available',
    status: 'warn',
    detail:
      'Not on PATH. The ownership table sends browser exploration and debugging to the official Playwright skills, which need it.',
    fix: execCommand(ctx.detection.manager, 'playwright-cli install --skills'),
  };
}

function checkOfficialSkills(ctx: DoctorContext): CheckResult {
  const candidates = ['.claude/skills', '.agent/skills', '.playwright/skills'];
  const found = candidates.find((dir) => {
    const path = join(ctx.projectRoot, dir);
    try {
      return existsSync(path) && readdirSync(path).length > 0;
    } catch {
      return false;
    }
  });

  if (found) {
    return {
      id: 'official-skills',
      title: 'Official Playwright skills installed',
      status: 'ok',
      detail: `Found in ${found}/.`,
    };
  }

  if (ctx.offline === true) {
    return {
      id: 'official-skills',
      title: 'Official Playwright skills installed',
      status: 'unchecked',
      detail: 'Offline: cannot confirm which skills are installed or how current they are.',
    };
  }

  return {
    id: 'official-skills',
    title: 'Official Playwright skills installed',
    status: 'warn',
    detail:
      'Not found. Understudy delegates running, debugging and tracing to these rather than documenting them itself.',
    fix: execCommand(ctx.detection.manager, 'playwright-cli install --skills'),
  };
}

function checkKnowledgeBase(ctx: DoctorContext): CheckResult {
  const kb = join(ctx.projectRoot, '.agent-kb');
  if (!existsSync(kb)) {
    return {
      id: 'agent-kb',
      title: 'Knowledge base',
      status: 'warn',
      detail: 'No .agent-kb/. Without it, every selector an agent writes is a guess.',
      fix: 'understudy init',
    };
  }

  const maps = readAllRouteMaps(ctx.projectRoot);
  if (maps.length === 0) {
    return {
      id: 'agent-kb',
      title: 'Knowledge base',
      status: 'warn',
      detail:
        '.agent-kb/ exists but no route has been surveyed, so it cannot answer a single question about the application.',
      fix: 'understudy survey <url>',
    };
  }

  const stale = maps.filter((m) => m.freshness === 'stale');
  const ageing = maps.filter((m) => m.freshness === 'ageing');

  if (stale.length > 0) {
    return {
      id: 'agent-kb',
      title: 'Knowledge base',
      status: 'warn',
      // A warning, not an error: stale entries are still usable as candidates.
      detail:
        `${String(stale.length)} of ${String(maps.length)} surveyed route(s) have not been confirmed in over a month: ` +
        `${stale.map((m) => m.map.route).join(', ')}. Treat those as candidates, not facts.`,
      fix: SURVEY_STALE_COMMAND,
    };
  }

  return {
    id: 'agent-kb',
    title: 'Knowledge base',
    status: 'ok',
    detail:
      `${String(maps.length)} route(s) surveyed` +
      (ageing.length > 0 ? `, ${String(ageing.length)} ageing` : ', all fresh') +
      '.',
  };
}

/** An agent someone uses but nobody wired up silently ignores the conventions. */
function checkTargetCoverage(ctx: DoctorContext): CheckResult[] {
  const installed = new Set<TargetId>(ctx.manifest?.targets ?? []);
  const detected = detectAgents({
    cwd: ctx.projectRoot,
    ...(ctx.env ? { env: ctx.env } : {}),
    ...(ctx.home !== undefined ? { home: ctx.home } : {}),
  });

  const results: CheckResult[] = [];

  for (const agent of detected) {
    if (installed.has(agent.id)) continue;
    results.push({
      id: `target:${agent.id}`,
      title: `${agent.name} detected but not configured`,
      status: 'warn',
      detail: `Evidence: ${agent.evidence.join(', ')}. AGENTS.md still applies, but nothing agent-specific is wired up.`,
      fix: `understudy add ${agent.id}`,
    });
  }

  for (const id of installed) {
    const target = getTarget(id);
    for (const limitation of target.limitations ?? []) {
      results.push({
        id: `limitation:${id}`,
        title: `${target.name}: known limitation`,
        status: 'warn',
        detail: limitation,
      });
    }
  }

  if (results.length === 0) {
    results.push({
      id: 'targets',
      title: 'Agent targets',
      status: 'ok',
      detail:
        installed.size > 0
          ? `Configured: ${[...installed].join(', ')}.`
          : 'Baseline only — AGENTS.md is read natively by every agent except Claude Code.',
    });
  }

  return results;
}

function checkNodeVersion(): CheckResult {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (major >= 24 || major === 22) {
    return {
      id: 'node',
      title: 'Node version',
      status: 'ok',
      detail: `Node ${process.versions.node}.`,
    };
  }
  return {
    id: 'node',
    title: 'Node version',
    status: major < 22 ? 'error' : 'warn',
    detail: `Node ${process.versions.node} is outside the supported range (^22.13 || >=24).`,
    fix: 'Install a supported Node release (see .nvmrc).',
  };
}

export function runChecks(ctx: DoctorContext): CheckResult[] {
  return [
    checkNodeVersion(),
    checkPackageManager(ctx),
    checkInitialised(ctx),
    checkAgentsFile(ctx),
    checkEslintPlugin(ctx),
    checkEslintWired(ctx),
    checkContentFresh(ctx),
    ...checkTargetCoverage(ctx),
    checkPlaywrightCli(ctx),
    checkOfficialSkills(ctx),
    checkKnowledgeBase(ctx),
  ];
}

export interface DoctorSummary {
  readonly results: readonly CheckResult[];
  readonly errors: number;
  readonly warnings: number;
  readonly unchecked: number;
}

export function summarise(results: readonly CheckResult[]): DoctorSummary {
  return {
    results,
    errors: results.filter((r) => r.status === 'error').length,
    warnings: results.filter((r) => r.status === 'warn').length,
    unchecked: results.filter((r) => r.status === 'unchecked').length,
  };
}

const MARK: Record<CheckStatus, string> = {
  ok: '  ok  ',
  warn: ' warn ',
  error: 'error ',
  unchecked: '  ?   ',
};

export function formatReport(summary: DoctorSummary): string {
  const lines: string[] = [''];

  for (const result of summary.results) {
    lines.push(`[${MARK[result.status]}] ${result.title}`);
    lines.push(`      ${result.detail}`);
    if (result.fix && result.status !== 'ok') lines.push(`      fix: ${result.fix}`);
    lines.push('');
  }

  const { errors, warnings, unchecked } = summary;
  if (errors === 0 && warnings === 0) {
    lines.push(
      unchecked > 0
        ? `Everything checked is in order. ${unchecked} item(s) could not be verified.`
        : 'Everything is in order.',
    );
  } else {
    lines.push(
      `${errors} error(s), ${warnings} warning(s)` +
        (unchecked > 0 ? `, ${unchecked} unverified` : '') +
        '. Each line above carries the command that fixes it.',
    );
  }

  return lines.join('\n');
}

/** Which targets a project has installed, for `list`. */
export function installedTargets(manifest: Manifest | undefined): TargetId[] {
  return manifest ? resolveTargets(manifest.targets).map((t) => t.id) : [];
}
