import { z } from 'zod';

/** Schema for rules/tags.yaml. */

export const TAGS_SCHEMA_VERSION = 1;

export const TagSchema = z.strictObject({
  name: z.string().regex(/^@[a-z][a-z0-9-]*$/, 'a tag must start with @ and be kebab-case'),
  means: z.string().min(1),
  ci: z.string().min(1),
});

export const TagSetSchema = z
  .strictObject({
    schemaVersion: z.literal(TAGS_SCHEMA_VERSION),
    tags: z.array(TagSchema).min(1),
  })
  .refine((t) => new Set(t.tags.map((x) => x.name)).size === t.tags.length, {
    message: 'duplicate tag name',
    path: ['tags'],
  });

export type Tag = z.infer<typeof TagSchema>;
export type TagSet = z.infer<typeof TagSetSchema>;
