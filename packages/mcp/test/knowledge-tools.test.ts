import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clearKnowledgeCache,
  cachedKnowledgeIndex,
  computeFreshness,
  hashSnapshot,
  parseSnapshot,
  routeId,
  writeRouteMap,
} from '@understudy/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  estimateTokens,
  findKnowledge,
  getEvidence,
  getFreshness,
  loadContext,
  resolveApi,
  resolveRoute,
  TOKEN_BUDGET,
  type ToolContext,
} from '../src/tools.js';

/**
 * The knowledge tools answer from the same index the CLI uses. What is tested here is
 * what the tools own: that a miss says unknown and how to find out, that lists stay
 * short however large the knowledge base is, and that the answer is the engine's.
 */

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
let context: ToolContext;

function surveyed(at: Date): void {
  const parsed = parseSnapshot(SNAPSHOT);
  const stamp = at.toISOString();
  writeRouteMap(root, {
    schemaVersion: 1,
    route: '/login',
    title: parsed.title,
    exploredAt: stamp,
    verifiedAt: stamp,
    snapshotHash: hashSnapshot(parsed.tree),
    elements: [...parsed.elements],
    links: [],
    gaps: [],
  });
}

/** Many endpoints, so that the cap on a list is exercised and not assumed. */
function withEndpoints(count: number): void {
  const entries = Array.from({ length: count }, (_, i) => ({
    kind: 'endpoint',
    method: i % 2 === 0 ? 'GET' : 'POST',
    path: `/api/orders/item${String(i)}`,
    source: `src/api/orders/route${String(i)}.ts:${String(i + 1)}`,
  }));
  entries.push({
    kind: 'endpoint',
    method: 'POST',
    path: '/api/login',
    source: 'openapi.yaml:12',
  });
  mkdirSync(join(root, '.agent-kb', 'product'), { recursive: true });
  writeFileSync(
    join(root, '.agent-kb', 'product', 'surface.yaml'),
    JSON.stringify({ schemaVersion: 1, entries }),
  );
}

beforeEach(() => {
  clearKnowledgeCache();
  root = mkdtempSync(join(tmpdir(), 'understudy-mcp-kb-'));
  surveyed(new Date());
  context = { rules: loadContext(root).rules, projectRoot: root };
});

afterEach(() => {
  clearKnowledgeCache();
  rmSync(root, { recursive: true, force: true });
});

