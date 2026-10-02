import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { arch, platform, release } from 'node:os';

/**
 * Everything needed to say what a result was a result of. A number that cannot be
 * traced to a commit, a tool version and a model is an anecdote, so these are
 * collected once per run and printed with the numbers.
 */

export interface RunMetadata {
  /** The versions of the tools the answers were run with. Absent where not installed. */
  readonly cueVersion?: string;
  readonly commit?: string;
  /** The working tree had uncommitted changes, so the commit does not fully describe the run. */
  readonly dirty?: boolean;
  readonly playwrightVersion?: string;
  readonly playwrightCliVersion?: string;
  readonly node: string;
  readonly os: string;
}

function versionOf(packageJson: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(packageJson, 'utf8')) as { version?: unknown };
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

function installedVersion(demoRoot: string, name: string): string | undefined {
  try {
    const manifest = createRequire(join(demoRoot, 'package.json')).resolve(`${name}/package.json`);
    return versionOf(manifest);
  } catch {
    return undefined;
  }
}

function git(repoRoot: string, args: readonly string[]): string | undefined {
  const result = spawnSync('git', [...args], { cwd: repoRoot, encoding: 'utf8', shell: false });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

export interface MetadataSources {
  /** The repository this ran from. */
  readonly repoRoot: string;
  /** The demo application, whose Playwright installs are the ones used. */
  readonly demoRoot: string;
}

export function collectMetadata(sources: MetadataSources): RunMetadata {
  const commit = git(sources.repoRoot, ['rev-parse', 'HEAD']);
  const status =
    commit === undefined ? undefined : git(sources.repoRoot, ['status', '--porcelain']);
  const cueVersion = versionOf(join(sources.repoRoot, 'package.json'));
  const playwrightVersion = installedVersion(sources.demoRoot, '@playwright/test');
  const playwrightCliVersion = installedVersion(sources.demoRoot, '@playwright/cli');

  return {
    ...(cueVersion === undefined ? {} : { cueVersion }),
    ...(commit === undefined ? {} : { commit }),
    ...(status === undefined ? {} : { dirty: status.length > 0 }),
    ...(playwrightVersion === undefined ? {} : { playwrightVersion }),
    ...(playwrightCliVersion === undefined ? {} : { playwrightCliVersion }),
    node: process.version,
    os: `${platform()} ${release()} (${arch()})`,
  };
}

// ------------------------------------------------------------------ statistics

export interface Spread {
  readonly min: number;
  readonly median: number;
  readonly max: number;
}

/** Undefined for no values at all: there is no honest minimum of nothing. */
export function spread(values: readonly number[]): Spread | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return { min: sorted[0] ?? 0, median, max: sorted[sorted.length - 1] ?? 0 };
}
