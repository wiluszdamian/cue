import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
  analyzeLocators,
  docsUrlFor,
  findingToDiagnostic,
  getReporter,
  indexKnowledge,
  loadKnowledge,
  REPORTED_VERDICTS,
  scopeMatcher,
  sortDiagnostics,
  type Constitution,
  type Diagnostic,
  type LoadIssue,
  type LocatorFinding,
  type LocatorVerdict,
} from '@understudy/engine';

/**
 * `understudy check` — do the locators in these tests name things the knowledge
 * base knows? The same question the lint rule asks, answered by the same
 * analyzer, for a person or an agent that has just written a test.
 */

export const CHECK_FORMATS = ['human', 'agent', 'json', 'sarif', 'github'] as const;
export type CheckFormat = (typeof CHECK_FORMATS)[number];
export type CheckMode = 'advisory' | 'strict';

export interface CheckedFile {
  readonly path: string;
  readonly findings: readonly LocatorFinding[];
}

export interface CheckReport {
  readonly files: readonly CheckedFile[];
  readonly counts: Readonly<Record<LocatorVerdict, number>> & { readonly total: number };
  /** Nothing in `.agent-kb` to check against: every verdict would be "unknown". */
  readonly nothingKnown: boolean;
  readonly knowledgeIssues: readonly LoadIssue[];
  /** Why no files were looked at, when none were. */
  readonly noFilesReason?: string;
}

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.agent-kb',
  '.next',
]);
const SOURCE = /\.(ts|tsx|mts|cts)$/;
const TEST_NAME = /\.(spec|test)\.(ts|tsx|mts|cts)$/;
const ANNOTATION = 'understudy-route:';

function walk(root: string, dir: string, found: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(root, join(dir, entry.name), found);
    } else if (entry.isFile() && SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      found.push(relative(root, join(dir, entry.name)).split(sep).join('/'));
    }
  }
}

/**
 * With no arguments: test files, and any file that says which route it is on (a
 * page object). With arguments: a file, a directory (everything TypeScript in it),
 * or a glob such as `tests/**\/*.spec.ts`.
 */
export function discoverFiles(root: string, targets: readonly string[]): string[] {
  const all: string[] = [];
  walk(root, root, all);

  if (targets.length === 0) {
    return all.filter(
      (path) => TEST_NAME.test(path) || readFileSync(join(root, path), 'utf8').includes(ANNOTATION),
    );
  }

  const chosen = new Set<string>();
  for (const target of targets) {
    const absolute = resolve(root, target);
    let kind: 'file' | 'dir' | 'glob' = 'glob';
    try {
      kind = statSync(absolute).isDirectory() ? 'dir' : 'file';
    } catch {
      // Not a path that exists, so it is a pattern.
    }

    const relativePath = relative(root, absolute).split(sep).join('/');
    if (kind === 'file') {
      chosen.add(relativePath);
    } else if (kind === 'dir') {
      const prefix = relativePath === '' ? '' : `${relativePath}/`;
      for (const path of all) if (path.startsWith(prefix)) chosen.add(path);
    } else {
      const matches = scopeMatcher({ scope: [target.split(sep).join('/')], exclude: [] });
      for (const path of all) if (matches(path)) chosen.add(path);
    }
  }
  return [...chosen].sort();
}

export interface CheckOptions {
  readonly projectRoot: string;
  readonly targets: readonly string[];
  readonly now?: Date;
}

const VERDICTS: readonly LocatorVerdict[] = [
  'known',
  'ambiguous',
  'unknown',
  'wrong-route',
  'stale',
  'unverified',
  'undecidable',
];

export function check(options: CheckOptions): CheckReport {
  const { kb, issues } = loadKnowledge(options.projectRoot, options.now);
  const index = indexKnowledge(kb);
  const nothingKnown = index.allLocators().length === 0 && index.routes().length === 0;

  const paths = discoverFiles(options.projectRoot, options.targets);
  const files = paths.map((path) => ({
    path,
    findings: analyzeLocators({
      filePath: path,
      source: readFileSync(join(options.projectRoot, path), 'utf8'),
      index,
      ...(options.now === undefined ? {} : { now: options.now }),
    }),
  }));

  const counts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0])) as Record<
    LocatorVerdict,
    number
  >;
  let total = 0;
  for (const file of files) {
    for (const finding of file.findings) {
      counts[finding.verdict] += 1;
      total += 1;
    }
  }

  return {
    files,
    counts: { ...counts, total },
    nothingKnown,
    knowledgeIssues: issues.filter((issue) => issue.severity === 'error'),
    ...(paths.length === 0
      ? {
          noFilesReason:
            options.targets.length === 0
              ? 'No test files found (*.spec.ts, *.test.ts, or a file with an understudy-route comment).'
              : `Nothing matched ${options.targets.join(', ')}.`,
        }
      : {}),
  };
}

// ----------------------------------------------------------------- exit codes

/**
 * - `advisory`: fails only on what breaks at runtime — an invented locator, or a
 *   real one on the wrong page. With nothing known there is nothing to fail on.
 * - `strict`: fails on every finding, and also when nothing could be checked (no
 *   files, or an empty knowledge base): a green build should not mean "nobody looked".
 */
