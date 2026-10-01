import { evidenceId } from './ids.js';
import {
  KNOWLEDGE_MODEL_VERSION,
  type Conflict,
  type ConflictValue,
  type FactStatus,
  type KnowledgeBase,
  type KnowledgeEvidence,
  type KnowledgeFact,
} from './model.js';

/**
 * Assembling a knowledge base from many sources, one observation at a time.
 *
 * The same thing is usually reported more than once — a route by the survey and
 * by the product source, a label by two translation files. Reports that agree
 * are merged into one fact that cites all of them. Reports that disagree are not
 * resolved: the first value stays, and the disagreement is recorded with who said
 * what, because choosing quietly is how a wrong locator ends up verified.
 */

/** Fields that describe a fact's standing rather than its content; they are merged, not compared. */
const STANDING = new Set([
  'id',
  'kind',
  'status',
  'evidence',
  'confidence',
  'verifiedAt',
  'verifiedAgainst',
  'dependencies',
]);

const RANK: Record<FactStatus, number> = { inferred: 0, observed: 1, verified: 2, stale: 3 };

function isConflictValue(value: unknown): value is ConflictValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/** A fact that is stale anywhere is stale; otherwise the most established claim wins. */
function mergedStatus(a: FactStatus, b: FactStatus): FactStatus {
  return RANK[a] >= RANK[b] ? a : b;
}

function later(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export class KnowledgeBuilder {
  private readonly facts = new Map<string, KnowledgeFact>();
  private readonly evidence = new Map<string, KnowledgeEvidence>();
  /** `factId\0field` → value → evidence that stated it. */
  private readonly claims = new Map<string, Map<ConflictValue, Set<string>>>();

  /** Records evidence and returns its id. The same evidence recorded twice is one record. */
  addEvidence(evidence: Omit<KnowledgeEvidence, 'id'>): string {
    const id = evidenceId(evidence);
    if (!this.evidence.has(id)) this.evidence.set(id, { ...evidence, id });
    return id;
  }

  /** Records a fact, or merges it into the one that already has its id. */
  addFact(fact: KnowledgeFact): void {
    const existing = this.facts.get(fact.id);
    if (existing === undefined) {
      this.facts.set(fact.id, fact);
      this.noteClaims(fact);
      return;
    }

    this.noteClaims(fact);
    const verifiedAt = later(existing.verifiedAt, fact.verifiedAt);
    // Content the first report lacked is adopted; content it had is never overwritten.
    const adopted = Object.fromEntries(
      Object.entries(fact).filter(
        ([field, value]) =>
          !STANDING.has(field) &&
          value !== undefined &&
          !(field in existing && existing[field as keyof typeof existing] !== undefined),
      ),
    );
    const merged = {
      ...adopted,
      ...existing,
      status: mergedStatus(existing.status, fact.status),
      evidence: [...new Set([...existing.evidence, ...fact.evidence])],
      ...(verifiedAt === undefined ? {} : { verifiedAt }),
    };
    this.facts.set(fact.id, merged);
  }

  /** Remembers who said what about each comparable field, so disagreements can be reported. */
  private noteClaims(fact: KnowledgeFact): void {
    for (const [field, value] of Object.entries(fact)) {
      if (STANDING.has(field) || !isConflictValue(value)) continue;
      const key = `${fact.id}\u0000${field}`;
      const byValue = this.claims.get(key) ?? new Map<ConflictValue, Set<string>>();
      const cited = byValue.get(value) ?? new Set<string>();
      for (const id of fact.evidence) cited.add(id);
      byValue.set(value, cited);
      this.claims.set(key, byValue);
    }
  }

  build(): KnowledgeBase {
    const conflicts: Conflict[] = [];
    for (const [key, byValue] of this.claims) {
      if (byValue.size < 2) continue;
      const [factId = '', field = ''] = key.split('\u0000');
      conflicts.push({
        factId,
        field,
        values: [...byValue].map(([value, evidence]) => ({ value, evidence: [...evidence] })),
      });
    }

    return {
      modelVersion: KNOWLEDGE_MODEL_VERSION,
      facts: [...this.facts.values()],
      evidence: [...this.evidence.values()],
      ...(conflicts.length > 0 ? { conflicts } : {}),
    };
  }
}
