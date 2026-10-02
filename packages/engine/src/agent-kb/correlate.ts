import type { Confidence, KbElement, TestIds } from '../schema/agent-kb.js';

/** Neither source alone proves a `data-testid` is real *and* reachable. */
export function correlate(
  elements: readonly KbElement[],
  testIds: TestIds | undefined,
): KbElement[] {
  if (!testIds || testIds.testIds.length === 0) return [...elements];

  return elements.map((element) => {
    const candidate = element.name === undefined ? undefined : match(element.name, testIds);
    if (candidate === undefined) return element;

    // Seen running and present in the source: the only combination that earns this.
    return { ...element, testId: candidate, confidence: 'confirmed' satisfies Confidence };
  });
}

/**
 * The test id for an accessible name, or nothing.
 *
 * Test ids are qualified by area, so demanding the whole id equal the name left
 * `confirmed` unreachable — on a real survey it matched 1 of 15. A name now
 * matches any run of whole segments, never a substring: `Log in` meets
 * `login-submit` but not `blogin-x`. Ambiguous matches confirm nothing, since
 * `Password` against both `login-password` and `reset-password` identifies neither.
 */
function match(name: string, testIds: TestIds): string | undefined {
  const wanted = normalise(name);
  if (wanted.length === 0) return undefined;

  const exact = testIds.testIds.find((entry) => normalise(entry.testId) === wanted);
  if (exact) return exact.testId;

  const candidates = testIds.testIds.filter((entry) => segmentRuns(entry.testId).has(wanted));
  return candidates.length === 1 ? candidates[0]?.testId : undefined;
}

/** Every run of consecutive segments in an id, joined: `a-b-c` → a, ab, abc, b, bc, c. */
function segmentRuns(testId: string): Set<string> {
  const segments = testId
    // camelCase and kebab/snake are both in the wild, often in one codebase.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 0);

  const runs = new Set<string>();
  for (let start = 0; start < segments.length; start += 1) {
    let joined = '';
    for (const segment of segments.slice(start)) {
      joined += segment;
      runs.add(joined);
    }
  }
  return runs;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
