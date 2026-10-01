import { existsSync, readFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Finding `playwright-cli` without a shell. The result is an executable plus
 * leading arguments, so a Node script is run as `node script.js …` and a `.cmd`
 * shim on Windows never has to be spawned: Node refuses to, since v20, without a
 * shell, and a shell is exactly what must not be involved.
 */

export interface ResolvedCommand {
  readonly executable: string;
  readonly prefixArgs: readonly string[];
  readonly via: 'explicit' | 'local-package' | 'path';
}

export interface ResolveEnvironment {
  readonly platform?: NodeJS.Platform;
  readonly pathEnv?: string;
  readonly pathExt?: string;
}

const SCRIPT = /\.[cm]?js$/i;
const CMD_SHIM = /\.(cmd|bat)$/i;
const BIN_NAME = 'playwright-cli';

function nodeScript(script: string, via: ResolvedCommand['via']): ResolvedCommand {
  return { executable: process.execPath, prefixArgs: [script], via };
}

/** The script an npm- or pnpm-generated `.cmd` shim launches, if it can be read out. */
export function scriptBehindShim(shimPath: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(shimPath, 'utf8');
  } catch {
    return undefined;
  }

  // Shims reference the script relative to themselves: "%dp0%\..\pkg\bin.js" or "%~dp0\…".
  const match = /%~?dp0%?[\\/]+([^"\r\n%]+?\.[cm]?js)"/i.exec(text);
  const relative = match?.[1];
  if (relative === undefined) return undefined;

  // Forward slashes: a backslash is only a separator on Windows, which accepts both.
  const script = resolve(dirname(shimPath), relative.replaceAll('\\', '/'));
  return existsSync(script) ? script : undefined;
}

function binScript(packageJsonPath: string): string | undefined {
  let manifest: { bin?: unknown };
  try {
    manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { bin?: unknown };
  } catch {
    return undefined;
  }

  const bin = manifest.bin;
  const relative =
    typeof bin === 'string'
      ? bin
      : bin !== null && typeof bin === 'object'
        ? ((bin as Record<string, unknown>)[BIN_NAME] ??
          Object.values(bin as Record<string, unknown>)[0])
        : undefined;
  if (typeof relative !== 'string') return undefined;

  const script = resolve(dirname(packageJsonPath), relative);
  return existsSync(script) ? script : undefined;
}

function fromLocalPackage(projectRoot: string): ResolvedCommand | undefined {
  let dir = resolve(projectRoot);
  for (;;) {
    const packageJson = join(dir, 'node_modules', '@playwright', 'cli', 'package.json');
    if (existsSync(packageJson)) {
      const script = binScript(packageJson);
      if (script !== undefined) return nodeScript(script, 'local-package');
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function fromExecutable(path: string, via: ResolvedCommand['via']): ResolvedCommand | undefined {
  if (SCRIPT.test(path)) return nodeScript(path, via);
  if (CMD_SHIM.test(path)) {
    const script = scriptBehindShim(path);
    return script === undefined ? undefined : nodeScript(script, via);
  }
  return { executable: path, prefixArgs: [], via };
}

function fromPath(env: ResolveEnvironment): ResolvedCommand | undefined {
  const platform = env.platform ?? process.platform;
  const dirs = (env.pathEnv ?? process.env['PATH'] ?? '').split(delimiter).filter(Boolean);
  const extensions =
    platform === 'win32'
      ? ['', ...(env.pathExt ?? process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';')]
      : [''];

  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = join(dir, `${BIN_NAME}${extension.toLowerCase()}`);
      if (!existsSync(candidate)) continue;
      // A bare `playwright-cli` on Windows is an sh script for Git Bash; it cannot be spawned.
      if (platform === 'win32' && extension === '') continue;
      const resolved = fromExecutable(candidate, 'path');
      if (resolved !== undefined) return resolved;
    }
  }
  return undefined;
}

/** Whether a program of this name exists on PATH. Looks, never runs. */
export function existsOnPath(name: string, env: ResolveEnvironment = {}): boolean {
  const platform = env.platform ?? process.platform;
  const dirs = (env.pathEnv ?? process.env['PATH'] ?? '').split(delimiter).filter(Boolean);
  const extensions =
    platform === 'win32'
      ? (env.pathExt ?? process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT')
          .split(';')
          .map((ext) => ext.toLowerCase())
      : [''];
  return dirs.some((dir) => extensions.some((ext) => existsSync(join(dir, `${name}${ext}`))));
}

/**
 * Explicit path, then the project's own `@playwright/cli`, then PATH. Returns
 * nothing rather than falling back to a shell when none of them works.
 */
export function resolvePlaywrightCli(
  projectRoot: string,
  explicit?: string,
  env: ResolveEnvironment = {},
): ResolvedCommand | undefined {
  if (explicit !== undefined) {
    const path = isAbsolute(explicit) ? explicit : resolve(projectRoot, explicit);
    return existsSync(path) ? fromExecutable(path, 'explicit') : undefined;
  }
  return fromLocalPackage(projectRoot) ?? fromPath(env);
}

export const NOT_FOUND_ADVICE = [
  'playwright-cli was not found, and it is never run through a shell.',
  'Install it in this project:',
  '  npm install --save-dev @playwright/cli',
  'or point at a copy with --playwright-cli <path>,',
  'or capture a snapshot elsewhere and pass it with --from <file>.',
].join('\n');
