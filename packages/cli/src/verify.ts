import {
  affectedBy,
  ageInDays,
  dependencyChanges,
  freshnessOf,
  hashSnapshot,
  locatorId,
  parseRawSnapshot,
  readAllRouteMapsWithErrors,
  recordLiveCheck,
  SURVEY_STALE_COMMAND,
  surveyCommand,
  UnsupportedSnapshotFormatError,
  writeRouteMap,
  type FileStateProvider,
  type Freshness,
  type InvalidRouteMap,
  type LoadedRouteMap,
  type ParsedSnapshot,
} from '@understudy/engine';
import type { SnapshotDriver } from './survey.js';

/**
 * `understudy verify` — what do we actually know about the map's accuracy?
 *
 * A knowledge base decays silently: nothing breaks the day a selector is removed,
 * and the tests keep passing until somebody writes a new one from a stale entry.
 * Three different things get called "verified" and they must not be mistaken for
 * one another:
 *
 *   - the files are readable (schema),
 *   - the entries are recent (freshness: age, and whether the code they were read
 *     from has changed since),
 *   - the application still shows what they say (live verification).
 *
 * Only the last one licenses the sentence "the map matches the application", and
 * it needs an environment to look at. Without one, the honest verdict is that
 * nothing was verified.
 */

export type LiveOutcome = 'unchanged' | 'drifted' | 'unreachable' | 'not-checked';

export interface RouteVerification {
  readonly route: string;
  /** From the entry's age. Says nothing about the application. */
  readonly freshness: Freshness;
  readonly ageDays: number;
  /**
   * Files the route's elements were read from that have changed or gone since, one
   * sentence each. Empty when nothing changed, and also when there was nothing to
   * compare them with: see `notes` on the report.
   */
  readonly changes: readonly string[];
  /** From looking at the running application in this run. */
  readonly live: LiveOutcome;
  readonly detail?: string;
  /** Elements the map has that the live page no longer shows. */
  readonly missing: readonly string[];
}

export type Overall = 'PASS' | 'PARTIAL' | 'FAIL' | 'NOT_VERIFIED' | 'EMPTY';

export interface VerifyCounts {
  readonly total: number;
  readonly liveChecked: number;
  readonly liveSkipped: number;
  readonly drifted: number;
  readonly unreachable: number;
  readonly fresh: number;
  readonly ageing: number;
  /** Stale by age and not re-confirmed by a live check in this run. */
  readonly stale: number;
  /** Depend on code that changed since they were confirmed, and not re-confirmed in this run. */
  readonly possiblyStale: number;
  readonly invalid: number;
}

export interface VerifyReport {
  readonly routes: readonly RouteVerification[];
  readonly invalidFiles: readonly InvalidRouteMap[];
  readonly counts: VerifyCounts;
  readonly overall: Overall;
  /** Things the reader needs to know to read the rest, e.g. that source files were not compared. */
  readonly notes: readonly string[];
  /** Present when the routes to check were chosen by what changed. */
  readonly selection?: { readonly changedFiles: number; readonly routes: readonly string[] };
}

export interface VerifyOptions {
  readonly projectRoot: string;
  readonly baseUrl?: string | undefined;
  readonly driver?: SnapshotDriver | undefined;
  /** Record `verifiedAt` on routes that a live check found unchanged. */
  readonly refresh?: boolean;
  /** A name such as `staging`, recorded with what a `--refresh` learns. */
  readonly environment?: string | undefined;
  /** Check only these routes. The rest are reported as not checked, which makes the run PARTIAL. */
  readonly only?: readonly string[] | undefined;
  /** The product's files as they are now, to see whether what an element was read from changed. */
  readonly files?: FileStateProvider | undefined;
  /**
   * Files that changed (from `git diff`). When given, only the routes whose elements
   * depend on one of them are checked, and the rest are reported as not checked.
   */
  readonly changedPaths?: readonly string[] | undefined;
  readonly now?: Date;
}

