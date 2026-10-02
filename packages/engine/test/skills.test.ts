import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRules } from '../src/loader.js';
import { V1_SKILLS, expectedInvocationFlag } from '../src/schema/skill.js';
import { loadSkills, parseSkill, SkillLoadError, validateSkills } from '../src/skills.js';

/**
 * The catalog is the light distribution channel: taken with `npx skills add`, with
 * no engine and nothing else validating it at the far end.
 *
 * What matters is what a reader cannot check themselves — every skill present, no
 * router firing on its own, and the rules quoted in `reference/` being the rules
 * actually enforced.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const SKILLS = join(REPO_ROOT, 'skills');

const skills = loadSkills(SKILLS);
const rules = loadRules(join(REPO_ROOT, 'rules'));

describe('the catalog', () => {
  it('has exactly the skills v1 promises', () => {
    expect(skills.map((s) => s.frontmatter.name).sort()).toEqual(V1_SKILLS.map((s) => s.id).sort());
  });

  it('passes its own validation', () => {
    expect(validateSkills(skills)).toEqual([]);
  });

  it.each(V1_SKILLS.map((s) => [s.id, s] as const))(
    '%s declares the right invocation mode',
    (id) => {
      const skill = skills.find((s) => s.frontmatter.name === id);
      expect(skill?.frontmatter['disable-model-invocation']).toBe(expectedInvocationFlag(id));
    },
  );

  it('lets a model invoke only the skills that are safe to trigger', () => {
    // A router that fires because a prompt mentioned testing is a nuisance.
    const invocable = skills
      .filter((s) => !s.frontmatter['disable-model-invocation'])
      .map((s) => s.frontmatter.name)
      .sort();
    expect(invocable).toEqual(['compose', 'resolve-locator', 'resolve-owner', 'understudy']);
  });

  it('keeps every description inside the context budget', () => {
    for (const skill of skills) {
      // Loaded every turn whether the skill runs or not: a budget line.
      expect(skill.frontmatter.description.length, skill.frontmatter.name).toBeLessThan(400);
    }
  });

  it('gives every skill a procedure and a way to tell it worked', () => {
    for (const skill of skills) {
      expect(skill.body, skill.frontmatter.name).toContain('## Procedure');
      expect(skill.body.toLowerCase(), skill.frontmatter.name).toContain('it is working if');
    }
  });
});

describe('frontmatter parsing', () => {
  it('rejects a file with no frontmatter', () => {
    expect(() => parseSkill('x/SKILL.md', '# just a heading\n')).toThrow(SkillLoadError);
  });

  it('rejects an unknown field rather than ignoring it', () => {
    const source = [
      '---',
      'name: compose',
      'description: x',
      'disable-model-invocation: false',
      'invented-field: true',
      '---',
      'body',
      '',
    ].join('\n');
    expect(() => parseSkill('x/SKILL.md', source)).toThrow(SkillLoadError);
  });

  it('rejects frontmatter with no procedure after it', () => {
    const source = [
      '---',
      'name: compose',
      'description: x',
      'disable-model-invocation: false',
      '---',
      '',
      '',
    ].join('\n');
    expect(() => parseSkill('x/SKILL.md', source)).toThrow(SkillLoadError);
  });
});

describe('generated reference', () => {
  const referenceFor = (id: string): string =>
    readFileSync(join(SKILLS, 'reference', `${id}.md`), 'utf8');

  it('has a page for every skill the constitution cites', () => {
    const cited = new Set(rules.constitution.rules.map((r) => r.skill));
    for (const id of cited) {
      expect(() => referenceFor(id), id).not.toThrow();
    }
  });

  it('quotes the rules that are actually enforced', () => {
    // A reference quoting a changed rule is worse than none: wrong with authority.
    for (const rule of rules.constitution.rules) {
      const page = referenceFor(rule.skill);
      expect(page, `${rule.skill} should document ${rule.id}`).toContain(`### ${rule.id}`);
      expect(page).toContain(rule.tier);
    }
  });

  it('says plainly when a rule is not mechanically enforced', () => {
    // There may be none: every rule can become mechanical. Then there is nothing to label.
    const manual = rules.constitution.rules.filter((r) => r.detector.kind === 'manual');
    for (const rule of manual) {
      expect(referenceFor(rule.skill)).toContain('**not enforced**');
    }
  });

  it('says when a rule is enforced only where a knowledge base exists', () => {
    const knowledge = rules.constitution.rules.filter((r) => r.detector.kind === 'knowledge');
    expect(knowledge.map((r) => r.id)).toContain('selectors-from-agent-kb');
    for (const rule of knowledge) {
      expect(referenceFor(rule.skill)).toContain('enforced by ESLint, against `.agent-kb`');
    }
  });

  it('marks a reference with no rules as deliberate rather than empty', () => {
    // seed-policy has an owner but no rule yet.
    expect(referenceFor('seed-policy')).toContain('No rule cites this reference yet');
  });
});

describe('the catalog points at the guarantee', () => {
  it('says what the skills channel does not give you', () => {
    const readme = readFileSync(join(SKILLS, 'README.md'), 'utf8');
    // Skills-only users should learn from the skills that they have no enforcement.
    expect(readme).toContain('does not get you the **guarantee**');
    expect(readme).toContain('understudy init');
  });

  it('credits the upstream sources it composes', () => {
    const readme = readFileSync(join(SKILLS, 'README.md'), 'utf8');
    expect(readme).toContain('Microsoft');
    expect(readme).toContain('Currents');
    expect(readme).toContain('not\naffiliated');
  });
});
