import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { analyze } from '../src/analyze.js';
import { loadKnowledge } from '../src/agent-kb/load-knowledge.js';
import { indexKnowledge } from '../src/knowledge/index.js';
import { loadRules } from '../src/loader.js';
import { isEnforceable } from '../src/schema/constitution.js';

/**
 * The contract every enforceable rule signs: it fires on `bad.ts` and stays
 * silent on `good.ts`.
 *
 * Each fixture runs with every *other* rule disabled. Without that, a `good.ts`
 * written to satisfy one rule would trip another — a page object's `good.ts`
 * legitimately contains a locator, which no-locators-in-tests flags — and the
 * suite would test rule interactions rather than rule behaviour.
 */

const FIXTURES = join(import.meta.dirname, 'fixtures');

/**
 * One virtual path for every fixture, chosen to fall inside the scope of all
 * ten enforceable rules at once: it matches `**\/*.ts` and `tests/**\/*.ts`, and
 * is excluded by neither `*.config.ts` nor `*.setup.ts`.
 */
const VIRTUAL_PATH = 'tests/app/functional/fixture.spec.ts';

const rules = loadRules(join(import.meta.dirname, '..', '..', '..', 'rules'));
const enforceable = rules.constitution.rules.filter(isEnforceable);

/**
 * Fixed, so that a fixture's knowledge base never ages out from under the test: the
 * ones that exist were written a day before this.
 */
const NOW = new Date('2026-10-01T12:00:00Z');

/**
 * A rule that checks against the knowledge base is given the `.agent-kb` that sits
 * inside its fixture directory, if it has one. Any rule can use this; none is special.
 */
function knowledgeFor(ruleId: string) {
  const dir = join(FIXTURES, ruleId);
  return existsSync(join(dir, '.agent-kb'))
    ? indexKnowledge(loadKnowledge(dir, NOW).kb)
    : undefined;
}

function analyzeOnly(ruleId: string, text: string) {
  const knowledge = knowledgeFor(ruleId);
  return analyze({
    files: [{ path: VIRTUAL_PATH, text }],
    constitution: rules.constitution,
    tags: rules.tags,
    disabled: rules.constitution.rules.filter((r) => r.id !== ruleId).map((r) => r.id),
    now: NOW,
    ...(knowledge === undefined ? {} : { knowledge }),
  });
}

function readFixture(ruleId: string, variant: 'good' | 'bad'): string {
  return readFileSync(join(FIXTURES, ruleId, `${variant}.ts`), 'utf8');
}

describe('fixture coverage', () => {
  it('has a fixture pair for every enforceable rule', () => {
    const present = readdirSync(FIXTURES, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(present).toEqual(enforceable.map((r) => r.id).sort());
  });

  it('has no fixture directory for a rule that no longer exists', () => {
    const ids = new Set(rules.constitution.rules.map((r) => r.id));
    for (const dir of readdirSync(FIXTURES)) {
      expect(ids.has(dir), `${dir}/ has no matching rule`).toBe(true);
    }
  });
});

describe.each(enforceable.map((r) => [r.id, r] as const))('%s', (ruleId, rule) => {
  it('reports the bad fixture', () => {
    const { diagnostics, skipped, notChecked } = analyzeOnly(ruleId, readFixture(ruleId, 'bad'));
    expect(skipped).toEqual([]);
    expect(notChecked).toEqual([]);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.ruleId === ruleId)).toBe(true);
    expect(diagnostics.every((d) => d.severity === rule.severity)).toBe(true);
  });

  it('leaves the good fixture alone', () => {
    const { diagnostics, skipped } = analyzeOnly(ruleId, readFixture(ruleId, 'good'));
    expect(skipped).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('reports stable positions and messages', async () => {
    const { diagnostics } = analyzeOnly(ruleId, readFixture(ruleId, 'bad'));
    await expect(
      diagnostics.map((d) => `${d.line}:${d.column}-${d.endLine}:${d.endColumn}  ${d.snippet}`),
    ).toMatchFileSnapshot(join(FIXTURES, ruleId, 'expected.snap'));
  });

  it('carries a fix only when the constitution says it is autofixable', () => {
    const { diagnostics } = analyzeOnly(ruleId, readFixture(ruleId, 'bad'));
    for (const d of diagnostics) {
      expect(d.fix !== undefined).toBe(rule.autofix);
    }
  });
});
