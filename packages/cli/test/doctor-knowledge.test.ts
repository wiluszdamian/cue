import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  indexKnowledge,
  KnowledgeBuilder,
  locatorId,
  routeId,
  testIdFactId,
  type FileStateProvider,
  type KnowledgeBase,
} from '@understudy/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COMMANDS } from '../src/commands.js';
import { knowledgeChecks, probeKnowledge, type KnowledgeProbe } from '../src/doctor-knowledge.js';

/**
 * One diagnosis at a time: each appears when its problem is there, is silent when it is
 * not, and always carries a command that exists.
 */

const NOW = new Date('2026-10-02T12:00:00.000Z');
const RECENT = '2026-10-01T12:00:00.000Z';
const LONG_AGO = '2026-06-01T12:00:00.000Z';

interface Spec {
  routes?: { path: string; verifiedAt?: string; browser?: boolean }[];
  locators?: { route: string; role: string; name: string; testId?: string; verifiedAt?: string }[];
  testIds?: string[];
}

function knowledge(spec: Spec): KnowledgeBase {
  const builder = new KnowledgeBuilder();
  for (const route of spec.routes ?? []) {
    builder.addFact({
      id: routeId(route.path),
      kind: 'route',
      path: route.path,
      status: route.browser === false ? 'inferred' : 'verified',
      evidence: [
        route.browser === false
          ? builder.addEvidence({ type: 'source-code', file: 'src/routes.ts', line: 1 })
          : builder.addEvidence({ type: 'browser', route: route.path, observedAt: RECENT }),
      ],
      ...(route.verifiedAt === undefined ? {} : { verifiedAt: route.verifiedAt }),
    });
  }
  for (const locator of spec.locators ?? []) {
    builder.addFact({
      id: locatorId(locator.route, locator.role, locator.name),
      kind: 'locator',
      route: routeId(locator.route),
      role: locator.role,
      name: locator.name,
      expression: `page.getByRole('${locator.role}', { name: '${locator.name}' })`,
      ...(locator.testId === undefined ? {} : { testId: locator.testId }),
      status: 'verified',
      evidence: [
        builder.addEvidence({ type: 'browser', route: locator.route, observedAt: RECENT }),
      ],
      verifiedAt: locator.verifiedAt ?? RECENT,
    });
  }
  for (const testId of spec.testIds ?? []) {
    builder.addFact({
      id: testIdFactId(testId),
      kind: 'test-id',
      testId,
      status: 'inferred',
      evidence: [builder.addEvidence({ type: 'source-code', file: 'src/Form.tsx', line: 3 })],
    });
  }
  return builder.build();
}

function probe(spec: Spec, rest: Partial<KnowledgeProbe> = {}): KnowledgeProbe {
  return {
    hasKb: true,
    issues: [],
    legacyRoutes: [],
    index: indexKnowledge(knowledge(spec)),
    now: NOW,
    testIdsGone: [],
    ...rest,
  };
}

const HEALTHY: Spec = {
  routes: [{ path: '/login', verifiedAt: RECENT }],
  locators: [{ route: '/login', role: 'button', name: 'Log in', verifiedAt: RECENT }],
};

const ids = (p: KnowledgeProbe): string[] => knowledgeChecks(p).map((result) => result.id);

/** A command named in a fix must be one the CLI has. */
function commandsIn(text: string): string[] {
  return [...text.matchAll(/understudy ([a-z][a-z-]*)/g)].map((m) => m[1] ?? '');
}

describe('a healthy knowledge base', () => {
  it('is one line, not a list of passing checks', () => {
    const results = knowledgeChecks(probe(HEALTHY));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'agent-kb', status: 'ok' });
    expect(results[0]?.detail).toContain('1 route, 1 element');
  });
});

describe('no knowledge base', () => {
  it('is one warning with a way to start, not a flood', () => {
    const results = knowledgeChecks(probe({}, { hasKb: false }));
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('warn');
    expect(results[0]?.fix).toContain('understudy survey');
    expect(results[0]?.fix).toContain('understudy extract');
  });

  it('warns when the folder is there and empty', () => {
    expect(knowledgeChecks(probe({}))[0]).toMatchObject({ id: 'agent-kb', status: 'warn' });
  });
});

describe('files that cannot be used', () => {
  it('is an error, and names the file and the way out', () => {
    const results = knowledgeChecks(
      probe(HEALTHY, {
        issues: [
          {
            path: '.agent-kb/app-map/login.yaml',
            severity: 'error',
            message: 'could not be read (bad indent)',
          },
        ],
      }),
    );
    const found = results.find((r) => r.id === 'kb:files');
    expect(found?.status).toBe('error');
    expect(found?.detail).toContain('login.yaml');
    expect(found?.fix).toContain('understudy survey --route');
  });

  it('separates product files, which extract rewrites', () => {
    const results = knowledgeChecks(
      probe(HEALTHY, {
        issues: [
          { path: '.agent-kb/product/surface.yaml', severity: 'warning', message: 'is odd' },
        ],
      }),
    );
    const found = results.find((r) => r.id === 'kb:product-files');
    expect(found?.status).toBe('warn');
    expect(found?.fix).toContain('understudy extract');
  });

  it('is absent when every file reads', () => {
    expect(ids(probe(HEALTHY))).not.toContain('kb:files');
  });
});

