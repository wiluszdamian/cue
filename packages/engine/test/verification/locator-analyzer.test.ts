import { describe, expect, it } from 'vitest';
import {
  indexKnowledge,
  KnowledgeBuilder,
  locatorId,
  routeId,
  testIdFactId,
  type FactStatus,
  type KnowledgeIndex,
} from '../../src/knowledge/index.js';
import {
  analyzeLocators,
  type LocatorFinding,
  type LocatorVerdict,
} from '../../src/verification/index.js';

/**
 * Each case is a way the checker could be wrong in either direction: a false
 * positive (flagging something real, which gets the rule switched off) or a false
 * negative (blessing something invented, which defeats the point).
 */

const NOW = new Date('2026-10-01T12:00:00Z');
const FRESH = '2026-09-30T00:00:00.000Z';
const OLD = '2026-07-01T00:00:00.000Z';

interface Entry {
  route: string;
  role: string;
  name: string;
  status?: FactStatus;
  verifiedAt?: string | null;
  testId?: string;
}

function knowledge(entries: Entry[], extra: { testIdsOnly?: string[] } = {}): KnowledgeIndex {
  const builder = new KnowledgeBuilder();
  const browser = builder.addEvidence({ type: 'browser', route: '/', observedAt: FRESH });
  const source = builder.addEvidence({ type: 'source-code', file: 'src/a.tsx', line: 1 });

  for (const route of new Set(entries.map((e) => e.route))) {
    builder.addFact({
      id: routeId(route),
      kind: 'route',
      path: route,
      status: 'observed',
      evidence: [browser],
    });
  }
  for (const entry of entries) {
    const status = entry.status ?? 'observed';
    const verifiedAt = entry.verifiedAt === undefined ? FRESH : (entry.verifiedAt ?? undefined);
    builder.addFact({
      id: locatorId(entry.route, entry.role, entry.name),
      kind: 'locator',
      route: routeId(entry.route),
      role: entry.role,
      name: entry.name,
      expression: `getByRole('${entry.role}', { name: '${entry.name}' })`,
      ...(entry.testId === undefined ? {} : { testId: entry.testId }),
      status,
      evidence: [browser],
      ...(verifiedAt === undefined ? {} : { verifiedAt }),
    });
  }
  for (const id of extra.testIdsOnly ?? []) {
    builder.addFact({
      id: testIdFactId(id),
      kind: 'test-id',
      testId: id,
      status: 'observed',
      evidence: [source],
    });
  }
  return indexKnowledge(builder.build());
}

const APP = [
  { route: '/login', role: 'button', name: 'Log in', testId: 'login-submit' },
  { route: '/login', role: 'textbox', name: 'Email' },
  { route: '/login', role: 'textbox', name: 'Password' },
  { route: '/login', role: 'link', name: 'Forgot password?' },
  { route: '/login', role: 'button', name: 'Log in with SSO' },
  { route: '/signup', role: 'button', name: 'Create account' },
  { route: '/signup', role: 'textbox', name: 'Email address' },
  { route: '/settings', role: 'button', name: 'Save changes' },
  { route: '/settings', role: 'button', name: 'Save draft' },
] satisfies Entry[];

const analyze = (source: string, index = knowledge(APP), filePath = 'tests/a.spec.ts') =>
  analyzeLocators({ filePath, source, index, now: NOW });

/** A test on /login, unless the body says otherwise. */
const onLogin = (body: string): string =>
  `test('t', async ({ page }) => {\n  await page.goto('/login');\n  ${body}\n});`;

const verdictOf = (source: string, index?: KnowledgeIndex): LocatorVerdict | undefined =>
  analyze(source, index)[0]?.verdict;

