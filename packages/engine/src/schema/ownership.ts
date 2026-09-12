import { z } from 'zod';

/** Schema for the arbitration table: which source decides each topic. */

export const OWNERSHIP_SCHEMA_VERSION = 1;

const ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** `external` is somebody else's release: consulted, never forked. */
export const OwnerKindSchema = z.enum(['internal', 'external']);

/** `absolute` is reserved for what nobody upstream can know: this repo, this app. */
export const PrecedenceSchema = z.enum(['absolute', 'default']);

/** How to reach a source, where more than one route exists. */
export const ChannelSchema = z.enum(['cli', 'mcp', 'file']);

export const OwnerSchema = z.strictObject({
  id: z.string().regex(ID, 'owner id must be kebab-case'),
  name: z.string().min(1),
  kind: OwnerKindSchema,
  maintainer: z.string().min(1),
  install: z.string().min(1).optional(),
  /** What to actually do when this owner decides a topic. */
  consult: z.string().min(1),
});

export const TopicSchema = z.strictObject({
  topic: z.string().min(1),
  owner: z.string().regex(ID),
  precedence: PrecedenceSchema.default('default'),
  channel: ChannelSchema.optional(),
  /**
   * Load-bearing: `validateRules` refuses a rule citing a skill that no
   * absolutely-owned topic claims.
   */
  skills: z.array(z.string().min(1)).default([]),
  keywords: z.array(z.string().min(1)).min(1),
  note: z.string().min(1).optional(),
});

export const OwnershipSchema = z
  .strictObject({
    schemaVersion: z.literal(OWNERSHIP_SCHEMA_VERSION),
    owners: z.array(OwnerSchema).min(1),
    topics: z.array(TopicSchema).min(1),
  })
  .refine((o) => new Set(o.owners.map((x) => x.id)).size === o.owners.length, {
    message: 'duplicate owner id',
    path: ['owners'],
  })
  .refine((o) => new Set(o.topics.map((t) => t.topic)).size === o.topics.length, {
    message: 'duplicate topic',
    path: ['topics'],
  })
  .refine(
    (o) => {
      const ids = new Set(o.owners.map((x) => x.id));
      return o.topics.every((t) => ids.has(t.owner));
    },
    { message: 'a topic names an owner that is not declared in owners', path: ['topics'] },
  );

export type OwnerKind = z.infer<typeof OwnerKindSchema>;
export type Precedence = z.infer<typeof PrecedenceSchema>;
export type Channel = z.infer<typeof ChannelSchema>;
export type Owner = z.infer<typeof OwnerSchema>;
export type Topic = z.infer<typeof TopicSchema>;
export type Ownership = z.infer<typeof OwnershipSchema>;
