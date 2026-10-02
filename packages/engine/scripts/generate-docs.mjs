#!/usr/bin/env node
/**
 * Generates everything downstream of rules/:
 *
 *   docs/reference/constitution.md   the rule index
 *   docs/reference/rules/<id>.md     one page per rule
 *   docs/reference/ownership.md      the arbitration table
 *   AGENTS.md                        the table, in a marked region
 *
 * Generated rather than written, so the page a violation links to cannot describe
 * a rule that no longer exists. Only AGENTS.md's marked region is replaced; the
 * rest of that file is hand-written.
 *
 * Output goes through Prettier so `--check` compares bytes without the repo's own
 * formatter fighting the generator.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { formatValidationProblems, loadRules, validateRules } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
// Plain Markdown in the repository tree: read on GitHub, in an editor, and by an
// agent, with no build step in between.
const docsDir = join(repoRoot, 'docs', 'reference');
const rulesDocsDir = join(docsDir, 'rules');
const agentsFile = join(repoRoot, 'AGENTS.md');

const BEGIN = '<!-- BEGIN GENERATED: ownership -->';
const END = '<!-- END GENERATED: ownership -->';

const rules = loadRules(join(repoRoot, 'rules'));
const problems = validateRules(rules);
if (problems.length > 0) {
  process.stderr.write(
    `rules/ is not internally consistent:\n${formatValidationProblems(problems)}\n`,
  );
  process.exit(1);
}

const GENERATED = '<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->';

/** The page carries its own title, since nothing here renders frontmatter. */
function heading(title, description) {
  return `# ${title}\n\n_${description}_\n`;
}

const oneLine = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * `<url>` in Markdown prose is parsed as raw HTML, so it is escaped here rather
 * than constraining what a rule may say. Fences are inert.
 */
const prose = (text) => oneLine(text).replace(/(<)/g, String.raw`\$1`);

const ENFORCEMENT = {
  ast: 'ESLint (AST)',
  regex: 'ESLint (text)',
  knowledge: 'ESLint, against `.agent-kb` (silent where there is none; `understudy check` says so)',
  manual: '**not enforced** — review only',
};

function rulePage(rule) {
  return `${heading(rule.id, oneLine(rule.title))}
${GENERATED}

| | |
|---|---|
| Tier | \`${rule.tier}\` |
| Severity | \`${rule.severity}\` |
| Enforcement | ${ENFORCEMENT[rule.detector.kind]} |
| Autofix | ${rule.autofix ? 'yes — `eslint --fix`' : 'no'} |
| Skill | \`${rule.skill}\` |
| Applies to | ${rule.scope.map((s) => `\`${s}\``).join(', ')} |
| Exempt | ${rule.exclude.length > 0 ? rule.exclude.map((s) => `\`${s}\``).join(', ') : '—'} |
| Since | ${rule.since} |${rule.deprecated ? `\n| Deprecated | ${rule.deprecated} |` : ''}

## Why

${prose(rule.rationale)}

## What to do instead

${prose(rule.message)}

## Examples

\`\`\`ts
// ✗ ${rule.id}
${rule.examples.bad.trimEnd()}
\`\`\`

\`\`\`ts
// ✓
${rule.examples.good.trimEnd()}
\`\`\`
${
  rule.detector.kind === 'manual'
    ? `
## A note on enforcement

No linter can check this one. It is written down here so the documented standard
and the enforced standard stay the same list, with the gap between them visible
rather than implied — see [All the rules](../constitution.md).
`
    : ''
}`;
}

