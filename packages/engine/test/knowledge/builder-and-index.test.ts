import { describe, expect, it } from 'vitest';
import {
  indexKnowledge,
  KnowledgeBuilder,
  locatorId,
  parseKnowledge,
  routeId,
  toData,
  validateKnowledge,
  type KnowledgeBase,
  type KnowledgeFact,
} from '../../src/knowledge/index.js';

const NOW = new Date('2026-10-01T12:00:00Z');

function builderWithRoute(): { builder: KnowledgeBuilder; browser: string; source: string } {
  const builder = new KnowledgeBuilder();
  const browser = builder.addEvidence({ type: 'browser', route: '/login' });
  const source = builder.addEvidence({ type: 'source-code', file: 'app/login/page.tsx', line: 1 });
  return { builder, browser, source };
}

const route = (evidence: string[], extra: Partial<KnowledgeFact> = {}): KnowledgeFact =>
  ({
    id: routeId('/login'),
    kind: 'route',
    path: '/login',
    status: 'observed',
    evidence,
    ...extra,
  }) as KnowledgeFact;

describe('KnowledgeBuilder', () => {
  it('records the same evidence once', () => {
    const builder = new KnowledgeBuilder();
    const a = builder.addEvidence({ type: 'browser', route: '/a' });
    const b = builder.addEvidence({ route: '/a', type: 'browser' });
    expect(a).toBe(b);
    expect(builder.build().evidence).toHaveLength(1);
  });

  it('merges two reports of one fact into one that cites both', () => {
    const { builder, browser, source } = builderWithRoute();
    builder.addFact(route([browser]));
    builder.addFact(route([source]));

    const kb = builder.build();
    expect(kb.facts).toHaveLength(1);
    expect(kb.facts[0]?.evidence).toEqual([browser, source]);
    expect(kb.conflicts).toBeUndefined();
  });

  it('adopts a field only the second report had, and never overwrites one the first had', () => {
    const { builder, browser, source } = builderWithRoute();
    builder.addFact(route([browser]));
    builder.addFact(route([source], { title: 'Sign in' }));
    expect(builder.build().facts[0]).toMatchObject({ title: 'Sign in' });

    const second = builderWithRoute();
    second.builder.addFact(route([second.browser], { title: 'First' }));
    second.builder.addFact(route([second.source], { title: 'Second' }));
    expect(second.builder.build().facts[0]).toMatchObject({ title: 'First' });
  });

  it('records a disagreement instead of choosing, with who said what', () => {
    const { builder, browser, source } = builderWithRoute();
    builder.addFact(route([browser], { title: 'Sign in' }));
    builder.addFact(route([source], { title: 'Log in' }));

    expect(builder.build().conflicts).toEqual([
      {
        factId: 'route:/login',
        field: 'title',
        values: [
          { value: 'Sign in', evidence: [browser] },
          { value: 'Log in', evidence: [source] },
        ],
      },
    ]);
  });

  it('does not call it a conflict when only one report has a value', () => {
    const { builder, browser, source } = builderWithRoute();
    builder.addFact(route([browser]));
    builder.addFact(route([source], { title: 'Sign in' }));
    expect(builder.build().conflicts).toBeUndefined();
  });

  it('keeps the stronger status and the later confirmation', () => {
    const { builder, browser, source } = builderWithRoute();
    builder.addFact(route([browser], { verifiedAt: '2026-09-01T00:00:00.000Z' }));
    builder.addFact(
      route([source], { status: 'verified', verifiedAt: '2026-09-20T00:00:00.000Z' }),
    );
    expect(builder.build().facts[0]).toMatchObject({
      status: 'verified',
      verifiedAt: '2026-09-20T00:00:00.000Z',
    });
  });

  it('lets stale outrank everything: a failed check is not outvoted by an older success', () => {
    const { builder, browser, source } = builderWithRoute();
    builder.addFact(
      route([browser], { status: 'verified', verifiedAt: '2026-09-01T00:00:00.000Z' }),
    );
    builder.addFact(route([source], { status: 'stale' }));
    expect(builder.build().facts[0]?.status).toBe('stale');
  });
});

describe('conflicts in the model', () => {
  const withConflict = (): KnowledgeBase => {
    const { builder, browser, source } = builderWithRoute();
    builder.addFact(route([browser], { title: 'Sign in' }));
    builder.addFact(route([source], { title: 'Log in' }));
    return builder.build();
  };

  it('survive a round trip', () => {
    const kb = withConflict();
    expect(parseKnowledge(JSON.parse(JSON.stringify(toData(kb)))).conflicts).toEqual(kb.conflicts);
  });

  it('are left out of the data when there are none', () => {
    const { builder, browser } = builderWithRoute();
    builder.addFact(route([browser]));
    expect('conflicts' in toData(builder.build())).toBe(false);
  });

  it('must be about a fact that exists, and cite evidence that exists', () => {
    const kb = withConflict();
    const first = kb.conflicts?.[0];
    if (first === undefined) throw new Error('expected a conflict');

    const orphan = { ...kb, conflicts: [{ ...first, factId: 'route:/ghost' }] };
    expect(validateKnowledge(orphan).map((i) => i.code)).toContain('conflict-without-fact');

    const unsourced = {
      ...kb,
      conflicts: [
        { ...first, values: first.values.map((v) => ({ ...v, evidence: ['ev_nowhere'] })) },
      ],
    };
    expect(validateKnowledge(unsourced).map((i) => i.code)).toContain('unknown-evidence');
  });

  it('need at least two sides', () => {
    const kb = withConflict();
    const first = kb.conflicts?.[0];
    if (first === undefined) throw new Error('expected a conflict');
    const lopsided = { ...kb, conflicts: [{ ...first, values: first.values.slice(0, 1) }] };
    expect(() => parseKnowledge(JSON.parse(JSON.stringify(lopsided)))).toThrow(/conflicts/);
  });
});

