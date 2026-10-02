import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { freshnessAdvice, freshnessOf } from '../src/agent-kb/freshness.js';
import { loadKnowledge } from '../src/agent-kb/load-knowledge.js';
import { resolveLocator, type LocatorAnswer } from '../src/agent-kb/resolve-locator.js';
import { correlate, readTestIds, writeRouteMap } from '../src/agent-kb/store.js';
import { indexKnowledge, validateKnowledge } from '../src/knowledge/index.js';
import { RouteMapV1Schema, type KbElement, type RouteMap } from '../src/schema/agent-kb.js';
import { routeToFilename } from '../src/agent-kb/snapshot/index.js';

/**
 * Loading the files that exist today into the Knowledge Core, and answering
 * "what is the selector for this?" through it. The second half has to behave
 * exactly as it did before the move, so it is checked against a copy of the old
 * algorithm rather than against expectations someone wrote afterwards.
 */

const NOW = new Date('2026-10-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number): string => new Date(NOW.getTime() - days * DAY).toISOString();

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'understudy-load-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

const element = (
  role: string,
  name: string,
  confidence: KbElement['confidence'],
  extra: Partial<KbElement> = {},
): KbElement => ({
  role,
  name,
  locator: `getByRole('${role}', { name: '${name}' })`,
  confidence,
  ...extra,
});

function routeMap(route: string, elements: KbElement[], verifiedDaysAgo = 1): RouteMap {
  return {
    schemaVersion: 1,
    route,
    title: `Title of ${route}`,
    exploredAt: ago(verifiedDaysAgo),
    verifiedAt: ago(verifiedDaysAgo),
    snapshotHash: `hash-${route}`,
    elements,
    links: [],
    gaps: [],
  };
}

const testIds = (entries: [string, string][], commit?: string): string =>
  stringify({
    schemaVersion: 1,
    ...(commit === undefined ? {} : { commit }),
    testIds: entries.map(([testId, source]) => ({ testId, source })),
  });

describe('mapping the route maps', () => {
  beforeEach(() => {
    write(
      '.agent-kb/product/testids.yaml',
      testIds([['login-submit', 'src/Login.tsx:12']], '8dbe210'),
    );
    writeRouteMap(
      root,
      routeMap('/login', [
        element('button', 'Log in', 'runtime-only'),
        element('textbox', 'Email', 'runtime-only'),
        element('button', 'Hand confirmed', 'confirmed', { testId: 'login-submit' }),
        element('button', 'In source only', 'code-only', { testId: 'login-submit' }),
        element('link', 'Mystery', 'unknown'),
      ]),
    );
  });

  const locator = (name: string) => {
    const { kb } = loadKnowledge(root, NOW);
    const index = indexKnowledge(kb);
    const fact = index.allLocators().find((item) => item.name === name);
    if (fact === undefined) throw new Error(`no locator named ${name}`);
    return { fact, index };
  };

  it('keeps a survey-only element observed, citing the browser alone', () => {
    const { fact, index } = locator('Email');
    expect(fact).toMatchObject({ status: 'observed', confidence: { level: 'medium' } });
    expect(index.evidenceFor(fact.id).map((e) => e.type)).toEqual(['browser']);
    expect(index.coverage(fact)).toBe('runtime-only');
  });

  it('makes an element the source also knows verified, citing both', () => {
    const { fact, index } = locator('Log in');
    // `correlate` matches the name to login-submit, exactly as it did at read before.
    expect(fact).toMatchObject({ status: 'verified', testId: 'login-submit' });
    expect(index.evidenceFor(fact.id).map((e) => e.type)).toEqual(['browser', 'source-code']);
    expect(index.evidenceFor(fact.id)[1]).toMatchObject({
      file: 'src/Login.tsx',
      line: 12,
      commit: '8dbe210',
    });
    expect(index.coverage(fact)).toBe('confirmed');
  });

  it('gives the source reference only where the test id is really in the extract', () => {
    const { fact, index } = locator('Hand confirmed');
    expect(index.evidenceFor(fact.id).map((e) => e.type)).toEqual(['browser', 'source-code']);
    expect(fact.status).toBe('verified');
  });

  it('maps code-only to inferred, resting on the source, and unknown to inferred on the file', () => {
    const codeOnly = locator('In source only');
    expect(codeOnly.fact.status).toBe('inferred');
    expect(codeOnly.index.coverage(codeOnly.fact)).toBe('code-only');

    const unknown = locator('Mystery');
    expect(unknown.fact.status).toBe('inferred');
    expect(unknown.index.evidenceFor(unknown.fact.id).map((e) => e.type)).toEqual(['import']);
    expect(unknown.index.coverage(unknown.fact)).toBe('unknown');
  });

  it('makes a route fact with the title, the date and what was seen', () => {
    const { index } = locator('Email');
    const route = index.route('/login');
    expect(route).toMatchObject({
      title: 'Title of /login',
      status: 'observed',
      verifiedAt: ago(1),
    });
    expect(index.evidenceFor('route:/login')[0]).toMatchObject({
      type: 'browser',
      route: '/login',
      snapshotHash: 'hash-/login',
      observedAt: ago(1),
    });
  });

  it('shares one piece of browser evidence across a route, rather than one per element', () => {
    const { kb } = loadKnowledge(root, NOW);
    expect(kb.evidence.filter((item) => item.type === 'browser')).toHaveLength(1);
  });

  it('never stores a host: evidence carries a path, and nothing carries a URL', () => {
    const text = JSON.stringify(loadKnowledge(root, NOW).kb);
    expect(text).not.toMatch(/https?:\/\//);
  });

  it('produces a knowledge base the model accepts', () => {
    expect(validateKnowledge(loadKnowledge(root, NOW).kb)).toEqual([]);
  });

  it('ages an element from when its route was last confirmed', () => {
    const { fact, index } = locator('Email');
    expect(index.freshness(fact, NOW)).toBe('fresh');
    expect(index.freshness(fact, new Date(NOW.getTime() + 40 * DAY))).toBe('stale');
  });
});

describe('mapping the product files', () => {
  it('merges a route the source declares with the one that was surveyed', () => {
    write(
      '.agent-kb/product/surface.yaml',
      stringify({
        schemaVersion: 1,
        commit: 'abc',
        entries: [
          { kind: 'route', path: '/login', source: 'app/login/page.tsx:1' },
          { kind: 'route', path: '/billing', source: 'app/billing/page.tsx:1' },
        ],
      }),
    );
    writeRouteMap(root, routeMap('/login', [element('button', 'Log in', 'runtime-only')]));

    const index = indexKnowledge(loadKnowledge(root, NOW).kb);
    expect(index.routes().map((r) => r.path)).toEqual(['/login', '/billing']);
    expect(index.evidenceFor('route:/login').map((e) => e.type)).toEqual([
      'browser',
      'source-code',
    ]);
    expect(index.evidenceFor('route:/billing').map((e) => e.type)).toEqual(['source-code']);
    // Title came from the survey; the source had none to offer, and that is not a conflict.
    expect(index.route('/login')?.title).toBe('Title of /login');
    expect(index.conflicts()).toEqual([]);
  });

  it('turns endpoints into api facts, citing OpenAPI when that is where they came from', () => {
    write(
      '.agent-kb/product/surface.yaml',
      stringify({
        schemaVersion: 1,
        entries: [
          { kind: 'endpoint', path: '/api/items', method: 'get', source: 'api/openapi.json:12' },
          { kind: 'endpoint', path: '/api/health', source: 'app/api/health/route.ts:1' },
        ],
      }),
    );
    const index = indexKnowledge(loadKnowledge(root, NOW).kb);
    expect(index.apis().map((api) => [api.id, api.method])).toEqual([
      ['api:GET /api/items', 'GET'],
      ['api:/api/health', undefined],
    ]);
    expect(index.evidenceFor('api:GET /api/items')[0]?.type).toBe('openapi');
    expect(index.evidenceFor('api:/api/health')[0]?.type).toBe('source-code');
  });

  it('turns test ids into facts that cite where the source has them', () => {
    write('.agent-kb/product/testids.yaml', testIds([['buy-now', 'src/Buy.tsx:3']], 'abc'));
    const index = indexKnowledge(loadKnowledge(root, NOW).kb);
    expect(index.byTestId('buy-now').map((fact) => fact.kind)).toEqual(['test-id']);
    expect(index.evidenceFor('test-id:buy-now')[0]).toMatchObject({
      type: 'source-code',
      file: 'src/Buy.tsx',
      line: 3,
      commit: 'abc',
    });
  });

  it('records a label two sources disagree about as a conflict, and keeps the first', () => {
    write(
      '.agent-kb/product/vocabulary.yaml',
      stringify({
        schemaVersion: 1,
        terms: [
          { key: 'auth.login.submit', label: 'Log in', source: 'locales/en.json:5' },
          { key: 'auth.login.submit', label: 'Zaloguj', source: 'locales/pl.json:5' },
          { key: 'auth.login.cancel', label: 'Cancel', source: 'locales/en.json:6' },
          { key: 'auth.login.cancel', label: 'Cancel', source: 'locales/pl.json:6' },
        ],
      }),
    );
    const { kb, issues } = loadKnowledge(root, NOW);
    const index = indexKnowledge(kb);

    expect(index.terms().find((t) => t.key === 'auth.login.submit')?.label).toBe('Log in');
    const [conflict] = index.conflictsFor('term:auth.login.submit');
    expect(conflict).toMatchObject({ field: 'label' });
    expect(conflict?.values.map((v) => v.value)).toEqual(['Log in', 'Zaloguj']);
    // Each side names the evidence that said it.
    expect(conflict?.values.map((v) => v.evidence.length)).toEqual([1, 1]);

    expect(index.conflicts()).toHaveLength(1);
    expect(index.conflictsFor('term:auth.login.cancel')).toEqual([]);
    // Agreeing sources are merged into one fact that cites both.
    expect(index.evidenceFor('term:auth.login.cancel')).toHaveLength(2);
    expect(issues.some((i) => /Log in.*Zaloguj/.test(i.message))).toBe(true);
  });
});

describe('files that cannot be used', () => {
  it('is an empty knowledge base, with no complaint, when there is no .agent-kb', () => {
    const { kb, issues } = loadKnowledge(root, NOW);
    expect(kb.facts).toEqual([]);
    expect(issues).toEqual([]);
  });

  it('reports a broken route map and keeps loading the rest', () => {
    writeRouteMap(root, routeMap('/ok', [element('button', 'Fine', 'runtime-only')]));
    write('.agent-kb/app-map/broken.yaml', 'route: [unclosed');

    const { kb, issues } = loadKnowledge(root, NOW);
    expect(
      indexKnowledge(kb)
        .allLocators()
        .map((l) => l.name),
    ).toEqual(['Fine']);
    expect(issues).toEqual([
      expect.objectContaining({ path: '.agent-kb/app-map/broken.yaml', severity: 'error' }),
    ]);
  });

  it.each(['testids', 'surface', 'vocabulary'])('reports an unreadable %s.yaml', (name) => {
    write(`.agent-kb/product/${name}.yaml`, 'schemaVersion: 7\nnonsense: true\n');
    const { issues } = loadKnowledge(root, NOW);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      path: `.agent-kb/product/${name}.yaml`,
      severity: 'error',
    });
    expect(issues[0]?.message).toContain('does not match its schema');
  });

  it('warns about a date that is not a date, and reads the entry as stale', () => {
    const map = routeMap('/old', [element('button', 'Save', 'runtime-only')]);
    writeRouteMap(root, { ...map, verifiedAt: 'last tuesday' });

    const { kb, issues } = loadKnowledge(root, NOW);
    const index = indexKnowledge(kb);
    const fact = index.allLocators()[0];
    expect(fact?.verifiedAt).toBeUndefined();
    expect(fact && index.freshness(fact, NOW)).toBe('stale');
    expect(issues.some((i) => i.message.includes('verifiedAt "last tuesday" is not a date'))).toBe(
      true,
    );
  });

  it('keeps the first of two elements that differ only in case, and says so', () => {
    writeRouteMap(
      root,
      routeMap('/a', [
        element('button', 'Save', 'runtime-only'),
        element('button', 'save', 'runtime-only'),
      ]),
    );
    const { kb, issues } = loadKnowledge(root, NOW);
    expect(
      indexKnowledge(kb)
        .allLocators()
        .map((l) => l.name),
    ).toEqual(['Save']);
    expect(issues.some((i) => i.message.includes('appears more than once'))).toBe(true);
  });
});

