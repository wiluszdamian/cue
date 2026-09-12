import type { Confidence, Freshness, KbElement } from '../schema/agent-kb.js';
import { freshnessAdvice, freshnessOf } from './freshness.js';
import { readAllRouteMaps, readRouteMap, readTestIds, correlate } from './store.js';

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

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Scores an element against a description, on whole words rather than fragments. */
function score(element: KbElement, query: string): number {
  const name = normalise(element.name ?? '');
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

  // Role alone must never match, or a missing element returns the first button.
  if (nameHits === 0) return 0;

  // With the name matched, the role separates "submit button" from "submit heading".
  return wanted.includes(element.role.toLowerCase()) ? nameHits + 1 : nameHits;
}

export interface ResolveOptions {
  readonly projectRoot: string;
  readonly route?: string | undefined;
  readonly query: string;
  readonly now?: Date;
}

export function resolveLocator(options: ResolveOptions): LocatorAnswer {
  const { projectRoot, route, query, now } = options;
  const testIds = readTestIds(projectRoot);

  const maps =
    route === undefined
      ? readAllRouteMaps(projectRoot, now)
      : [readRouteMap(projectRoot, route, now)].flatMap((m) => (m ? [m] : []));

  const knownRoutes = readAllRouteMaps(projectRoot, now).map((m) => m.map.route);

  const candidates = maps.flatMap((loaded) =>
    correlate(loaded.map.elements, testIds).map((element) => ({
      element,
      route: loaded.map.route,
      freshness: freshnessOf(loaded.map.verifiedAt, now),
      score: score(element, query),
    })),
  );

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

  return {
    kind: 'found',
    route: best.route,
    element: best.element,
    freshness: best.freshness,
    confidence: best.element.confidence,
    advice: freshnessAdvice(best.freshness, best.route),
    alternatives: matches.slice(1, 4).map((m) => m.element),
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

  const { element, route, freshness, confidence, advice, alternatives } = answer;
  const lines = [
    `Route:      ${route}`,
    `Locator:    ${element.locator}`,
    ...(element.testId === undefined ? [] : [`Test id:    ${element.testId}`]),
    `Confidence: ${confidence} — ${CONFIDENCE_NOTE[confidence]}`,
    `Freshness:  ${freshness} — ${advice}`,
  ];

  if (alternatives.length > 0) {
    lines.push('', 'Other matches on this route:');
    for (const alternative of alternatives) lines.push(`  ${alternative.locator}`);
  }

  return lines.join('\n');
}