/**
 * The verdict, as a pure function of the counts. In this order, and the order is
 * the policy: breakage outranks everything, and no live check outranks partial.
 */
export function computeOverall(counts: VerifyCounts): Overall {
  if (counts.total === 0 && counts.invalid === 0) return 'EMPTY';
  if (counts.invalid > 0 || counts.drifted > 0 || counts.unreachable > 0) return 'FAIL';
  if (counts.liveChecked === 0) return 'NOT_VERIFIED';
  if (counts.liveSkipped > 0 || counts.stale > 0 || counts.possiblyStale > 0) return 'PARTIAL';
  return 'PASS';
}

/** What changed in the files this route's elements were read from, without saying the same thing twice. */
function changesFor(loaded: LoadedRouteMap, files: FileStateProvider | undefined): string[] {
  const { map } = loaded;
  return [
    ...new Set(
      map.elements.flatMap((element) =>
        dependencyChanges(
          { verifiedAt: element.verifiedAt ?? map.verifiedAt, dependencies: element.dependencies },
          files,
        ),
      ),
    ),
  ];
}

function verifyRoute(
  loaded: LoadedRouteMap,
  options: VerifyOptions,
  now: Date,
  skip: string | undefined,
): RouteVerification {
  const { map } = loaded;
  const freshness = freshnessOf(map.verifiedAt, now);
  const ageDays = ageInDays(map.verifiedAt, now);
  const base = {
    route: map.route,
    freshness,
    ageDays,
    changes: changesFor(loaded, options.files),
    missing: [] as string[],
  };

  if (skip !== undefined) return { ...base, live: 'not-checked', detail: skip };
  if (options.driver === undefined || options.baseUrl === undefined) {
    return { ...base, live: 'not-checked', detail: 'no environment URL given' };
  }

  const captured = options.driver.capture(`${options.baseUrl.replace(/\/$/, '')}${map.route}`);
  if (!captured.ok) {
    return { ...base, live: 'unreachable', detail: captured.reason };
  }

  let parsed: ParsedSnapshot;
  try {
    parsed = parseRawSnapshot({
      text: captured.output,
      capturedAt: now.toISOString(),
      ...(captured.cliVersion === undefined ? {} : { cliVersion: captured.cliVersion }),
    });
  } catch (error) {
    // An unreadable answer is not a matching one, and not a crash either.
    if (error instanceof UnsupportedSnapshotFormatError) {
      return { ...base, live: 'unreachable', detail: error.message };
    }
    throw error;
  }

  const snapshotHash = hashSnapshot(parsed.tree);
  const tool = {
    name: 'playwright-cli',
    ...(captured.cliVersion === undefined ? {} : { version: captured.cliVersion }),
    format: parsed.format,
  };
  const record = (missingIds: ReadonlySet<string>): void =>
    void writeRouteMap(
      options.projectRoot,
      recordLiveCheck(map, {
        at: now,
        snapshotHash,
        missing: missingIds,
        environment: options.environment,
        tool,
      }),
    );

  if (snapshotHash === map.snapshotHash) {
    // What the check found is written down only when asked: verifying does not edit files.
    if (options.refresh === true) record(new Set());
    return {
      ...base,
      live: 'unchanged',
      ...(options.refresh === true ? { freshness: 'fresh' } : {}),
    };
  }

  // A copy edit moves the hash; what matters is which recorded elements are gone.
  const live = new Set(parsed.elements.map((e) => `${e.role} ${e.name ?? ''}`));
  const gone = map.elements.filter((e) => !live.has(`${e.role} ${e.name ?? ''}`));
  const missing = gone.map((e) => e.locator);

  // A lost element is kept and marked stale, not removed: "this used to be here" is knowledge.
  if (options.refresh === true && gone.length > 0) {
    record(new Set(gone.map((e) => e.id ?? locatorId(map.route, e.role, e.name))));
  }

  return {
    ...base,
    live: 'drifted',
    missing,
    detail:
      missing.length > 0
        ? `${String(missing.length)} recorded element(s) are no longer on the page`
        : 'the page changed, but every recorded element is still present',
  };
}

