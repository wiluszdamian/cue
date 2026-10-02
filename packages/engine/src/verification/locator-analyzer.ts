import {
  scanTestSource,
  type LocatorUse,
  type TestSourceScan,
} from '../agent-kb/extract-locators.js';
import { routeToFilename } from '../agent-kb/snapshot/index.js';
import {
  nameSimilarity,
  type KnowledgeIndex,
  type LocatorFact,
  type TestIdFact,
} from '../knowledge/index.js';

/**
 * Does each locator in a test name something the knowledge base knows? One pure
 * function, used by `understudy check`, the lint rule, the benchmark and `doctor`,
 * so "known" means the same thing to all of them and the matching is written once.
 *
 * It judges only what it can. A locator built from a variable, a text or CSS
 * lookup the knowledge base does not store, a name given as a regular expression:
 * these are `undecidable`, and reported as such rather than as findings. A checker
 * that guesses gets switched off, and then it guards nothing.
 */

export type LocatorVerdict =
  /** Exactly one fresh, observed or verified fact matches. */
  | 'known'
  /** More than one element on the route matches, so Playwright's strict mode would refuse it. */
  | 'ambiguous'
  /** Nothing matches: very likely invented. */
  | 'unknown'
  /** Known, but only on a route other than the one the test is on. */
  | 'wrong-route'
  /** Matches a fact that failed its last check, or that has not been confirmed for too long. */
  | 'stale'
  /** Matches only something inferred, or only a test id the source has but nobody has seen. */
  | 'unverified'
  /** Cannot be decided from the code alone. */
  | 'undecidable';

export interface NearestFact {
  readonly factId: string;
  readonly route: string;
  readonly expression: string;
  readonly score: number;
}

export interface LocatorFinding {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  /** The call as the knowledge base would write it. */
  readonly expression: string;
  readonly method: string;
  readonly verdict: LocatorVerdict;
  /** The route the test was on at this point, and how that was found. */
  readonly routeContext?: string;
  readonly match?: {
    readonly factId: string;
    readonly route: string;
    readonly expression: string;
    readonly status: string;
    readonly verifiedAt?: string;
  };
  /** At most three, the same route first. */
  readonly nearest: readonly NearestFact[];
  /** One sentence for a model: what to use instead, or what to run. */
  readonly suggestion: string;
  /** Why it could not be decided, for `undecidable`. */
  readonly note?: string;
}

export interface AnalyzeLocatorsInput {
  readonly filePath: string;
  readonly source: string;
  readonly index: KnowledgeIndex;
  readonly now?: Date;
}

/** Roles `getByLabel` can reach: form controls, which are what a label belongs to. */
const LABELLED_ROLES = new Set([
  'textbox',
  'combobox',
  'checkbox',
  'radio',
  'spinbutton',
  'searchbox',
  'slider',
  'switch',
  'listbox',
]);

const NEAREST = 3;

const collapse = (value: string): string => value.trim().replace(/\s+/g, ' ');

/** A fact's name, whitespace collapsed, in both cases: worked out once, not once per locator. */
interface Names {
  readonly exact: string;
  readonly lower: string;
}

function namesOf(fact: LocatorFact, cache: Map<LocatorFact, Names>): Names | undefined {
  if (fact.name === undefined) return undefined;
  let names = cache.get(fact);
  if (names === undefined) {
    const exact = collapse(fact.name);
    names = { exact, lower: exact.toLowerCase() };
    cache.set(fact, names);
  }
  return names;
}

/** Playwright's default: case-insensitive substring. `exact` is case-sensitive equality. */
function nameMatches(names: Names | undefined, wanted: string, exact: boolean): boolean {
  if (names === undefined) return false;
  const want = collapse(wanted);
  return exact ? names.exact === want : names.lower.includes(want.toLowerCase());
}

const sameRoute = (a: string, b: string): boolean => routeToFilename(a) === routeToFilename(b);

/** `route:/login` → `/login` */
const pathOf = (fact: LocatorFact): string => fact.route.replace(/^route:/, '');

/** The route the test is on where `use` is written, and the evidence for saying so. */
function routeContextFor(use: LocatorUse, scan: TestSourceScan): string | undefined {
  // Innermost function first: a goto in this test beats one further out.
  for (const scope of use.scopes) {
    const before = scan.navigations
      .filter((nav) => nav.scopes[0] === scope && nav.offset < use.offset)
      .at(-1);
    if (before !== undefined) return pathFromTarget(before.target);
  }
  return scan.routeAnnotation === undefined ? undefined : pathFromTarget(scan.routeAnnotation);
}

