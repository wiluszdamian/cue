import {
  affectedBy,
  computeFreshness,
  type FileStateProvider,
  type KnowledgeIndex,
} from '../knowledge/index.js';

/**
 * Which pages are worth looking at again. A full crawl is the expensive answer to
 * "is the map still right?", and most of the time one page, or the three a change
 * reached, is the question. Pure: it reads the knowledge base and is handed the
 * state of the files, so it is decided the same way wherever it runs.
 */

export interface SurveySelectors {
  /** Pages named by hand. They need not have been surveyed before. */
  readonly routes?: readonly string[];
  /** Pages with something stale, or read from code that changed. */
  readonly stale?: boolean;
  /** Files that changed (from git): pages read from any of them. */
  readonly changedPaths?: readonly string[];
}

export interface SurveyTarget {
  readonly route: string;
  /** Why it was chosen, one sentence each (at most a few). */
  readonly reasons: readonly string[];
  /** Why it will not be surveyed, when it will not. */
  readonly skip?: string;
}

const MAX_REASONS = 3;

/** `/items/[id]`, `/users/:id` and `/orders/{id}` need a real id before there is a page to open. */
const DYNAMIC = /\[[^\]]+\]|\{[^}]+\}|\/:[A-Za-z_]/;

/** `login`, `/login/` and `/login?next=/a` all mean `/login`. */
export function normaliseRoute(route: string): string {
  const path = (route.split(/[?#]/)[0] ?? route).trim();
  const rooted = path.startsWith('/') ? path : `/${path}`;
  return rooted.length > 1 ? rooted.replace(/\/+$/, '') : rooted;
}

export function selectSurveyTargets(
  index: KnowledgeIndex,
  selectors: SurveySelectors,
  options: { files?: FileStateProvider | undefined; now?: Date } = {},
): SurveyTarget[] {
  const reasons = new Map<string, string[]>();
  const add = (route: string, reason: string): void => {
    const list = reasons.get(route) ?? [];
    if (!list.includes(reason)) list.push(reason);
    reasons.set(route, list);
  };

  for (const asked of selectors.routes ?? []) {
    if (asked.trim() !== '') add(normaliseRoute(asked), 'asked for');
  }

  if (selectors.stale === true || selectors.changedPaths !== undefined) {
    for (const route of index.routes()) {
      const locators = index.locatorsOn(route.path);

      if (selectors.stale === true) {
        for (const locator of locators) {
          if (locator.status === 'stale') {
            add(route.path, `${locator.expression} failed its last check`);
            continue;
          }
          const verdict = computeFreshness(locator, options.now, options.files);
          if (verdict.freshness === 'stale' || verdict.freshness === 'possibly-stale') {
            for (const reason of verdict.reasons.filter((r) => !r.startsWith('last confirmed'))) {
              add(route.path, reason);
            }
          }
        }
      }

      if (selectors.changedPaths !== undefined) {
        const reached = affectedBy(locators, selectors.changedPaths);
        const files = new Set(
          reached.flatMap((fact) =>
            (fact.dependencies?.files ?? [])
              .map((dependency) => dependency.path)
              .filter((path) => selectors.changedPaths?.includes(path)),
          ),
        );
        if (reached.length > 0) add(route.path, `changed: ${[...files].sort().join(', ')}`);
      }
    }
  }

  return [...reasons.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([route, list]): SurveyTarget => {
      const shown = list.slice(0, MAX_REASONS);
      if (list.length > MAX_REASONS) shown.push(`…and ${String(list.length - MAX_REASONS)} more`);
      return DYNAMIC.test(route)
        ? {
            route,
            reasons: shown,
            skip: 'a route with a parameter has no page until it has a real value: survey a concrete URL',
          }
        : { route, reasons: shown };
    });
}
