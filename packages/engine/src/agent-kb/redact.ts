/**
 * Keeping secrets out of `.agent-kb`, which is committed. A survey reads a live
 * application seeded with real-looking data, so the filter runs on the way in —
 * redacting at read time would mean the secret was already committed.
 */

export interface Redaction {
  readonly kind: string;
  readonly count: number;
}

export interface RedactionResult {
  readonly text: string;
  readonly redactions: readonly Redaction[];
}

/** Broad on purpose: a false positive costs a placeholder, a false negative a credential. */
const PATTERNS: readonly { kind: string; pattern: RegExp }[] = [
  // Ahead of `assigned-secret`: only this one keeps the parameter name.
  {
    kind: 'url-credential',
    pattern: /([?&](?:token|key|secret|password|sig|signature)=)[^&\s]+/gi,
  },
  { kind: 'email', pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { kind: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi },
  // Common provider key shapes: sk-..., ghp_..., AKIA...
  { kind: 'api-key', pattern: /\b(?:sk|pk|rk)[-_][A-Za-z0-9]{16,}\b/g },
  { kind: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { kind: 'aws-key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    kind: 'assigned-secret',
    pattern:
      /\b(?:token|secret|password|passwd|apikey|api_key|auth)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{8,}/gi,
  },
  { kind: 'credit-card', pattern: /\b(?:\d[ -]?){13,19}\b/g },
  {
    kind: 'url-credential',
    pattern: /([?&](?:token|key|secret|password|sig|signature)=)[^&\s]+/gi,
  },
];

const PLACEHOLDER = (kind: string): string => `«redacted:${kind}»`;

export function redact(text: string): RedactionResult {
  const redactions: Redaction[] = [];
  let out = text;

  for (const { kind, pattern } of PATTERNS) {
    let count = 0;
    out = out.replace(new RegExp(pattern.source, pattern.flags), (_match, prefix?: string) => {
      count += 1;
      // Keep the parameter name so a reader can see *what* was removed.
      return typeof prefix === 'string' ? `${prefix}${PLACEHOLDER(kind)}` : PLACEHOLDER(kind);
    });
    if (count > 0) redactions.push({ kind, count });
  }

  return { text: out, redactions };
}

export function containsSensitive(text: string): boolean {
  return redact(text).redactions.length > 0;
}

export function describeRedactions(redactions: readonly Redaction[]): string {
  if (redactions.length === 0) return 'nothing sensitive found';
  return redactions.map((r) => `${String(r.count)} ${r.kind}`).join(', ');
}
