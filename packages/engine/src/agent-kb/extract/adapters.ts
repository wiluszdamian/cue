import type { SurfaceEntry, TermEntryLike, TestIdEntry } from './types.js';
import type { TestActionEntry, TestLocatorEntry } from '../../schema/agent-kb.js';
import { readCatalogue } from './i18n.js';
import { readOpenApi } from './openapi.js';
import { readExistingTests } from './tests.js';
import { reference, type SourceFileRef } from './scan.js';

/**
 * The adapters. Every one extracts facts — a string in the source, and its line —
 * and none infers, because a model asked to describe a codebase fabricates
 * confidently. An unrecognised stack degrades to the generic adapter.
 */

export interface AdapterContext {
  readonly files: readonly SourceFileRef[];
}

export interface AdapterResult {
  readonly testIds?: readonly TestIdEntry[];
  readonly surface?: readonly SurfaceEntry[];
  readonly terms?: readonly TermEntryLike[];
  readonly gaps?: readonly string[];
  readonly fromTests?: {
    readonly locators: readonly TestLocatorEntry[];
    readonly actions: readonly TestActionEntry[];
  };
}

export interface Adapter {
  readonly id: string;
  readonly summary: string;
  detect(context: AdapterContext): boolean;
  extract(context: AdapterContext): AdapterResult;
}

// ---------------------------------------------------------------- test ids

/**
 * `data-testid="checkout-submit"`, `data-testid={'x'}`, `testID="x"` — the half of
 * the correlation that says a selector is real rather than merely rendered.
 */
const TEST_ID = /(?:data-testid|data-test-id|data-test|testID)\s*=\s*["'{]\s*["']?([\w.:-]+)["']?/g;

export const testIdAdapter: Adapter = {
  id: 'test-ids',
  summary: 'data-testid attributes, wherever they appear',
  detect: () => true,
  extract({ files }) {
    const seen = new Map<string, string>();

    for (const file of files) {
      file.lines.forEach((line, index) => {
        for (const match of line.matchAll(TEST_ID)) {
          const id = match[1];
          // First occurrence wins: point at the definition, not the last render.
          if (id !== undefined && !seen.has(id)) seen.set(id, reference(file, index));
        }
      });
    }

    return {
      testIds: [...seen.entries()]
        .map(([testId, source]) => ({ testId, source }))
        .sort((a, b) => a.testId.localeCompare(b.testId)),
    };
  },
};

// ----------------------------------------------------------------- Next.js

const NEXT_APP_PAGE = /(?:^|\/)app\/(.*\/)?page\.(tsx|ts|jsx|js)$/;
const NEXT_APP_ROUTE = /(?:^|\/)app\/(.*\/)?route\.(ts|js)$/;
const NEXT_PAGES = /(?:^|\/)pages\/(?!api\/)(.+)\.(tsx|ts|jsx|js)$/;
const NEXT_PAGES_API = /(?:^|\/)pages\/api\/(.+)\.(ts|js)$/;
const HTTP_METHOD =
  /^\s*export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;

/** `app/(marketing)/blog/[slug]/page.tsx` -> `/blog/[slug]` */
function routeFromAppPath(segments: string): string {
  const parts = segments
    .split('/')
    .filter((part) => part.length > 0)
    // Route groups `(marketing)` and private folders `_components` are not URL segments.
    .filter((part) => !(part.startsWith('(') && part.endsWith(')')))
    .filter((part) => !part.startsWith('_'));
  return `/${parts.join('/')}`.replace(/\/+$/, '') || '/';
}

const NEXT_CONFIG = /(^|\/)next\.config\.(js|mjs|cjs|ts)$/;
const NEXT_DEPENDENCY = /"next"\s*:/;

/**
 * Directories that are a Next.js project, as shown by a `next.config.*` or a
 * `package.json` that depends on `next`. A `pages/` folder is Next's Pages Router
 * only beneath one of these: elsewhere it is as likely to hold page objects for a
 * test suite, and calling those routes would invent an application that is not there.
 */
