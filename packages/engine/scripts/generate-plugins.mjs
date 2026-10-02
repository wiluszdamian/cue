#!/usr/bin/env node
/**
 * Packages the skill catalog as native plugins for each supported agent.
 *
 * `skills/` stays the source of truth; this copies it into
 * `plugins/understudy/skills/` and writes the per-agent manifests around that
 * copy, so a marketplace install does not ship the rest of the monorepo as
 * plugin context. `--check` fails on drift.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { loadSkills, V1_SKILLS } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const skillsDir = join(repoRoot, 'skills');
const pluginDir = join(repoRoot, 'plugins', 'understudy');
const pluginSkillsDir = join(pluginDir, 'skills');

const version = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();
const skills = loadSkills(skillsDir);
const skillIds = V1_SKILLS.map((s) => s.id);

const REPO = 'https://github.com/wiluszdamian/understudy';
const PLUGIN_ID = 'understudy';
const DESCRIPTION =
  'Playwright testing conventions for this repository: constitution, locators from .agent-kb, and the skill catalog that writes tests the way this team already writes them.';

const author = { name: 'Understudy', url: REPO };
const keywords = ['playwright', 'testing', 'e2e', 'typescript', 'agent-skills'];

const playwrightMcp = {
  command: 'npx',
  args: ['-y', '@playwright/mcp@latest'],
};

// The three point lookups. Shipped alongside Playwright MCP, not instead of it:
// that one drives a browser, this one answers questions without one.
const understudyMcp = {
  command: 'npx',
  args: ['-y', '@understudy/mcp@latest'],
};

const mcpServers = { understudy: understudyMcp, playwright: playwrightMcp };

const prettierOpts = (await prettier.resolveConfig(join(repoRoot, 'package.json'))) ?? {};

const json = async (value) =>
  prettier.format(`${JSON.stringify(value)}\n`, { ...prettierOpts, parser: 'json' });

const md = async (content) => prettier.format(content, { ...prettierOpts, parser: 'markdown' });

function show(path) {
  return relative(repoRoot, path).split('\\').join('/');
}

function walkFiles(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(path, base));
    else out.push(path);
  }
  return out;
}

const identity = {
  name: PLUGIN_ID,
  version,
  description: DESCRIPTION,
  author: { name: author.name },
  homepage: REPO,
  repository: REPO,
  license: 'MIT',
  keywords,
};

const files = new Map();

files.set(
  join(pluginDir, 'plugin.json'),
  await json({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: PLUGIN_ID,
    version,
    description: DESCRIPTION,
    author,
    homepage: REPO,
    repository: REPO,
    license: 'MIT',
    keywords,
  }),
);

files.set(
  join(pluginDir, '.claude-plugin', 'plugin.json'),
  await json({
    ...identity,
    skills: './skills',
    mcpServers: './.mcp.json',
  }),
);

files.set(
  join(pluginDir, '.cursor-plugin', 'plugin.json'),
  await json({
    ...identity,
    skills: './skills',
    mcpServers: './mcp.json',
  }),
);

files.set(
  join(pluginDir, '.grok-plugin', 'plugin.json'),
  await json({
    ...identity,
    skills: './skills',
    mcpServers: './.mcp.json',
  }),
);

files.set(
  join(pluginDir, '.codex-plugin', 'plugin.json'),
  await json({
    ...identity,
    skills: './skills/',
    mcpServers: './mcp.json',
  }),
);

files.set(
  join(pluginDir, 'gemini-extension.json'),
  await json({
    name: PLUGIN_ID,
    version,
    description: DESCRIPTION,
    mcpServers,
  }),
);

files.set(
  join(repoRoot, 'gemini-extension.json'),
  await json({
    name: PLUGIN_ID,
    version,
    description: DESCRIPTION,
    mcpServers,
  }),
);

files.set(
  join(pluginDir, 'mcp.json'),
  await json({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: {
      understudy: { type: 'stdio', ...understudyMcp },
      playwright: { type: 'stdio', ...playwrightMcp },
    },
  }),
);

files.set(join(pluginDir, '.mcp.json'), await json({ mcpServers }));

const marketplacePlugin = {
  name: PLUGIN_ID,
  source: './plugins/understudy',
  description: DESCRIPTION,
  version,
  author: { name: author.name },
  homepage: REPO,
  keywords,
};

files.set(
  join(repoRoot, '.claude-plugin', 'marketplace.json'),
  await json({
    name: PLUGIN_ID,
    owner: { name: 'Understudy' },
    metadata: { description: DESCRIPTION, version },
    plugins: [
      {
        ...marketplacePlugin,
        category: 'development',
        skills: './skills',
        mcpServers: './.mcp.json',
      },
    ],
  }),
);

files.set(
  join(repoRoot, '.cursor-plugin', 'marketplace.json'),
  await json({
    name: PLUGIN_ID,
    owner: { name: 'Understudy' },
    metadata: { description: DESCRIPTION, version, pluginRoot: 'plugins' },
    plugins: [
      {
        name: PLUGIN_ID,
        source: 'understudy',
        description: DESCRIPTION,
        version,
        skills: './skills',
      },
    ],
  }),
);

files.set(
  join(repoRoot, '.grok-plugin', 'marketplace.json'),
  await json({
    name: PLUGIN_ID,
    description: DESCRIPTION,
    owner: { name: 'Understudy' },
    plugins: [
      {
        ...marketplacePlugin,
        category: 'development',
      },
    ],
  }),
);

files.set(
  join(repoRoot, '.agents', 'plugins', 'marketplace.json'),
  await json({
    name: PLUGIN_ID,
    interface: { displayName: 'Understudy' },
    plugins: [
      {
        name: PLUGIN_ID,
        source: { source: 'local', path: './plugins/understudy' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
      },
    ],
  }),
);

const catalogRows = V1_SKILLS.map((s) => {
  const description = (
    skills.find((sk) => sk.frontmatter.name === s.id)?.frontmatter.description ?? ''
  )
    .replace(/\s+/g, ' ')
    .trim();
  const first = `${(description.split('. ')[0] ?? description).replace(/\.$/, '')}.`;
  return `| \`/${s.id}\` | ${s.kind} | ${first} |`;
}).join('\n');

files.set(
  join(pluginDir, 'README.md'),
  await md(`<!-- GENERATED. Run \`pnpm skills:generate\`. Do not edit. -->

# Understudy plugin

The skill catalog, packaged so coding agents can install it as a plugin rather
than copying markdown by hand. Procedures are the same files as \`skills/\`; this
directory is the installable unit around them.

Two MCP servers are bundled. \`understudy\` answers point lookups —
\`explain_rule\`, \`resolve_owner\`, \`resolve_locator\`, \`resolve_route\`,
\`resolve_api\`, \`get_evidence\`, \`get_freshness\` and \`find_knowledge\` — against this
project's rules and knowledge base, and writes nothing. Playwright MCP handles
point-in-time browser calls. Exploration still goes through \`playwright-cli\`:
an accessibility tree costs more context than the question it answers. See the
ownership table in \`AGENTS.md\`.

## Install

| Agent | Command |
| --- | --- |
| Claude Code | \`/plugin marketplace add wiluszdamian/understudy\` then \`/plugin install understudy@understudy\` |
| Cursor | add \`wiluszdamian/understudy\` as a marketplace, install **understudy** |
| Codex | \`codex plugin marketplace add wiluszdamian/understudy\` |
| Grok | \`grok plugin marketplace add wiluszdamian/understudy\` then \`grok plugin install understudy --trust\` |
| Gemini CLI | \`gemini extensions install https://github.com/wiluszdamian/understudy.git\` |
| OpenCode | \`npx skills add wiluszdamian/understudy -a opencode\` |
| .agents (universal) | \`npx skills add wiluszdamian/understudy -a universal\` |

OpenCode and the \`.agents/skills\` convention do not have a marketplace of their
own that this package can publish to. \`npx skills add\` copies the catalog into
the directory those agents already read.

This is the light channel: conventions, not the ESLint guarantee. For
enforcement:

\`\`\`bash
npx @understudy/cli init
\`\`\`

## Skills

| Invocation | Type | What it does |
| --- | --- | --- |
${catalogRows}

\`/understudy\` is the on-ramp a model may invoke. The rest of the getting-started
and main-flow skills stay user-invoked so a mention of testing does not start a
survey.

## Credits

Understudy composes work maintained by others — the official Playwright skills
and CLI, and Playwright MCP (Microsoft, Apache-2.0), and a Playwright
best-practices reference skill (Currents Software Inc., MIT). It is not
affiliated with Microsoft, Anthropic, OpenAI, Google, xAI, or Currents.
`),
);

function catalogSkillDirs() {
  return readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => {
    if (!entry.isDirectory() || entry.name.startsWith('.')) return false;
    return existsSync(join(skillsDir, entry.name, 'SKILL.md')) || entry.name === 'reference';
  });
}

function expectedSkillCopies() {
  const copies = new Map();
  for (const entry of catalogSkillDirs()) {
    const srcDir = join(skillsDir, entry.name);
    for (const file of walkFiles(srcDir)) {
      const dest = join(pluginSkillsDir, relative(skillsDir, file));
      copies.set(dest, readFileSync(file, 'utf8'));
    }
  }
  return copies;
}

const copies = expectedSkillCopies();
for (const [path, content] of copies) files.set(path, content);

const missingCatalog = skillIds.filter((id) => !existsSync(join(skillsDir, id, 'SKILL.md')));
if (missingCatalog.length > 0) {
  process.stderr.write(
    `plugin packaging needs every catalog skill present:\n${missingCatalog
      .map((id) => `  skills/${id}/SKILL.md`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

const generatedRoots = [
  pluginDir,
  join(repoRoot, '.claude-plugin'),
  join(repoRoot, '.cursor-plugin'),
  join(repoRoot, '.grok-plugin'),
  join(repoRoot, '.agents', 'plugins'),
];

function existingGenerated() {
  const found = [];
  for (const root of generatedRoots) {
    if (!existsSync(root)) continue;
    found.push(...walkFiles(root));
  }
  const geminiRoot = join(repoRoot, 'gemini-extension.json');
  if (existsSync(geminiRoot)) found.push(geminiRoot);
  return found;
}

if (process.argv.includes('--check')) {
  const stale = [];
  for (const [path, content] of files) {
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      /* missing counts as stale */
    }
    if (current !== content) stale.push(path);
  }

  const expected = new Set([...files.keys()].map((p) => show(p)));
  const orphans = existingGenerated()
    .map((p) => show(p))
    .filter((rel) => !expected.has(rel));

  if (stale.length > 0 || orphans.length > 0) {
    process.stderr.write(
      `plugin packaging is out of date with skills/:\n${[...stale.map(show), ...orphans]
        .map((f) => `  ${f}`)
        .join('\n')}\nRun: pnpm skills:generate\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `plugins are in sync with skills/ (${files.size} files, ${skillIds.length} skills).\n`,
  );
} else {
  rmSync(pluginDir, { recursive: true, force: true });
  for (const root of [
    join(repoRoot, '.claude-plugin'),
    join(repoRoot, '.cursor-plugin'),
    join(repoRoot, '.grok-plugin'),
    join(repoRoot, '.agents', 'plugins'),
  ]) {
    rmSync(root, { recursive: true, force: true });
  }

  for (const [path, content] of files) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }

  process.stdout.write(
    `wrote ${files.size} plugin files (${skillIds.length} skills, version ${version}).\n`,
  );
}