function constitutionIndex() {
  const row = (rule) =>
    `| [\`${rule.id}\`](rules/${rule.id}.md) | ${rule.tier} | ${rule.severity} | ${
      rule.detector.kind === 'manual' ? 'review' : 'lint'
    } | ${rule.autofix ? '✓' : ''} | ${prose(rule.title)} |`;

  const enforced = rules.constitution.rules.filter((r) => r.detector.kind !== 'manual');
  const manual = rules.constitution.rules.filter((r) => r.detector.kind === 'manual');

  return `${heading('All the rules', 'Every rule Understudy checks, why it exists, and what to write instead.')}
${GENERATED}

These are the rules Understudy owns outright. Everything else — how to drive the
browser, how to debug a test, how to handle Electron or i18n — belongs to another
source; see [Who decides what](ownership.md) for who owns what.

${enforced.length} of ${rules.constitution.rules.length} rules are mechanically
enforced by \`@understudy/eslint-plugin\`. The rest are stated here and checked in
review. That split is deliberate and published, because a standard that overstates
its own teeth stops being believed.

## Enforced

| Rule | Tier | Severity | Checked by | Fix | |
|---|---|---|---|---|---|
${enforced.map(row).join('\n')}

## Documented, not enforced

| Rule | Tier | Severity | Checked by | Fix | |
|---|---|---|---|---|---|
${manual.map(row).join('\n')}

## Canonical tags

Referenced by [\`require-test-tags\`](rules/require-test-tags.md).

| Tag | Means | Runs |
|---|---|---|
${rules.tags.tags.map((t) => `| \`${t.name}\` | ${prose(t.means)} | \`${t.ci}\` |`).join('\n')}

## Rule details

${rules.constitution.rules
  .map(
    (rule) => `### ${rule.docsAnchor}

**${prose(rule.title)}** · \`${rule.tier}\` · [full page](rules/${rule.id}.md)

${prose(rule.rationale)}

${prose(rule.message)}`,
  )
  .join('\n\n')}
`;
}

/** The compact table that goes into AGENTS.md — every agent reads this one. */
function ownershipTable() {
  const rows = rules.ownership.topics.map((topic) => {
    const wins = topic.precedence === 'absolute' ? ' **(wins)**' : '';
    const channel = topic.channel ? ` _via ${topic.channel}_` : '';
    return `| ${topic.topic} | \`${topic.owner}\`${wins}${channel} |`;
  });

  return [
    BEGIN,
    '',
    '<!-- Generated from rules/ownership.yaml. Run `pnpm docs:generate`. Do not edit by hand. -->',
    '',
    'Three skill trees compete for your attention and none of them knows the other',
    'two exist. This table decides. An owner marked **(wins)** outranks every other',
    'source, including one that states the opposite confidently.',
    '',
    '| Topic | Decided by |',
    '| --- | --- |',
    ...rows,
    '',
    '**A topic that is not listed is a gap in `rules/ownership.yaml`, not an invitation',
    'to improvise.** Say the topic is unowned and open an issue. Full detail, including',
    'what to consult for each owner, is in docs/reference/ownership.md.',
    '',
    END,
  ].join('\n');
}

