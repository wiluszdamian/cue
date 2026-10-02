/**
 * How recent a confirmation is. An expired entry is uncertain, never spoken with
 * confidence: a selector reported confidently after it stopped existing fails at
 * runtime in a way that reads like an application bug, so the debugging goes into
 * the product rather than the map.
 *
 * Age is one signal among several (what changed since is another), and it is the
 * only one that needs nothing but a clock, so it lives here with the model.
 *
 * The thresholds are short on purpose. An application under active development
 * changes faster than a week, and re-surveying costs a minute.
 */

export type FreshnessLevel = 'fresh' | 'ageing' | 'stale';

export const AGEING_AFTER_DAYS = 7;
export const STALE_AFTER_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

export function freshnessOf(verifiedAt: string, now: Date = new Date()): FreshnessLevel {
  const verified = Date.parse(verifiedAt);
  // An unparseable timestamp is not a fresh one.
  if (Number.isNaN(verified)) return 'stale';

  const ageDays = (now.getTime() - verified) / DAY;
  if (ageDays >= STALE_AFTER_DAYS) return 'stale';
  if (ageDays >= AGEING_AFTER_DAYS) return 'ageing';
  return 'fresh';
}

export function ageInDays(verifiedAt: string, now: Date = new Date()): number {
  const verified = Date.parse(verifiedAt);
  if (Number.isNaN(verified)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - verified) / DAY);
}

// ------------------------------------------------- what changed since it was confirmed

/**
 * Age is one thing a clock can tell you. The other is whether the code a fact was
 * read from has changed since: a button's label can be rewritten the day after it
 * was confirmed, and a week-old note is then wrong while a month-old note about
 * untouched code is fine.
 */

/** `possibly-stale`: something the fact depends on changed, but nobody has looked. */
export type FreshnessWithChanges = FreshnessLevel | 'possibly-stale';

/** How the present state of a file is asked for. The model does no I/O of its own. */
export interface FileStateProvider {
  /** The content hash now, or `undefined` when the file is not there. */
  hashOf(path: string): string | undefined;
}

export interface FreshnessVerdict {
  readonly freshness: FreshnessWithChanges;
  /** Why it is not simply fresh, one sentence each. Empty for a fresh fact. */
  readonly reasons: readonly string[];
}

/** Worst last: the combined verdict of age and change is the worse of the two. */
const ORDER: Readonly<Record<FreshnessWithChanges, number>> = {
  fresh: 0,
  ageing: 1,
  'possibly-stale': 2,
  stale: 3,
};

interface Dated {
  readonly verifiedAt?: string | undefined;
  readonly dependencies?:
    { readonly files: readonly { path: string; hash?: string | undefined }[] } | undefined;
}

export function computeFreshness(
  fact: Dated,
  now: Date = new Date(),
  files?: FileStateProvider,
): FreshnessVerdict {
  const reasons: string[] = [];
  let level: FreshnessWithChanges;

  if (fact.verifiedAt === undefined) {
    level = 'stale';
    reasons.push('it has never been confirmed, so it has no age to speak of');
  } else {
    level = freshnessOf(fact.verifiedAt, now);
    const days = ageInDays(fact.verifiedAt, now);
    if (level === 'stale') reasons.push(`not confirmed for ${describeDays(days)}`);
    else if (level === 'ageing') reasons.push(`last confirmed ${describeDays(days)} ago`);
  }

  const changes = dependencyChanges(fact, files);
  if (changes.length > 0) {
    reasons.push(...changes);
    if (ORDER[level] < ORDER['possibly-stale']) level = 'possibly-stale';
  }

  return { freshness: level, reasons };
}

/**
 * Only what changed in the files a fact depends on, apart from its age. A file whose
 * state cannot be asked about, or that was recorded without a hash, proves nothing
 * either way: it is left out, never counted as unchanged or as changed.
 */
export function dependencyChanges(fact: Dated, files: FileStateProvider | undefined): string[] {
  if (files === undefined) return [];
  const when =
    fact.verifiedAt === undefined
      ? 'it was confirmed'
      : `it was confirmed (${fact.verifiedAt.slice(0, 10)})`;

  const reasons: string[] = [];
  for (const dependency of fact.dependencies?.files ?? []) {
    if (dependency.hash === undefined) continue;
    const hash = files.hashOf(dependency.path);
    if (hash === undefined) reasons.push(`${dependency.path} no longer exists since ${when}`);
    else if (hash !== dependency.hash) reasons.push(`${dependency.path} changed since ${when}`);
  }
  return reasons;
}

function describeDays(days: number): string {
  if (!Number.isFinite(days)) return 'an unknown time';
  return days === 1 ? '1 day' : `${String(days)} days`;
}

/**
 * The facts that depend on any of these files. Paths are compared as written, with
 * forward slashes: `src/a.tsx` is not `a.tsx`.
 */
export function affectedBy<T extends Dated>(facts: readonly T[], changed: readonly string[]): T[] {
  const normal = (path: string): string => path.replaceAll('\\', '/');
  const paths = new Set(changed.map(normal));
  return facts.filter((fact) =>
    (fact.dependencies?.files ?? []).some((dependency) => paths.has(normal(dependency.path))),
  );
}
