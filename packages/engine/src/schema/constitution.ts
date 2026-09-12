import { z } from 'zod';

/**
 * Schema for rules/constitution.yaml. The constitution is data so one edit reaches
 * the plugin, the docs and `explain_rule` at once; what data cannot express goes
 * in a registry keyed by rule id, deliberately awkwardly.
 */

/** Bumped when a change to this schema is not backward compatible. */
export const CONSTITUTION_SCHEMA_VERSION = 1;

const RULE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

export const TierSchema = z.enum(['MUST', 'SHOULD', 'MUST_NOT']);
export const SeveritySchema = z.enum(['error', 'warn']);

/** The same string becomes the ESLint listener key, which is what makes the two agree. */
const AstDetectorSchema = z.strictObject({
  kind: z.literal('ast'),
  selector: z.string().min(1),
  /** Optional second pass, for what a selector cannot see: comments, siblings, tags. */
  refine: z.string().min(1).optional(),
});

const RegexDetectorSchema = z.strictObject({
  kind: z.literal('regex'),
  pattern: z.string().min(1),
  flags: z
    .string()
    .regex(/^[gimsuy]*$/)
    .default('g'),
});

/**
 * Real but not mechanically checkable: documented, never reported, never an ESLint
 * rule. Recorded here so the constitution stays honest about its own teeth.
 */
const ManualDetectorSchema = z.strictObject({
  kind: z.literal('manual'),
});

export const DetectorSchema = z.discriminatedUnion('kind', [
  AstDetectorSchema,
  RegexDetectorSchema,
  ManualDetectorSchema,
]);

export const ExamplesSchema = z.strictObject({
  bad: z.string().min(1),
  good: z.string().min(1),
});

export const RuleSchema = z
  .strictObject({
    id: z.string().regex(RULE_ID, 'rule id must be kebab-case'),
    tier: TierSchema,
    severity: SeveritySchema,
    title: z.string().min(1),
    rationale: z.string().min(1),
    detector: DetectorSchema,
    scope: z.array(z.string().min(1)).min(1),
    exclude: z.array(z.string().min(1)).default([]),
    autofix: z.boolean().default(false),
    /**
     * What is wrong, why, and the correct alternative. A message that only names
     * the rule teaches an agent to route around it.
     */
    message: z.string().min(1),
    skill: z.string().min(1),
    docsAnchor: z.string().min(1),
    examples: ExamplesSchema,
    since: z.string().regex(SEMVER),
    deprecated: z.string().regex(SEMVER).nullable().default(null),
  })
  .refine((rule) => !(rule.autofix && rule.detector.kind === 'manual'), {
    message: 'a manual rule cannot be autofixable',
    path: ['autofix'],
  })
  .refine((rule) => !(rule.detector.kind === 'manual' && rule.severity === 'warn'), {
    message:
      'a manual rule is documentation, not a soft warning — give it the severity it would have if it were enforceable',
    path: ['severity'],
  });

export const ConstitutionSchema = z
  .strictObject({
    schemaVersion: z.literal(CONSTITUTION_SCHEMA_VERSION),
    rules: z.array(RuleSchema).min(1),
  })
  .refine((c) => new Set(c.rules.map((r) => r.id)).size === c.rules.length, {
    message: 'duplicate rule id',
    path: ['rules'],
  })
  .refine((c) => new Set(c.rules.map((r) => r.docsAnchor)).size === c.rules.length, {
    message: 'duplicate docsAnchor',
    path: ['rules'],
  });

export type Tier = z.infer<typeof TierSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Detector = z.infer<typeof DetectorSchema>;
export type AstDetector = z.infer<typeof AstDetectorSchema>;
export type RegexDetector = z.infer<typeof RegexDetectorSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Constitution = z.infer<typeof ConstitutionSchema>;

/** A rule whose detector produces diagnostics. Excludes `manual`. */
export type EnforceableRule = Rule & { detector: AstDetector | RegexDetector };

export function isEnforceable(rule: Rule): rule is EnforceableRule {
  return rule.detector.kind !== 'manual';
}
