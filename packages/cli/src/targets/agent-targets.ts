import { COMPATIBILITY } from '../generated/compatibility.js';
import type { DesiredFile } from '../install.js';
import type { PackageManager } from '../package-manager.js';
import type { Target, TargetContext } from './types.js';

/**
 * The per-agent layer, almost empty: five of six agents read `AGENTS.md` natively,
 * leaving a small MCP config each. TOML takes comment markers so a region can be
 * removed exactly; JSON cannot, so those files are only ever created.
 */

/**
 * Complements: an agent with only the browser server guesses selectors.
 *
 * Both are pinned. `@latest` would run whatever was published this morning on the
 * strength of a config written months ago, and the first sign of a breaking release
 * would be an agent that stopped answering. Our own server is pinned to the release
 * that wrote the file; the browser server to the version compatibility.yaml was
 * tested with. `cue sync` moves both when the package is upgraded.
 */
function mcpPackages(cueVersion: string): { cue: string; playwright: string } {
  const playwright = COMPATIBILITY.tools['@playwright/mcp'];
  return {
    cue: `@wiluszdamian/cue-mcp@${cueVersion}`,
    playwright: `@playwright/mcp@${playwright?.tested ?? 'latest'}`,
  };
}

function mcpRunner(manager: PackageManager, pkg: string): { command: string; args: string[] } {
  switch (manager) {
    case 'npm':
      return { command: 'npx', args: ['-y', pkg] };
    case 'pnpm':
      return { command: 'pnpm', args: ['dlx', pkg] };
    case 'yarn':
      return { command: 'yarn', args: ['dlx', pkg] };
    case 'bun':
      return { command: 'bunx', args: [pkg] };
  }
}

function mcpServers(
  manager: PackageManager,
  cueVersion: string,
): Record<string, { command: string; args: string[] }> {
  const packages = mcpPackages(cueVersion);
  return {
    cue: mcpRunner(manager, packages.cue),
    playwright: mcpRunner(manager, packages.playwright),
  };
}

export function mcpJson(manager: PackageManager, cueVersion: string, key = 'mcpServers'): string {
  return `${JSON.stringify({ [key]: mcpServers(manager, cueVersion) }, null, 2)}\n`;
}

function mcpToml(manager: PackageManager, cueVersion: string): string {
  const servers = mcpServers(manager, cueVersion);
  const block = (name: string): string =>
    [
      `[mcp_servers.${name}]`,
      `command = ${JSON.stringify(servers[name]?.command)}`,
      `args = ${JSON.stringify(servers[name]?.args)}`,
    ].join('\n');

  return `
# Cue MCP — explain_rule, resolve_owner, resolve_locator and the knowledge
# lookups (resolve_route, resolve_api, get_evidence, get_freshness, find_knowledge).
# Read-only point lookups against this project's rules and knowledge base.
${block('cue')}

# Playwright MCP — point-in-time browser calls with small results.
# Exploration goes through playwright-cli instead; see the ownership table in
# AGENTS.md for why.
${block('playwright')}
`;
}

const CLAUDE_BEGIN = '<!-- BEGIN CUE -->';
const CLAUDE_END = '<!-- END CUE -->';
const TOML_BEGIN = '# BEGIN CUE';
const TOML_END = '# END CUE';

export const claudeCodeTarget: Target = {
  id: 'claude-code',
  name: 'Claude Code',
  summary: 'CLAUDE.md importing AGENTS.md, plus the Cue and Playwright MCP servers',

  files(context: TargetContext): DesiredFile[] {
    return [
      {
        path: 'CLAUDE.md',
        target: 'claude-code',
        // One line keeps Claude Code on the same instructions, with no copy to drift.
        content: `
@AGENTS.md
`,
        region: { begin: CLAUDE_BEGIN, end: CLAUDE_END },
        reason: 'Claude Code is the only agent that needs its own instruction file',
      },
      {
        path: '.mcp.json',
        target: 'claude-code',
        content: mcpJson(context.packageManager, context.cueVersion),
        reason: 'Cue point lookups, and Playwright MCP for browser calls',
      },
    ];
  },
};

export const cursorTarget: Target = {
  id: 'cursor',
  name: 'Cursor',
  summary: 'Cue and Playwright MCP (AGENTS.md is read natively)',

  files(context: TargetContext): DesiredFile[] {
    return [
      {
        path: '.cursor/mcp.json',
        target: 'cursor',
        content: mcpJson(context.packageManager, context.cueVersion),
        reason: 'Cue point lookups, and Playwright MCP for browser calls',
      },
    ];
  },
};

export const codexTarget: Target = {
  id: 'codex',
  name: 'Codex',
  summary: 'Cue and Playwright MCP (AGENTS.md is read natively)',

  files(context: TargetContext): DesiredFile[] {
    return [
      {
        path: '.codex/config.toml',
        target: 'codex',
        content: mcpToml(context.packageManager, context.cueVersion),
        region: { begin: TOML_BEGIN, end: TOML_END },
        reason: 'Cue point lookups, and Playwright MCP for browser calls',
      },
    ];
  },
};

export const opencodeTarget: Target = {
  id: 'opencode',
  name: 'OpenCode',
  summary: 'Cue and Playwright MCP (AGENTS.md is read natively)',

  files(context: TargetContext): DesiredFile[] {
    return [
      {
        path: 'opencode.json',
        target: 'opencode',
        content: mcpJson(context.packageManager, context.cueVersion, 'mcp'),
        reason: 'Cue point lookups, and Playwright MCP for browser calls',
      },
    ];
  },
};

export const geminiTarget: Target = {
  id: 'gemini',
  name: 'Gemini CLI',
  summary: 'Cue and Playwright MCP (AGENTS.md is read natively)',

  files(context: TargetContext): DesiredFile[] {
    return [
      {
        path: '.gemini/settings.json',
        target: 'gemini',
        content: mcpJson(context.packageManager, context.cueVersion),
        reason: 'Cue point lookups, and Playwright MCP for browser calls',
      },
    ];
  },
};

export const grokTarget: Target = {
  id: 'grok',
  name: 'Grok',
  summary: 'AGENTS.md only — MCP config lives outside the project',
  limitations: [
    'Grok reads its MCP config from ~/.grok/config.toml, outside this repository.',
    'Cue does not write to your home directory, so that step is yours: add',
    '[mcp_servers.cue] and [mcp_servers.playwright] blocks there.',
    '`cue doctor` cannot verify it.',
  ],

  files(): DesiredFile[] {
    // Its MCP config is per-user, and `remove` cannot undo writes outside the repo.
    return [];
  },
};
