import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  apiId,
  buildTaskContext,
  estimateTokens,
  indexKnowledge,
  KnowledgeBuilder,
  loadRules,
  locatorId,
  routeId,
  stemsOf,
  termId,
  type KnowledgeIndex,
} from '../src/index.js';

/**
 * The context a model starts a task with. What matters is that it is about the right
 * page, that it fits the budget it was given, and that it never drops the two things
 * that have to be there: the policy and the ages.
 */

const rules = loadRules(join(import.meta.dirname, '..', '..', '..', 'rules')).constitution.rules;
const NOW = new Date('2026-10-02T12:00:00.000Z');
const RECENT = '2026-10-01T12:00:00.000Z';

function demo(options: { extraRoutes?: number } = {}): KnowledgeIndex {
  const builder = new KnowledgeBuilder();
  const browser = (route: string): string =>
    builder.addEvidence({ type: 'browser', route, environment: 'dev', observedAt: RECENT });
  const code = (file: string, line: number): string =>
    builder.addEvidence({ type: 'source-code', file, line });

  const route = (path: string, title: string): void => {
    builder.addFact({
      id: routeId(path),
      kind: 'route',
      path,
      title,
      status: 'verified',
      evidence: [browser(path)],
      verifiedAt: RECENT,
    });
  };
  const locator = (path: string, role: string, name: string, expression: string): void => {
    builder.addFact({
      id: locatorId(path, role, name),
      kind: 'locator',
      route: routeId(path),
      role,
      name,
      expression,
      status: 'verified',
      evidence: [browser(path)],
      verifiedAt: RECENT,
    });
  };

  route('/login', 'Sign in');
  locator('/login', 'textbox', 'Email', "page.getByRole('textbox', { name: 'Email' })");
  locator('/login', 'textbox', 'Password', "page.getByLabel('Password')");
  locator('/login', 'button', 'Log in', "page.getByRole('button', { name: 'Log in' })");

  route('/settings', 'Account settings');
  locator(
    '/settings',
    'textbox',
    'New password',
    "page.getByRole('textbox', { name: 'New password' })",
  );
  locator(
    '/settings',
    'button',
    'Change password',
    "page.getByRole('button', { name: 'Change password' })",
  );

  route('/items', 'Items');
  locator('/items', 'button', 'Add item', "page.getByRole('button', { name: 'Add item' })");
  locator('/items', 'textbox', 'Item name', "page.getByRole('textbox', { name: 'Item name' })");

  builder.addFact({
    id: apiId('POST', '/api/password'),
    kind: 'api',
    method: 'POST',
    path: '/api/password',
    status: 'observed',
    evidence: [code('src/api/password.ts', 12)],
  });
  builder.addFact({
    id: termId('password.change'),
    kind: 'term',
    key: 'password.change',
    label: 'Change password',
    status: 'observed',
    evidence: [code('locales/en.json', 4)],
  });

  for (let i = 0; i < (options.extraRoutes ?? 0); i += 1)
    route(`/reports/r${String(i)}`, `Report ${String(i)}`);
  return indexKnowledge(builder.build());
}

describe('stemsOf', () => {
  it('meets "changing", "changed" and "change" at one stem', () => {
    const stems = ['changing', 'changed', 'change', 'changes'].map((w) => stemsOf(w)[0]);
    expect(new Set(stems).size).toBe(1);
  });

  it('leaves short words and double s alone', () => {
    expect(stemsOf('pass')).toEqual(['pass']);
    expect(stemsOf('bus')).toEqual(['bus']);
  });
});