export function verify(options: VerifyOptions): VerifyReport {
  const now = options.now ?? new Date();
  const { maps, invalid } = readAllRouteMapsWithErrors(options.projectRoot, now);

  // Why a route is not looked at, when it is not: chosen by name, or by what changed.
  const reached =
    options.changedPaths === undefined
      ? undefined
      : new Set(
          maps
            .filter(
              (loaded) => affectedBy(loaded.map.elements, options.changedPaths ?? []).length > 0,
            )
            .map((loaded) => loaded.map.route),
        );
  const skipReason = (route: string): string | undefined => {
    if (options.only !== undefined && !options.only.includes(route))
      return 'not selected with --route';
    if (reached !== undefined && !reached.has(route)) {
      return 'no changed file is one it was read from';
    }
    return undefined;
  };

  const routes = maps.map((loaded) =>
    verifyRoute(loaded, options, now, skipReason(loaded.map.route)),
  );

  const count = (test: (route: RouteVerification) => boolean): number => routes.filter(test).length;
  // A route the application just confirmed is not stale, whatever its stored age or what changed.
  const confirmedNow = (route: RouteVerification): boolean => route.live === 'unchanged';

  const counts: VerifyCounts = {
    total: routes.length,
    liveChecked: count((r) => r.live === 'unchanged' || r.live === 'drifted'),
    liveSkipped: count((r) => r.live === 'not-checked'),
    drifted: count((r) => r.live === 'drifted'),
    unreachable: count((r) => r.live === 'unreachable'),
    fresh: count((r) => r.freshness === 'fresh'),
    ageing: count((r) => r.freshness === 'ageing'),
    stale: count((r) => r.freshness === 'stale' && !confirmedNow(r)),
    possiblyStale: count((r) => r.changes.length > 0 && !confirmedNow(r)),
    invalid: invalid.length,
  };

  const notes: string[] = [];
  const dependsOnSource = maps.some((loaded) =>
    loaded.map.elements.some((element) => (element.dependencies?.files.length ?? 0) > 0),
  );
  if (options.files === undefined && dependsOnSource) {
    notes.push(
      'The product source was not found, so whether the code behind the map has changed was not checked. ' +
        'Pass --source <path> to the product.',
    );
  }

  return {
    routes,
    invalidFiles: invalid,
    counts,
    overall: computeOverall(counts),
    notes,
    ...(reached === undefined
      ? {}
      : {
          selection: {
            changedFiles: options.changedPaths?.length ?? 0,
            routes: [...reached],
          },
        }),
  };
}

const MARK: Record<LiveOutcome, string> = {
  unchanged: '  ok  ',
  drifted: 'drift ',
  unreachable: 'error ',
  'not-checked': '  ?   ',
};

const LIVE_WORDS: Record<LiveOutcome, string> = {
  unchanged: 'matches the application',
  drifted: 'differs from the application',
  unreachable: 'could not be checked',
  'not-checked': 'not checked against the application',
};