function nextRoots(files: readonly SourceFileRef[]): string[] {
  const roots = new Set<string>();
  for (const file of files) {
    const directory = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    if (NEXT_CONFIG.test(file.path)) roots.add(directory);
    else if (
      (file.path === 'package.json' || file.path.endsWith('/package.json')) &&
      NEXT_DEPENDENCY.test(file.lines.join('\n'))
    ) {
      roots.add(directory);
    }
  }
  return [...roots];
}

const underAny = (path: string, roots: readonly string[]): boolean =>
  roots.some((root) => root === '' || path.startsWith(`${root}/`));

export const nextAdapter: Adapter = {
  id: 'nextjs',
  summary: 'Next.js routes, from the App Router and the Pages Router',

  detect({ files }) {
    return (
      nextRoots(files).length > 0 ||
      files.some((file) => NEXT_APP_PAGE.test(file.path) || NEXT_APP_ROUTE.test(file.path))
    );
  },

  extract({ files }) {
    const surface: SurfaceEntry[] = [];
    const roots = nextRoots(files);

    for (const file of files) {
      const appPage = NEXT_APP_PAGE.exec(file.path);
      if (appPage) {
        surface.push({
          kind: 'route',
          path: routeFromAppPath(appPage[1] ?? ''),
          source: reference(file, 0),
        });
        continue;
      }

      const appRoute = NEXT_APP_ROUTE.exec(file.path);
      if (appRoute) {
        const path = routeFromAppPath(appRoute[1] ?? '');
        // One exported function per verb, so the verbs are read rather than guessed.
        const methods = file.lines
          .map((line, index) => ({ match: HTTP_METHOD.exec(line), index }))
          .filter(
            (entry): entry is { match: RegExpExecArray; index: number } => entry.match !== null,
          );

        if (methods.length === 0) {
          surface.push({ kind: 'endpoint', path, source: reference(file, 0) });
        } else {
          for (const { match, index } of methods) {
            surface.push({
              kind: 'endpoint',
              path,
              method: match[1] ?? 'GET',
              source: reference(file, index),
            });
          }
        }
        continue;
      }

      const pagesApi = underAny(file.path, roots) ? NEXT_PAGES_API.exec(file.path) : null;
      if (pagesApi) {
        surface.push({
          kind: 'endpoint',
          path: `/api/${(pagesApi[1] ?? '').replace(/\/index$/, '')}`,
          source: reference(file, 0),
        });
        continue;
      }

      const pages = underAny(file.path, roots) ? NEXT_PAGES.exec(file.path) : null;
      if (pages) {
        const name = (pages[1] ?? '').replace(/\/index$/, '').replace(/^index$/, '');
        if (name === '_app' || name === '_document' || name === '_error') continue;
        surface.push({
          kind: 'route',
          path: `/${name}`.replace(/\/+$/, '') || '/',
          source: reference(file, 0),
        });
      }
    }

    return {
      surface: surface.sort((a, b) => a.path.localeCompare(b.path)),
      ...(surface.length === 0
        ? {
            gaps: [
              'Next.js was detected but no routes were found — check --source points at the app.',
            ],
          }
        : {}),
    };
  },
};

// ----------------------------------------------------------------- OpenAPI

const OPENAPI_FILE = /(openapi|swagger)\.(json|ya?ml)$/i;

export const openApiAdapter: Adapter = {
  id: 'openapi',
  summary: 'API endpoints from an OpenAPI document',

  detect({ files }) {
    return files.some((file) => OPENAPI_FILE.test(file.path));
  },

  extract({ files }) {
    const surface: SurfaceEntry[] = [];
    const gaps: string[] = [];

    for (const file of files.filter((f) => OPENAPI_FILE.test(f.path))) {
      const result = readOpenApi(file);
      surface.push(...result.surface);
      gaps.push(...result.gaps);
    }

    return {
      surface: surface.sort((a, b) => a.path.localeCompare(b.path)),
      ...(gaps.length > 0 ? { gaps } : {}),
    };
  },
};

