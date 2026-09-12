import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import parser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { analyze, isEnforceable, loadRules } from '@understudy/engine';
import { afterAll, describe, expect, it } from 'vitest';
import { rules } from '../src/index.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/**
 * The plugin and the engine are two consumers of one constitution, so the test
 * that earns its keep is not "does this rule fire" — it is "do both halves agree
 * about where and how often".
 *
 * Every case below is driven from the engine's own fixtures: the expected error
 * positions are computed by running the engine, and then asserted against
 * ESLint. If a refinement, a scope glob, or a selector ever starts meaning
 * something different on the two sides, this suite fails rather than the
 * guarantee quietly hollowing out.
 */

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const fixtures = join(repoRoot, 'packages', 'engine', 'test', 'fixtures');
const rulesData = loadRules(join(repoRoot, 'rules'));
const enforceable = rulesData.constitution.rules.filter(isEnforceable);

/** Matches the scope of every enforceable rule; see the engine fixture suite. */
const VIRTUAL_PATH = 'tests/app/functional/fixture.spec.ts';
const filename = join(process.cwd(), ...VIRTUAL_PATH.split('/'));

const readFixture = (ruleId: string, variant: 'good' | 'bad'): string =>
  readFileSync(join(fixtures, ruleId, `${variant}.ts`), 'utf8');

function engineDiagnostics(ruleId: string, code: string) {
  return analyze({
    files: [{ path: VIRTUAL_PATH, text: code }],
    constitution: rulesData.constitution,
    tags: rulesData.tags,
    disabled: rulesData.constitution.rules.filter((r) => r.id !== ruleId).map((r) => r.id),
  }).diagnostics;
}

const ruleTester = new RuleTester({ languageOptions: { parser } });

describe('every enforceable rule is exported', () => {
  it('exports one ESLint rule per enforceable constitution rule', () => {
    expect(Object.keys(rules).sort()).toEqual(enforceable.map((r) => r.id).sort());
  });

  it('marks exactly the autofixable rules as fixable', () => {
    for (const rule of enforceable) {
      expect(rules[rule.id]?.meta.fixable !== undefined, rule.id).toBe(rule.autofix);
    }
  });

  it('carries the constitution message verbatim, so a block explains itself', () => {
    for (const rule of enforceable) {
      expect(rules[rule.id]?.meta.messages.violation).toBe(
        rule.message.replace(/\s+/g, ' ').trim(),
      );
    }
  });
});

for (const rule of enforceable) {
  const bad = readFixture(rule.id, 'bad');
  const good = readFixture(rule.id, 'good');
  const expected = engineDiagnostics(rule.id, bad);

  ruleTester.run(rule.id, rules[rule.id] as never, {
    valid: [{ code: good, filename }],
    invalid: [
      {
        code: bad,
        filename,
        errors: expected.map((d) => ({
          messageId: 'violation' as const,
          line: d.line,
          column: d.column,
        })),
        ...(rule.autofix ? { output: applyFixes(bad, expected) } : {}),
      },
    ],
  });
}

/** Applies the engine's own fixes, back to front so earlier ranges stay valid. */
function applyFixes(code: string, diagnostics: ReturnType<typeof engineDiagnostics>): string {
  const fixes = diagnostics
    .flatMap((d) => (d.fix ? [d.fix] : []))
    .sort((a, b) => b.range[0] - a.range[0]);
  let out = code;
  for (const fix of fixes) {
    out = out.slice(0, fix.range[0]) + fix.text + out.slice(fix.range[1]);
  }
  return out;
}

/**
 * `no-locators-in-tests` is scoped to `tests/**`. A page object legitimately
 * contains exactly the locators that fixture declares to be violations, so
 * running the same code through a `pages/` filename proves the scope is doing
 * the work rather than the selector.
 */
ruleTester.run('no-locators-in-tests (outside its scope)', rules['no-locators-in-tests'] as never, {
  valid: [
    {
      code: readFixture('no-locators-in-tests', 'bad'),
      filename: join(process.cwd(), 'pages', 'app', 'login.page.ts'),
    },
  ],
  invalid: [],
});
