import { z } from 'zod';
import { DependenciesSchema, EvidenceSchema, FactStatusSchema } from '../knowledge/model.js';

/**
 * Schemas for `.agent-kb`. A selector reported confidently after it stopped
 * existing fails like an application bug, so every entry carries where it came
 * from and when it was last confirmed.
 */

export const AGENT_KB_SCHEMA_VERSION = 1;

/**
 * Route maps are written as version 2: every element says what it rests on
 * (evidence), where it stands (status) and when it was confirmed. Version 1 is
 * still read — migrated in memory, never rewritten until something saves it — and
 * a version this Understudy does not know is refused rather than half-read.
 * The product files (`testids`, `surface`, `vocabulary`) stay at version 1: each of
 * their entries already carries its `file:line` and each file its `commit`, which
 * is exactly their evidence.
 */
export const ROUTE_MAP_VERSION = 2;

/** How much to trust a selector. Only `confirmed` earns an unqualified answer. */
export const ConfidenceSchema = z.enum([
  /** Present in the product source and seen in the running application. */
  'confirmed',
  /** Seen running, absent from the source — may be third-party or generated. */
  'runtime-only',
  /** In the source, never seen running — may be dead, or behind a flag. */
  'code-only',
  /** Neither. Never returned as an answer; recorded so the gap is visible. */
  'unknown',
]);

export const FreshnessSchema = z.enum(['fresh', 'ageing', 'stale']);

const elementCore = {
  role: z.string().min(1),
  name: z.string().optional(),
  level: z.number().int().positive().optional(),
  /** A ready-to-paste Playwright expression, e.g. `getByRole('button', { name: 'Log in' })`. */
  locator: z.string().min(1),
  /** `data-testid` from the product source, when correlation found one. */
  testId: z.string().optional(),
};

/** An element as version 1 stored it. Only used to read old files. */
export const KbElementV1Schema = z.strictObject({ ...elementCore, confidence: ConfidenceSchema });

/**
 * One addressable thing on a page, as the code works with it. `confidence` is the
 * short answer to "who has seen this" and is derived from `status` and `evidence`
 * when those are present; a freshly surveyed element has only `confidence`, and the
 * rest is worked out when it is written. Storing CSS here would launder a violation.
 */
export const KbElementSchema = z.strictObject({
  ...elementCore,
  confidence: ConfidenceSchema,
  id: z.string().min(1).optional(),
  status: FactStatusSchema.optional(),
  /** Ids into the map's `evidence`. */
  evidence: z.array(z.string().min(1)).optional(),
  verifiedAt: z.string().min(1).optional(),
  dependencies: DependenciesSchema.optional(),
});

/** An element as version 2 stores it: what it is, where it stands, what it rests on. */
export const KbElementFileV2Schema = z.strictObject({
  id: z.string().min(1),
  ...elementCore,
  status: FactStatusSchema,
  evidence: z.array(z.string().min(1)).min(1),
  verifiedAt: z.string().min(1).optional(),
  dependencies: DependenciesSchema.optional(),
});

export const KbLinkSchema = z.strictObject({
  name: z.string().optional(),
  href: z.string().min(1),
});

const routeMapCore = {
  /** Path only — the host belongs to the environment, never to the map. */
  route: z.string().min(1),
  title: z.string(),
  /** A name such as `staging`. Never a URL: the address is configuration, not knowledge. */
  environment: z.string().min(1).optional(),
  exploredAt: z.string().min(1),
  /** Equal to `exploredAt` on a fresh survey; moved forward by `verify --refresh`. */
  verifiedAt: z.string().min(1),
  /** Hash of the accessibility snapshot, so drift is detectable without a diff. */
  snapshotHash: z.string().min(1),
  links: z.array(KbLinkSchema).default([]),
  /** Anything the survey could not establish, stated rather than omitted. */
  gaps: z.array(z.string()).default([]),
};

/** A route map as version 1 stored it. Only used to read old files. */
export const RouteMapV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  ...routeMapCore,
  elements: z.array(KbElementV1Schema),
});

/** A route map as it is written to disk. */
export const RouteMapFileV2Schema = z.strictObject({
  schemaVersion: z.literal(ROUTE_MAP_VERSION),
  ...routeMapCore,
  /** Every piece of evidence any element below cites. */
  evidence: z.array(EvidenceSchema),
  elements: z.array(KbElementFileV2Schema),
});

