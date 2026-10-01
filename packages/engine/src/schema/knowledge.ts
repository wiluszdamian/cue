import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true });

export const KnowledgeStatusSchema = z.enum(['observed', 'inferred', 'verified', 'conflicting']);

export const KnowledgeProvenanceTypeSchema = z.enum([
  'source-code',
  'browser-survey',
  'existing-test',
  'page-object',
  'openapi',
  'manual',
  'agent-inference',
  'import',
]);

export const RelevantFileSchema = z.strictObject({
  path: z.string().min(1),
  hash: z.string().min(1).optional(),
});

export const KnowledgeProvenanceSchema = z.strictObject({
  type: KnowledgeProvenanceTypeSchema,
  file: z.string().min(1).optional(),
  line: z.number().int().positive().optional(),
  symbol: z.string().min(1).optional(),
  url: z.url().optional(),
  environment: z.string().min(1).optional(),
  commit: z.string().min(1).optional(),
  observedAt: isoDate.optional(),
  snapshotHash: z.string().min(1).optional(),
  relevantFiles: z.array(RelevantFileSchema).optional(),
});

const FactBase = {
  id: z.string().min(1),
  status: KnowledgeStatusSchema,
  provenance: z.array(KnowledgeProvenanceSchema).min(1),
  verifiedAt: isoDate.optional(),
};

const RouteFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('route'),
  path: z.string().min(1),
});
const LocatorFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('locator'),
  route: z.string().min(1),
  expression: z.string().min(1),
  role: z.string().min(1),
  name: z.string().optional(),
  level: z.number().int().positive().optional(),
  testIdCandidate: z.string().min(1).optional(),
});
const TestIdFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('test-id'),
  testId: z.string().min(1),
});
const ApiFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('api'),
  path: z.string().min(1),
  method: z.string().min(1).optional(),
});
const TermFactSchema = z.strictObject({
  ...FactBase,
  kind: z.literal('term'),
  key: z.string().min(1),
  label: z.string(),
});

export const KnowledgeFactSchema = z
  .discriminatedUnion('kind', [
    RouteFactSchema,
    LocatorFactSchema,
    TestIdFactSchema,
    ApiFactSchema,
    TermFactSchema,
  ])
  .superRefine((fact, ctx) => {
    if (fact.status === 'verified') {
      if (fact.verifiedAt === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'verified facts require verifiedAt',
          path: ['verifiedAt'],
        });
      }
      if (fact.provenance.every((source) => source.type === 'agent-inference')) {
        ctx.addIssue({
          code: 'custom',
          message: 'agent inference alone cannot verify a fact',
          path: ['provenance'],
        });
      }
    }
  });

export const KnowledgeBaseSchema = z.strictObject({ facts: z.array(KnowledgeFactSchema) });

export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;
export type KnowledgeProvenanceType = z.infer<typeof KnowledgeProvenanceTypeSchema>;
export type KnowledgeProvenance = z.infer<typeof KnowledgeProvenanceSchema>;
export type KnowledgeFact = z.infer<typeof KnowledgeFactSchema>;
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;