describe('known', () => {
  it.each([
    ['exact name', "page.getByRole('button', { name: 'Log in with SSO' })"],
    ['a different case', "page.getByRole('textbox', { name: 'EMAIL' })"],
    ['a role in upper case', "page.getByRole('TEXTBOX', { name: 'Password' })"],
    ['collapsed whitespace', "page.getByRole('link', { name: '  Forgot   password? ' })"],
    ['a test id', "page.getByTestId('login-submit')"],
    ['a label', "page.getByLabel('Password')"],
    ['an exact name', "page.getByRole('button', { name: 'Log in with SSO', exact: true })"],
  ])('%s', (_what, call) => {
    const [finding] = analyze(onLogin(`await ${call}.click();`));
    expect(finding).toMatchObject({ verdict: 'known', routeContext: '/login' });
    expect(finding?.match?.route).toBe('/login');
  });

  it('accepts a substring when it matches exactly one element, as Playwright does', () => {
    expect(verdictOf(onLogin("page.getByRole('link', { name: 'Forgot' })"))).toBe('known');
  });

  it('reports where in the file it is, from the method name to the closing parenthesis', () => {
    const [finding] = analyze("page.getByRole('textbox', { name: 'Email' });");
    expect(finding).toMatchObject({ line: 1, column: 6, endLine: 1, endColumn: 45 });
  });
});

describe('ambiguous', () => {
  it('flags a bare role that more than one element has', () => {
    const [finding] = analyze(onLogin("page.getByRole('textbox')"));
    expect(finding?.verdict).toBe('ambiguous');
    expect(finding?.suggestion).toContain('2 elements match');
  });

  it('flags a substring that matches two, which Playwright would refuse', () => {
    expect(verdictOf(onLogin("page.getByRole('button', { name: 'Log in' })"))).toBe('ambiguous');
  });

  it('is resolved by exact: true', () => {
    expect(verdictOf(onLogin("page.getByRole('button', { name: 'Log in', exact: true })"))).toBe(
      'known',
    );
  });

  it('does not flag it when a parent narrows it down', () => {
    const findings = analyze(onLogin("page.getByRole('form').getByRole('textbox')"));
    const leaf = findings.find((f) => f.expression === "getByRole('textbox')");
    expect(leaf?.verdict).toBe('known');
  });

  it('treats a locator on this.page as the page, not as a narrowing parent', () => {
    expect(verdictOf("class P { f() { return this.page.getByRole('textbox'); } }\n")).toBe(
      'ambiguous',
    );
  });
});

describe('unknown', () => {
  it('flags an invented name, with the nearest real one', () => {
    const [finding] = analyze(onLogin("page.getByRole('button', { name: 'Sign in' })"));
    expect(finding?.verdict).toBe('unknown');
    expect(finding?.nearest[0]?.expression).toContain('Log in');
    expect(finding?.suggestion).toContain('Nearest known');
    expect(finding?.suggestion).toContain('understudy survey --route /login --base-url <url>');
  });

  it('flags an invented test id', () => {
    expect(verdictOf(onLogin("page.getByTestId('login-submit-btn')"))).toBe('unknown');
  });

  it('flags a name that exists with the wrong role', () => {
    expect(verdictOf(onLogin("page.getByRole('link', { name: 'Log in' })"))).toBe('unknown');
  });

  it('flags an invented label', () => {
    expect(verdictOf(onLogin("page.getByLabel('Phone number')"))).toBe('unknown');
  });

  it('says to extract and survey when nothing is known at all', () => {
    const [finding] = analyze(
      "page.getByRole('button', { name: 'Anything' })",
      indexKnowledge({ modelVersion: 1, facts: [], evidence: [] }),
    );
    expect(finding?.verdict).toBe('unknown');
    expect(finding?.suggestion).toContain('understudy extract');
    expect(finding?.suggestion).toContain('understudy survey');
  });

  it('puts the route the test is on first among the nearest', () => {
    const [finding] = analyze(
      "test('t', async ({ page }) => { await page.goto('/settings'); page.getByRole('button', { name: 'Save' }); });",
    );
    expect(finding?.nearest.map((n) => n.route)).toEqual(['/settings', '/settings']);
  });
});

