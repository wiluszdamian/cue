import { describe, expect, it } from 'vitest';
import { normaliseRoute, selectSurveyTargets } from '../src/agent-kb/survey-targets.js';
import { SURVEY_STALE_COMMAND, surveyCommand } from '../src/agent-kb/advice.js';
import {
  indexKnowledge,
  KnowledgeBuilder,
  locatorId,
  routeId,
  type FactStatus,
  type FileStateProvider,
  type KnowledgeIndex,
} from '../src/knowledge/index.js';

const NOW = new Date('2026-10-01T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number): string => new Date(NOW.getTime() - days * DAY).toISOString();

interface Page {
  route: string;
  days?: number;
  status?: FactStatus;
  /** A file the element was read from, and the hash recorded for it. */
  reads?: [string, string];
}

function knowledge(pages: Page[]): KnowledgeIndex {
  const builder = new KnowledgeBuilder();
  const browser = builder.addEvidence({ type: 'browser', route: '/', observedAt: ago(1) });
  for (const page of pages) {
    builder.addFact({
      id: routeId(page.route),
      kind: 'route',
      path: page.route,
      status: 'observed',
      evidence: [browser],
    });
    builder.addFact({
      id: locatorId(page.route, 'button', 'Go'),
      kind: 'locator',
      route: routeId(page.route),
      role: 'button',
      name: 'Go',
      expression: "getByRole('button', { name: 'Go' })",
      status: page.status ?? 'observed',
      evidence: [browser],
      verifiedAt: ago(page.days ?? 1),
      ...(page.reads === undefined
        ? {}
        : { dependencies: { files: [{ path: page.reads[0], hash: page.reads[1] }] } }),
    });
  }
  return indexKnowledge(builder.build());
}

const files = (state: Record<string, string | undefined>): FileStateProvider => ({
  hashOf: (path) => state[path],
});

const routes = (targets: { route: string }[]): string[] => targets.map((t) => t.route);

describe('the pages asked for', () => {
  const index = knowledge([{ route: '/login' }, { route: '/signup' }]);

  it('are chosen as asked, sorted, and say so', () => {
    const targets = selectSurveyTargets(index, { routes: ['/signup', '/login'] });
    expect(targets).toEqual([
      { route: '/login', reasons: ['asked for'] },
      { route: '/signup', reasons: ['asked for'] },
    ]);
  });

  it('need not have been surveyed before: that is how a page is first surveyed', () => {
    expect(routes(selectSurveyTargets(index, { routes: ['/never-seen'] }))).toEqual([
      '/never-seen',
    ]);
  });

  it('are written however they were typed', () => {
    expect(normaliseRoute('login')).toBe('/login');
    expect(normaliseRoute('/login/')).toBe('/login');
    expect(normaliseRoute('/login?next=%2Fa&b=1')).toBe('/login');
    expect(normaliseRoute('/')).toBe('/');
    expect(normaliseRoute('  /a/b/#frag')).toBe('/a/b');
    expect(
      routes(selectSurveyTargets(index, { routes: ['login', '/login/', '/login?x=1'] })),
    ).toEqual(['/login']);
  });

  it('ignore an empty name', () => {
    expect(selectSurveyTargets(index, { routes: ['', '  '] })).toEqual([]);
  });

  it('are skipped, with the reason, when they have a parameter and so no page', () => {
    for (const route of ['/items/[id]', '/users/:id', '/orders/{id}/lines']) {
      const [target] = selectSurveyTargets(index, { routes: [route] });
      expect(target?.skip, route).toContain('survey a concrete URL');
    }
    const [plain] = selectSurveyTargets(index, { routes: ['/items'] });
    expect(plain?.skip).toBeUndefined();
  });
});

describe('the pages that have gone stale', () => {
  it('are those not confirmed for over a month, and why', () => {
    const index = knowledge([
      { route: '/old', days: 45 },
      { route: '/new', days: 1 },
    ]);
    const targets = selectSurveyTargets(index, { stale: true }, { now: NOW });
    expect(targets).toEqual([{ route: '/old', reasons: ['not confirmed for 45 days'] }]);
  });

  it('leave out the merely ageing: they are usable, and a survey is a minute each', () => {
    const index = knowledge([{ route: '/ageing', days: 12 }]);
    expect(selectSurveyTargets(index, { stale: true }, { now: NOW })).toEqual([]);
  });

  it('include an element that failed its last check, naming it', () => {
    const index = knowledge([{ route: '/broken', status: 'stale' }]);
    expect(selectSurveyTargets(index, { stale: true }, { now: NOW })).toEqual([
      { route: '/broken', reasons: ["getByRole('button', { name: 'Go' }) failed its last check"] },
    ]);
  });

  it('include a page read from code that has changed, naming the file', () => {
    const index = knowledge([{ route: '/edited', reads: ['src/Edit.tsx', 'old'] }]);
    const targets = selectSurveyTargets(
      index,
      { stale: true },
      { now: NOW, files: files({ 'src/Edit.tsx': 'new' }) },
    );
    expect(targets).toEqual([
      {
        route: '/edited',
        reasons: ['src/Edit.tsx changed since it was confirmed (' + ago(1).slice(0, 10) + ')'],
      },
    ]);
  });

  it('leave out a page whose code is as it was', () => {
    const index = knowledge([{ route: '/same', reads: ['src/Same.tsx', 'h'] }]);
    expect(
      selectSurveyTargets(
        index,
        { stale: true },
        { now: NOW, files: files({ 'src/Same.tsx': 'h' }) },
      ),
    ).toEqual([]);
  });

  it('are none in an empty knowledge base', () => {
    expect(selectSurveyTargets(knowledge([]), { stale: true })).toEqual([]);
  });
});

describe('the pages a change reaches', () => {
  const index = knowledge([
    { route: '/a', reads: ['src/A.tsx', 'h'] },
    { route: '/b', reads: ['src/B.tsx', 'h'] },
    { route: '/c' },
  ]);

  it('are those read from a changed file, and the file is named', () => {
    expect(selectSurveyTargets(index, { changedPaths: ['src/A.tsx', 'README.md'] })).toEqual([
      { route: '/a', reasons: ['changed: src/A.tsx'] },
    ]);
  });

  it('are none when the change touched nothing a page was read from', () => {
    expect(selectSurveyTargets(index, { changedPaths: ['README.md'] })).toEqual([]);
    expect(selectSurveyTargets(index, { changedPaths: [] })).toEqual([]);
  });

  it('do not include a page that depends on no file, however much changed', () => {
    expect(
      routes(selectSurveyTargets(index, { changedPaths: ['src/A.tsx', 'src/B.tsx', 'x'] })),
    ).toEqual(['/a', '/b']);
  });
});

describe('several reasons at once', () => {
  it('are combined into one entry per page, once each, and kept short', () => {
    const index = knowledge([{ route: '/a', days: 60, reads: ['src/A.tsx', 'old'] }]);
    const [target] = selectSurveyTargets(
      index,
      { routes: ['/a'], stale: true, changedPaths: ['src/A.tsx'] },
      { now: NOW, files: files({ 'src/A.tsx': 'new' }) },
    );
    expect(target?.route).toBe('/a');
    expect(target?.reasons).toEqual([
      'asked for',
      'not confirmed for 60 days',
      'src/A.tsx changed since it was confirmed (' + ago(60).slice(0, 10) + ')',
      '…and 1 more',
    ]);
  });
});

describe('what to run', () => {
  it('names the page when it is known, and falls back to the plain form when it is not', () => {
    expect(surveyCommand('/login')).toBe('cue survey --route /login --base-url <url>');
    expect(surveyCommand()).toBe('cue survey <url>');
    expect(SURVEY_STALE_COMMAND).toBe('cue survey --stale --base-url <url>');
  });
});
