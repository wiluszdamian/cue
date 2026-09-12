import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  expectedInvocationFlag,
  SkillFrontmatterSchema,
  V1_SKILLS,
  type Skill,
  type SkillKind,
} from './schema/skill.js';

/**
 * Reading and checking the skill catalog. `npx skills add` installs the markdown
 * with no engine and no ESLint, so the frontmatter is the entire interface.
 */

export class SkillLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillLoadError';
  }
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export function parseSkill(path: string, source: string): Skill {
  const match = FRONTMATTER.exec(source);
  if (!match) {
    throw new SkillLoadError(
      `${path} has no YAML frontmatter. A skill starts with a --- delimited block ` +
        `carrying name, description and disable-model-invocation.`,
    );
  }

  const [, raw = '', body = ''] = match;

  let data: unknown;
  try {
    data = parse(raw);
  } catch (error) {
    throw new SkillLoadError(
      `${path} frontmatter is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const parsed = SkillFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    throw new SkillLoadError(
      `${path} frontmatter does not match the schema:\n` +
        parsed.error.issues
          .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('\n'),
    );
  }

  const known = V1_SKILLS.find((s) => s.id === parsed.data.name);
  const kind: SkillKind = known?.kind ?? 'reference';

  if (body.trim().length === 0) {
    throw new SkillLoadError(`${path} has frontmatter but no procedure.`);
  }

  return { frontmatter: parsed.data, kind, body, path };
}

export function loadSkills(skillsDir: string): Skill[] {
  if (!existsSync(skillsDir)) {
    throw new SkillLoadError(`no skills directory at ${skillsDir}`);
  }

  const skills: Skill[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'reference') continue;
    const file = join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    skills.push(parseSkill(`${entry.name}/SKILL.md`, readFileSync(file, 'utf8')));
  }
  return skills.sort((a, b) => a.frontmatter.name.localeCompare(b.frontmatter.name));
}

export interface SkillProblem {
  readonly skill: string;
  readonly field: string;
  readonly message: string;
}

/** Where the interesting mistakes are: an unlisted skill, a model-triggerable router. */
export function validateSkills(skills: readonly Skill[]): SkillProblem[] {
  const problems: SkillProblem[] = [];
  const present = new Map(skills.map((s) => [s.frontmatter.name, s]));

  for (const expected of V1_SKILLS) {
    if (!present.has(expected.id)) {
      problems.push({
        skill: expected.id,
        field: '(missing)',
        message: `the v1 catalog lists this skill but skills/${expected.id}/SKILL.md does not exist`,
      });
    }
  }

  for (const skill of skills) {
    const { name, description } = skill.frontmatter;
    const flag = skill.frontmatter['disable-model-invocation'];

    if (!V1_SKILLS.some((s) => s.id === name)) {
      problems.push({
        skill: name,
        field: 'name',
        message:
          'not part of the v1 catalog. Add it to V1_SKILLS with a kind, or remove the folder — ' +
          'a catalog nobody enumerated is one nobody maintains.',
      });
      continue;
    }

    if (flag !== expectedInvocationFlag(name)) {
      problems.push({
        skill: name,
        field: 'disable-model-invocation',
        message: `expected ${String(expectedInvocationFlag(name))}. A user-invoked skill that a model can trigger fires on prompts that merely mention testing.`,
      });
    }

    // Loaded on every turn for anything model-invocable. Three sentences is the ceiling.
    const sentences = description.split(/[.!?](\s|$)/).filter((s) => s.trim().length > 0).length;
    if (sentences > 6) {
      problems.push({
        skill: name,
        field: 'description',
        message: 'longer than three sentences — this is a context budget line, not documentation.',
      });
    }
    if (description.length > 400) {
      problems.push({
        skill: name,
        field: 'description',
        message: `${description.length} characters. Keep it under 400: it is loaded whether or not the skill runs.`,
      });
    }
  }

  return problems;
}

export function formatSkillProblems(problems: readonly SkillProblem[]): string {
  return problems.map((p) => `  ${p.skill} · ${p.field}\n      ${p.message}`).join('\n');
}
