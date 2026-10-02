import type { Confidence, Freshness, KbElement } from '../schema/agent-kb.js';
import {
  dependencyChanges,
  indexKnowledge,
  nameSimilarity,
  type FileStateProvider,
  type KnowledgeIndex,
  type LocatorFact,
} from '../knowledge/index.js';
import { freshnessAdvice } from './freshness.js';
import { loadKnowledge } from './load-knowledge.js';
import { routeToFilename } from './snapshot/index.js';

/**
 * Answering "what is the selector for this element?" — the one place where
 * refusing is the valuable behaviour, since a plausible invented selector fails at
 * runtime like an application bug. Two kinds of answer and no third: a selector
 * with a source and a freshness, or an instruction to go and survey the route.
 */

export interface LocatorFound {
  readonly kind: 'found';
  readonly route: string;
  readonly element: KbElement;
  readonly freshness: Freshness;
  readonly confidence: Confidence;
  readonly advice: string;
  readonly alternatives: readonly KbElement[];
  /**
   * Files this was read from that have changed or gone since it was confirmed, one
   * sentence each. Empty when nothing changed, or when there was nothing to compare.
   */
  readonly changes: readonly string[];
}

export interface LocatorUnknown {
  readonly kind: 'unknown';
  readonly route: string | undefined;
  readonly query: string;
  readonly remedy: string;
  /** Routes that are in the map, so the caller can see what *is* known. */
  readonly knownRoutes: readonly string[];
}

export type LocatorAnswer = LocatorFound | LocatorUnknown;

/** Scores an element against a description. */
function score(element: KbElement, query: string): number {
  return nameSimilarity(element.name, element.role, query);
}

export interface ResolveOptions {
  readonly projectRoot: string;
  readonly route?: string | undefined;
  readonly query: string;
  readonly now?: Date;
  /** The product's files as they are now, to notice that what an element was read from changed. */
  readonly files?: FileStateProvider | undefined;
}

/** The older element shape, for the answer's callers; what it says is read off the fact. */
function toElement(index: KnowledgeIndex, fact: LocatorFact): KbElement {
  return {
    role: fact.role,
    ...(fact.name === undefined ? {} : { name: fact.name }),
    ...(fact.level === undefined ? {} : { level: fact.level }),
    locator: fact.expression,
    ...(fact.testId === undefined ? {} : { testId: fact.testId }),
    confidence: index.coverage(fact),
  };
}

/** `/login/`, `login` and `/login` are one route, as they are one file name. */
function samePath(a: string, b: string): boolean {
  return routeToFilename(a) === routeToFilename(b);
}

export function resolveLocator(options: ResolveOptions): LocatorAnswer {
  const { projectRoot, route, query, now, files } = options;
  const index = indexKnowledge(loadKnowledge(projectRoot, now).kb);

  // Routes somebody actually looked at; a route only the source declares is not "surveyed".
  const knownRoutes = index
    .routes()
    .filter((fact) => index.evidenceFor(fact.id).some((evidence) => evidence.type === 'browser'))
    .map((fact) => fact.path);

  const routeOf = (fact: LocatorFact): string => fact.route.replace(/^route:/, '');
  const inScope = index
    .allLocators()
    .filter((fact) => route === undefined || samePath(routeOf(fact), route));

  const candidates = inScope.map((fact) => {
    const element = toElement(index, fact);
    return {
      fact,
      element,
      route: routeOf(fact),
      freshness: index.freshness(fact, now) satisfies Freshness,
      score: score(element, query),
    };
  });

  const matches = candidates.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  const best = matches[0];

  if (!best) {
    return {
      kind: 'unknown',
      route,
      query,
      // Never a guess. The remedy is the answer.
      remedy:
        route === undefined
          ? 'understudy survey <url>   # map the route this element is on'
          : `understudy survey <url>${route}   # this route has not been surveyed`,
      knownRoutes,
    };
  }

  // Only for the answer given: looking at every candidate's files would cost for nothing.
  const changes = dependencyChanges(best.fact, files);
  const advice =
    changes.length === 0
      ? freshnessAdvice(best.freshness, best.route)
      : `${freshnessAdvice(best.freshness, best.route)} A file it was read from has changed, so it may no longer be right: ` +
        `run \`understudy survey\` on ${best.route} before relying on it.`;

  return {
    kind: 'found',
    route: best.route,
    element: best.element,
    freshness: best.freshness,
    confidence: best.element.confidence,
    advice,
    alternatives: matches.slice(1, 4).map((m) => m.element),
    changes,
  };
}

const CONFIDENCE_NOTE: Record<Confidence, string> = {
  confirmed: 'Present in the product source and seen running.',
  'runtime-only':
    'Seen running, but absent from the product source — it may be generated or third-party, and it may move.',
  'code-only':
    'In the product source but never seen running — it may be dead code or behind a feature flag.',
  unknown: 'Neither source confirms this.',
};

export function formatLocatorAnswer(answer: LocatorAnswer): string {
  if (answer.kind === 'unknown') {
    const lines = [
      `No entry for "${answer.query}"${answer.route === undefined ? '' : ` on ${answer.route}`}.`,
      '',
      'Do not guess a selector. A plausible one that does not exist fails at runtime',
      'in a way that reads like an application bug, and the time goes into debugging',
      'the product instead of the map.',
      '',
      `Run: ${answer.remedy}`,
    ];
    if (answer.knownRoutes.length > 0) {
      lines.push('', `Surveyed routes: ${answer.knownRoutes.join(', ')}`);
    } else {
      lines.push('', 'Nothing has been surveyed yet — the knowledge base is empty.');
    }
    return lines.join('\n');
  }

  const { element, route, freshness, confidence, advice, alternatives, changes } = answer;
  const lines = [
    `Route:      ${route}`,
    `Locator:    ${element.locator}`,
    ...(element.testId === undefined ? [] : [`Test id:    ${element.testId}`]),
    `Confidence: ${confidence} — ${CONFIDENCE_NOTE[confidence]}`,
    `Freshness:  ${freshness} — ${advice}`,
    // The first reason only: an answer is paid for out of the context the task needs.
    ...(changes.length === 0
      ? []
      : [
          `Changed:    ${changes[0] ?? ''}${changes.length > 1 ? ` (and ${String(changes.length - 1)} more)` : ''}`,
        ]),
  ];

  if (alternatives.length > 0) {
    lines.push('', 'Other matches on this route:');
    for (const alternative of alternatives) lines.push(`  ${alternative.locator}`);
  }

  return lines.join('\n');
}
