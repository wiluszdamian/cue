import picomatch from 'picomatch';
import type { Rule } from './schema/constitution.js';

/** Windows paths would otherwise never match the constitution's glob scopes. */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * A rule's `scope` is relative to the project root, but the engine sees
 * repo-relative paths while ESLint reports absolute ones with no reliable root to
 * subtract. Anchoring each pattern with `**\/` makes one matcher correct for both.
 *
 * The cost is that `tests/` also matches `packages/x/tests/`, which in a monorepo
 * is what you wanted. The alternative — a scope that stops applying depending on
 * where the linter was launched — fails by looking like a clean run.
 */
function anchor(pattern: string): string {
  if (pattern.startsWith('**/') || pattern.startsWith('/')) return pattern;
  return `**/${pattern}`;
}

export type ScopeMatcher = (path: string) => boolean;

export function scopeMatcher(rule: Pick<Rule, 'scope' | 'exclude'>): ScopeMatcher {
  const isIncluded = picomatch(rule.scope.map(anchor), { dot: true });
  const isExcluded =
    rule.exclude.length > 0 ? picomatch(rule.exclude.map(anchor), { dot: true }) : () => false;

  return (path) => {
    const normalized = normalizePath(path);
    return isIncluded(normalized) && !isExcluded(normalized);
  };
}