describe('buildTaskContext', () => {
  it.each([
    ['test password change', '/settings'],
    ['log in with a wrong password', '/login'],
    ['add an item to the list', '/items'],
  ])('"%s" is about %s', (task, route) => {
    const context = buildTaskContext(demo(), rules, { task }, { now: NOW });
    expect(context.found).toBe(true);
    expect(context.routes[0]).toBe(route);
    expect(context.text).toContain(`Applicable route: ${route}`);
  });

  it('names the elements that match, with their real locators', () => {
    const { text } = buildTaskContext(
      demo(),
      rules,
      { task: 'test password change' },
      { now: NOW },
    );
    expect(text).toContain("getByRole('button', { name: 'Change password' })");
    expect(text).not.toContain("name: 'Email'");
  });

  it('includes the endpoint and the vocabulary the task touches', () => {
    const { text } = buildTaskContext(
      demo(),
      rules,
      { task: 'test password change' },
      { now: NOW },
    );
    expect(text).toContain('POST /api/password · src/api/password.ts:12');
    expect(text).toContain('password.change = Change password');
  });

  it('always carries the policy and the freshness', () => {
    const { text } = buildTaskContext(
      demo(),
      rules,
      { task: 'test password change' },
      { now: NOW },
    );
    expect(text).toContain('## Policy');
    expect(text).toContain('MUST_NOT No hard waits');
    expect(text).toContain('freshness: fresh');
  });

  it('points to get_evidence for the ids behind what it said', () => {
    const { text } = buildTaskContext(
      demo(),
      rules,
      { task: 'test password change' },
      { now: NOW },
    );
    expect(text).toContain('Deeper (get_evidence):');
    expect(text).toContain('route:/settings');
  });

  it('prefers the route it was told about', () => {
    const { routes } = buildTaskContext(
      demo(),
      rules,
      { task: 'password', route: '/login' },
      { now: NOW },
    );
    expect(routes[0]).toBe('/login');
  });

  it('is the same answer every time for the same question', () => {
    const first = buildTaskContext(demo(), rules, { task: 'add item' }, { now: NOW });
    const second = buildTaskContext(demo(), rules, { task: 'add item' }, { now: NOW });
    expect(second.text).toBe(first.text);
  });

  it('says how old a fact is when it is old', () => {
    const later = new Date('2026-12-01T00:00:00.000Z');
    const { text } = buildTaskContext(demo(), rules, { task: 'add item' }, { now: later });
    expect(text).toContain('freshness: stale');
  });

  it('says unknown, with the known routes and the way out, for an unrelated task', () => {
    const context = buildTaskContext(demo(), rules, { task: 'reconcile the ledger' }, { now: NOW });
    expect(context.found).toBe(false);
    expect(context.text).toContain('status: unknown');
    expect(context.text).toContain('/login');
    expect(context.text).toContain('understudy survey --route');
  });

  it('lists at most ten known routes when it does not know', () => {
    const context = buildTaskContext(
      demo({ extraRoutes: 30 }),
      rules,
      { task: 'reconcile the ledger' },
      { now: NOW },
    );
    expect(context.text).toContain('more)');
    expect(context.text.match(/\/reports\/r\d+/g)?.length ?? 0).toBeLessThanOrEqual(10);
  });

  it('says unknown for an empty knowledge base', () => {
    const context = buildTaskContext(
      indexKnowledge(new KnowledgeBuilder().build()),
      rules,
      { task: 'add item' },
      { now: NOW },
    );
    expect(context.found).toBe(false);
    expect(context.text).toContain('Routes known: none.');
  });
});

describe('the budget', () => {
  const tasks = [
    'test password change',
    'log in with a wrong password',
    'add an item to the list',
    'reconcile the ledger',
    'password '.repeat(400),
  ];

  it.each([300, 1200, 3000])('holds at %i tokens for every task', (maxTokens) => {
    for (const task of tasks) {
      const context = buildTaskContext(
        demo({ extraRoutes: 40 }),
        rules,
        { task, maxTokens },
        { now: NOW },
      );
      expect(context.tokens, task).toBeLessThanOrEqual(maxTokens);
      expect(estimateTokens(context.text), task).toBeLessThanOrEqual(maxTokens);
    }
  });

  it('never trades the policy or the ages for room', () => {
    const { text } = buildTaskContext(
      demo(),
      rules,
      { task: 'test password change', maxTokens: 300 },
      { now: NOW },
    );
    expect(text).toContain('## Policy');
    expect(text).toContain('freshness:');
  });

  it('drops what matters least first: the second route, vocabulary, then endpoints', () => {
    const roomy = buildTaskContext(
      demo(),
      rules,
      { task: 'password', maxTokens: 3000 },
      { now: NOW },
    );
    const tight = buildTaskContext(
      demo(),
      rules,
      { task: 'password', maxTokens: 300 },
      { now: NOW },
    );
    expect(roomy.text.length).toBeGreaterThan(tight.text.length);
    expect(roomy.text).toContain('## Vocabulary');
    expect(tight.text).not.toContain('Also possibly');
  });

  it('clamps a budget outside the range it promises', () => {
    const huge = buildTaskContext(
      demo(),
      rules,
      { task: 'password', maxTokens: 1e9 },
      { now: NOW },
    );
    const tiny = buildTaskContext(demo(), rules, { task: 'password', maxTokens: 1 }, { now: NOW });
    expect(huge.tokens).toBeLessThanOrEqual(3000);
    expect(tiny.tokens).toBeLessThanOrEqual(300);
  });
});
