import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  apiId,
  evidenceId,
  KNOWLEDGE_MODEL_VERSION,
  KnowledgeError,
  locatorId,
  namedId,
  normaliseName,
  parseKnowledge,
  routeId,
  termId,
  testIdFactId,
  toData,
  UnsupportedKnowledgeVersionError,
  validateKnowledge,
  type KnowledgeBase,
  type KnowledgeEvidence,
  type KnowledgeFact,
} from '../../src/knowledge/index.js';

const NOW = '2026-10-01T09:12:00Z';

const browser: KnowledgeEvidence = {
  id: 'ev_browser',
  type: 'browser',
  route: '/login',
  environment: 'staging',
  observedAt: NOW,
  snapshotHash: 'abc123',
  tool: { name: 'playwright-cli', version: '0.1.22', format: 'playwright-cli/markdown-yaml@1' },
};
const source: KnowledgeEvidence = {
  id: 'ev_source',
  type: 'source-code',
  file: 'src/Login.tsx',
  line: 12,
  symbol: 'Login',
  commit: '8dbe210',
};
const guess: KnowledgeEvidence = { id: 'ev_guess', type: 'agent-inference' };

const LOGIN_ROUTE = routeId('/login');
const LOGIN_BUTTON = locatorId(LOGIN_ROUTE.slice('route:'.length), 'button', 'Log in');

/** One of every kind, wired together the way a real survey plus extract would. */
function everyKind(): KnowledgeBase {
  const facts: KnowledgeFact[] = [
    {
      id: 'application:admin-panel',
      kind: 'application',
      name: 'admin-panel',
      status: 'observed',
      evidence: ['ev_source'],
    },
    {
      id: 'environment:staging',
      kind: 'environment',
      name: 'staging',
      application: 'application:admin-panel',
      status: 'observed',
      evidence: ['ev_browser'],
    },
    {
      id: LOGIN_ROUTE,
      kind: 'route',
      path: '/login',
      title: 'Sign in',
      application: 'application:admin-panel',
      status: 'observed',
      evidence: ['ev_browser', 'ev_source'],
    },
    {
      id: 'component:login-form',
      kind: 'component',
      name: 'login-form',
      route: LOGIN_ROUTE,
      status: 'observed',
      evidence: ['ev_source'],
    },
    { id: 'role:admin', kind: 'role', name: 'admin', status: 'inferred', evidence: ['ev_guess'] },
    {
      id: 'state:authenticated',
      kind: 'state',
      name: 'authenticated',
      status: 'inferred',
      evidence: ['ev_guess'],
    },
    {
      id: LOGIN_BUTTON,
      kind: 'locator',
      route: LOGIN_ROUTE,
      role: 'button',
      name: 'Log in',
      expression: "getByRole('button', { name: 'Log in' })",
      testId: 'login-submit',
      status: 'verified',
      verifiedAt: NOW,
      verifiedAgainst: {
        commit: '8dbe210',
        environment: 'staging',
        role: 'admin',
        locale: 'en-US',
      },
      confidence: { level: 'high', reason: 'seen running and present in the source' },
      dependencies: { files: [{ path: 'src/Login.tsx', hash: 'deadbeef' }] },
      evidence: ['ev_browser', 'ev_source'],
    },
    {
      id: 'action:auth.login',
      kind: 'action',
      route: LOGIN_ROUTE,
      component: 'component:login-form',
      intent: 'log-in',
      locator: LOGIN_BUTTON,
      requires: { roles: ['admin'], states: ['authenticated'] },
      status: 'observed',
      evidence: ['ev_browser'],
    },
    {
      id: testIdFactId('login-submit'),
      kind: 'test-id',
      testId: 'login-submit',
      status: 'observed',
      evidence: ['ev_source'],
    },
    {
      id: apiId('post', '/api/login'),
      kind: 'api',
      method: 'post',
      path: '/api/login',
      status: 'observed',
      evidence: ['ev_source'],
    },
    {
      id: termId('auth.login.submit'),
      kind: 'term',
      key: 'auth.login.submit',
      label: 'Log in',
      status: 'observed',
      evidence: ['ev_source'],
    },
    {
      id: 'data-requirement:seeded-user',
      kind: 'data-requirement',
      name: 'seeded-user',
      description: 'a user that can log in',
      status: 'inferred',
      evidence: ['ev_guess'],
    },
  ];
  return { modelVersion: KNOWLEDGE_MODEL_VERSION, facts, evidence: [browser, source, guess] };
}

/** `everyKind()` with one fact replaced, for testing a single rule. */
function with_(
  id: string,
  change: Partial<KnowledgeFact> | ((fact: KnowledgeFact) => KnowledgeFact),
): KnowledgeBase {
  const kb = everyKind();
  return {
    ...kb,
    facts: kb.facts.map((fact) =>
      fact.id !== id
        ? fact
        : typeof change === 'function'
          ? change(fact)
          : ({ ...fact, ...change } as KnowledgeFact),
    ),
  };
}

