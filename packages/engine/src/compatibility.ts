import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * Which versions of other people's tools this project has been run against, and the
 * arithmetic to ask whether a version is among them. The data is `compatibility.yaml`;
 * this is the schema, the range check, and the two comparisons built on it (what is
 * installed here, what is current upstream).
 *
 * Ranges are deliberately a small language: space-separated comparators, `||` between
 * alternatives. A range this cannot read is a mistake in the file, caught on load,
 * never a version quietly judged compatible.
 */

export const COMPATIBILITY_SCHEMA_VERSION = 1;

const VERSION = /^\d+\.\d+\.\d+$/;
const COMPARATOR = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/;

/** `1.2.3`, with no pre-release or build part: those are not judged, see `satisfies`. */
function parseVersion(version: string): [number, number, number] | undefined {
  if (!VERSION.test(version)) return undefined;
  const [major, minor, patch] = version.split('.').map(Number);
  return major === undefined || minor === undefined || patch === undefined
    ? undefined
    : [major, minor, patch];
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === undefined || right === undefined) {
    throw new Error(`cannot compare "${a}" with "${b}": both must be major.minor.patch`);
  }
  for (let i = 0; i < 3; i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

/** Whether a range is one `satisfies` can evaluate. */
export function isReadableRange(range: string): boolean {
  const alternatives = range.split('||').map((part) => part.trim());
  return alternatives.every((alternative) => {
    const comparators = alternative.split(/\s+/).filter((token) => token !== '');
    return comparators.length > 0 && comparators.every((token) => COMPARATOR.test(token));
  });
}

/**
 * Whether `version` is inside `range`. A pre-release (`0.2.0-beta.1`) is never inside:
 * it is a version nobody tested, and the honest answer to "does it work" is not yes.
 */
export function satisfies(version: string, range: string): boolean {
  if (parseVersion(version) === undefined) return false;
  if (!isReadableRange(range)) throw new Error(`cannot read the range "${range}"`);

  return range.split('||').some((alternative) =>
    alternative
      .trim()
      .split(/\s+/)
      .every((token) => {
        const match = COMPARATOR.exec(token);
        const operator = match?.[1] ?? '=';
        const bound = match?.[2] ?? '';
        const order = compareVersions(version, bound);
        switch (operator) {
          case '>=':
            return order >= 0;
          case '>':
            return order > 0;
          case '<=':
            return order <= 0;
          case '<':
            return order < 0;
          default:
            return order === 0;
        }
      }),
  );
}

export const ToolCompatibilitySchema = z
  .strictObject({
    range: z.string().min(1),
    tested: z.string().regex(VERSION, 'tested must be major.minor.patch'),
    role: z.string().min(1),
    snapshotFormats: z.array(z.string().min(1)).optional(),
  })
  .refine((tool) => isReadableRange(tool.range), {
    message: 'range must be comparators such as ">=0.1.22 <0.2.0", joined by "||" for alternatives',
    path: ['range'],
  })
  .refine((tool) => !isReadableRange(tool.range) || satisfies(tool.tested, tool.range), {
    message: 'the tested version must be inside its own range',
    path: ['tested'],
  });

export const CompatibilitySchema = z.strictObject({
  schemaVersion: z.literal(COMPATIBILITY_SCHEMA_VERSION),
  node: z.string().min(1),
  tools: z.record(z.string().min(1), ToolCompatibilitySchema),
});

export type ToolCompatibility = z.infer<typeof ToolCompatibilitySchema>;
export type Compatibility = z.infer<typeof CompatibilitySchema>;

export function parseCompatibility(text: string): Compatibility {
  return CompatibilitySchema.parse(parse(text));
}

export function loadCompatibility(path: string): Compatibility {
  return parseCompatibility(readFileSync(path, 'utf8'));
}

// ------------------------------------------------------------- comparisons

export type VersionVerdict = 'inside' | 'outside' | 'not-judged';

export interface VersionFinding {
  readonly tool: string;
  readonly version: string;
  readonly verdict: VersionVerdict;
  readonly range: string;
  readonly tested: string;
}

/** Each named tool against its range; a tool the file does not list is not this file's business. */
export function judgeVersions(
  compatibility: Compatibility,
  versions: Readonly<Record<string, string>>,
): VersionFinding[] {
  const findings: VersionFinding[] = [];
  for (const [tool, version] of Object.entries(versions)) {
    const entry = compatibility.tools[tool];
    if (entry === undefined) continue;
    const readable = /^\d+\.\d+\.\d+$/.test(version);
    findings.push({
      tool,
      version,
      range: entry.range,
      tested: entry.tested,
      verdict: !readable ? 'not-judged' : satisfies(version, entry.range) ? 'inside' : 'outside',
    });
  }
  return findings;
}

/**
 * What to tell somebody when the newest upstream release is outside what was tested.
 * One paragraph per tool, each saying what moved and what to do about it.
 */
export function describeUpstreamDrift(findings: readonly VersionFinding[]): string[] {
  return findings
    .filter((finding) => finding.verdict !== 'inside')
    .map((finding) =>
      finding.verdict === 'not-judged'
        ? `${finding.tool}: the newest release is "${finding.version}", which is not a plain version, so it was not compared against ${finding.range}.`
        : `${finding.tool} ${finding.version} is outside the tested range ${finding.range} (last tested: ${finding.tested}). Run the suite against it, then widen the range and the tested version in compatibility.yaml, or hold the range and say why.`,
    );
}