describe('resolve_route', () => {
  it('answers from the knowledge base: title, standing, freshness, elements, sources', () => {
    const answer = resolveRoute(context, '/login');
    expect(answer).toContain('route: /login');
    expect(answer).toContain('title: Sign in');
    expect(answer).toContain('freshness: fresh');
    expect(answer).toContain('elements: 3');
    expect(answer).toContain('sources:');
  });

  it('finds the route by a few words, and by a path written another way', () => {
    expect(resolveRoute(context, 'sign in')).toContain('route: /login');
    expect(resolveRoute(context, 'login/')).toContain('route: /login');
  });

  it('gives the same freshness as the engine does', () => {
    const index = cachedKnowledgeIndex(root);
    const fact = index.route('/login');
    expect(fact).toBeDefined();
    if (fact === undefined) return;
    const now = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    expect(resolveRoute(context, '/login', now)).toContain(
      `freshness: ${computeFreshness(fact, now).freshness}`,
    );
  });

  it('says why a route is not fresh', () => {
    const later = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    const answer = resolveRoute(context, '/login', later);
    expect(answer).toContain('freshness: stale');
    expect(answer).toContain('because not confirmed for');
  });

  it('says unknown, and how to find out, instead of inventing a route', () => {
    const answer = resolveRoute(context, '/checkout');
    expect(answer).toContain('status: unknown');
    expect(answer).toContain('suggested action:');
    expect(answer).toContain('understudy survey');
    expect(answer).toContain('/login');
  });

  it('survives an empty query', () => {
    expect(resolveRoute(context, '   ')).toContain('status: unknown');
  });

  it('says unknown when there is no knowledge base at all', () => {
    const bare = mkdtempSync(join(tmpdir(), 'understudy-mcp-bare-'));
    try {
      expect(resolveRoute({ ...context, projectRoot: bare }, '/login')).toContain(
        'status: unknown',
      );
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe('resolve_api', () => {
  beforeEach(() => {
    withEndpoints(12);
  });

  it('finds an endpoint and names the file it came from', () => {
    const answer = resolveApi(context, '/api/login', 'post');
    expect(answer).toContain('POST /api/login');
    expect(answer).toContain('openapi.yaml:12');
  });

  it('does not match an endpoint of another method', () => {
    expect(resolveApi(context, '/api/login', 'DELETE')).toContain('status: unknown');
  });

  it('lists at most five endpoints however many match', () => {
    const answer = resolveApi(context, 'orders');
    expect(answer.split('\n').filter((line) => line.includes('/api/orders')).length).toBe(5);
    expect(answer).toContain('and 7 more');
  });

  it('says unknown, with the command that would find out', () => {
    const answer = resolveApi(context, '/api/unheard-of');
    expect(answer).toContain('status: unknown');
    expect(answer).toContain('understudy extract');
  });
});

describe('get_evidence', () => {
  it('lists why a fact is believed', () => {
    const answer = getEvidence(context, routeId('/login'));
    expect(answer).toContain('route:/login');
    expect(answer).toContain('evidence:');
    expect(answer).toContain('browser');
  });

  it('says unknown for an id that is not there, and points at find_knowledge', () => {
    const answer = getEvidence(context, 'route:/nope');
    expect(answer).toContain('status: unknown');
    expect(answer).toContain('find_knowledge');
  });
});

describe('get_freshness', () => {
  it('reports a fresh fact without nagging', () => {
    const answer = getFreshness(context, { route: '/login' });
    expect(answer).toContain('freshness: fresh');
    expect(answer).not.toContain('suggested action');
  });

  it('reports an old fact with the reason and the way out', () => {
    const later = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    const answer = getFreshness(context, { factId: routeId('/login') }, later);
    expect(answer).toContain('freshness: stale');
    expect(answer).toContain('because');
    expect(answer).toContain('suggested action');
  });

  it('asks for something to look up when given nothing', () => {
    expect(getFreshness(context, {})).toContain('factId or a route');
  });

  it('says unknown for a fact that is not there', () => {
    expect(getFreshness(context, { route: '/nope' })).toContain('status: unknown');
  });
});

describe('find_knowledge', () => {
  it('finds a fact by a few words and gives its id', () => {
    const answer = findKnowledge(context, 'log in button');
    expect(answer).toContain('locator');
    expect(answer).toContain("getByRole('button', { name: 'Log in' })");
  });

  it('can be narrowed to one kind', () => {
    const answer = findKnowledge(context, 'login', 'route');
    expect(answer).toContain('route');
    expect(answer).not.toContain('locator');
  });

  it('names the valid kinds when given one that does not exist', () => {
    expect(findKnowledge(context, 'login', 'widget')).toContain('Kinds:');
  });

  it('says unknown when nothing matches', () => {
    expect(findKnowledge(context, 'zebra crossing')).toContain('status: unknown');
  });

  it('names at most five facts', () => {
    withEndpoints(30);
    const answer = findKnowledge(context, 'orders item', 'api');
    expect(answer.split('\n').filter((line) => line.includes(' · api · ')).length).toBe(5);
    expect(answer).toContain('narrow the query');
  });
});

describe('the context budget', () => {
  // An answer is paid for out of the window the real task needs, so the ceiling is
  // asserted over hits, misses and a knowledge base far larger than a list may show.
  const long = 'x'.repeat(5000);

  it('resolve_route stays inside budget', () => {
    withEndpoints(40);
    for (const query of ['/login', 'sign in', '/nope', long, '']) {
      expect(estimateTokens(resolveRoute(context, query))).toBeLessThanOrEqual(
        TOKEN_BUDGET.resolve_route,
      );
    }
  });

  it('resolve_api stays inside budget', () => {
    withEndpoints(60);
    for (const [path, method] of [
      ['orders', undefined],
      ['/api/login', 'POST'],
      ['/nope', undefined],
      [long, long],
    ] as const) {
      expect(estimateTokens(resolveApi(context, path, method))).toBeLessThanOrEqual(
        TOKEN_BUDGET.resolve_api,
      );
    }
  });

  it('get_evidence stays inside budget', () => {
    for (const id of [routeId('/login'), 'route:/nope', long]) {
      expect(estimateTokens(getEvidence(context, id))).toBeLessThanOrEqual(
        TOKEN_BUDGET.get_evidence,
      );
    }
  });

  it('get_freshness stays inside budget', () => {
    const later = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    for (const target of [{ route: '/login' }, { factId: long }, { route: long }, {}]) {
      expect(estimateTokens(getFreshness(context, target, later))).toBeLessThanOrEqual(
        TOKEN_BUDGET.get_freshness,
      );
    }
  });

  it('find_knowledge stays inside budget', () => {
    withEndpoints(80);
    for (const [query, kind] of [
      ['orders item', 'api'],
      ['login', undefined],
      [long, undefined],
      ['login', long],
    ] as const) {
      expect(estimateTokens(findKnowledge(context, query, kind))).toBeLessThanOrEqual(
        TOKEN_BUDGET.find_knowledge,
      );
    }
  });
});
