import { createHash } from 'node:crypto';
import type { FactKind, KnowledgeEvidence } from './model.js';

/**
 * Ids are derived from what a thing *is*, so two surveys of the same button yield
 * the same id and merge instead of piling up. They are readable on purpose: they
 * end up in diagnostics an agent has to act on.
 */

/** Case, spacing and surrounding whitespace are not identity. */
export function normaliseName(name: string | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** `route:/login` — the path only, never the host. */
export const routeId = (path: string): string => `route:${path}`;

/** `locator:/login#button:log in` */
export const locatorId = (route: string, role: string, name: string | undefined): string =>
  `locator:${route}#${role}:${normaliseName(name)}`;

export const testIdFactId = (testId: string): string => `test-id:${testId}`;

/** `api:GET /api/items`; a path with no method is `api:/api/items`. */
export const apiId = (method: string | undefined, path: string): string =>
  method === undefined ? `api:${path}` : `api:${method.toUpperCase()} ${path}`;

export const termId = (key: string): string => `term:${key}`;

/** For the kinds a person names: `action:settings.password.change`, `role:admin`. */
export const namedId = (
  kind: Exclude<FactKind, 'route' | 'locator' | 'test-id' | 'api' | 'term'>,
  name: string,
): string => `${kind}:${name}`;

/**
 * The same evidence is always the same id, whoever records it and in what order:
 * a hash of its content, so a repeated observation is recognised as repeated.
 */
export function evidenceId(evidence: Omit<KnowledgeEvidence, 'id'>): string {
  return `ev_${createHash('sha256').update(canonical(evidence), 'utf8').digest('hex').slice(0, 12)}`;
}

/** JSON with every object's keys sorted and `undefined` dropped, so key order is not identity. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