describe('wrong-route', () => {
  it('flags a real element on a different page', () => {
    const [finding] = analyze(
      "test('t', async ({ page }) => { await page.goto('/login'); page.getByRole('button', { name: 'Create account' }); });",
    );
    expect(finding).toMatchObject({ verdict: 'wrong-route', routeContext: '/login' });
    expect(finding?.match?.route).toBe('/signup');
    expect(finding?.suggestion).toContain('exists on /signup');
  });

  it('understands a full URL and ignores its query string', () => {
    const [finding] = analyze(
      "test('t', async ({ page }) => { await page.goto('https://x.test/signup?next=%2Fa&b=1'); page.getByRole('button', { name: 'Create account' }); });",
    );
    expect(finding).toMatchObject({ verdict: 'known', routeContext: '/signup' });
  });

  it('uses the latest goto before the locator, not an earlier or later one', () => {
    const [first, second, third] = analyze(
      [
        "test('t', async ({ page }) => {",
        "  await page.goto('/login');",
        "  page.getByRole('textbox', { name: 'Password' });",
        "  await page.goto('/signup');",
        "  page.getByRole('textbox', { name: 'Password' });",
        "  page.getByRole('button', { name: 'Create account' });",
        '});',
      ].join('\n'),
    );
    expect(first).toMatchObject({ verdict: 'known', routeContext: '/login' });
    expect(second).toMatchObject({ verdict: 'wrong-route', routeContext: '/signup' });
    expect(third).toMatchObject({ verdict: 'known', routeContext: '/signup' });
  });

  it('does not let one test’s goto leak into the next test', () => {
    const [, second] = analyze(
      [
        "test('a', async ({ page }) => { await page.goto('/login'); page.getByRole('textbox', { name: 'Email' }); });",
        "test('b', async ({ page }) => { page.getByRole('button', { name: 'Create account' }); });",
      ].join('\n'),
    );
    expect(second?.routeContext).toBeUndefined();
    expect(second?.verdict).toBe('known');
  });
});

describe('route from a page object', () => {
  it('uses an understudy-route comment when there is no goto', () => {
    const source = [
      '// understudy-route: /signup',
      'export class SignupPage {',
      "  create() { return this.page.getByRole('button', { name: 'Create account' }); }",
      "  login() { return this.page.getByRole('button', { name: 'Log in with SSO' }); }",
      '}',
    ].join('\n');
    const [create, login] = analyze(source);
    expect(create).toMatchObject({ verdict: 'known', routeContext: '/signup' });
    expect(login).toMatchObject({ verdict: 'wrong-route' });
  });

  it('accepts the annotation in a block comment', () => {
    const [finding] = analyze(
      "/* understudy-route: /signup */\nthis.page.getByRole('button', { name: 'Create account' });",
    );
    expect(finding?.routeContext).toBe('/signup');
  });

  it('judges against every route when a page object has no annotation', () => {
    const [finding] = analyze(
      "class P { go() { return this.page.getByRole('button', { name: 'Create account' }); } }",
    );
    expect(finding).toMatchObject({ verdict: 'known' });
    expect(finding?.routeContext).toBeUndefined();
  });
});

describe('stale and unverified', () => {
  it('flags a fact that failed its last check', () => {
    const index = knowledge([{ route: '/login', role: 'button', name: 'Log in', status: 'stale' }]);
    const [finding] = analyze(onLogin("page.getByRole('button', { name: 'Log in' })"), index);
    expect(finding?.verdict).toBe('stale');
    expect(finding?.suggestion).toContain('failed its last check');
  });

  it('flags a fact nobody has confirmed for over a month', () => {
    const index = knowledge([{ route: '/login', role: 'button', name: 'Log in', verifiedAt: OLD }]);
    const [finding] = analyze(onLogin("page.getByRole('button', { name: 'Log in' })"), index);
    expect(finding?.verdict).toBe('stale');
    expect(finding?.suggestion).toContain('not been confirmed recently');
  });

  it('flags a fact with no date as stale: an undated claim is not a recent one', () => {
    const index = knowledge([
      { route: '/login', role: 'button', name: 'Log in', verifiedAt: null },
    ]);
    expect(verdictOf(onLogin("page.getByRole('button', { name: 'Log in' })"), index)).toBe('stale');
  });

  it('flags an inferred fact as unverified', () => {
    const index = knowledge([
      { route: '/login', role: 'button', name: 'Log in', status: 'inferred' },
    ]);
    const [finding] = analyze(onLogin("page.getByRole('button', { name: 'Log in' })"), index);
    expect(finding?.verdict).toBe('unverified');
  });

  it('flags a test id the source has but no page was seen with', () => {
    const index = knowledge(APP, { testIdsOnly: ['checkout-pay'] });
    const [finding] = analyze(onLogin("page.getByTestId('checkout-pay')"), index);
    expect(finding?.verdict).toBe('unverified');
    expect(finding?.suggestion).toContain('product source has test id');
  });

  it('prefers stale over unverified when both apply', () => {
    const index = knowledge([{ route: '/login', role: 'button', name: 'Log in', status: 'stale' }]);
    expect(verdictOf(onLogin("page.getByRole('button', { name: 'Log in' })"), index)).toBe('stale');
  });
});

