#!/usr/bin/env node
/**
 * Generates the parts of `skills/` that come from `rules/`.
 *
 * The catalog can be taken with `npx skills add` and the engine never installed,
 * which makes drift the central risk: a reference skill quoting a changed rule is
 * worse than none, because it is wrong with authority. So procedures are
 * hand-written and rules are not:
 *
 *   skills/reference/<skill>.md     fully generated from constitution.yaml
 *   skills/compass/SKILL.md         catalog table injected into a marked region
 *   skills/resolve-owner/SKILL.md   ownership table injected likewise
 *   skills/README.md                fully generated index
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import {
  formatSkillProblems,
  formatValidationProblems,
  loadRules,
  loadSkills,
  V1_SKILLS,
  validateRules,
  validateSkills,
} from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const skillsDir = join(repoRoot, 'skills');
const referenceDir = join(skillsDir, 'reference');

const rules = loadRules(join(repoRoot, 'rules'));
const ruleProblems = validateRules(rules);
if (ruleProblems.length > 0) {
  process.stderr.write(
    `rules/ is not internally consistent:\n${formatValidationProblems(ruleProblems)}\n`,
  );
  process.exit(1);
}

const skills = loadSkills(skillsDir);
const skillProblems = validateSkills(skills);
if (skillProblems.length > 0) {
  process.stderr.write(`skills/ is not consistent:\n${formatSkillProblems(skillProblems)}\n`);
  process.exit(1);
}

const oneLine = (text) => text.replace(/\s+/g, ' ').trim();
const GENERATED = '<!-- GENERATED from rules/. Run `pnpm skills:generate`. Do not edit. -->';

/** Every `skill:` the constitution cites, plus the ones only ownership names. */
function referenceSkillIds() {
  const ids = new Set(rules.constitution.rules.map((r) => r.skill));
  for (const topic of rules.ownership.topics) for (const s of topic.skills) ids.add(s);
  return [...ids].sort();
}

function referencePage(id) {
  const owned = rules.constitution.rules.filter((r) => r.skill === id);
  const topics = rules.ownership.topics.filter((t) => t.skills.includes(id));

  const body =
    owned.length === 0
      ? `No rule cites this reference yet, so there is nothing here to enforce.
That is deliberate rather than an oversight: the topic has an owner in the
table, so a rule added later lands on decided ownership instead of a gap.`
      : owned
          .map(
            (rule) => `### ${rule.id}

\`${rule.tier}\` · \`${rule.severity}\` · ${
              rule.detector.kind === 'manual'
                ? '**not enforced** — checked in review'
                : rule.detector.kind === 'knowledge'
                  ? 'enforced by ESLint, against `.agent-kb`'
                  : 'enforced by ESLint'
            }${rule.autofix ? ' · autofixable' : ''}

${oneLine(rule.rationale)}

**Do this instead.** ${oneLine(rule.message)}

\`\`\`ts
// wrong
${rule.examples.bad.trimEnd()}
// right
${rule.examples.good.trimEnd()}
\`\`\``,
          )
          .join('\n\n');

  return `${GENERATED}

# ${id}

${
  topics.length > 0
    ? `Owns: ${topics.map((t) => t.topic).join('; ')}.\n\nThis is Cue's topic outright — it outranks any other source that says otherwise.`
    : 'Reference material, cited by `compose` and `pin`.'
}

${body}
`;
}

function catalogRegion() {
  const groups = new Map();
  for (const skill of V1_SKILLS) {
    groups.set(skill.group, [...(groups.get(skill.group) ?? []), skill]);
  }

  const byId = new Map(skills.map((s) => [s.frontmatter.name, s]));
  const sections = [...groups.entries()].map(([group, members]) => {
    const rows = members.map((m) => {
      const description = oneLine(byId.get(m.id)?.frontmatter.description ?? '');
      const first = `${description.split('. ')[0] ?? description}.`.replace(/\.\.$/, '.');
      return `| \`/${m.id}\` | ${m.kind} | ${first} |`;
    });
    return [
      `**${group}**`,
      '',
      '| Invocation | Type | What it does |',
      '| --- | --- | --- |',
      ...rows,
    ].join('\n');
  });

  return `\n\n## The catalog\n\n${sections.join('\n\n')}\n\n${TABLE}\n\n`;
}

const TABLE = `## What you have → what to reach for

| You have | Reach for |
| --- | --- |
| The Cue plugin, and a testing task | \`/cue\` |
| No idea where to start | \`/compass\` |
| A fresh repo, nothing wired up | \`/bind\` |
| No knowledge of the live UI | \`/survey\` |
| The product source alongside | \`/extract\` |
| Agreement on what to check, no cases yet | \`/pin\` |
| Cases, but no test code | \`/compose\` |
| An existing suite you want assessed | \`/inspect\` |
| Two sources giving conflicting advice | \`/resolve-owner\` |
| An uncertain selector | \`/resolve-locator\` |
| A product spec or ticket breakdown | outside Cue — your team's process |`;

