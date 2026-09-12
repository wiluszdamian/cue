import type { Freshness } from '../schema/agent-kb.js';

/**
 * How much to trust an entry given its age. An expired entry is uncertain, never
 * spoken with confidence: a selector reported confidently after it stopped
 * existing fails at runtime in a way that reads like an application bug, so the
 * debugging goes into the product rather than the map.
 *
 * The thresholds are short on purpose. An application under active development
 * changes faster than a week, and re-surveying costs a minute.
 */

export const AGEING_AFTER_DAYS = 7;
export const STALE_AFTER_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

export function freshnessOf(verifiedAt: string, now: Date = new Date()): Freshness {
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

/** An instruction rather than a status: a status alone gets rounded up to "fine". */
export function freshnessAdvice(freshness: Freshness, route: string): string {
  switch (freshness) {
    case 'fresh':
      return 'Confirmed recently. Safe to use.';
    case 'ageing':
      return `Last confirmed over ${String(AGEING_AFTER_DAYS)} days ago. Usable, but say so when it matters.`;
    case 'stale':
      return (
        `Not confirmed in over ${String(STALE_AFTER_DAYS)} days. Treat this as a candidate, not a fact: ` +
        `run \`understudy survey\` on ${route} before relying on it, and do not write in a confident voice until you have.`
      );
  }
}
