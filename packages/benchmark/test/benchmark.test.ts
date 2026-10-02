import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashSnapshot, loadRules, parseSnapshot, writeRouteMap } from '@wiluszdamian/cue-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RecordedAgent, extractCode } from '../src/agent.js';
import { PROMPTS, PROMPT_SET_VERSION } from '../src/prompts.js';
import { formatReport } from '../src/report.js';
import { buildContext, compare, runBenchmark } from '../src/runner.js';
import { scoreCompliance, scoreGrounding } from '../src/scoring.js';

/**
 * Tests for the measuring instrument, not the thing measured. The recordings are
 * hand-written fixtures: they show the scoring counts what it claims to, and
 * nothing about whether Cue helps, since one person wrote both.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const RECORDINGS = join(import.meta.dirname, 'recordings');
const rules = loadRules(join(REPO_ROOT, 'rules'));

const SNAPSHOT = `### Page
- Page URL: http://localhost:3000/login
- Page Title: Sign in
### Snapshot
\`\`\`yaml
- main [ref=e2]:
  - heading "Welcome back" [level=1] [ref=e3]
  - textbox "Email" [ref=e5]
  - button "Log in" [ref=e7]
\`\`\`
`;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cue-bench-'));
  const parsed = parseSnapshot(SNAPSHOT);
  const now = new Date().toISOString();
  writeRouteMap(root, {
    schemaVersion: 1,
    route: '/login',
    title: parsed.title,
    exploredAt: now,
    verifiedAt: now,
    snapshotHash: hashSnapshot(parsed.tree),
    elements: [...parsed.elements],
    links: [],
    gaps: [],
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the prompt set', () => {
  it('is versioned, so a run can be compared with an earlier one', () => {
    expect(PROMPT_SET_VERSION).toBeGreaterThan(0);
  });

  it('never hints at the rules it is measuring', () => {
    // A prompt saying "remember to tag the test" would measure the prompt.
    for (const prompt of PROMPTS) {
      const text = prompt.text.toLowerCase();
      for (const giveaway of ['cue', 'constitution', 'page object', '@smoke', 'tag the']) {
        expect(text, `${prompt.id} mentions "${giveaway}"`).not.toContain(giveaway);
      }
    }
  });

  it('exercises rules that actually exist', () => {
    const known = new Set(rules.constitution.rules.map((r) => r.id));
    for (const prompt of PROMPTS) {
      for (const ruleId of prompt.exercises) {
        expect(known.has(ruleId), `${prompt.id} names unknown rule ${ruleId}`).toBe(true);
      }
    }
  });
});

describe('compliance scoring', () => {
  it('counts violations per file, not in total', () => {
    const source =
      "import { test } from '@playwright/test';\ntest('x', async ({ page }) => { await page.waitForTimeout(1); });\n";
    const one = scoreCompliance(
      [{ path: 'tests/app/functional/a.spec.ts', source }],
      rules.constitution,
      rules.tags,
    );
    const two = scoreCompliance(
      [
        { path: 'tests/app/functional/a.spec.ts', source },
        { path: 'tests/app/functional/b.spec.ts', source },
      ],
      rules.constitution,
      rules.tags,
    );
    // Otherwise a chattier model looks worse for free.
    expect(two.violations).toBe(one.violations * 2);
    expect(two.violationsPerFile).toBe(one.violationsPerFile);
  });

  it('does not penalise a page object for holding locators', () => {
    const pageObject = `import type { Page } from '@playwright/test';
export class LoginPage {
  constructor(private readonly page: Page) {}
  get logInButton() {
    return this.page.getByRole('button', { name: 'Log in' });
  }
}
`;
    // Scored as a spec this breaks no-locators-in-tests — exactly backwards.
    const asPageObject = scoreCompliance(
      [{ path: 'pages/app/login.page.ts', source: pageObject }],
      rules.constitution,
      rules.tags,
    );
    const asSpec = scoreCompliance(
      [{ path: 'tests/app/functional/login.spec.ts', source: pageObject }],
      rules.constitution,
      rules.tags,
    );
    expect(asPageObject.violations).toBe(0);
    expect(asSpec.violations).toBeGreaterThan(0);
  });

  it('counts a file that will not parse rather than dropping it', () => {
    const broken = scoreCompliance(
      [{ path: 'tests/app/functional/a.spec.ts', source: 'this is not typescript {{{' }],
      rules.constitution,
      rules.tags,
    );
    expect(broken.unparsed).toBe(1);
  });
});

describe('grounding scoring', () => {
  const file = (source: string) => [{ path: 'tests/app/functional/a.spec.ts', source }];

  it('counts a selector the knowledge base has seen as grounded', () => {
    const score = scoreGrounding(file("page.getByRole('button', { name: 'Log in' });"), root);
    expect(score.grounded).toBe(1);
    expect(score.invented).toBe(0);
    expect(score.groundedRate).toBe(1);
  });

  it('counts one nobody has ever seen as invented', () => {
    const score = scoreGrounding(file("page.getByTestId('checkout-submit-btn');"), root);
    expect(score.invented).toBe(1);
    expect(score.groundedRate).toBe(0);
    expect(score.inventedLocators[0]).toContain('checkout-submit-btn');
  });

  it('refuses to judge a locator built from a variable', () => {
    // Counting these as invented would flatter the with-knowledge-base run.
    const score = scoreGrounding(file('page.getByTestId(selector);'), root);
    expect(score.undecidable).toBe(1);
    expect(score.groundedRate).toBeUndefined();
  });

  it('accepts a correct element addressed a different way', () => {
    // Generous on purpose: strictness would inflate the difference.
    const score = scoreGrounding(file("page.getByLabel('Email');"), root);
    expect(score.grounded).toBe(1);
  });

  it('reports no rate at all when there is nothing to judge', () => {
    expect(scoreGrounding(file('const x = 1;'), root).groundedRate).toBeUndefined();
  });
});

describe('the context handed to the assistant', () => {
  it('is empty in the bare condition', () => {
    expect(buildContext(root, 'bare')).toBe('');
  });

  it('carries the knowledge base in the cue condition', () => {
    const context = buildContext(root, 'cue');
    expect(context).toContain('/login');
    expect(context).toContain("getByRole('button', { name: 'Log in' })");
  });
});

describe('a full run over recorded responses', () => {
  const prompts = PROMPTS.filter((p) => p.id === 'login-success' || p.id === 'slow-page');

  it('scores both conditions and compares them', async () => {
    const result = await runBenchmark({
      projectRoot: root,
      agent: new RecordedAgent(RECORDINGS),
      rules,
      prompts,
    });

    expect(result.conditions).toHaveLength(2);
    expect(result.surveyedRoutes).toEqual(['/login']);

    const comparison = compare(result);
    // Both numbers produced, NOT a direction: these are fixtures.
    expect(comparison.violationsPerFile.bare).toBeGreaterThanOrEqual(0);
    expect(comparison.groundedRate.cue).toBeDefined();
  });

  it('says plainly when the sample does not support the premise', async () => {
    const result = await runBenchmark({
      projectRoot: root,
      agent: new RecordedAgent(RECORDINGS),
      rules,
      prompts,
    });

    const report = formatReport(result);
    expect(report).toContain('Constitution violations per generated file');
    expect(report).toContain('Selectors naming something that actually exists');
    // The report must always disclose the sample size next to the numbers.
    expect(report).toContain(`Sample of ${String(prompts.length)} prompts`);
  });

  it('refuses to invent a missing recording', async () => {
    await expect(
      runBenchmark({
        projectRoot: root,
        agent: new RecordedAgent(join(root, 'nothing-here')),
        rules,
        prompts,
      }),
    ).rejects.toThrow(/No recording/);
  });
});

describe('extracting code from a chat response', () => {
  it('takes the fenced block', () => {
    expect(extractCode('Sure!\n\n```ts\nconst a = 1;\n```\n\nHope that helps.')).toBe(
      'const a = 1;',
    );
  });

  it('joins several blocks', () => {
    expect(extractCode('```ts\nconst a = 1;\n```\ntext\n```ts\nconst b = 2;\n```')).toBe(
      'const a = 1;\n\nconst b = 2;',
    );
  });

  it('treats an unfenced answer as code, so it scores as unparsed rather than zero', () => {
    // Prose and no test is a failure to produce a test, not a perfect score.
    expect(extractCode('I would recommend using Playwright for this.')).toBe(
      'I would recommend using Playwright for this.',
    );
  });
});

describe('the fixtures are labelled as fixtures', () => {
  it('warns, in the directory itself, that they are not results', () => {
    // Somebody will find these without the surrounding context.
    const text = readFileSync(join(RECORDINGS, 'README.md'), 'utf8');
    expect(text).toContain('not benchmark results');
    expect(text).toContain('cannot be evidence');
  });
});
