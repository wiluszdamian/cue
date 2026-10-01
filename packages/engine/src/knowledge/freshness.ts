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