function ownershipRegion() {
  const rows = rules.ownership.topics.map((topic) => {
    const wins = topic.precedence === 'absolute' ? ' **(wins)**' : '';
    const channel = topic.channel ? ` _via ${topic.channel}_` : '';
    return `| ${topic.topic} | \`${topic.owner}\`${wins}${channel} |`;
  });

  const owners = rules.ownership.owners.map(
    (owner) => `- **\`${owner.id}\`** — ${oneLine(owner.consult)}`,
  );

  return `\n\n## The table\n\n| Topic | Decided by |\n| --- | --- |\n${rows.join(
    '\n',
  )}\n\n## What each owner means\n\n${owners.join('\n')}\n\n`;
}

function readme() {
  const byId = new Map(skills.map((s) => [s.frontmatter.name, s]));
  const rows = V1_SKILLS.map((s) => {
    const description = oneLine(byId.get(s.id)?.frontmatter.description ?? '');
    return `| [\`/${s.id}\`](${s.id}/SKILL.md) | ${s.group} | ${s.kind} | ${`${description.split('. ')[0] ?? description}.`.replace(
      /\.\.$/,
      '.',
    )} |`;
  });

  return `${GENERATED}

# Cue skills

The light half of Cue: procedures an agent can follow, with no engine, no
ESLint and no manifest.

\`\`\`bash
npx skills add wiluszdamian/cue
npx skills add wiluszdamian/cue --skill=compass
\`\`\`

Or install the same catalog as a plugin for Claude Code, Cursor, Codex, Grok,
Gemini, OpenCode, or \`.agents\` — see \`plugins/cue/README.md\`.

That gets you the conventions. It does not get you the **guarantee** — the ESLint
preset that fails a build when a rule is broken, whether or not an agent was
involved. For that, install the product:

\`\`\`bash
npm create cue
cue init
\`\`\`

| Skill | Group | Type | What it does |
| --- | --- | --- | --- |
${rows.join('\n')}

${TABLE}

## Reference

[\`reference/\`](reference/) is generated from the project constitution and cited
by \`/compose\` and \`/pin\`. It is not invoked directly.

${referenceSkillIds()
  .map((id) => `- [\`${id}\`](reference/${id}.md)`)
  .join('\n')}

## Credits

Cue composes work maintained by others — the official Playwright skills
and CLI, and Playwright MCP (Microsoft, Apache-2.0), and a Playwright
best-practices reference skill (Currents Software Inc., MIT). It is not
affiliated with Microsoft, Anthropic, OpenAI, Google, xAI, or Currents.
`;
}

function inject(path, begin, end, body) {
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf(begin);
  const stop = source.indexOf(end, start);
  if (start === -1 || stop === -1) {
    process.stderr.write(`${relative(repoRoot, path)} is missing the ${begin} / ${end} markers.\n`);
    process.exit(1);
  }
  return source.slice(0, start + begin.length) + body + source.slice(stop);
}

const md = async (content) =>
  prettier.format(content, {
    parser: 'markdown',
    ...(await prettier.resolveConfig(join(skillsDir, 'README.md'))),
  });

const files = new Map();
files.set(join(skillsDir, 'README.md'), await md(readme()));
for (const id of referenceSkillIds()) {
  files.set(join(referenceDir, `${id}.md`), await md(referencePage(id)));
}
files.set(
  join(skillsDir, 'compass', 'SKILL.md'),
  await md(
    inject(
      join(skillsDir, 'compass', 'SKILL.md'),
      '<!-- BEGIN GENERATED: catalog -->',
      '<!-- END GENERATED: catalog -->',
      catalogRegion(),
    ),
  ),
);
files.set(
  join(skillsDir, 'resolve-owner', 'SKILL.md'),
  await md(
    inject(
      join(skillsDir, 'resolve-owner', 'SKILL.md'),
      '<!-- BEGIN GENERATED: ownership -->',
      '<!-- END GENERATED: ownership -->',
      ownershipRegion(),
    ),
  ),
);

const show = (path) => relative(repoRoot, path).split('\\').join('/');

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

  let orphans = [];
  try {
    const expected = new Set(referenceSkillIds().map((id) => `${id}.md`));
    orphans = readdirSync(referenceDir)
      .filter((f) => !expected.has(f))
      .map((f) => join(referenceDir, f));
  } catch {
    /* directory may not exist yet */
  }

  if (stale.length > 0 || orphans.length > 0) {
    process.stderr.write(
      `skills/ is out of date with rules/:\n${[...stale, ...orphans]
        .map((f) => `  ${show(f)}`)
        .join('\n')}\nRun: pnpm skills:generate\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`skills are in sync with rules/ (${files.size} files).\n`);
} else {
  rmSync(referenceDir, { recursive: true, force: true });
  mkdirSync(referenceDir, { recursive: true });
  for (const [path, content] of files) writeFileSync(path, content, 'utf8');
  process.stdout.write(
    `wrote ${files.size} skill files (${V1_SKILLS.length} skills, ${referenceSkillIds().length} reference).\n`,
  );
}
