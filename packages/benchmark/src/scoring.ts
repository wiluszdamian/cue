import {
  analyze,
  analyzeLocators,
  extractLocators,
  readAllRouteMaps,
  type KnowledgeIndex,
  type Constitution,
  type LocatorUse,
  type TagSet,
} from '@understudy/engine';

/**
 * Scoring a piece of generated test code. Deterministic, and both metrics are
 * counts rather than judgements, because this is the half that has to be beyond
 * argument.
 *
 * 1. **Compliance** — rules broken, per file, so longer output is not worse for free.
 * 2. **Grounding** — of the selectors written, how many name something real.
 */

export interface ComplianceScore {
  readonly files: number;
  readonly violations: number;
  readonly violationsPerFile: number;
  readonly byRule: readonly { readonly ruleId: string; readonly count: number }[];
  /** Files that did not parse. Counted, never silently dropped. */
  readonly unparsed: number;
}

export interface GroundingScore {
  readonly total: number;
  readonly grounded: number;
  readonly invented: number;
  /** A locator built from a variable, so nothing can be decided about it. */
  readonly undecidable: number;
  /** grounded / (grounded + invented). Undefined when there is nothing to judge. */
  readonly groundedRate: number | undefined;
  readonly inventedLocators: readonly string[];
}

export interface GeneratedFile {
  readonly path: string;
  readonly source: string;
}

export function scoreCompliance(
  files: readonly GeneratedFile[],
  constitution: Constitution,
  tags: TagSet,
): ComplianceScore {
  const result = analyze({
    // Paths come from the response, so directory-scoped rules apply as they would
    // in a real suite.
    files: files.map((file) => ({ path: file.path, text: file.source })),
    constitution,
    tags,
  });

  const counts = new Map<string, number>();
  for (const diagnostic of result.diagnostics) {
    counts.set(diagnostic.ruleId, (counts.get(diagnostic.ruleId) ?? 0) + 1);
  }

  return {
    files: files.length,
    violations: result.diagnostics.length,
    violationsPerFile: files.length === 0 ? 0 : result.diagnostics.length / files.length,
    byRule: [...counts.entries()]
      .map(([ruleId, count]) => ({ ruleId, count }))
      .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId)),
    unparsed: result.skipped.length,
  };
}

function knownFromKb(projectRoot: string): { names: Set<string>; testIds: Set<string> } {
  const names = new Set<string>();
  const testIds = new Set<string>();

  for (const { map } of readAllRouteMaps(projectRoot)) {
    for (const element of map.elements) {
      if (element.name !== undefined) names.add(normalise(element.name));
      if (element.testId !== undefined) testIds.add(normalise(element.testId));
    }
  }
  return { names, testIds };
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Matches on accessible name or test id rather than the exact expression:
 * generous on purpose, since a benchmark measuring its author should err against
 * itself.
 */
function isGrounded(use: LocatorUse, known: { names: Set<string>; testIds: Set<string> }): boolean {
  const candidates = [use.name, use.value].filter((v): v is string => v !== undefined);
  return candidates.some((candidate) => {
    const key = normalise(candidate);
    return key.length > 0 && (known.names.has(key) || known.testIds.has(key));
  });
}

export function scoreGrounding(
  files: readonly GeneratedFile[],
  projectRoot: string,
): GroundingScore {
  const known = knownFromKb(projectRoot);
  const uses = files.flatMap((file) => extractLocators(file.source));

  let grounded = 0;
  let invented = 0;
  let undecidable = 0;
  const inventedLocators: string[] = [];

  for (const use of uses) {
    // Counting these as invented would flatter the with-knowledge-base condition.
    if (use.value === undefined && use.name === undefined) {
      undecidable += 1;
      continue;
    }

    if (isGrounded(use, known)) {
      grounded += 1;
    } else {
      invented += 1;
      inventedLocators.push(use.locator);
    }
  }

  const judged = grounded + invented;
  return {
    total: uses.length,
    grounded,
    invented,
    undecidable,
    groundedRate: judged === 0 ? undefined : grounded / judged,
    inventedLocators,
  };
}

/**
 * The same judgement the checker makes, applied to what a model wrote. Unlike
 * `GroundingScore` it knows which route a test is on and whether the match is
 * unique, so "the right element on the right page" is what counts as valid.
 */
export interface LocatorScore {
  readonly total: number;
  /** Everything the knowledge base could rule on: `total` less `undecidable`. */
  readonly judged: number;
  readonly known: number;
  /** Nothing in the knowledge base matches: invented. */
  readonly unknown: number;
  /** Real, but on a page the test is not on. */
  readonly wrongRoute: number;
  /** More than one element matches, so Playwright would refuse it. */
  readonly ambiguous: number;
  readonly stale: number;
  readonly unverified: number;
  /** Not judged: a variable, a regular expression, getByText. Never counted as invented. */
  readonly undecidable: number;
  /** known / judged. Undefined when nothing could be judged. */
  readonly validRate: number | undefined;
  /** `unknown` and `wrong-route`, as written, so the failure can be read. */
  readonly invalidLocators: readonly string[];
}

export function scoreLocators(
  files: readonly GeneratedFile[],
  index: KnowledgeIndex,
  now?: Date,
): LocatorScore {
  const count = {
    known: 0,
    unknown: 0,
    'wrong-route': 0,
    ambiguous: 0,
    stale: 0,
    unverified: 0,
    undecidable: 0,
  };
  const invalid: string[] = [];
  let total = 0;

  for (const file of files) {
    for (const finding of analyzeLocators({
      filePath: file.path,
      source: file.source,
      index,
      ...(now === undefined ? {} : { now }),
    })) {
      total += 1;
      count[finding.verdict] += 1;
      if (finding.verdict === 'unknown' || finding.verdict === 'wrong-route') {
        invalid.push(
          `${finding.expression}${finding.verdict === 'wrong-route' ? ' (wrong route)' : ''}`,
        );
      }
    }
  }

  const judged = total - count.undecidable;
  return {
    total,
    judged,
    known: count.known,
    unknown: count.unknown,
    wrongRoute: count['wrong-route'],
    ambiguous: count.ambiguous,
    stale: count.stale,
    unverified: count.unverified,
    undecidable: count.undecidable,
    validRate: judged === 0 ? undefined : count.known / judged,
    invalidLocators: invalid,
  };
}