describe('the index', () => {
  function sample(): KnowledgeBase {
    const builder = new KnowledgeBuilder();
    const browser = builder.addEvidence({
      type: 'browser',
      route: '/login',
      observedAt: '2026-09-30T00:00:00.000Z',
    });
    const source = builder.addEvidence({ type: 'source-code', file: 'src/Login.tsx', line: 12 });
    const guess = builder.addEvidence({ type: 'agent-inference' });
    builder.addFact(route([browser], { verifiedAt: '2026-09-30T00:00:00.000Z' }));
    builder.addFact({
      id: routeId('/signup'),
      kind: 'route',
      path: '/signup',
      status: 'observed',
      evidence: [source],
    });
    const locator = (name: string, extra: Partial<KnowledgeFact>): KnowledgeFact =>
      ({
        id: locatorId('/login', 'button', name),
        kind: 'locator',
        route: routeId('/login'),
        role: 'button',
        name,
        expression: `getByRole('button', { name: '${name}' })`,
        ...extra,
      }) as KnowledgeFact;
    builder.addFact(
      locator('Log in', {
        status: 'verified',
        verifiedAt: '2026-09-30T00:00:00.000Z',
        evidence: [browser, source],
        testId: 'login-submit',
      }),
    );
    builder.addFact(locator('Seen', { status: 'observed', evidence: [browser] }));
    builder.addFact(locator('Read', { status: 'inferred', evidence: [source] }));
    builder.addFact(locator('Guessed', { status: 'inferred', evidence: [guess] }));
    builder.addFact(locator('Broken', { status: 'stale', evidence: [browser] }));
    builder.addFact({
      id: 'test-id:login-submit',
      kind: 'test-id',
      testId: 'login-submit',
      status: 'observed',
      evidence: [source],
    });
    return builder.build();
  }

  it('lists routes and finds one by path', () => {
    const index = indexKnowledge(sample());
    expect(index.routes().map((r) => r.path)).toEqual(['/login', '/signup']);
    expect(index.route('/signup')?.id).toBe('route:/signup');
    expect(index.route('/nowhere')).toBeUndefined();
  });

  it('finds the locators on one route, in the order they were added', () => {
    const index = indexKnowledge(sample());
    expect(index.locatorsOn('/login').map((l) => l.name)).toEqual([
      'Log in',
      'Seen',
      'Read',
      'Guessed',
      'Broken',
    ]);
    expect(index.locatorsOn('/signup')).toEqual([]);
    expect(index.allLocators()).toHaveLength(5);
  });

  it('finds a test id wherever it appears', () => {
    expect(
      indexKnowledge(sample())
        .byTestId('login-submit')
        .map((fact) => fact.kind),
    ).toEqual(['locator', 'test-id']);
    expect(indexKnowledge(sample()).byTestId('absent')).toEqual([]);
  });

  it('reads coverage off the fact, and a guess is never more than unknown', () => {
    const index = indexKnowledge(sample());
    const coverage = (name: string) => {
      const fact = index.allLocators().find((l) => l.name === name);
      if (fact === undefined) throw new Error(name);
      return index.coverage(fact);
    };
    expect(coverage('Log in')).toBe('confirmed');
    expect(coverage('Seen')).toBe('runtime-only');
    expect(coverage('Read')).toBe('code-only');
    expect(coverage('Guessed')).toBe('unknown');
    expect(coverage('Broken')).toBe('unknown');
  });

  it('returns the evidence a fact cites, and none for a fact that is not there', () => {
    const index = indexKnowledge(sample());
    expect(index.evidenceFor(locatorId('/login', 'button', 'Log in')).map((e) => e.type)).toEqual([
      'browser',
      'source-code',
    ]);
    expect(index.evidenceFor('route:/nowhere')).toEqual([]);
  });

  it('ages a fact from when it was confirmed, and calls an undated one stale', () => {
    const index = indexKnowledge(sample());
    const login = index.fact(locatorId('/login', 'button', 'Log in'));
    const seen = index.fact(locatorId('/login', 'button', 'Seen'));
    if (!login || !seen) throw new Error('missing fixture');
    expect(index.freshness(login, NOW)).toBe('fresh');
    expect(index.freshness(login, new Date('2026-12-01T00:00:00Z'))).toBe('stale');
    expect(index.freshness(seen, NOW)).toBe('stale');
  });

  it('exposes conflicts for a fact, and none for the others', () => {
    const { builder, browser, source } = builderWithRoute();
    builder.addFact(route([browser], { title: 'A' }));
    builder.addFact(route([source], { title: 'B' }));
    const index = indexKnowledge(builder.build());
    expect(index.conflicts()).toHaveLength(1);
    expect(index.conflictsFor('route:/login')).toHaveLength(1);
    expect(index.conflictsFor('route:/other')).toEqual([]);
  });

  it('is an empty answer, not a failure, for an empty knowledge base', () => {
    const index = indexKnowledge({ modelVersion: 1, facts: [], evidence: [] });
    expect(index.routes()).toEqual([]);
    expect(index.allLocators()).toEqual([]);
    expect(index.conflicts()).toEqual([]);
  });
});
