import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Which coding agents this repository is set up for. Detection suggests what to
 * tick and never decides: a directory left by an old experiment is not consent to
 * write files, and an undetected agent is no reason to refuse — the baseline
 * installs either way and `cue add <target>` covers the rest.
 */

export const TARGET_IDS = [
  'agents',
  'claude-code',
  'cursor',
  'codex',
  'opencode',
  'gemini',
  'grok',
] as const;

export type TargetId = (typeof TARGET_IDS)[number];

export function isTargetId(value: string): value is TargetId {
  return (TARGET_IDS as readonly string[]).includes(value);
}

export interface AgentSignature {
  readonly id: Exclude<TargetId, 'agents'>;
  readonly name: string;
  /** Project-relative directories that indicate the agent is in use here. */
  readonly projectPaths: readonly string[];
  /** Paths under the user's home directory. */
  readonly homePaths: readonly string[];
  /** Environment variables the agent sets when it is the running process. */
  readonly envVars: readonly string[];
}

export const AGENT_SIGNATURES: readonly AgentSignature[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    projectPaths: ['.claude'],
    homePaths: ['.claude'],
    envVars: ['CLAUDE_CODE_ENTRYPOINT'],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    projectPaths: ['.cursor'],
    homePaths: [],
    envVars: [],
  },
  {
    id: 'codex',
    name: 'Codex',
    projectPaths: ['.codex'],
    homePaths: ['.codex'],
    envVars: ['CODEX_CLI_ENTRYPOINT'],
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    projectPaths: ['.opencode'],
    homePaths: [],
    envVars: ['OPENCODE'],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    projectPaths: ['.gemini'],
    homePaths: ['.gemini'],
    envVars: ['GEMINI_CLI_ENTRYPOINT'],
  },
  {
    id: 'grok',
    name: 'Grok',
    projectPaths: ['.grok'],
    homePaths: ['.grok'],
    envVars: [],
  },
];

export interface DetectedAgent {
  readonly id: Exclude<TargetId, 'agents'>;
  readonly name: string;
  /** Why we think so — shown to the user before anything is written. */
  readonly evidence: readonly string[];
}

export interface DetectAgentsOptions {
  readonly cwd: string;
  readonly home?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export function detectAgents(options: DetectAgentsOptions): DetectedAgent[] {
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const found: DetectedAgent[] = [];

  for (const signature of AGENT_SIGNATURES) {
    const evidence: string[] = [];

    for (const path of signature.projectPaths) {
      if (existsSync(join(options.cwd, path))) evidence.push(`${path}/ in this project`);
    }
    for (const path of signature.homePaths) {
      if (existsSync(join(home, path))) evidence.push(`~/${path}/`);
    }
    for (const variable of signature.envVars) {
      if (env[variable] !== undefined) evidence.push(`$${variable} is set`);
    }

    if (evidence.length > 0) found.push({ id: signature.id, name: signature.name, evidence });
  }

  return found;
}