/** The first item, or a failure that says so, rather than an assertion the linter forbids. */
function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('expected at least one item');
  return item;
}

/** What would be read off disk: plain JSON, free to be corrupted by a test. */
function rawData(): { facts: Record<string, unknown>[]; evidence: Record<string, unknown>[] } {
  return JSON.parse(JSON.stringify(everyKind())) as {
    facts: Record<string, unknown>[];
    evidence: Record<string, unknown>[];
  };
}

const codes = (kb: KnowledgeBase) => validateKnowledge(kb).map((issue) => issue.code);

describe('a knowledge base with every kind of fact', () => {
  it('is valid', () => {
    expect(validateKnowledge(everyKind())).toEqual([]);
  });

  it('survives a round trip through JSON unchanged', () => {
    const kb = everyKind();
    const copy = parseKnowledge(JSON.parse(JSON.stringify(toData(kb))));
    expect(copy).toEqual(toData(kb));
  });

  it('keeps every field of every fact, including provenance', () => {
    const copy = parseKnowledge(JSON.parse(JSON.stringify(everyKind())));
    const locator = copy.facts.find((fact) => fact.id === LOGIN_BUTTON);
    expect(locator).toMatchObject({
      verifiedAgainst: { environment: 'staging', role: 'admin', locale: 'en-US' },
      confidence: { level: 'high' },
      dependencies: { files: [{ path: 'src/Login.tsx', hash: 'deadbeef' }] },
      evidence: ['ev_browser', 'ev_source'],
    });
    expect(copy.evidence.find((e) => e.id === 'ev_browser')?.tool?.version).toBe('0.1.22');
  });

  it('serialises the same way whatever order the facts were added in', () => {
    const kb = everyKind();
    const shuffled = {
      ...kb,
      facts: [...kb.facts].reverse(),
      evidence: [...kb.evidence].reverse(),
    };
    expect(JSON.stringify(toData(shuffled))).toBe(JSON.stringify(toData(kb)));
  });
});

describe('inferred and verified cannot be confused', () => {
  const verifiedOnAGuess = () =>
    with_(LOGIN_BUTTON, { status: 'verified', verifiedAt: NOW, evidence: ['ev_guess'] });

  it('refuses a verified fact that rests only on inference', () => {
    expect(codes(verifiedOnAGuess())).toContain('verified-on-inference');
    expect(() => parseKnowledge(verifiedOnAGuess())).toThrow(/inference alone cannot verify/i);
  });

  it('refuses an observed fact that rests only on inference', () => {
    expect(codes(with_(LOGIN_BUTTON, { status: 'observed', evidence: ['ev_guess'] }))).toContain(
      'status-above-inference',
    );
  });

  it('accepts a guess standing next to real evidence', () => {
    expect(
      codes(
        with_(LOGIN_BUTTON, {
          status: 'verified',
          verifiedAt: NOW,
          evidence: ['ev_guess', 'ev_browser'],
        }),
      ),
    ).toEqual([]);
  });

  it('accepts an inferred fact resting on inference, and on real evidence too', () => {
    expect(codes(with_(LOGIN_BUTTON, { status: 'inferred', evidence: ['ev_guess'] }))).toEqual([]);
    expect(codes(with_(LOGIN_BUTTON, { status: 'inferred', evidence: ['ev_browser'] }))).toEqual(
      [],
    );
  });

  it('refuses verified with no date', () => {
    const kb = with_(LOGIN_BUTTON, { verifiedAt: undefined });
    expect(codes(kb)).toContain('verified-without-date');
  });

  it('allows a stale fact, which is a verification that failed', () => {
    expect(codes(with_(LOGIN_BUTTON, { status: 'stale' }))).toEqual([]);
  });
});