export function locatorCheckExitCode(report: CheckReport, mode: CheckMode): number {
  if (mode === 'strict') {
    if (report.noFilesReason !== undefined || report.nothingKnown) return 1;
    return [...REPORTED_VERDICTS].some((verdict) => report.counts[verdict] > 0) ? 1 : 0;
  }
  if (report.nothingKnown) return 0;
  return report.counts.unknown > 0 || report.counts['wrong-route'] > 0 ? 1 : 0;
}

// -------------------------------------------------------------------- output

export function summaryLine(report: CheckReport): string {
  const { counts } = report;
  const parts = [
    `${String(counts.known)} known`,
    ...(['unknown', 'wrong-route', 'ambiguous', 'stale', 'unverified'] as const)
      .filter((verdict) => counts[verdict] > 0)
      .map((verdict) => `${String(counts[verdict])} ${verdict}`),
    `${String(counts.undecidable)} undecidable (not judged)`,
  ];
  return `${String(counts.total)} locator(s): ${parts.join(', ')}`;
}

const HEADLINE: Record<LocatorVerdict, string> = {
  unknown: 'Unknown locator',
  'wrong-route': 'Locator on the wrong route',
  ambiguous: 'Ambiguous locator',
  stale: 'Stale knowledge',
  unverified: 'Unverified knowledge',
  known: 'Known locator',
  undecidable: 'Not judged',
};

const MAX_NOT_JUDGED = 10;

function ago(verifiedAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(verifiedAt)) / 86_400_000);
  if (Number.isNaN(days)) return 'at an unknown time';
  return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${String(days)} days ago`;
}

export function formatHuman(report: CheckReport, now: Date = new Date()): string {
  const lines: string[] = [''];

  for (const issue of report.knowledgeIssues) {
    lines.push(`! ${issue.path} could not be read: ${issue.message}`);
  }
  if (report.knowledgeIssues.length > 0) {
    lines.push('  What it held is missing below, so some "unknown" findings may be this.', '');
  }

  if (report.noFilesReason !== undefined) {
    return [...lines, report.noFilesReason].join('\n');
  }

  if (report.nothingKnown) {
    lines.push(
      'Nothing is known about this application yet, so no locator can be checked.',
      'Run: understudy extract --source <path>   (what the product source declares)',
      'Run: understudy survey <url>              (what is on the page)',
      '',
      summaryLine(report),
    );
    return lines.join('\n');
  }

  let reported = 0;
  for (const file of report.files) {
    for (const finding of file.findings) {
      if (!REPORTED_VERDICTS.has(finding.verdict)) continue;
      reported += 1;
      lines.push(`${file.path}:${String(finding.line)}:${String(finding.column)}`);
      lines.push(`  ${HEADLINE[finding.verdict]}: ${finding.expression}`);
      if (finding.routeContext !== undefined) lines.push(`  Route: ${finding.routeContext}`);
      if (finding.match !== undefined) {
        lines.push(`  Matches: ${finding.match.expression} on ${finding.match.route}`);
        if (finding.match.verifiedAt !== undefined) {
          lines.push(`  Verified: ${ago(finding.match.verifiedAt, now)}`);
        }
      }
      if (finding.verdict === 'unknown' && finding.nearest.length > 0) {
        lines.push('  Nearest known:');
        for (const near of finding.nearest) lines.push(`    ${near.expression}  (${near.route})`);
      }
      lines.push(`  ${finding.suggestion}`, '');
    }
  }
  if (reported === 0) lines.push('Every locator that can be judged is known.', '');

  const notJudged = report.files.flatMap((file) =>
    file.findings
      .filter((finding) => finding.verdict === 'undecidable')
      .map((finding) => ({ file: file.path, finding })),
  );
  if (notJudged.length > 0) {
    lines.push('Not judged (the code alone cannot say):');
    for (const { file, finding } of notJudged.slice(0, MAX_NOT_JUDGED)) {
      lines.push(
        `  ${file}:${String(finding.line)}  ${finding.expression} — ${finding.note ?? ''}`,
      );
    }
    if (notJudged.length > MAX_NOT_JUDGED) {
      lines.push(`  …and ${String(notJudged.length - MAX_NOT_JUDGED)} more`);
    }
    lines.push('');
  }

  lines.push(summaryLine(report));
  return lines.join('\n');
}

export function toDiagnostics(report: CheckReport, constitution: Constitution): Diagnostic[] {
  const rule = constitution.rules.find((candidate) => candidate.id === 'selectors-from-agent-kb');
  const docsUrl = rule === undefined ? '' : docsUrlFor(rule);
  return sortDiagnostics(
    report.files.flatMap((file) =>
      file.findings.flatMap((finding) => {
        const diagnostic = findingToDiagnostic(finding, file.path, docsUrl);
        return diagnostic === undefined ? [] : [diagnostic];
      }),
    ),
  );
}

export function formatCheck(
  report: CheckReport,
  format: CheckFormat,
  constitution: Constitution,
  root: string,
): string {
  switch (format) {
    case 'human':
    case 'agent':
      // Written to be read by a model already: what is wrong, the nearest real
      // locator, and the command that fixes it.
      return formatHuman(report);
    case 'json':
      return JSON.stringify(report, null, 2);
    case 'sarif':
    case 'github':
      return getReporter(format)({
        result: {
          diagnostics: toDiagnostics(report, constitution),
          skipped: [],
          notChecked: [],
          filesAnalyzed: report.files.length,
          durationMs: 0,
        },
        constitution,
        root,
      });
  }
}