function ownershipPage() {
  const byOwner = new Map(rules.ownership.owners.map((o) => [o.id, o]));

  const ownerSections = rules.ownership.owners.map((owner) => {
    const owned = rules.ownership.topics.filter((t) => t.owner === owner.id);
    return `### ${owner.name} \`${owner.id}\`

- **Kind:** ${owner.kind}
- **Maintained by:** ${owner.maintainer}${owner.install ? `\n- **Obtained via:** \`${owner.install}\`` : ''}

${prose(owner.consult)}

Decides ${owned.length} topic${owned.length === 1 ? '' : 's'}:

${owned.map((t) => `- ${t.topic}${t.precedence === 'absolute' ? ' — **wins over every other source**' : ''}`).join('\n')}`;
  });

  const topicSections = rules.ownership.topics.map((topic) => {
    const owner = byOwner.get(topic.owner);
    return `### ${topic.topic}

| | |
|---|---|
| Decided by | \`${topic.owner}\` (${owner?.name ?? 'unknown'}) |
| Precedence | \`${topic.precedence}\`${topic.precedence === 'absolute' ? ' — outranks every other source' : ''} |${topic.channel ? `\n| Reached via | \`${topic.channel}\` |` : ''}${topic.skills.length > 0 ? `\n| Constitution skills | ${topic.skills.map((s) => `\`${s}\``).join(', ')} |` : ''}

${topic.note ? prose(topic.note) : prose(owner?.consult ?? '')}`;
  });

  return `${heading('Who decides what', 'When two sources of advice disagree, this table settles it.')}
${GENERATED}

Understudy is an integrator. It composes sources maintained by other people and
adds the two nobody else can supply — this repo's rules, and this application's
actual shape. That leaves one problem no other project has: deciding which source
wins when they disagree.

This file is that decision, generated from
[\`rules/ownership.yaml\`](../../rules/ownership.yaml).

## How precedence works

\`absolute\` beats everything, including a source that says the opposite with
total confidence. It is reserved for the two things nobody upstream can know:
what this repository has decided, and what this application actually looks like.

Everything else is \`default\`: authoritative on its topic unless an absolute
owner also covers the question.

Two invariants are checked in CI rather than asserted here:

1. **Every topic the constitution covers is Understudy's, absolutely.** Each
   \`skill\` a rule cites must be claimed by an understudy-owned topic at absolute
   precedence, so a rule cannot be added on a topic whose ownership nobody
   decided.
2. **Every topic is reachable.** Asking about a topic by its own name must
   resolve to that topic, which catches keyword lists so narrow the arbitration
   can never fire, and topics so overlapping they shadow each other.

## When nothing matches

An unowned topic is a gap in the table, never a licence to improvise. \`whoOwns\`
returns that verdict explicitly instead of staying silent, because a convention
invented on the spot is indistinguishable from a convention everyone agreed to —
right up until the second person has to guess it too.

## Owners

${ownerSections.join('\n\n')}

## Topics

${topicSections.join('\n\n')}
`;
}

async function md(content) {
  return prettier.format(content, {
    parser: 'markdown',
    ...(await prettier.resolveConfig(agentsFile)),
  });
}

function injectOwnership(existing) {
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  if (start === -1 || end === -1) {
    process.stderr.write(
      `AGENTS.md is missing the ${BEGIN} / ${END} markers. The ownership table is\n` +
        `generated into that region; restore the markers and re-run.\n`,
    );
    process.exit(1);
  }
  return existing.slice(0, start) + ownershipTable() + existing.slice(end + END.length);
}

const files = new Map();
files.set(join(docsDir, 'constitution.md'), await md(constitutionIndex()));
files.set(join(docsDir, 'ownership.md'), await md(ownershipPage()));
files.set(agentsFile, await md(injectOwnership(readFileSync(agentsFile, 'utf8'))));
for (const rule of rules.constitution.rules) {
  files.set(join(rulesDocsDir, `${rule.id}.md`), await md(rulePage(rule)));
}

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
    const expected = new Set(rules.constitution.rules.map((r) => `${r.id}.md`));
    orphans = readdirSync(rulesDocsDir)
      .filter((f) => !expected.has(f))
      .map((f) => join(rulesDocsDir, f));
  } catch {
    /* directory may not exist yet */
  }

  if (stale.length > 0 || orphans.length > 0) {
    process.stderr.write(
      `generated docs are out of date with rules/:\n${[...stale, ...orphans]
        .map((f) => `  ${show(f)}`)
        .join('\n')}\nRun: pnpm docs:generate\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`docs are in sync with rules/ (${files.size} files).\n`);
} else {
  // Removed wholesale, so a deleted rule cannot leave a page behind.
  rmSync(rulesDocsDir, { recursive: true, force: true });
  mkdirSync(rulesDocsDir, { recursive: true });
  for (const [path, content] of files) writeFileSync(path, content, 'utf8');
  process.stdout.write(`wrote ${files.size} documentation files.\n`);
}