/**
 * Writes a route map the way version 1 did: the old fields and nothing else. The
 * parity test needs real v1 files, both to compare against the old algorithm and so
 * that the answers go through the migration.
 */
function writeLegacy(map: RouteMap): void {
  const legacy = {
    schemaVersion: 1,
    route: map.route,
    title: map.title,
    exploredAt: map.exploredAt,
    verifiedAt: map.verifiedAt,
    snapshotHash: map.snapshotHash,
    elements: map.elements.map((item) => ({
      role: item.role,
      ...(item.name === undefined ? {} : { name: item.name }),
      ...(item.level === undefined ? {} : { level: item.level }),
      locator: item.locator,
      ...(item.testId === undefined ? {} : { testId: item.testId }),
      confidence: item.confidence,
    })),
    links: [],
    gaps: [],
  };
  write(`.agent-kb/app-map/${routeToFilename(map.route)}.yaml`, stringify(legacy));
}

/** The old reader: every file under app-map parsed with the version 1 schema, sorted by route. */
function legacyMaps(): { route: string; verifiedAt: string; elements: KbElement[] }[] {
  const dir = join(root, '.agent-kb', 'app-map');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .flatMap((name) => {
      const parsed = RouteMapV1Schema.safeParse(parse(readFileSync(join(dir, name), 'utf8')));
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * The algorithm as it was before the Knowledge Core, kept verbatim as an oracle:
 * route maps and test ids read straight from the files, correlated, scored.
 */
function legacyResolve(query: string, route?: string, now?: Date): LocatorAnswer {
  const normalise = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const score = (item: KbElement): number => {
    const name = normalise(item.name ?? '');
    if (name.length === 0) return 0;
    const wanted = normalise(query)
      .split(' ')
      .filter((w) => w.length > 0);
    if (wanted.length === 0) return 0;
    const words = new Set(name.split(' '));
    let nameHits = 0;
    for (const word of wanted) {
      if (words.has(word)) nameHits += 2;
      else if (word.length > 3 && name.includes(word)) nameHits += 1;
    }
    if (nameHits === 0) return 0;
    return wanted.includes(item.role.toLowerCase()) ? nameHits + 1 : nameHits;
  };

  // The answer has only ever carried these fields; the reader now attaches more.
  const plain = (item: KbElement): KbElement => ({
    role: item.role,
    ...(item.name === undefined ? {} : { name: item.name }),
    ...(item.level === undefined ? {} : { level: item.level }),
    locator: item.locator,
    ...(item.testId === undefined ? {} : { testId: item.testId }),
    confidence: item.confidence,
  });

  const ids = readTestIds(root);
  const all = legacyMaps();
  const maps =
    route === undefined
      ? all
      : all.filter((m) => routeToFilename(m.route) === routeToFilename(route));
  const knownRoutes = all.map((m) => m.route);

  const candidates = maps.flatMap((loaded) =>
    correlate(loaded.elements.map(plain), ids).map((item) => ({
      element: item,
      route: loaded.route,
      freshness: freshnessOf(loaded.verifiedAt, now),
      score: score(item),
    })),
  );
  const matches = candidates.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  const best = matches[0];

  if (!best) {
    return {
      kind: 'unknown',
      route,
      query,
      remedy:
        route === undefined
          ? 'understudy survey <url>   # map the route this element is on'
          : `understudy survey --route ${route} --base-url <url>   # this route has not been surveyed`,
      knownRoutes,
    };
  }
  return {
    kind: 'found',
    route: best.route,
    element: best.element,
    freshness: best.freshness,
    confidence: best.element.confidence,
    advice: freshnessAdvice(best.freshness, best.route),
    alternatives: matches.slice(1, 4).map((m) => m.element),
    // The old algorithm knew nothing of the code behind an element.
    changes: [],
  };
}

/**
 * The one deliberate difference. A hand-written `code-only` entry says "this is in
 * the product source" without saying where; the model has no evidence to rest that
 * on, so it reads as `unknown`. Nothing in Understudy writes `code-only`.
 */
function withoutUnsupportedClaims(answer: LocatorAnswer): LocatorAnswer {
  if (answer.kind === 'unknown') return answer;
  const fix = (item: KbElement): KbElement =>
    item.confidence === 'code-only' && item.testId === undefined
      ? { ...item, confidence: 'unknown' }
      : item;
  const element = fix(answer.element);
  return {
    ...answer,
    element,
    confidence: element.confidence,
    alternatives: answer.alternatives.map(fix),
  };
}

describe('resolving a locator is unchanged by the move', () => {
  beforeEach(() => {
    write(
      '.agent-kb/product/testids.yaml',
      testIds([
        ['login-submit', 'src/Login.tsx:12'],
        ['login-email', 'src/Login.tsx:9'],
        ['reset-password', 'src/Reset.tsx:4'],
        ['login-password', 'src/Login.tsx:10'],
      ]),
    );
    writeLegacy(
      routeMap('/login', [
        element('heading', 'Sign in', 'runtime-only', { level: 1 }),
        element('textbox', 'Email', 'runtime-only'),
        element('textbox', 'Password', 'runtime-only'),
        element('button', 'Log in', 'runtime-only'),
        element('button', 'Log in with SSO', 'runtime-only'),
        element('link', 'Forgot password?', 'runtime-only'),
      ]),
    );
    writeLegacy(
      routeMap(
        '/signup',
        [
          element('textbox', 'Email', 'runtime-only'),
          element('button', 'Create account', 'runtime-only'),
          element('button', 'Log in', 'code-only'),
        ],
        12,
      ),
    );
    writeLegacy(
      routeMap('/admin/settings/security', [element('button', 'Change password', 'confirmed')], 45),
    );
    writeLegacy({
      ...routeMap('/undated', [element('button', 'Ghost', 'runtime-only')]),
      verifiedAt: 'never',
    });
  });

  const queries = [
    'log in button',
    'log in',
    'email',
    'password',
    'change password',
    'create account',
    'sign in heading',
    'ghost',
    'forgot',
    'delete account button',
    'nonexistent thing',
    'button',
    'SSO',
    '   ',
    'Log   IN',
  ];
  const routes = [
    undefined,
    '/login',
    '/signup',
    '/admin/settings/security',
    '/missing',
    'login',
    '/login/',
    '/undated',
  ];

  it.each(queries.flatMap((query) => routes.map((route) => [query, route] as const)))(
    '%j on %j gives the answer it always gave',
    (query, route) => {
      const actual = resolveLocator({ projectRoot: root, query, route, now: NOW });
      expect(actual).toEqual(withoutUnsupportedClaims(legacyResolve(query, route, NOW)));
    },
  );

  it('reads a code-only entry with no source reference as unknown, the one thing that differs', () => {
    const answer = resolveLocator({
      projectRoot: root,
      query: 'log in',
      route: '/signup',
      now: NOW,
    });
    if (answer.kind !== 'found') throw new Error('expected an answer');
    expect(answer.element.confidence).toBe('unknown');
    expect(legacyResolve('log in', '/signup', NOW)).toMatchObject({
      element: { confidence: 'code-only' },
    });
  });

  it('also agrees on an empty knowledge base', () => {
    rmSync(join(root, '.agent-kb'), { recursive: true, force: true });
    expect(resolveLocator({ projectRoot: root, query: 'anything', now: NOW })).toEqual(
      legacyResolve('anything', undefined, NOW),
    );
  });
});
