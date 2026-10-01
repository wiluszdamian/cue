import { ZodError } from 'zod';
import { KNOWLEDGE_MODEL_VERSION, KnowledgeBaseSchema, type KnowledgeBase } from './model.js';
import { validateKnowledge, type KnowledgeIssue } from './validate.js';

/**
 * Turning a knowledge base into plain data and back. Strict in both directions:
 * unknown fields are an error, not ignored, because a field that is silently
 * dropped on the way in is a fact that silently disappears on the way out.
 */

/** Written by a newer Understudy than this one. Refused, never read as far as it goes. */
export class UnsupportedKnowledgeVersionError extends Error {
  constructor(readonly found: number) {
    super(
      `This knowledge base uses model version ${String(found)}, but this Understudy understands ` +
        `up to ${String(KNOWLEDGE_MODEL_VERSION)}. Upgrade @understudy/cli rather than editing the file: ` +
        'reading it with an older model would drop whatever the newer one added.',
    );
    this.name = 'UnsupportedKnowledgeVersionError';
  }
}

/** The data is not a knowledge base, or is one that contradicts itself. */
export class KnowledgeError extends Error {
  constructor(
    message: string,
    readonly issues: readonly KnowledgeIssue[] = [],
  ) {
    super(message);
    this.name = 'KnowledgeError';
  }
}

const SHOWN = 8;

function describeZod(error: ZodError): string {
  const lines = error.issues
    .slice(0, SHOWN)
    .map(
      (issue) =>
        `  ${issue.path.length > 0 ? issue.path.join('.') : '(top level)'}: ${issue.message}`,
    );
  if (error.issues.length > SHOWN) lines.push(`  …and ${String(error.issues.length - SHOWN)} more`);
  return lines.join('\n');
}

/** Facts and evidence in a stable order, so the same knowledge always serialises the same way. */
export function toData(kb: KnowledgeBase): KnowledgeBase {
  const byId = <T extends { id: string }>(items: readonly T[]): T[] =>
    [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    modelVersion: KNOWLEDGE_MODEL_VERSION,
    facts: byId(kb.facts),
    evidence: byId(kb.evidence),
  };
}

/**
 * Plain data in, a knowledge base out — or a reason, never a half-read result.
 * Checks the version first (so a newer file gets the upgrade message rather than a
 * confusing schema error), then the shape, then the rules about facts.
 */
export function parseKnowledge(data: unknown): KnowledgeBase {
  const version =
    typeof data === 'object' && data !== null && 'modelVersion' in data
      ? data.modelVersion
      : undefined;
  if (typeof version === 'number' && version > KNOWLEDGE_MODEL_VERSION) {
    throw new UnsupportedKnowledgeVersionError(version);
  }

  const result = KnowledgeBaseSchema.safeParse(data);
  if (!result.success) {
    throw new KnowledgeError(`Not a valid knowledge base:\n${describeZod(result.error)}`);
  }

  const issues = validateKnowledge(result.data);
  if (issues.length > 0) {
    const shown = issues.slice(0, SHOWN).map((issue) => `  - ${issue.message}`);
    if (issues.length > SHOWN) shown.push(`  …and ${String(issues.length - SHOWN)} more`);
    throw new KnowledgeError(
      `The knowledge base contradicts itself (${String(issues.length)} problem(s)):\n${shown.join('\n')}`,
      issues,
    );
  }
  return toData(result.data);
}
