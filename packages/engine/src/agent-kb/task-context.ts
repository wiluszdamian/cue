import {
  computeFreshness,
  type FactStatus,
  type FileStateProvider,
  type KnowledgeEvidence,
  type KnowledgeFact,
  type KnowledgeIndex,
  type LocatorFact,
  type RouteFact,
} from '../knowledge/index.js';
import type { Rule } from '../schema/constitution.js';
import { routeToFilename } from './snapshot/index.js';

/**
 * What a model needs to know before it starts on a task, in one answer that fits a
 * stated budget. Retrieval is deterministic — words, not a model — so the same task
 * over the same knowledge gives the same context, and a wrong answer can be traced
 * to the word that caused it.
 *
 * It is a pure function of the knowledge index and the rules. Whatever is dropped to
 * fit is dropped in a fixed order, and two things are never dropped: the policy
 * (what the project forbids) and how fresh the facts are (a fact stated without its
 * age reads as a fact that is current).
 */

export const DEFAULT_CONTEXT_TOKENS = 1200;
export const MAX_CONTEXT_TOKENS = 3000;
/** Below this the policy alone no longer fits, and the answer would break its own promise. */
export const MIN_CONTEXT_TOKENS = 200;

/** Four characters per token over-estimates here, which is the safe direction. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TaskContextInput {
  readonly task: string;
  readonly maxTokens?: number | undefined;
  /** A route the caller already knows is the right one. Preferred, not forced. */
  readonly route?: string | undefined;
}

export interface TaskContextOptions {
  readonly now?: Date;
  readonly files?: FileStateProvider | undefined;
}

export interface TaskContext {
  readonly found: boolean;
  readonly text: string;
  /** The routes the answer is about, best first. */
  readonly routes: readonly string[];
  readonly tokens: number;
}

// ---------------------------------------------------------------------- words

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'for',
  'and',
  'or',
  'in',
  'on',
  'at',
  'by',
  'with',
  'from',
  'into',
  'that',
  'this',
  'it',
  'is',
  'are',
  'be',
  'can',
  'should',
  'when',
  'then',
  'test',
  'tests',
  'testing',
  'write',
  'create',
  'check',
  'verify',
  'user',
  'page',
  'new',
]);

/**
 * Whole words reduced to a rough stem, so "changing", "changed" and "change" meet.
 * Crude on purpose: a table of rules a reader can predict beats a stemmer that is
 * right more often and surprising when it is not.
 */
export function stemsOf(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw === '') continue;
    let word = raw;
    if (word.length > 5 && word.endsWith('ing')) word = word.slice(0, -3);
    else if (word.length > 4 && word.endsWith('ed')) word = word.slice(0, -2);
    else if (word.length > 3 && word.endsWith('ies')) word = `${word.slice(0, -3)}y`;
    else if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss'))
      word = word.slice(0, -1);
    if (word.length > 4 && word.endsWith('e')) word = word.slice(0, -1);
    out.push(word);
  }
  return out;
}

function taskStems(task: string): string[] {
  const kept: string[] = [];
  for (const word of task.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word === '' || STOP_WORDS.has(word)) continue;
    kept.push(...stemsOf(word));
  }
  return [...new Set(kept)];
}

/** How many distinct task words the text contains, doubled when it is the whole word. */
function scoreText(wanted: readonly string[], text: string): number {
  const own = new Set(stemsOf(text));
  let hits = 0;
  for (const stem of wanted) if (own.has(stem)) hits += 2;
  return hits;
}

// ------------------------------------------------------------------ rendering

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

