import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Which package manager the user actually uses. Every command Cue prints is
 * rendered for it, so a bun user is never handed an `npm` command.
 */

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export function isPackageManager(value: string): value is PackageManager {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/** Lockfiles, most specific first. `npm` is last because it is the fallback. */
const LOCKFILES: readonly (readonly [PackageManager, readonly string[]])[] = [
  ['bun', ['bun.lock', 'bun.lockb']],
  ['pnpm', ['pnpm-lock.yaml']],
  ['yarn', ['yarn.lock']],
  ['npm', ['package-lock.json', 'npm-shrinkwrap.json']],
];

export interface Detection {
  readonly manager: PackageManager;
  /** How we know. Shown by `doctor` so a wrong guess is diagnosable. */
  readonly evidence: string;
  readonly confident: boolean;
}

/** Describes the process in play rather than the committed lockfile, so it wins. */
export function fromUserAgent(userAgent: string | undefined): PackageManager | undefined {
  if (!userAgent) return undefined;
  const name = userAgent.split('/')[0]?.trim().toLowerCase();
  return name !== undefined && isPackageManager(name) ? name : undefined;
}

export function fromLockfile(cwd: string): { manager: PackageManager; file: string } | undefined {
  for (const [manager, files] of LOCKFILES) {
    for (const file of files) {
      if (existsSync(join(cwd, file))) return { manager, file };
    }
  }
  return undefined;
}

/** `packageManager` in package.json states intent; the user agent states reality, so this is the fallback. */
export function fromPackageJson(pkg: unknown): PackageManager | undefined {
  if (typeof pkg !== 'object' || pkg === null) return undefined;
  const field = (pkg as { packageManager?: unknown }).packageManager;
  if (typeof field !== 'string') return undefined;
  const name = field.split('@')[0]?.trim().toLowerCase();
  return name !== undefined && isPackageManager(name) ? name : undefined;
}

export interface DetectOptions {
  readonly cwd: string;
  readonly userAgent?: string | undefined;
  readonly packageJson?: unknown;
  readonly override?: string | undefined;
}

export function detectPackageManager(options: DetectOptions): Detection {
  if (options.override !== undefined) {
    if (!isPackageManager(options.override)) {
      throw new Error(
        `unknown package manager "${options.override}". Expected one of: ${PACKAGE_MANAGERS.join(', ')}`,
      );
    }
    return { manager: options.override, evidence: '--package-manager', confident: true };
  }

  const fromEnv = fromUserAgent(options.userAgent);
  if (fromEnv) {
    return { manager: fromEnv, evidence: 'npm_config_user_agent', confident: true };
  }

  const lock = fromLockfile(options.cwd);
  if (lock) return { manager: lock.manager, evidence: lock.file, confident: true };

  const declared = fromPackageJson(options.packageJson);
  if (declared) {
    return { manager: declared, evidence: 'packageManager in package.json', confident: true };
  }

  return { manager: 'npm', evidence: 'no lockfile found, defaulting', confident: false };
}

export function addDevCommand(manager: PackageManager, packages: readonly string[]): string {
  const list = packages.join(' ');
  switch (manager) {
    case 'npm':
      return `npm install --save-dev ${list}`;
    case 'pnpm':
      return `pnpm add -D ${list}`;
    case 'yarn':
      return `yarn add -D ${list}`;
    case 'bun':
      return `bun add -d ${list}`;
  }
}

export function execCommand(manager: PackageManager, command: string): string {
  switch (manager) {
    case 'npm':
      return `npx ${command}`;
    case 'pnpm':
      return `pnpm dlx ${command}`;
    case 'yarn':
      return `yarn dlx ${command}`;
    case 'bun':
      return `bunx ${command}`;
  }
}

export function runCommand(manager: PackageManager, script: string): string {
  return manager === 'npm' ? `npm run ${script}` : `${manager} run ${script}`;
}

/** The reproducible install: lockfile respected, no drift between committing and building. */
export function ciInstallCommand(manager: PackageManager): string {
  switch (manager) {
    case 'npm':
      return 'npm ci';
    case 'pnpm':
      return 'pnpm install --frozen-lockfile';
    case 'yarn':
      return 'yarn install --immutable';
    case 'bun':
      return 'bun install --frozen-lockfile';
  }
}

/** The GitHub Actions `cache:` key for setup-node, where one applies. */
export function setupNodeCache(manager: PackageManager): string | undefined {
  return manager === 'bun' ? undefined : manager;
}

/**
 * Bun does not run `postinstall` for untrusted packages, so nothing may depend on
 * that hook: `init` installs browsers and skills explicitly, on every manager alike.
 */
export function runsPostinstallByDefault(manager: PackageManager): boolean {
  return manager !== 'bun';
}
