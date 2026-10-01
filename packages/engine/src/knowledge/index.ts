/**
 * The Knowledge Core: the model of what is known about an application and how far
 * to trust it. No I/O lives here — see model.ts for why.
 */

export {
  ConflictSchema,
  DependenciesSchema,
  EvidenceSchema,
  EvidenceTypeSchema,
  FactConfidenceSchema,
  FactStatusSchema,
  GROUNDED_EVIDENCE,
  KNOWLEDGE_MODEL_VERSION,
  KnowledgeBaseSchema,
  KnowledgeFactSchema,
  VerifiedAgainstSchema,
  type Conflict,
  type ConflictValue,
  type EvidenceType,
  type FactConfidence,
  type FactKind,
  type FactOfKind,
  type FactStatus,
  type KnowledgeBase,
  type KnowledgeEvidence,
  type KnowledgeFact,
} from './model.js';

export {
  apiId,
  evidenceId,
  locatorId,
  namedId,
  normaliseName,
  routeId,
  termId,
  testIdFactId,
} from './ids.js';

export { validateKnowledge, type KnowledgeIssue, type KnowledgeIssueCode } from './validate.js';

export {
  KnowledgeError,
  parseKnowledge,
  toData,
  UnsupportedKnowledgeVersionError,
} from './serialize.js';

export { KnowledgeBuilder } from './builder.js';

export {
  indexKnowledge,
  type ApiFact,
  type Coverage,
  type KnowledgeIndex,
  type LocatorFact,
  type RouteFact,
  type TermFact,
  type TestIdFact,
} from './query.js';
