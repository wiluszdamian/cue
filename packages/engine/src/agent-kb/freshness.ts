import type { Freshness } from '../schema/agent-kb.js';

/**
 * The age arithmetic moved into the Knowledge Core, which needs it without
 * reaching into this directory. It is re-exported so existing imports keep
 * working; what stays here is the wording given to an agent.
 */
export {
  AGEING_AFTER_DAYS,
  ageInDays,
  freshnessOf,
  STALE_AFTER_DAYS,
} from '../knowledge/freshness.js';

import { AGEING_AFTER_DAYS, STALE_AFTER_DAYS } from '../knowledge/freshness.js';

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