/**
 * A route map as the code works with it, whichever version it was read from. Reading
 * a version 1 file yields `schemaVersion: 2` here, since it has been migrated; the
 * value is ignored on the way out, because writing always produces version 2.
 */
export const RouteMapSchema = z.strictObject({
  schemaVersion: z.union([z.literal(1), z.literal(ROUTE_MAP_VERSION)]),
  ...routeMapCore,
  /** The tool that made the observation. Used once, to describe it in evidence. */
  tool: z
    .strictObject({
      name: z.string().min(1),
      version: z.string().min(1).optional(),
      format: z.string().min(1).optional(),
    })
    .optional(),
  evidence: z.array(EvidenceSchema).optional(),
  elements: z.array(KbElementSchema),
});

export const FlowStepSchema = z.strictObject({
  action: z.string().min(1),
  route: z.string().min(1),
  checkpoint: z.string().optional(),
});

export const FlowSchema = z.strictObject({
  schemaVersion: z.literal(AGENT_KB_SCHEMA_VERSION),
  name: z.string().min(1),
  steps: z.array(FlowStepSchema).min(1),
  exploredAt: z.string().min(1),
  verifiedAt: z.string().min(1),
});

/** `product/testids.yaml` — written by `extract`, read by correlation. */
export const TestIdEntrySchema = z.strictObject({
  testId: z.string().min(1),
  /** `file:line` in the product source. Without it the entry is unverifiable. */
  source: z.string().min(1),
});

export const TestIdsSchema = z.strictObject({
  schemaVersion: z.literal(AGENT_KB_SCHEMA_VERSION),
  commit: z.string().optional(),
  testIds: z.array(TestIdEntrySchema).default([]),
});

/** One route or endpoint the product source declares. */
export const SurfaceEntrySchema = z.strictObject({
  kind: z.enum(['route', 'endpoint']),
  /** `/checkout/[id]`, or `GET /api/users`. */
  path: z.string().min(1),
  method: z.string().optional(),
  /** `file:line` in the product source. Without it the entry is unverifiable. */
  source: z.string().min(1),
});

export const SurfaceSchema = z.strictObject({
  schemaVersion: z.literal(AGENT_KB_SCHEMA_VERSION),
  commit: z.string().optional(),
  entries: z.array(SurfaceEntrySchema).default([]),
});

/** A user-visible label, usually from an i18n catalogue. */
export const TermSchema = z.strictObject({
  key: z.string().min(1),
  label: z.string(),
  source: z.string().min(1),
});

export const VocabularySchema = z.strictObject({
  schemaVersion: z.literal(AGENT_KB_SCHEMA_VERSION),
  commit: z.string().optional(),
  terms: z.array(TermSchema).default([]),
});

/** What `extract` read: which commit a claim came from, and what to re-check for drift. */
export const SourcesSchema = z.strictObject({
  schemaVersion: z.literal(AGENT_KB_SCHEMA_VERSION),
  source: z.string().min(1),
  commit: z.string().optional(),
  extractedAt: z.string().min(1),
  adapters: z.array(z.string()).default([]),
  files: z.array(z.strictObject({ path: z.string().min(1), hash: z.string().min(1) })).default([]),
  /** What could not be established, stated rather than omitted. */
  gaps: z.array(z.string()).default([]),
});

export type SurfaceEntry = z.infer<typeof SurfaceEntrySchema>;
export type Surface = z.infer<typeof SurfaceSchema>;
export type Term = z.infer<typeof TermSchema>;
export type Vocabulary = z.infer<typeof VocabularySchema>;
export type Sources = z.infer<typeof SourcesSchema>;

export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Freshness = z.infer<typeof FreshnessSchema>;
export type KbElement = z.infer<typeof KbElementSchema>;
export type KbLink = z.infer<typeof KbLinkSchema>;
export type RouteMap = z.infer<typeof RouteMapSchema>;
export type RouteMapFileV2 = z.infer<typeof RouteMapFileV2Schema>;
export type Flow = z.infer<typeof FlowSchema>;
export type TestIdEntry = z.infer<typeof TestIdEntrySchema>;
export type TestIds = z.infer<typeof TestIdsSchema>;