function resultLines(report: VerifyReport): string[] {
  const { counts } = report;
  // The routes that need another look, so the advice can name them.
  const drifted = report.routes
    .filter((route) => route.live === 'drifted' || route.live === 'unreachable')
    .map((route) => route.route);
  switch (report.overall) {
    case 'PASS':
      return ['PASS — every route was checked against the running application and still matches.'];
    case 'PARTIAL':
      return [
        `PARTIAL — ${String(counts.liveChecked)} of ${String(counts.total)} route(s) were checked against the application and match.`,
        counts.liveSkipped > 0
          ? `${String(counts.liveSkipped)} route(s) were not checked; nothing is claimed about them.`
          : '',
        counts.stale > 0
          ? `${String(counts.stale)} route(s) are stale. Re-survey them: ${SURVEY_STALE_COMMAND}`
          : '',
        counts.possiblyStale > 0
          ? `${String(counts.possiblyStale)} route(s) were read from code that has changed since. Re-survey them: ${SURVEY_STALE_COMMAND}`
          : '',
      ].filter((line) => line.length > 0);
    case 'NOT_VERIFIED':
      return [
        'NOT VERIFIED — the application was not checked, so this says nothing about whether the map matches it.',
        'Re-run with --base-url <url> to check it.',
      ];
    case 'FAIL':
      return [
        `FAIL — ${String(counts.drifted)} drifted, ${String(counts.unreachable)} unreachable, ${String(counts.invalid)} unreadable file(s).`,
        `Re-survey what drifted: ${drifted.length > 0 ? surveyCommand(drifted.join(',')) : SURVEY_STALE_COMMAND}`,
      ];
    case 'EMPTY':
      return [
        'Nothing to verify — the knowledge base has no surveyed routes.',
        'Run: understudy survey <url>',
      ];
  }
}

export function formatVerifyReport(report: VerifyReport): string {
  const { counts } = report;
  const lines = ['', 'Understudy verify', ''];

  if (report.overall !== 'EMPTY') {
    lines.push(
      'Knowledge',
      `  ${String(counts.total)} route(s)${counts.invalid > 0 ? `, ${String(counts.invalid)} unreadable file(s)` : ''}`,
      '',
      'Freshness (from age, and from the code it was read from — says nothing about the application)',
      `  fresh ${String(counts.fresh)} · ageing ${String(counts.ageing)} · stale ${String(counts.stale)} · possibly stale ${String(counts.possiblyStale)}`,
      '',
      'Live verification',
      counts.liveChecked + counts.unreachable + counts.liveSkipped === 0
        ? '  none'
        : `  checked ${String(counts.liveChecked)}/${String(counts.total)} · skipped ${String(counts.liveSkipped)} · unreachable ${String(counts.unreachable)} · drifted ${String(counts.drifted)}`,
      '',
    );
  }

  for (const note of report.notes) lines.push(`! ${note}`);
  if (report.selection !== undefined) {
    lines.push(
      `${String(report.selection.changedFiles)} changed file(s) reach ${String(report.selection.routes.length)} route(s)` +
        (report.selection.routes.length > 0
          ? `: ${report.selection.routes.join(', ')}`
          : ' — nothing surveyed depends on them, so nothing was checked'),
      '',
    );
  }
  for (const invalid of report.invalidFiles) {
    lines.push(`[invalid] ${invalid.path}`, `      ${invalid.reason}`);
  }
  for (const route of report.routes) {
    lines.push(
      `[${MARK[route.live]}] ${route.route}   ${LIVE_WORDS[route.live]}; ${route.freshness}, ${String(route.ageDays)}d old`,
    );
    if (route.detail && route.live !== 'not-checked') lines.push(`      ${route.detail}`);
    for (const change of route.changes.slice(0, 3)) lines.push(`      possibly stale: ${change}`);
    if (route.changes.length > 3) lines.push(`      …and ${String(route.changes.length - 3)} more`);
    for (const locator of route.missing.slice(0, 5)) lines.push(`      gone: ${locator}`);
    if (route.missing.length > 5) {
      lines.push(`      …and ${String(route.missing.length - 5)} more`);
    }
  }

  lines.push('', 'Result', ...resultLines(report).map((line) => `  ${line}`));
  return lines.join('\n');
}

/**
 * - `advisory` fails only on breakage: drift, an unreachable route, an unreadable file.
 * - `strict` also fails on anything short of a full live pass — not verified,
 *   partial, or nothing to verify — because a green build should not mean
 *   "nobody looked".
 */
export type CiMode = 'advisory' | 'strict';

export function verifyExitCode(report: VerifyReport, mode: CiMode): number {
  if (report.overall === 'FAIL') return 1;
  if (mode === 'strict' && report.overall !== 'PASS') return 1;
  return 0;
}
