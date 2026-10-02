import {
  buildTaskContext,
  cachedKnowledgeIndex,
  DEFAULT_CONTEXT_TOKENS,
  describeEvidence,
  computeFreshness,
  findProductRoot,
  nameSimilarity,
  routeToFilename,
  words,
  workingTreeFiles,
  type FactKind,
  type KnowledgeEvidence,
  type KnowledgeFact,
  type KnowledgeIndex,
} from '@understudy/engine';
import type { ToolContext } from './tools.js';

/**
 * Point lookups over the knowledge base: one fact, its reasons, how far to trust it.
 * Every answer comes from the same engine functions the CLI uses; what lives here is
 * only the choosing of what to print, kept short because it is paid for in context.
 *
 * An answer to something not known always has the same shape — `status: unknown`
 * and the command that would find out — and never a value that was made up.
 */

export const FACT_KINDS: readonly FactKind[] = [
  'application',
  'environment',
  'route',
  'component',
  'role',
  'state',
  'action',
  'locator',
  'test-id',
  'api',
  'term',
  'data-requirement',
];

/** Most facts a list answer names. More would cost context to say what a narrower question answers. */
const MAX_HITS = 5;
const MAX_EVIDENCE = 4;
const MAX_ROUTES_LISTED = 8;

/** Whatever the caller typed is echoed back; it must not be able to make an answer long. */
function clip(text: string, length = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

function indexOf(context: ToolContext): KnowledgeIndex {
  return cachedKnowledgeIndex(context.projectRoot);
}

function freshnessOfFact(context: ToolContext, fact: KnowledgeFact, now: Date) {
  const productRoot = findProductRoot(context.projectRoot);
  return computeFreshness(
    fact,
    now,
    productRoot === undefined ? undefined : workingTreeFiles(productRoot),
  );
}

function unknown(what: string, suggestion: string, extra: readonly string[] = []): string {
  return ['status: unknown', what, ...extra, '', `suggested action: ${suggestion}`].join('\n');
}

const evidenceLine = (item: KnowledgeEvidence): string => `- ${describeEvidence(item)}`;

function sourcesOf(index: KnowledgeIndex, fact: KnowledgeFact): string[] {
  const all = index.evidenceFor(fact.id);
  const shown = all.slice(0, MAX_EVIDENCE).map(evidenceLine);
  return all.length > MAX_EVIDENCE
    ? [...shown, `- …and ${String(all.length - MAX_EVIDENCE)} more (get_evidence ${fact.id})`]
    : shown;
}

/** The one line a list of facts shows for each. */
function describe(fact: KnowledgeFact): string {
  switch (fact.kind) {
    case 'route':
      return fact.title === undefined ? fact.path : `${fact.path} — ${fact.title}`;
    case 'locator':
      return fact.expression;
    case 'test-id':
      return fact.testId;
    case 'api':
      return `${fact.method ?? 'ANY'} ${fact.path}`;
    case 'term':
      return `${fact.key} = ${fact.label}`;
    case 'action':
      return fact.intent;
    default:
      return fact.name;
  }
}

/** The words a query is matched against, per kind. */
function searchable(fact: KnowledgeFact): string {
  switch (fact.kind) {
    case 'route':
      return `${fact.path} ${fact.title ?? ''}`;
    case 'locator':
      return `${fact.name ?? ''} ${fact.role} ${fact.testId ?? ''}`;
    case 'test-id':
      return fact.testId;
    case 'api':
      return `${fact.method ?? ''} ${fact.path}`;
    case 'term':
      return `${fact.key} ${fact.label}`;
    case 'action':
      return fact.intent;
    default:
      return fact.name;
  }
}

function knownRoutes(index: KnowledgeIndex): string {
  const paths = index.routes().map((route) => route.path);
  if (paths.length === 0) return 'Routes known: none.';
  const shown = paths.slice(0, MAX_ROUTES_LISTED).join(', ');
  return `Routes known: ${shown}${paths.length > MAX_ROUTES_LISTED ? `, …(${String(paths.length - MAX_ROUTES_LISTED)} more)` : ''}`;
}

// -------------------------------------------------------------- resolve_route

export function resolveRoute(context: ToolContext, query: string, now: Date = new Date()): string {
  const index = indexOf(context);
  const wanted = query.trim();

  let route = index.routes().find((r) => routeToFilename(r.path) === routeToFilename(wanted));
  if (route === undefined && wanted !== '') {
    const ranked = index
      .routes()
      .map((r) => ({ r, score: nameSimilarity(searchable(r), '', wanted) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    route = ranked[0]?.r;
  }

  if (route === undefined) {
    return unknown(
      `No route matches "${clip(wanted)}".`,
      'run `understudy survey <url>` for the page, or `understudy extract --source <dir>` if it is in the code.',
      [knownRoutes(index)],
    );
  }

  const verdict = freshnessOfFact(context, route, now);
  const lines = [
    `route: ${route.path}`,
    ...(route.title === undefined ? [] : [`title: ${clip(route.title, 80)}`]),
    `status: ${route.status}`,
    `freshness: ${verdict.freshness}`,
    ...verdict.reasons.slice(0, 3).map((reason) => `  because ${clip(reason, 100)}`),
    `elements: ${String(index.locatorsOn(route.path).length)}`,
    'sources:',
    ...sourcesOf(index, route),
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------- resolve_api

/** Nearly every path says so, which makes the word a match for everything. */
const GENERIC_PATH_WORDS = new Set(['api']);

/** Every word the caller gave must be a whole word of the path; one that is not is a different endpoint. */
function pathMatches(path: string, query: string): boolean {
  const wanted = words(query)
    .split(' ')
    .filter((word) => word !== '' && !GENERIC_PATH_WORDS.has(word));
  if (wanted.length === 0) return false;
  const known = new Set(words(path).split(' '));
  return wanted.every((word) => known.has(word));
}

export function resolveApi(context: ToolContext, path: string, method?: string): string {
  const index = indexOf(context);
  const wantedMethod = method?.trim().toUpperCase();
  const wanted = path.trim();

  const sameMethod = (m: string | undefined): boolean =>
    wantedMethod === undefined || wantedMethod === '' || m === undefined || m === wantedMethod;

  const exact = index.apis().filter((api) => api.path === wanted && sameMethod(api.method));
  const found =
    exact.length > 0
      ? exact
      : index.apis().filter((api) => sameMethod(api.method) && pathMatches(api.path, wanted));

  if (found.length === 0) {
    return unknown(
      `No endpoint matches ${wantedMethod === undefined ? '' : `${clip(wantedMethod, 12)} `}"${clip(wanted)}".`,
      'run `understudy extract --source <dir>` if the project has an OpenAPI document or route handlers.',
      [`Endpoints known: ${String(index.apis().length)}.`],
    );
  }

  const lines = found.slice(0, MAX_HITS).flatMap((api) => {
    const first = index.evidenceFor(api.id)[0];
    const source =
      first?.file === undefined
        ? 'no source recorded'
        : `${first.file}${first.line === undefined ? '' : `:${String(first.line)}`}`;
    return [`${api.method ?? 'ANY'} ${api.path} · ${api.status} · ${source}`];
  });
  if (found.length > MAX_HITS) lines.push(`…and ${String(found.length - MAX_HITS)} more`);
  return lines.join('\n');
}

// -------------------------------------------------------------- get_evidence

export function getEvidence(context: ToolContext, factId: string): string {
  const index = indexOf(context);
  const fact = index.fact(factId.trim());
  if (fact === undefined) {
    return unknown(
      `No fact has the id "${clip(factId, 80)}".`,
      'use find_knowledge to look an id up by what it is called.',
    );
  }
  const conflicts = index.conflictsFor(fact.id);
  return [
    `${fact.id} · ${fact.status}`,
    'evidence:',
    ...sourcesOf(index, fact),
    ...(conflicts.length === 0
      ? []
      : [`conflicts: ${String(conflicts.length)} — sources disagree; do not rely on this fact`]),
  ].join('\n');
}

// -------------------------------------------------------------- get_freshness

export function getFreshness(
  context: ToolContext,
  target: { factId?: string | undefined; route?: string | undefined },
  now: Date = new Date(),
): string {
  const index = indexOf(context);
  const id = target.factId?.trim();
  const path = target.route?.trim();

  if ((id === undefined || id === '') && (path === undefined || path === '')) {
    return 'Give a factId or a route.';
  }

  const fact =
    id !== undefined && id !== ''
      ? index.fact(id)
      : index.routes().find((r) => routeToFilename(r.path) === routeToFilename(path ?? ''));

  if (fact === undefined) {
    return unknown(
      `Nothing is known as "${clip(id ?? path ?? '', 80)}", so there is no age to report.`,
      'run `understudy survey <url>` or `understudy extract --source <dir>`.',
    );
  }

  const verdict = freshnessOfFact(context, fact, now);
  return [
    `${fact.id} · ${fact.status}`,
    `freshness: ${verdict.freshness}`,
    ...(fact.verifiedAt === undefined
      ? ['confirmed: never']
      : [`confirmed: ${fact.verifiedAt.slice(0, 10)}`]),
    ...verdict.reasons.slice(0, 4).map((reason) => `because ${clip(reason, 100)}`),
    ...(verdict.freshness === 'fresh'
      ? []
      : ['', 'suggested action: run `understudy verify`, or survey the page again.']),
  ].join('\n');
}

// -------------------------------------------------------------- find_knowledge

export function findKnowledge(context: ToolContext, query: string, kind?: string): string {
  const index = indexOf(context);
  const wantedKind = kind?.trim();

  if (
    wantedKind !== undefined &&
    wantedKind !== '' &&
    !FACT_KINDS.includes(wantedKind as FactKind)
  ) {
    return `No kind called "${clip(wantedKind, 30)}". Kinds: ${FACT_KINDS.join(', ')}.`;
  }

  const kb = [
    ...index.routes(),
    ...index.allLocators(),
    ...index.apis(),
    ...index.terms(),
  ] as KnowledgeFact[];
  const hits = kb
    .filter((fact) => wantedKind === undefined || wantedKind === '' || fact.kind === wantedKind)
    .map((fact) => ({ fact, score: nameSimilarity(searchable(fact), '', query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (hits.length === 0) {
    return unknown(
      `Nothing found for "${clip(query)}"${wantedKind ? ` among ${wantedKind} facts` : ''}.`,
      'run `understudy survey <url>` for a page, or `understudy extract --source <dir>` for the code.',
    );
  }

  return [
    ...hits
      .slice(0, MAX_HITS)
      .map(({ fact }) => `${fact.id} · ${fact.kind} · ${clip(describe(fact), 90)}`),
    ...(hits.length > MAX_HITS
      ? [`…and ${String(hits.length - MAX_HITS)} more; narrow the query`]
      : []),
  ].join('\n');
}

// ---------------------------------------------------------------- get_context

export function getContext(
  context: ToolContext,
  task: string,
  options: { maxTokens?: number | undefined; route?: string | undefined } = {},
  now: Date = new Date(),
): string {
  const productRoot = findProductRoot(context.projectRoot);
  return buildTaskContext(
    indexOf(context),
    context.rules.constitution.rules,
    { task, maxTokens: options.maxTokens ?? DEFAULT_CONTEXT_TOKENS, route: options.route },
    {
      now,
      files: productRoot === undefined ? undefined : workingTreeFiles(productRoot),
    },
  ).text;
}