describe('references', () => {
  it('rejects evidence that is not there, naming it', () => {
    const kb = with_(LOGIN_BUTTON, { evidence: ['ev_browser', 'ev_nowhere'] });
    expect(codes(kb)).toContain('unknown-evidence');
    expect(() => parseKnowledge(kb)).toThrow(/ev_nowhere/);
  });

  it('rejects a locator on a route that does not exist', () => {
    const kb = with_(LOGIN_BUTTON, { route: 'route:/nowhere' });
    expect(codes(kb)).toContain('dangling-reference');
    expect(() => parseKnowledge(kb)).toThrow(/route:\/nowhere/);
  });

  it('rejects a reference to a fact of the wrong kind', () => {
    const kb = with_('action:auth.login', { locator: 'role:admin' });
    expect(
      validateKnowledge(kb)
        .map((i) => i.message)
        .join(' '),
    ).toMatch(/is a role, not a locator/);
  });

  it('rejects dangling references in every field that has one', () => {
    for (const [id, change] of [
      ['environment:staging', { application: 'application:ghost' }],
      ['route:/login', { application: 'application:ghost' }],
      ['component:login-form', { route: 'route:/ghost' }],
      ['action:auth.login', { route: 'route:/ghost' }],
      ['action:auth.login', { component: 'component:ghost' }],
      ['action:auth.login', { locator: 'locator:/ghost#button:x' }],
    ] as const) {
      expect(codes(with_(id, change)), `${id} ${JSON.stringify(change)}`).toContain(
        'dangling-reference',
      );
    }
  });

  it('rejects two facts with one id, and two pieces of evidence with one id', () => {
    const kb = everyKind();
    expect(codes({ ...kb, facts: [...kb.facts, first(kb.facts)] })).toContain('duplicate-fact-id');
    expect(codes({ ...kb, evidence: [...kb.evidence, browser] })).toContain(
      'duplicate-evidence-id',
    );
  });

  it('insists that derived ids are what they derive to', () => {
    const kb = with_(LOGIN_BUTTON, { name: 'Sign in' });
    expect(codes(kb)).toContain('id-mismatch');
  });
});

describe('the data on disk', () => {
  it('reports unknown fields instead of dropping them', () => {
    const data = rawData();
    first(data.facts)['colour'] = 'red';
    expect(() => parseKnowledge(data)).toThrow(KnowledgeError);
    expect(() => parseKnowledge(data)).toThrow(/colour|Unrecognized/);
  });

  it('reports a malformed date, with where', () => {
    const data = rawData();
    first(data.evidence)['observedAt'] = 'yesterday';
    expect(() => parseKnowledge(data)).toThrow(/evidence\.0\.observedAt/);
  });

  it('refuses a fact with no evidence at all', () => {
    const data = rawData();
    first(data.facts)['evidence'] = [];
    expect(() => parseKnowledge(data)).toThrow(KnowledgeError);
  });

  it('says what is wrong with something that is not a knowledge base', () => {
    expect(() => parseKnowledge({})).toThrow(/Not a valid knowledge base/);
    expect(() => parseKnowledge('hello')).toThrow(KnowledgeError);
    expect(() => parseKnowledge(null)).toThrow(KnowledgeError);
  });

  it('refuses a newer model version with an instruction to upgrade', () => {
    const data = { ...everyKind(), modelVersion: KNOWLEDGE_MODEL_VERSION + 1 };
    expect(() => parseKnowledge(data)).toThrow(UnsupportedKnowledgeVersionError);
    expect(() => parseKnowledge(data)).toThrow(/Upgrade @understudy\/cli/);
  });

  it('does not mistake a newer version for a schema error', () => {
    const data = { modelVersion: 99, somethingNew: true };
    expect(() => parseKnowledge(data)).toThrow(UnsupportedKnowledgeVersionError);
  });
});

describe('ids', () => {
  it('ignore case and spacing in names, so the same button is one fact', () => {
    expect(locatorId('/login', 'button', '  Log   IN ')).toBe(
      locatorId('/login', 'button', 'log in'),
    );
    expect(normaliseName(undefined)).toBe('');
  });

  it('read as what they are', () => {
    expect(routeId('/login')).toBe('route:/login');
    expect(locatorId('/login', 'button', 'Log in')).toBe('locator:/login#button:log in');
    expect(apiId('get', '/api/items')).toBe('api:GET /api/items');
    expect(apiId(undefined, '/api/items')).toBe('api:/api/items');
    expect(namedId('role', 'admin')).toBe('role:admin');
  });

  it('give the same evidence the same id, whatever order its fields are in', () => {
    const a = evidenceId({ type: 'browser', route: '/login', tool: { name: 'x', version: '1' } });
    const b = evidenceId({ tool: { version: '1', name: 'x' }, route: '/login', type: 'browser' });
    expect(a).toBe(b);
    expect(a).toMatch(/^ev_[0-9a-f]{12}$/);
  });

  it('give different evidence different ids', () => {
    expect(evidenceId({ type: 'browser', route: '/a' })).not.toBe(
      evidenceId({ type: 'browser', route: '/b' }),
    );
    expect(evidenceId({ type: 'browser' })).not.toBe(evidenceId({ type: 'source-code' }));
  });
});

describe('the model has no way to reach outside itself', () => {
  const dir = join(import.meta.dirname, '..', '..', 'src', 'knowledge');
  const sources = readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(join(dir, name), 'utf8')] as const);

  it.each(sources)('%s imports no I/O, process or agent code', (_name, text) => {
    const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
    const forbidden = imports.filter(
      (specifier) =>
        /^node:(fs|child_process|net|http|https|os|path)/.test(specifier) ||
        specifier === 'fs' ||
        specifier === 'child_process' ||
        specifier.includes('agent-kb') ||
        specifier.includes('cli'),
    );
    expect(forbidden).toEqual([]);
  });
});
