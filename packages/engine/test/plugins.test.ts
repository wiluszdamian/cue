import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { V1_SKILLS } from '../src/schema/skill.js';
import { loadCompatibility } from '../src/compatibility.js';
import { loadSkills } from '../src/skills.js';

/**
 * The plugin package is the catalog, wrapped so Claude Code, Cursor, Codex,
 * Grok, Gemini, OpenCode and `.agents` can install it through their own
 * marketplaces. Skills stay authored in `skills/`; the plugin copy must not
 * drift, and every manifest must point at a directory that actually exists.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const SKILLS = join(REPO_ROOT, 'skills');
const PLUGIN = join(REPO_ROOT, 'plugins', 'cue');
const VERSION = readFileSync(join(REPO_ROOT, 'VERSION'), 'utf8').trim();

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

const compatibility = loadCompatibility(join(REPO_ROOT, 'compatibility.yaml'));
const catalog = loadSkills(SKILLS);
const bundled = loadSkills(join(PLUGIN, 'skills'));

describe('the plugin package', () => {
  it('ships every catalog skill, byte-identical', () => {
    expect(bundled.map((s) => s.frontmatter.name).sort()).toEqual(
      catalog.map((s) => s.frontmatter.name).sort(),
    );
    expect(bundled.map((s) => s.frontmatter.name).sort()).toEqual(
      V1_SKILLS.map((s) => s.id).sort(),
    );

    for (const skill of catalog) {
      const source = readFileSync(join(SKILLS, skill.frontmatter.name, 'SKILL.md'), 'utf8');
      const copy = readFileSync(join(PLUGIN, 'skills', skill.frontmatter.name, 'SKILL.md'), 'utf8');
      expect(copy, skill.frontmatter.name).toBe(source);
    }
  });

  it('copies reference pages the procedures cite', () => {
    const reference = join(PLUGIN, 'skills', 'reference');
    expect(existsSync(reference)).toBe(true);
    const pages = readdirSync(reference).filter((f) => f.endsWith('.md'));
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(readFileSync(join(reference, page), 'utf8')).toBe(
        readFileSync(join(SKILLS, 'reference', page), 'utf8'),
      );
    }
  });

  it('has a model-invocable on-ramp named cue', () => {
    const onRamp = bundled.find((s) => s.frontmatter.name === 'cue');
    expect(onRamp).toBeDefined();
    expect(onRamp?.frontmatter['disable-model-invocation']).toBe(false);
    expect(onRamp?.body.toLowerCase()).toContain('it is working if');
    expect(onRamp?.body).toContain('/compose');
    expect(onRamp?.body).toContain('/resolve-locator');
  });

  it('tells each supported agent how to install', () => {
    const readme = readFileSync(join(PLUGIN, 'README.md'), 'utf8');
    for (const agent of [
      'Claude Code',
      'Cursor',
      'Codex',
      'Grok',
      'Gemini CLI',
      'OpenCode',
      '.agents',
    ]) {
      expect(readme, agent).toContain(agent);
    }
  });
});

describe('manifests', () => {
  const pluginJson = readJson(join(PLUGIN, 'plugin.json'));
  const claude = readJson(join(PLUGIN, '.claude-plugin', 'plugin.json'));
  const cursor = readJson(join(PLUGIN, '.cursor-plugin', 'plugin.json'));
  const grok = readJson(join(PLUGIN, '.grok-plugin', 'plugin.json'));
  const codex = readJson(join(PLUGIN, '.codex-plugin', 'plugin.json'));
  const gemini = readJson(join(PLUGIN, 'gemini-extension.json'));
  const geminiRoot = readJson(join(REPO_ROOT, 'gemini-extension.json'));
  const mcp = readJson(join(PLUGIN, 'mcp.json'));
  const mcpDot = readJson(join(PLUGIN, '.mcp.json'));

  it('pins the same version as VERSION', () => {
    expect(pluginJson.version).toBe(VERSION);
    expect(claude.version).toBe(VERSION);
    expect(cursor.version).toBe(VERSION);
    expect(grok.version).toBe(VERSION);
    expect(codex.version).toBe(VERSION);
    expect(gemini.version).toBe(VERSION);
    expect(geminiRoot.version).toBe(VERSION);
  });

  it('declares the Agent Plugins schema on the portable manifest', () => {
    expect(pluginJson.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    expect(pluginJson.name).toBe('cue');
    expect(pluginJson.license).toBe('MIT');
  });

  it('pins both MCP servers instead of running whatever was published last', () => {
    const everything = [mcp, mcpDot, gemini, geminiRoot]
      .map((manifest) => JSON.stringify(manifest))
      .join('\n');
    expect(everything).not.toContain('@latest');
  });

  it('bundles both MCP servers without guessing a package manager', () => {
    const npx = {
      command: 'npx',
      args: ['-y', `@playwright/mcp@${compatibility.tools['@playwright/mcp']?.tested ?? ''}`],
    };
    const ours = { command: 'npx', args: ['-y', `@wiluszdamian/cue-mcp@${VERSION}`] };

    const servers = mcp.mcpServers as Record<string, { command: string; args: string[] }>;
    expect(servers.playwright?.command).toBe(npx.command);
    expect(servers.playwright?.args).toEqual(npx.args);
    expect(servers.cue?.args).toEqual(ours.args);

    const dotted = mcpDot.mcpServers as Record<string, { command: string; args: string[] }>;
    expect(dotted.playwright).toEqual(npx);
    expect(dotted.cue).toEqual(ours);

    const geminiServers = gemini.mcpServers as Record<string, { command: string; args: string[] }>;
    expect(geminiServers.playwright).toEqual(npx);
    expect(geminiServers.cue).toEqual(ours);
  });

  it('ships the point lookups everywhere the browser server goes', () => {
    // The two answer different questions and a manifest carrying only one of
    // them is the easy mistake: an agent with no resolve_locator guesses a
    // selector instead of asking, which is the failure the knowledge base exists
    // to prevent.
    for (const [name, manifest] of [
      ['mcp.json', mcp],
      ['.mcp.json', mcpDot],
      ['gemini-extension.json', gemini],
    ] as const) {
      const servers = manifest.mcpServers as Record<string, unknown>;
      expect(Object.keys(servers).sort(), name).toEqual(['cue', 'playwright']);
    }
  });
});

describe('marketplaces', () => {
  const claude = readJson(join(REPO_ROOT, '.claude-plugin', 'marketplace.json'));
  const cursor = readJson(join(REPO_ROOT, '.cursor-plugin', 'marketplace.json'));
  const grok = readJson(join(REPO_ROOT, '.grok-plugin', 'marketplace.json'));
  const agents = readJson(join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json'));

  it('points every marketplace at the plugin directory', () => {
    const claudePlugins = claude.plugins as { source: string }[];
    const grokPlugins = grok.plugins as { source: string }[];
    const agentsPlugins = agents.plugins as { source: { path: string } }[];

    expect(claudePlugins[0]?.source).toBe('./plugins/cue');
    expect(grokPlugins[0]?.source).toBe('./plugins/cue');
    expect(agentsPlugins[0]?.source.path).toBe('./plugins/cue');
    expect(existsSync(join(REPO_ROOT, 'plugins', 'cue', 'plugin.json'))).toBe(true);

    const cursorMeta = cursor.metadata as { pluginRoot: string };
    expect(cursorMeta.pluginRoot).toBe('plugins');
    const cursorPlugins = cursor.plugins as { source: string }[];
    expect(cursorPlugins[0]?.source).toBe('cue');
  });

  it('names the marketplace after the product, not an agent', () => {
    expect(claude.name).toBe('cue');
    expect(cursor.name).toBe('cue');
    expect(grok.name).toBe('cue');
    expect(agents.name).toBe('cue');
  });
});