describe('older route maps', () => {
  it('asks to look again, naming a route', () => {
    const found = knowledgeChecks(probe(HEALTHY, { legacyRoutes: ['/login', '/items'] })).find(
      (r) => r.id === 'kb:legacy',
    );
    expect(found?.fix).toBe('understudy survey --route /login --base-url <url>');
    expect(found?.detail).toContain('2 pages');
  });

  it('is absent when none are old', () => {
    expect(ids(probe(HEALTHY))).not.toContain('kb:legacy');
  });
});

describe('what is out of date', () => {
  it('reports facts not confirmed for over a month, with the reason', () => {
    const found = knowledgeChecks(
      probe({
        routes: [{ path: '/login', verifiedAt: LONG_AGO }],
        locators: [{ route: '/login', role: 'button', name: 'Log in', verifiedAt: LONG_AGO }],
      }),
    ).find((r) => r.id === 'kb:fresh');
    expect(found?.status).toBe('warn');
    expect(found?.detail).toContain('2 not confirmed for over a month');
    expect(found?.detail).toContain('not confirmed for');
    expect(found?.fix).toContain('understudy survey --stale');
  });

  it('reports facts whose code changed since they were confirmed', () => {
    const base = knowledge({
      routes: [{ path: '/login', verifiedAt: RECENT }],
    });
    const withDependency: KnowledgeBase = {
      ...base,
      facts: base.facts.map((fact) =>
        fact.kind === 'route'
          ? { ...fact, dependencies: { files: [{ path: 'src/Login.tsx', hash: 'old' }] } }
          : fact,
      ),
    };
    const files: FileStateProvider = { hashOf: () => 'new' };
    const found = knowledgeChecks({
      ...probe({}),
      index: indexKnowledge(withDependency),
      files,
    }).find((r) => r.id === 'kb:fresh');
    expect(found?.detail).toContain('possibly out of date because the code changed');
    expect(found?.detail).toContain('src/Login.tsx changed');
  });

  it('lists five and counts the rest', () => {
    const routes = Array.from({ length: 12 }, (_, i) => ({
      path: `/r${String(i)}`,
      verifiedAt: LONG_AGO,
    }));
    const found = knowledgeChecks(probe({ routes })).find((r) => r.id === 'kb:fresh');
    expect(found?.detail).toContain('and 7 more');
    expect(found?.detail.match(/\/r\d+ \(/g)).toHaveLength(5);
  });

  it('leaves a fact that was never confirmed to the coverage check', () => {
    expect(ids(probe({ routes: [{ path: '/orders', browser: false }] }))).not.toContain('kb:fresh');
  });
});

describe('conflicts', () => {
  it('names the fact and says neither source was picked', () => {
    const base = knowledge(HEALTHY);
    const found = knowledgeChecks(
      probe(
        {},
        {
          index: indexKnowledge({
            ...base,
            conflicts: [
              {
                factId: routeId('/login'),
                field: 'title',
                values: [
                  { value: 'Sign in', evidence: [] },
                  { value: 'Log in', evidence: [] },
                ],
              },
            ],
          }),
        },
      ),
    ).find((r) => r.id === 'kb:conflicts');
    expect(found?.detail).toContain('route:/login (title: Sign in vs Log in)');
    expect(found?.fix).toBe('understudy survey --route /login --base-url <url>');
  });

  it('is absent without any', () => {
    expect(ids(probe(HEALTHY))).not.toContain('kb:conflicts');
  });
});

describe('locators in tests', () => {
  it('lists the unknown ones with where they are, and points at check', () => {
    const found = knowledgeChecks(
      probe(HEALTHY, {
        unknownInTests: [{ where: 'tests/a.spec.ts:7', expression: "getByRole('button')" }],
      }),
    ).find((r) => r.id === 'kb:tests');
    expect(found?.detail).toContain('tests/a.spec.ts:7');
    expect(found?.fix).toBe('understudy check');
  });

  it('is absent when every one is known, or when tests were not looked at', () => {
    expect(ids(probe(HEALTHY, { unknownInTests: [] }))).not.toContain('kb:tests');
    expect(ids(probe(HEALTHY))).not.toContain('kb:tests');
  });
});

describe('test ids that left the source', () => {
  it('names them and sends the reader to extract', () => {
    const found = knowledgeChecks(probe(HEALTHY, { testIdsGone: ['login-submit'] })).find(
      (r) => r.id === 'kb:test-ids',
    );
    expect(found?.detail).toContain('login-submit');
    expect(found?.fix).toContain('understudy extract');
  });
});

describe('the same element twice', () => {
  it('is reported when two ids share a test id on one route', () => {
    const found = knowledgeChecks(
      probe({
        routes: [{ path: '/login', verifiedAt: RECENT }],
        locators: [
          { route: '/login', role: 'button', name: 'Log in', testId: 'go' },
          { route: '/login', role: 'button', name: 'Sign in', testId: 'go' },
        ],
      }),
    ).find((r) => r.id === 'kb:duplicates');
    expect(found?.detail).toContain('1 element noted under more than one id');
  });

  it('is absent for two different elements', () => {
    expect(
      ids(
        probe({
          routes: [{ path: '/login', verifiedAt: RECENT }],
          locators: [
            { route: '/login', role: 'button', name: 'Log in', testId: 'a' },
            { route: '/login', role: 'button', name: 'Cancel', testId: 'b' },
          ],
        }),
      ),
    ).not.toContain('kb:duplicates');
  });
});

describe('pages known only from the code', () => {
  it('asks for a survey of one that can be named', () => {
    const found = knowledgeChecks(
      probe({
        routes: [
          { path: '/items/[id]', browser: false },
          { path: '/orders', browser: false },
          { path: '/login', verifiedAt: RECENT },
        ],
        locators: [{ route: '/login', role: 'button', name: 'Log in' }],
      }),
    ).find((r) => r.id === 'kb:coverage');
    expect(found?.detail).toContain('2 pages');
    expect(found?.fix).toBe('understudy survey --route /orders --base-url <url>');
  });

  it('cannot name a page with a parameter, and says to use a real address', () => {
    const found = knowledgeChecks(
      probe({ routes: [{ path: '/items/[id]', browser: false }] }),
    ).find((r) => r.id === 'kb:coverage');
    expect(found?.fix).toBe('understudy survey <url>');
  });
});

describe('every diagnosis', () => {
  const everything = probe(
    {
      routes: [
        { path: '/login', verifiedAt: LONG_AGO },
        { path: '/orders', browser: false },
      ],
      locators: [
        { route: '/login', role: 'button', name: 'Log in', testId: 'x', verifiedAt: LONG_AGO },
        { route: '/login', role: 'button', name: 'Sign in', testId: 'x', verifiedAt: LONG_AGO },
      ],
    },
    {
      issues: [{ path: '.agent-kb/app-map/a.yaml', severity: 'error', message: 'broken' }],
      legacyRoutes: ['/login'],
      testIdsGone: ['gone'],
      unknownInTests: [{ where: 'a.spec.ts:1', expression: 'x' }],
    },
  );

  it('carries a fix, and the fix names commands that exist', () => {
    const results = knowledgeChecks(everything);
    expect(results.length).toBeGreaterThan(5);
    for (const result of results) {
      if (result.status === 'ok') continue;
      expect(result.fix, result.id).toBeTruthy();
      for (const command of commandsIn(result.fix ?? '')) {
        expect(COMMANDS as readonly string[], `${result.id}: ${command}`).toContain(command);
      }
    }
  });

  it('is fast on a knowledge base of two thousand facts', () => {
    const routes = Array.from({ length: 200 }, (_, i) => ({
      path: `/page${String(i)}`,
      verifiedAt: i % 2 === 0 ? RECENT : LONG_AGO,
    }));
    const locators = Array.from({ length: 1800 }, (_, i) => ({
      route: `/page${String(i % 200)}`,
      role: 'button',
      name: `Action ${String(i)}`,
      verifiedAt: RECENT,
    }));
    const big = probe({ routes, locators });
    expect(big.index.allLocators().length + big.index.routes().length).toBe(2000);

    const started = performance.now();
    knowledgeChecks(big);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('reading the disk', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'understudy-doctor-kb-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text, 'utf8');
  };

  it('reports no knowledge base when there is no .agent-kb', () => {
    expect(probeKnowledge(root, NOW).hasKb).toBe(false);
  });

  it('reports a file it cannot parse instead of ignoring it', () => {
    write('.agent-kb/app-map/broken.yaml', 'route: [unclosed');
    const results = knowledgeChecks(probeKnowledge(root, NOW));
    expect(results.find((r) => r.id === 'kb:files')?.status).toBe('error');
  });

  it('notices a test id that the source no longer contains', () => {
    write(
      '.agent-kb/product/testids.yaml',
      [
        'schemaVersion: 1',
        'testIds:',
        '  - testId: login-submit',
        '    source: src/Login.tsx:4',
        '  - testId: still-here',
        '    source: src/Login.tsx:9',
        '',
      ].join('\n'),
    );
    write('package.json', '{"name":"p"}');
    write('src/Login.tsx', '<button data-testid="still-here" />');
    const results = knowledgeChecks(probeKnowledge(root, NOW, root));
    const found = results.find((r) => r.id === 'kb:test-ids');
    expect(found?.detail).toContain('login-submit');
    expect(found?.detail).not.toContain('still-here');
  });
});
