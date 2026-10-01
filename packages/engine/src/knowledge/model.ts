import { z } from 'zod';

/**
 * The Knowledge Core: what Understudy knows about an application, why it believes
 * it, and how far to trust it. Plain typed structures with string ids — no graph
 * engine — because the questions asked of it are lookups, not traversals.
 *
 * Nothing in this directory touches the file system, a process, the CLI or an
 * agent. It is data and the rules about data; reading and writing it is somebody
 * else's job, which is what keeps it testable and what lets every consumer (CLI,
 * lint rule, MCP) get the same answer from the same code.
 */

/** Bumped when the model changes in a way an older reader cannot understand. */
export const KNOWLEDGE_MODEL_VERSION = 1;

const isoDate = z.iso.datetime({ offset: true });
const nonEmpty = z.string().min(1);

/**
 * Where a fact stands. Stored, because it records something that happened:
 *
 * - `inferred` — reasoned or guessed. Never the basis for generating a locator.
 * - `observed` — seen once, by some real source.
 * - `verified` — confirmed by enough evidence to rely on.
 * - `stale` — a check that was meant to confirm it failed.
 *
 * Deliberately not here: `possibly-stale` (a consequence of what changed since, so
 * it is computed on read and would be wrong the day after it was written) and
 * `conflicting` (a relationship between facts, not a property of one).
 */
export const FactStatusSchema = z.enum(['inferred', 'observed', 'verified', 'stale']);

export const EvidenceTypeSchema = z.enum([
  'source-code',
  'browser',
  'existing-test',
  'page-object',
  'openapi',
  'manual',
  'import',
  'agent-inference',
]);

/** Evidence types that something other than a model's guess stands behind. */
export const GROUNDED_EVIDENCE: ReadonlySet<EvidenceType> = new Set([
  'source-code',
  'browser',
  'existing-test',
  'page-object',
  'openapi',
  'manual',
  'import',
]);

/** One reason to believe something. A fact cites it by id; many facts may share one. */
export const EvidenceSchema = z.strictObject({
  id: nonEmpty,
  type: EvidenceTypeSchema,
  file: nonEmpty.optional(),
  line: z.number().int().positive().optional(),
  symbol: nonEmpty.optional(),
  /** A path. The host belongs to the environment, never to the knowledge. */
  route: nonEmpty.optional(),
  environment: nonEmpty.optional(),
  commit: nonEmpty.optional(),
  observedAt: isoDate.optional(),
  snapshotHash: nonEmpty.optional(),
  /** What produced it, so a result can be traced to a tool version. */
  tool: z
    .strictObject({ name: nonEmpty, version: nonEmpty.optional(), format: nonEmpty.optional() })
    .optional(),
});

/** How much to trust a fact, in words. Never a number: nothing here measures to that precision. */
export const FactConfidenceSchema = z.strictObject({
  level: z.enum(['low', 'medium', 'high']),
  reason: nonEmpty,
});

/** The context a fact was confirmed in; the same button can differ by role or locale. */
export const VerifiedAgainstSchema = z.strictObject({
  commit: nonEmpty.optional(),
  environment: nonEmpty.optional(),
  role: nonEmpty.optional(),
  locale: nonEmpty.optional(),
});

/** What a fact depends on, so that a change to it can be traced back to the fact. */
export const DependenciesSchema = z.strictObject({
  files: z.array(z.strictObject({ path: nonEmpty, hash: nonEmpty.optional() })),
});

const FactBase = {
  id: nonEmpty,
  status: FactStatusSchema,
  /** Ids of `Evidence`. A fact with no reason attached is not a fact. */
  evidence: z.array(nonEmpty).min(1),
  confidence: FactConfidenceSchema.optional(),
  verifiedAt: isoDate.optional(),
  verifiedAgainst: VerifiedAgainstSchema.optional(),
  dependencies: DependenciesSchema.optional(),
};

const named = <K extends string>(kind: K) =>
  z.strictObject({
    ...FactBase,
    kind: z.literal(kind),
    name: nonEmpty,
    description: z.string().optional(),
  });

const ApplicationFactSchema = named('application');
const RoleFactSchema = named('role');
const StateFactSchema = named('state');
const DataRequirementFactSchema = named('data-requirement');

const EnvironmentFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('environment'),
  name: nonEmpty,
  /** Id of an `application` fact. There is no base URL: that is configuration. */
  application: nonEmpty.optional(),
  description: z.string().optional(),
});

const RouteFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('route'),
  path: nonEmpty,
  title: z.string().optional(),
  application: nonEmpty.optional(),
});

const ComponentFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('component'),
  name: nonEmpty,
  /** Id of a `route` fact. */
  route: nonEmpty.optional(),
  description: z.string().optional(),
});

const LocatorFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('locator'),
  /** Id of a `route` fact. */
  route: nonEmpty,
  role: nonEmpty,
  name: z.string().optional(),
  level: z.number().int().positive().optional(),
  /** A ready-to-paste Playwright expression. */
  expression: nonEmpty,
  testId: nonEmpty.optional(),
});

const ActionFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('action'),
  /** Id of a `route` fact. */
  route: nonEmpty,
  /** Id of a `component` fact. */
  component: nonEmpty.optional(),
  intent: nonEmpty,
  /** Id of a `locator` fact. */
  locator: nonEmpty.optional(),
  requires: z
    .strictObject({
      roles: z.array(nonEmpty).optional(),
      states: z.array(nonEmpty).optional(),
    })
    .optional(),
});

const TestIdFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('test-id'),
  testId: nonEmpty,
});

const ApiFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('api'),
  method: nonEmpty.optional(),
  path: nonEmpty,
});

const TermFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('term'),
  key: nonEmpty,
  label: z.string(),
});

export const KnowledgeFactSchema = z.discriminatedUnion('kind', [
  ApplicationFactSchema,
  EnvironmentFactSchema,
  RouteFactSchema,
  ComponentFactSchema,
  RoleFactSchema,
  StateFactSchema,
  ActionFactSchema,
  LocatorFactSchema,
  TestIdFactSchema,
  ApiFactSchema,
  TermFactSchema,
  DataRequirementFactSchema,
]);

const ConflictValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * Two sources disagree about one field of one fact. Kept as a record of the
 * disagreement, with who said what, rather than resolved by picking a winner:
 * a merge that silently chooses one is how a wrong locator gets verified.
 */
export const ConflictSchema = z.strictObject({
  factId: nonEmpty,
  field: nonEmpty,
  values: z
    .array(z.strictObject({ value: ConflictValueSchema, evidence: z.array(nonEmpty) }))
    .min(2),
});

export const KnowledgeBaseSchema = z.strictObject({
  modelVersion: z.number().int().positive(),
  facts: z.array(KnowledgeFactSchema),
  evidence: z.array(EvidenceSchema),
  conflicts: z.array(ConflictSchema).optional(),
});

export type Conflict = z.infer<typeof ConflictSchema>;
export type ConflictValue = z.infer<typeof ConflictValueSchema>;
export type FactStatus = z.infer<typeof FactStatusSchema>;
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;
export type KnowledgeEvidence = z.infer<typeof EvidenceSchema>;
export type FactConfidence = z.infer<typeof FactConfidenceSchema>;
export type KnowledgeFact = z.infer<typeof KnowledgeFactSchema>;
export type FactKind = KnowledgeFact['kind'];
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;

export type FactOfKind<K extends FactKind> = Extract<KnowledgeFact, { kind: K }>;