// -------------------------------------------------------------------- i18n

/** A catalogue for English, by the usual names: `en.json`, `locales/en/common.json`, `en-US.yaml`. */
const ENGLISH = /(?:^|[/._-])en(?:[-_][a-z]{2})?(?:[/._-]|$)/i;

const I18N_FILE = /(?:^|\/)(?:locales?|i18n|lang|translations?)\/.*\.(json|ya?ml)$/i;

/** Translation catalogues: the words a user sees, and so the words a `getByRole` name must match. */
export const i18nAdapter: Adapter = {
  id: 'i18n',
  summary: 'user-visible labels from translation files',

  detect({ files }) {
    return files.some((file) => I18N_FILE.test(file.path));
  },

  extract({ files }) {
    const terms = new Map<string, TermEntryLike>();
    const gaps: string[] = [];

    // English first and then by path, so that with several locales the label that is kept
    // does not depend on the order the disk lists them in.
    const catalogues = files
      .filter((f) => I18N_FILE.test(f.path))
      .sort(
        (a, b) =>
          Number(ENGLISH.test(b.path)) - Number(ENGLISH.test(a.path)) ||
          a.path.localeCompare(b.path),
      );

    for (const file of catalogues) {
      const catalogue = readCatalogue(file);
      gaps.push(...catalogue.gaps);
      for (const term of catalogue.terms) {
        const kept = terms.get(term.key);
        if (kept === undefined) terms.set(term.key, term);
        else if (kept.label !== term.label) {
          // The vocabulary does not record a locale, so a second language cannot sit beside the first.
          gaps.push(
            `${file.path}: ${term.key} has another label than in ${kept.source.split(':')[0] ?? 'the first catalogue'}; the first is kept (locales are not recorded)`,
          );
        }
      }
    }

    return { terms: [...terms.values()], ...(gaps.length > 0 ? { gaps } : {}) };
  },
};

// ----------------------------------------------------------- existing tests

const TEST_FILE = /\.(spec|test)\.(ts|tsx|mts|cts)$/;
const ROUTE_NOTE = 'understudy-route:';

/** A page object is a class holding a `Page`; the cheap sign of one is the type written out. */
const HOLDS_PAGE = /:\s*Page\b/;

const looksLikeTests = (file: SourceFileRef): boolean =>
  TEST_FILE.test(file.path) ||
  file.lines.some((line) => line.includes(ROUTE_NOTE)) ||
  (/\.(ts|tsx|mts|cts)$/.test(file.path) && file.lines.some((line) => HOLDS_PAGE.test(line)));

/**
 * What the suite already says about the application: the role locators its tests and
 * page objects use, the page each is on, and what the page object methods do with
 * them. Evidence and nothing more — a test can be dead — so everything it yields is
 * loaded as inferred, and only a survey of the same element can raise it.
 */
export const existingTestsAdapter: Adapter = {
  id: 'existing-tests',
  summary: 'role locators and page object methods from the tests that already exist',

  detect({ files }) {
    return files.some(looksLikeTests);
  },

  extract({ files }) {
    const locators: TestLocatorEntry[] = [];
    const actions: TestActionEntry[] = [];
    const gaps: string[] = [];

    for (const file of files.filter(looksLikeTests)) {
      const read = readExistingTests(file);
      locators.push(...read.locators);
      actions.push(...read.actions);
      gaps.push(...read.gaps);
    }

    return { fromTests: { locators, actions }, ...(gaps.length > 0 ? { gaps } : {}) };
  },
};

export const ADAPTERS: readonly Adapter[] = [
  testIdAdapter,
  nextAdapter,
  openApiAdapter,
  i18nAdapter,
  existingTestsAdapter,
];
