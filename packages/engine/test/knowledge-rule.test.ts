import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analyze.js';
import { loadKnowledge } from '../src/agent-kb/load-knowledge.js';
import { loadRules } from '../src/loader.js';
import { indexKnowledge } from '../src/knowledge/index.js';

/**
 * `selectors-from-agent-kb` is the one rule that needs something besides code. The
 * promise worth testing is that it never looks clean when it did not look.
 */

const rules = loadRules(join(import.meta.dirname, '..', '..', '..', 'rules'));
const fixture = join(import.meta.dirname, 'fixtures', 'selectors-from-agent-kb');
const NOW = new Date('2026-10-01T12:00:00Z');
const RULE = 'selectors-from-agent-kb';

const BAD = "test('t', async ({ page }) => { await page.getByTestId('invented-id').click(); });";

function run(options: { knowledge?: boolean }) {
  return analyze({
    files: [{ path: 'tests/a.spec.ts', text: BAD }],
    constitution: rules.constitution,
    tags: rules.tags,
    disabled: rules.constitution.rules.filter((r) => r.id !== RULE).map((r) => r.id),
    now: NOW,
    ...(options.knowledge === true
      ? { knowledge: indexKnowledge(loadKnowledge(fixture, NOW).kb) }
      : {}),
  });
}

describe(RULE, () => {
  it('is enforceable, a warning, and not autofixable', () => {
    const rule = rules.constitution.rules.find((r) => r.id === RULE);
    expect(rule?.detector).toEqual({ kind: 'knowledge', check: 'locators' });
    expect(rule?.severity).toBe('warn');
    expect(rule?.autofix).toBe(false);
  });

  it('says it did not run when it was given no knowledge base', () => {
    const result = run({ knowledge: false });
    expect(result.diagnostics).toEqual([]);
    expect(result.notChecked).toHaveLength(1);
    expect(result.notChecked[0]?.ruleId).toBe(RULE);
    expect(result.notChecked[0]?.reason).toContain('nothing was checked');
  });

  it('reports with the rule’s own severity and says what to do, in the constitution’s words', () => {
    const result = run({ knowledge: true });
    expect(result.notChecked).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    const [diagnostic] = result.diagnostics;
    expect(diagnostic).toMatchObject({
      ruleId: RULE,
      severity: 'warn',
      snippet: "getByTestId('invented-id')",
    });
    expect(diagnostic?.message).toContain('does not trace to .agent-kb');
    expect(diagnostic?.message).toContain('cue survey');
  });

  it('does not mention the rule at all for a file outside its scope', () => {
    const result = analyze({
      files: [{ path: 'README.md', text: BAD }],
      constitution: rules.constitution,
      tags: rules.tags,
      disabled: rules.constitution.rules.filter((r) => r.id !== RULE).map((r) => r.id),
    });
    expect(result.notChecked).toEqual([]);
  });
});