function pathFromTarget(target: string): string {
  try {
    return new URL(target).pathname || '/';
  } catch {
    const path = target.split(/[?#]/)[0] ?? target;
    return path.startsWith('/') ? path : `/${path}`;
  }
}

export function analyzeLocators(input: AnalyzeLocatorsInput): LocatorFinding[] {
  const { index, now } = input;
  const scan = scanTestSource(input.source);
  if (scan.locators.length === 0) return [];

  const all = index.allLocators();
  const nothingKnown = all.length === 0 && index.routes().length === 0;

  const names = new Map<LocatorFact, Names>();
  const byRoute = new Map<string, LocatorFact[]>();
  for (const fact of all) {
    const key = routeToFilename(pathOf(fact));
    const group = byRoute.get(key);
    if (group === undefined) byRoute.set(key, [fact]);
    else group.push(fact);
  }

  return scan.locators.map((use) => {
    const routeContext = routeContextFor(use, scan);
    const position = {
      line: use.line,
      column: use.column,
      endLine: use.endLine,
      endColumn: use.endColumn,
      expression: use.locator,
      method: use.method,
      ...(routeContext === undefined ? {} : { routeContext }),
    };

    const undecided = (note: string): LocatorFinding => ({
      ...position,
      verdict: 'undecidable',
      nearest: [],
      note,
      suggestion: `Not judged: ${note}.`,
    });

    const judged = judgeable(use);
    if (judged.kind === 'skip') return undecided(judged.note);

    const onRoute =
      routeContext === undefined ? all : (byRoute.get(routeToFilename(routeContext)) ?? []);

    // What the locator could be pointing at, among the facts on the route in scope.
    const inScope = matching(onRoute, judged, names);
    const elsewhere =
      routeContext === undefined
        ? []
        : matching(all, judged, names).filter((f) => !onRoute.includes(f));

    // Only computed for a finding that shows it: scoring every fact is the expensive part.
    const near = (): NearestFact[] => nearest(all, judged.query, routeContext);
    const sourceOnly =
      judged.kind === 'testid' ? index.byTestId(judged.query).filter(isTestIdFact) : [];

    if (inScope.length === 0 && elsewhere.length === 0) {
      // A bare role says nothing about names, and the knowledge base keeps only named elements.
      if (judged.kind === 'role' && judged.name === undefined) {
        return undecided(
          'the knowledge base records only named elements, so an unnamed one cannot be checked',
        );
      }
      if (sourceOnly.length > 0) {
        return {
          ...position,
          verdict: 'unverified',
          nearest: near(),
          suggestion:
            `The product source has test id "${judged.query}", but nobody has seen it on a page. ` +
            `Run \`understudy survey <url>${routeContext ?? '/…'}\` to confirm where it appears.`,
        };
      }
      const nearList = near();
      return {
        ...position,
        verdict: 'unknown',
        nearest: nearList,
        suggestion: unknownAdvice(nearList, routeContext, nothingKnown, use.locator),
      };
    }

    if (inScope.length === 0) {
      const found = elsewhere[0];
      if (found === undefined) throw new Error('unreachable: elsewhere is non-empty here');
      return {
        ...position,
        verdict: 'wrong-route',
        match: describe(found),
        nearest: near(),
        suggestion:
          `${use.locator} exists on ${pathOf(found)}, not on ${routeContext ?? 'this route'}. ` +
          `Either this test is on the wrong page, or run \`understudy survey <url>${routeContext ?? ''}\` to see what is really there.`,
      };
    }

    // More than one element: Playwright refuses that, unless a parent narrows it.
    if (inScope.length > 1 && !use.chained) {
      const first = inScope[0];
      if (first === undefined) throw new Error('unreachable: inScope is non-empty here');
      return {
        ...position,
        verdict: 'ambiguous',
        match: describe(first),
        nearest: inScope.slice(0, NEAREST).map(toNearest),
        suggestion: `${String(inScope.length)} elements match ${use.locator}: ${inScope
          .slice(0, NEAREST)
          .map((f) => f.expression)
          .join(
            ', ',
          )}. Make it specific with { name: '…', exact: true } or narrow it with a parent locator.`,
      };
    }

    const found = best(inScope, judged.query);
    const state = standing(found, index, now);
    return {
      ...position,
      verdict: state,
      match: describe(found),
      nearest: state === 'known' ? [] : near(),
      suggestion: adviceFor(state, found, index, use.locator),
    };
  });
}

// ------------------------------------------------------------------- judging

type Judged =
  | { kind: 'skip'; note: string }
  | { kind: 'role'; role: string; name: string | undefined; exact: boolean; query: string }
  | { kind: 'testid'; id: string; query: string }
  | { kind: 'label'; label: string; exact: boolean; query: string };

function judgeable(use: LocatorUse): Judged {
  if (use.dynamic)
    return { kind: 'skip', note: 'it is built from something only known at runtime' };

  switch (use.method) {
    case 'getByRole':
      if (use.value === undefined) return { kind: 'skip', note: 'it has no role' };
      return {
        kind: 'role',
        role: use.value.toLowerCase(),
        name: use.name,
        exact: use.exact,
        query: use.name ?? use.value,
      };
    case 'getByTestId':
      return use.value === undefined
        ? { kind: 'skip', note: 'it has no test id' }
        : { kind: 'testid', id: use.value, query: use.value };
    case 'getByLabel':
      return use.value === undefined
        ? { kind: 'skip', note: 'it has no label' }
        : { kind: 'label', label: use.value, exact: use.exact, query: use.value };
    default:
      return {
        kind: 'skip',
        note: `${use.method} looks at something the knowledge base does not store`,
      };
  }
}

function matching(
  facts: readonly LocatorFact[],
  judged: Exclude<Judged, { kind: 'skip' }>,
  names: Map<LocatorFact, Names>,
): LocatorFact[] {
  switch (judged.kind) {
    case 'role':
      return facts.filter(
        (fact) =>
          fact.role.toLowerCase() === judged.role &&
          (judged.name === undefined ||
            nameMatches(namesOf(fact, names), judged.name, judged.exact)),
      );
    case 'testid':
      return facts.filter((fact) => fact.testId === judged.id);
    case 'label':
      return facts.filter(
        (fact) =>
          LABELLED_ROLES.has(fact.role.toLowerCase()) &&
          nameMatches(namesOf(fact, names), judged.label, judged.exact),
      );
  }
}

const isTestIdFact = (fact: LocatorFact | TestIdFact): fact is TestIdFact =>
  fact.kind === 'test-id';

/** The closest match by name, so a loose substring does not pick an arbitrary neighbour. */
function best(facts: readonly LocatorFact[], query: string): LocatorFact {
  const ranked = [...facts].sort(
    (a, b) => nameSimilarity(b.name, b.role, query) - nameSimilarity(a.name, a.role, query),
  );
  const first = ranked[0];
  if (first === undefined) throw new Error('best() needs at least one fact');
  return first;
}

function standing(
  fact: LocatorFact,
  index: KnowledgeIndex,
  now: Date | undefined,
): 'known' | 'stale' | 'unverified' {
  if (fact.status === 'stale' || index.freshness(fact, now) === 'stale') return 'stale';
  if (fact.status === 'inferred') return 'unverified';
  return 'known';
}

// ---------------------------------------------------------------- reporting

const toNearest = (fact: LocatorFact, score = 0): NearestFact => ({
  factId: fact.id,
  route: pathOf(fact),
  expression: fact.expression,
  score,
});

function describe(fact: LocatorFact): NonNullable<LocatorFinding['match']> {
  return {
    factId: fact.id,
    route: pathOf(fact),
    expression: fact.expression,
    status: fact.status,
    ...(fact.verifiedAt === undefined ? {} : { verifiedAt: fact.verifiedAt }),
  };
}

/** The closest known locators, the route the test is on first. */
function nearest(
  all: readonly LocatorFact[],
  query: string,
  routeContext: string | undefined,
): NearestFact[] {
  return all
    .map((fact) => ({ fact, score: nameSimilarity(fact.name ?? fact.testId, fact.role, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      const aHere = routeContext !== undefined && sameRoute(pathOf(a.fact), routeContext) ? 1 : 0;
      const bHere = routeContext !== undefined && sameRoute(pathOf(b.fact), routeContext) ? 1 : 0;
      return bHere - aHere || b.score - a.score;
    })
    .slice(0, NEAREST)
    .map((entry) => toNearest(entry.fact, entry.score));
}

function unknownAdvice(
  near: readonly NearestFact[],
  routeContext: string | undefined,
  nothingKnown: boolean,
  expression: string,
): string {
  if (nothingKnown) {
    return (
      `Nothing is known about this application yet, so ${expression} cannot be checked. ` +
      'Run `understudy extract --source <path>` and `understudy survey <url>` first.'
    );
  }
  const closest = near[0];
  const survey = `understudy survey <url>${routeContext ?? '/…'}`;
  return closest === undefined
    ? `${expression} is not in the knowledge base and nothing similar is. Do not guess: run \`${survey}\` and use what it finds.`
    : `${expression} is not in the knowledge base. Nearest known: ${closest.expression} on ${closest.route}. ` +
        `Use that, or run \`${survey}\` if the element is new.`;
}

function adviceFor(
  state: 'known' | 'stale' | 'unverified',
  fact: LocatorFact,
  index: KnowledgeIndex,
  expression: string,
): string {
  switch (state) {
    case 'known':
      return `${expression} matches ${fact.expression} on ${pathOf(fact)}.`;
    case 'stale':
      return `${expression} matches ${fact.expression} on ${pathOf(fact)}, but ${
        fact.status === 'stale' ? 'it failed its last check' : 'it has not been confirmed recently'
      }. Run \`understudy survey <url>${pathOf(fact)}\` before relying on it.`;
    case 'unverified':
      return `${expression} matches ${fact.expression} on ${pathOf(fact)}, but that is only inferred (${index.coverage(fact)}), never seen running. Survey ${pathOf(fact)} to confirm it.`;
  }
}
