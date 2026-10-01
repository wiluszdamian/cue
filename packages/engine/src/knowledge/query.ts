import { freshnessOf, type FreshnessLevel } from './freshness.js';
import { routeId } from './ids.js';
import type {
  Conflict,
  FactOfKind,
  KnowledgeBase,
  KnowledgeEvidence,
  KnowledgeFact,
} from './model.js';

/**
 * Answering questions about a knowledge base. Every consumer — the CLI, a lint
 * rule, an MCP tool — asks through this, so "is this locator known?" has one
 * meaning. Pure: it is handed a knowledge base and touches nothing else.
 */

export type RouteFact = FactOfKind<'route'>;
export type LocatorFact = FactOfKind<'locator'>;
export type TestIdFact = FactOfKind<'test-id'>;
export type ApiFact = FactOfKind<'api'>;
export type TermFact = FactOfKind<'term'>;

/**
 * Which sources have seen a locator — the question the older `.agent-kb` format
 * answered with its `confidence` field. Derived from the fact's standing, not
 * stored, so there is one source of truth for how far to trust it:
 *
 * - `confirmed` — verified: seen running and present in the source.
 * - `runtime-only` — observed: seen running, absent from the source.
 * - `code-only` — inferred from the source, never seen running.
 * - `unknown` — neither, or a check failed.
 */
export type Coverage = 'confirmed' | 'runtime-only' | 'code-only' | 'unknown';

export interface KnowledgeIndex {
  /** In the order they were added, which for a loaded `.agent-kb` is by route. */
  routes(): RouteFact[];
  /** By path, e.g. `/login`. */
  route(path: string): RouteFact | undefined;
  locatorsOn(routePath: string): LocatorFact[];
  allLocators(): LocatorFact[];
  /** Locator and test-id facts that carry this id. */
  byTestId(testId: string): (LocatorFact | TestIdFact)[];
  apis(): ApiFact[];
  terms(): TermFact[];
  fact(id: string): KnowledgeFact | undefined;
  evidenceFor(factId: string): KnowledgeEvidence[];
  coverage(fact: LocatorFact): Coverage;
  /**
   * From age alone, counted from when the fact was last confirmed. A fact that was
   * never confirmed, or whose date cannot be read, has no age to speak of: it is
   * reported stale, because an undated claim is not a recent one.
   */
  freshness(fact: KnowledgeFact, now?: Date): FreshnessLevel;
  conflicts(): Conflict[];
  conflictsFor(factId: string): Conflict[];
}

export function indexKnowledge(kb: KnowledgeBase): KnowledgeIndex {
  const facts = new Map<string, KnowledgeFact>();
  for (const fact of kb.facts) facts.set(fact.id, fact);

  const evidence = new Map<string, KnowledgeEvidence>();
  for (const item of kb.evidence) evidence.set(item.id, item);

  const ofKind = <K extends KnowledgeFact['kind']>(kind: K): FactOfKind<K>[] =>
    kb.facts.filter((fact): fact is FactOfKind<K> => fact.kind === kind);

  const conflicts = kb.conflicts ?? [];

  const evidenceFor = (factId: string): KnowledgeEvidence[] =>
    (facts.get(factId)?.evidence ?? []).flatMap((id) => {
      const item = evidence.get(id);
      return item === undefined ? [] : [item];
    });

  return {
    routes: () => ofKind('route'),
    route: (path) => {
      const fact = facts.get(routeId(path));
      return fact?.kind === 'route' ? fact : undefined;
    },
    locatorsOn: (routePath) =>
      ofKind('locator').filter((fact) => fact.route === routeId(routePath)),
    allLocators: () => ofKind('locator'),
    byTestId: (testId) =>
      kb.facts.filter(
        (fact): fact is LocatorFact | TestIdFact =>
          (fact.kind === 'locator' || fact.kind === 'test-id') && fact.testId === testId,
      ),
    apis: () => ofKind('api'),
    terms: () => ofKind('term'),
    fact: (id) => facts.get(id),
    evidenceFor,

    coverage: (fact) => {
      switch (fact.status) {
        case 'verified':
          return 'confirmed';
        case 'observed':
          return 'runtime-only';
        case 'inferred':
          return evidenceFor(fact.id).some((item) => item.type === 'source-code')
            ? 'code-only'
            : 'unknown';
        case 'stale':
          return 'unknown';
      }
    },

    freshness: (fact, now) =>
      fact.verifiedAt === undefined ? 'stale' : freshnessOf(fact.verifiedAt, now),

    conflicts: () => [...conflicts],
    conflictsFor: (factId) => conflicts.filter((conflict) => conflict.factId === factId),
  };
}