function clip(text: string, length: number): string {
  const flat = oneLine(text);
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

/** One reason to believe something, short enough for a list. */
export function describeEvidence(item: KnowledgeEvidence): string {
  const where =
    item.file === undefined
      ? [item.route, item.environment === undefined ? undefined : `(${item.environment})`]
          .filter((part) => part !== undefined)
          .join(' ')
      : `${item.file}${item.line === undefined ? '' : `:${String(item.line)}`}`;
  const when = item.observedAt === undefined ? '' : ` · ${item.observedAt.slice(0, 10)}`;
  return `${item.type}${where === '' ? '' : ` ${where}`}${when}`;
}

function standing(status: FactStatus): string {
  return status;
}

interface Selected {
  readonly route: RouteFact;
  readonly freshness: string;
  readonly source: string | undefined;
  readonly elements: { readonly line: string; readonly id: string }[];
}

/** Everything the answer may say; each part can be dropped, in the order trimming names. */
interface Plan {
  routes: Selected[];
  apis: { line: string }[];
  terms: { line: string }[];
  deeper: string[];
  showSource: boolean;
}

function render(task: string, plan: Plan, policy: readonly string[]): string {
  const lines = [`task: ${clip(task, 80)}`, 'status: found'];

  plan.routes.forEach((selected, position) => {
    const { route } = selected;
    lines.push(
      '',
      `## ${position === 0 ? 'Applicable route' : 'Also possibly'}: ${route.path}${route.title === undefined ? '' : ` — ${clip(route.title, 50)}`}`,
      `standing: ${standing(route.status)} · freshness: ${selected.freshness}`,
    );
    if (plan.showSource && selected.source !== undefined) lines.push(`source: ${selected.source}`);
    if (selected.elements.length > 0) {
      lines.push('known elements:', ...selected.elements.map((element) => `- ${element.line}`));
    } else if (position === 0) {
      lines.push('known elements: none matched the task');
    }
  });

  if (plan.apis.length > 0) lines.push('', '## API', ...plan.apis.map((api) => `- ${api.line}`));
  if (plan.terms.length > 0)
    lines.push('', '## Vocabulary', ...plan.terms.map((t) => `- ${t.line}`));

  lines.push('', '## Policy', ...policy.map((line) => `- ${line}`));
  if (plan.deeper.length > 0) lines.push('', `Deeper (get_evidence): ${plan.deeper.join(', ')}`);
  return lines.join('\n');
}

/** The rules a test author is held to, one line each. */
function policyLines(rules: readonly Rule[]): string[] {
  return rules
    .filter(
      (rule) =>
        rule.deprecated === null &&
        rule.severity === 'error' &&
        (rule.tier === 'MUST' || rule.tier === 'MUST_NOT'),
    )
    .map((rule) => `${rule.tier} ${rule.title} (${rule.id})`);
}

// ---------------------------------------------------------------------- build

function freshnessLine(
  fact: KnowledgeFact,
  now: Date,
  files: FileStateProvider | undefined,
): string {
  const verdict = computeFreshness(fact, now, files);
  const reason = verdict.reasons[0];
  return reason === undefined ? verdict.freshness : `${verdict.freshness} (${clip(reason, 70)})`;
}

export function buildTaskContext(
  index: KnowledgeIndex,
  rules: readonly Rule[],
  input: TaskContextInput,
  options: TaskContextOptions = {},
): TaskContext {
  const now = options.now ?? new Date();
  const budget = Math.min(
    MAX_CONTEXT_TOKENS,
    Math.max(MIN_CONTEXT_TOKENS, Math.floor(input.maxTokens ?? DEFAULT_CONTEXT_TOKENS)),
  );
  const wanted = taskStems(input.task);
  const named = input.route === undefined ? undefined : routeToFilename(input.route.trim());

  // --- the routes: their own words, plus the words of what is on them
  const scored = index
    .routes()
    .map((route) => {
      const locators = index.locatorsOn(route.path).map((locator) => ({
        locator,
        score: scoreText(wanted, `${locator.name ?? ''} ${locator.role} ${locator.testId ?? ''}`),
      }));
      const own = scoreText(wanted, `${route.path} ${route.title ?? ''}`);
      const onPage = locators.reduce((sum, entry) => sum + entry.score, 0);
      const bonus = named !== undefined && routeToFilename(route.path) === named ? 10 : 0;
      return { route, locators, score: own * 2 + onPage + bonus };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const apis = index
    .apis()
    .map((api) => ({ api, score: scoreText(wanted, `${api.method ?? ''} ${api.path}`) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const terms = index
    .terms()
    .map((term) => ({ term, score: scoreText(wanted, `${term.key} ${term.label}`) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0) {
    const known = index.routes().map((route) => route.path);
    const text = [
      `task: ${clip(input.task, 80)}`,
      'status: unknown',
      'Nothing known matches this task.',
      known.length === 0
        ? 'Routes known: none.'
        : `Routes known: ${known.slice(0, 10).join(', ')}${known.length > 10 ? `, …(${String(known.length - 10)} more)` : ''}`,
      '',
      'suggested action: `cue survey --route <path> --base-url <url>` for the page the task is about, or `cue extract --source <dir>` for what the code declares.',
    ].join('\n');
    return { found: false, text, routes: [], tokens: estimateTokens(text) };
  }

  const top = scored[0];
  const chosen = scored.filter(
    (entry, position) =>
      position === 0 || (position === 1 && top !== undefined && entry.score * 2 >= top.score),
  );

  const selected: Selected[] = chosen.map(({ route, locators }) => {
    const first = index.evidenceFor(route.id)[0];
    const matching = locators
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((entry) => entry.locator);
    return {
      route,
      freshness: freshnessLine(route, now, options.files),
      source: first === undefined ? undefined : describeEvidence(first),
      elements: matching.map((locator: LocatorFact) => ({
        line: `${locator.expression} · ${standing(locator.status)}`,
        id: locator.id,
      })),
    };
  });

  const plan: Plan = {
    routes: selected,
    apis: apis.map(({ api }) => {
      const source = index.evidenceFor(api.id)[0];
      return {
        line: `${api.method ?? 'ANY'} ${api.path}${source?.file === undefined ? '' : ` · ${source.file}${source.line === undefined ? '' : `:${String(source.line)}`}`}`,
      };
    }),
    terms: terms.map(({ term }) => ({ line: `${term.key} = ${clip(term.label, 40)}` })),
    deeper: [],
    showSource: true,
  };
  const refreshDeeper = (): void => {
    plan.deeper = plan.routes
      .flatMap((entry) => [entry.route.id, ...entry.elements.map((element) => element.id)])
      .slice(0, 6);
  };
  refreshDeeper();

  const policy = policyLines(rules);

  // --- fit the budget: the least valuable part goes first, the policy and the ages never
  const trimmed = (): boolean => {
    if (plan.routes.length > 1) {
      plan.routes.pop();
    } else if (plan.terms.length > 0) {
      plan.terms = [];
    } else if (plan.apis.length > 0) {
      plan.apis = [];
    } else if (plan.showSource) {
      plan.showSource = false;
    } else if ((plan.routes[0]?.elements.length ?? 0) > 1) {
      plan.routes[0]?.elements.pop();
    } else if (plan.deeper.length > 0) {
      plan.deeper = [];
      return true;
    } else {
      return false;
    }
    refreshDeeper();
    return true;
  };

  let text = render(input.task, plan, policy);
  while (estimateTokens(text) > budget && trimmed()) text = render(input.task, plan, policy);

  return {
    found: true,
    text,
    routes: plan.routes.map((entry) => entry.route.path),
    tokens: estimateTokens(text),
  };
}
