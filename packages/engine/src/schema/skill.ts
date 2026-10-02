import { z } from 'zod';

/**
 * Schema for a skill in `skills/`. The catalog can be taken with `npx skills add`
 * and the engine never installed, so the frontmatter is the whole contract.
 */

export const SKILL_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * `user` — invoked by a person with a slash; a router that fires because a prompt
 *   mentioned testing is a nuisance. `model` — narrow and cheap, safe mid-task.
 * `reference` — cited by other skills, never runs a session of its own.
 */
export const SkillKindSchema = z.enum(['user', 'model', 'reference']);

export const SkillFrontmatterSchema = z.strictObject({
  name: z.string().regex(SKILL_ID, 'skill name must be kebab-case'),
  /** One to three sentences. Loaded every turn for model-invocable skills: a budget line. */
  description: z.string().min(1),
  'disable-model-invocation': z.boolean(),
});

export const SkillSchema = z.strictObject({
  frontmatter: SkillFrontmatterSchema,
  kind: SkillKindSchema,
  body: z.string().min(1),
  /** Path relative to `skills/`. */
  path: z.string().min(1),
});

export type SkillKind = z.infer<typeof SkillKindSchema>;
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
export type Skill = z.infer<typeof SkillSchema>;

/** Fixed here, not read from disk, so a missing folder errors instead of shortening the catalog. */
export const V1_SKILLS: readonly { id: string; kind: SkillKind; group: string }[] = [
  { id: 'cue', kind: 'model', group: 'Getting started' },
  { id: 'compass', kind: 'user', group: 'Getting started' },
  { id: 'bind', kind: 'user', group: 'Getting started' },
  { id: 'survey', kind: 'user', group: 'Main flow' },
  { id: 'extract', kind: 'user', group: 'Main flow' },
  { id: 'pin', kind: 'user', group: 'Main flow' },
  { id: 'compose', kind: 'user', group: 'Main flow' },
  { id: 'inspect', kind: 'user', group: 'Main flow' },
  { id: 'resolve-owner', kind: 'model', group: 'Invoked layer' },
  { id: 'resolve-locator', kind: 'model', group: 'Invoked layer' },
];

/**
 * `cue` is the on-ramp and `compose` the one flow skill a model may invoke.
 * "Write a test here" is worth picking up unprompted; "set this repository up" is not.
 */
export const MODEL_INVOCABLE = new Set(['cue', 'compose', 'resolve-owner', 'resolve-locator']);

export function expectedInvocationFlag(id: string): boolean {
  return !MODEL_INVOCABLE.has(id);
}