describe('undecidable', () => {
  it.each([
    ['a variable name', "const label = 'x'; page.getByRole('button', { name: label })"],
    ['a template with an expression', "page.getByRole('button', { name: `Hi ${user}` })"],
    ['a regular expression name', "page.getByRole('button', { name: /log/i })"],
    ['a variable test id', 'page.getByTestId(id)'],
    ['options from a variable', "page.getByRole('button', opts)"],
    ['spread options', "page.getByRole('button', { ...rest })"],
    ['getByText', "page.getByText('Log in')"],
    ['getByPlaceholder', "page.getByPlaceholder('you@example.com')"],
    ['a CSS locator', "page.locator('css=.btn')"],
    ['a bare locator()', "page.locator('#submit')"],
  ])('%s', (_what, call) => {
    const findings = analyze(onLogin(`${call};`));
    const finding = findings.at(-1);
    expect(finding?.verdict).toBe('undecidable');
    expect(finding?.note).toBeDefined();
    expect(finding?.nearest).toEqual([]);
  });

  it('does not report a bare role as unknown when the knowledge base only keeps named elements', () => {
    const [finding] = analyze(onLogin("page.getByRole('navigation')"));
    expect(finding?.verdict).toBe('undecidable');
    expect(finding?.note).toContain('only named elements');
  });

  it('still judges the other locators in the same file', () => {
    const findings = analyze(
      onLogin("page.getByText('x'); page.getByRole('button', { name: 'Nope' });"),
    );
    expect(findings.map((f) => f.verdict)).toEqual(['undecidable', 'unknown']);
  });
});

describe('chains', () => {
  it('judges each link of page.getByRole(...).getByRole(...)', () => {
    const findings = analyze(
      onLogin(
        "page.getByRole('form', { name: 'Sign in' }).getByRole('button', { name: 'Log in with SSO' });",
      ),
    );
    expect(findings).toHaveLength(2);
    // Both are in the file in source order; the outer call is visited first.
    const verdicts = Object.fromEntries(findings.map((f) => [f.expression, f.verdict]));
    expect(verdicts["getByRole('button', { name: 'Log in with SSO' })"]).toBe('known');
    expect(verdicts["getByRole('form', { name: 'Sign in' })"]).toBe('unknown');
  });
});

describe('an empty or unparseable file', () => {
  it('has nothing to report', () => {
    expect(analyze('')).toEqual([]);
    expect(analyze('const x = 1;')).toEqual([]);
  });

  it('reports nothing rather than throwing on code that does not parse', () => {
    expect(analyze('this is not ( typescript')).toEqual([]);
  });
});

describe('speed', () => {
  it('checks 200 locators against 2,000 facts in well under 200 ms', () => {
    const entries: Entry[] = Array.from({ length: 2000 }, (_, i) => ({
      route: `/page-${String(i % 40)}`,
      role: 'button',
      name: `Action number ${String(i)}`,
    }));
    const index = knowledge(entries);
    const source = Array.from(
      { length: 200 },
      (_, i) => `page.getByRole('button', { name: 'Action number ${String(i * 7)}' });`,
    ).join('\n');

    const started = performance.now();
    const findings: LocatorFinding[] = analyze(source, index);
    const elapsed = performance.now() - started;

    expect(findings).toHaveLength(200);
    expect(elapsed).toBeLessThan(200);
  });
});
