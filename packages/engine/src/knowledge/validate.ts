import { apiId, locatorId, routeId, termId, testIdFactId } from './ids.js';
import { GROUNDED_EVIDENCE, type KnowledgeBase, type KnowledgeFact } from './model.js';

/**
 * The rules about facts that a schema cannot express: what may be called
 * verified, and whether every reference points at something. A model that checks
 * only its shape would accept a "verified" locator that rests on a guess.
 */

export type KnowledgeIssueCode =
  | 'duplicate-fact-id'
  | 'duplicate-evidence-id'
  | 'unknown-evidence'
  | 'verified-without-date'
  | 'verified-on-inference'
  | 'status-above-inference'
  | 'dangling-reference'
  | 'id-mismatch';

export interface KnowledgeIssue {
  readonly code: KnowledgeIssueCode;
  readonly factId?: string;
  readonly message: string;
}

/** The id a fact of this kind must have, for the kinds whose id is derived from content. */
function derivedId(fact: KnowledgeFact): string | undefined {
  switch (fact.kind) {
    case 'route':
      return routeId(fact.path);
    case 'locator':
      return locatorId(fact.route.replace(/^route:/, ''), fact.role, fact.name);
    case 'test-id':
      return testIdFactId(fact.testId);
    case 'api':
      return apiId(fact.method, fact.path);
    case 'term':
      return termId(fact.key);
    default:
      return undefined;
  }
}

/** Fields that name another fact, and the kind they must name. */
function references(
  fact: KnowledgeFact,
): readonly { field: string; target: string; kind: string }[] {
  switch (fact.kind) {
    case 'environment':
      return fact.application === undefined
        ? []
        : [{ field: 'application', target: fact.application, kind: 'application' }];
    case 'route':
      return fact.application === undefined
        ? []
        : [{ field: 'application', target: fact.application, kind: 'application' }];
    case 'component':
      return fact.route === undefined
        ? []
        : [{ field: 'route', target: fact.route, kind: 'route' }];
    case 'locator':
      return [{ field: 'route', target: fact.route, kind: 'route' }];
    case 'action':
      return [
        { field: 'route', target: fact.route, kind: 'route' },
        ...(fact.component === undefined
          ? []
          : [{ field: 'component', target: fact.component, kind: 'component' }]),
        ...(fact.locator === undefined
          ? []
          : [{ field: 'locator', target: fact.locator, kind: 'locator' }]),
      ];
    default:
      return [];
  }
}

export function validateKnowledge(kb: KnowledgeBase): KnowledgeIssue[] {
  const issues: KnowledgeIssue[] = [];

  const evidenceById = new Map<string, KnowledgeBase['evidence'][number]>();
  for (const evidence of kb.evidence) {
    if (evidenceById.has(evidence.id)) {
      issues.push({
        code: 'duplicate-evidence-id',
        message: `Evidence ${evidence.id} is defined more than once.`,
      });
    }
    evidenceById.set(evidence.id, evidence);
  }

  const factsById = new Map<string, KnowledgeFact>();
  for (const fact of kb.facts) {
    if (factsById.has(fact.id)) {
      issues.push({
        code: 'duplicate-fact-id',
        factId: fact.id,
        message: `Fact ${fact.id} is defined more than once. Merge the two, or they are different facts and need different ids.`,
      });
    }
    factsById.set(fact.id, fact);
  }

  for (const fact of kb.facts) {
    const cited = fact.evidence.map((id) => ({ id, evidence: evidenceById.get(id) }));

    for (const { id, evidence } of cited) {
      if (evidence === undefined) {
        issues.push({
          code: 'unknown-evidence',
          factId: fact.id,
          message: `${fact.id} cites evidence ${id}, which does not exist.`,
        });
      }
    }

    const known = cited.flatMap(({ evidence }) => (evidence === undefined ? [] : [evidence]));
    const grounded = known.some((evidence) => GROUNDED_EVIDENCE.has(evidence.type));

    if (fact.status === 'verified') {
      if (fact.verifiedAt === undefined) {
        issues.push({
          code: 'verified-without-date',
          factId: fact.id,
          message: `${fact.id} is verified but does not say when. A verification with no date cannot be aged or re-checked.`,
        });
      }
      if (!grounded) {
        issues.push({
          code: 'verified-on-inference',
          factId: fact.id,
          message: `${fact.id} is verified, but nothing other than an agent's inference stands behind it. Inference alone cannot verify a fact: observe it, or cite its source.`,
        });
      }
    } else if (fact.status === 'observed' && !grounded && known.length > 0) {
      issues.push({
        code: 'status-above-inference',
        factId: fact.id,
        message: `${fact.id} is marked observed, but only an agent's inference stands behind it. That is inferred until something real is seen.`,
      });
    }

    const expected = derivedId(fact);
    if (expected !== undefined && expected !== fact.id) {
      issues.push({
        code: 'id-mismatch',
        factId: fact.id,
        message: `${fact.id} should be ${expected}. Ids are derived from content so the same thing is never recorded twice.`,
      });
    }

    for (const reference of references(fact)) {
      const target = factsById.get(reference.target);
      if (target?.kind !== reference.kind) {
        issues.push({
          code: 'dangling-reference',
          factId: fact.id,
          message:
            target === undefined
              ? `${fact.id}.${reference.field} names ${reference.target}, which is not in the knowledge base.`
              : `${fact.id}.${reference.field} names ${reference.target}, which is a ${target.kind}, not a ${reference.kind}.`,
        });
      }
    }
  }

  return issues;
}
