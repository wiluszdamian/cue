import {
  ageInDays,
  freshnessOf,
  hashSnapshot,
  parseSnapshot,
  readAllRouteMaps,
  writeRouteMap,
  type Freshness,
  type LoadedRouteMap,
} from '@understudy/engine';
import type { SnapshotDriver } from './survey.js';

/**
 * `understudy verify-map` — does the map still match the application?
 *
 * A knowledge base decays silently: nothing breaks the day a selector is removed,
 * and the tests keep passing until somebody writes a new one from a stale entry.
 * This turns that silence into a CI failure.
 */

export type VerdictKind = 'unchanged' | 'drifted' | 'unreachable' | 'skipped';

export interface RouteVerdict {
  readonly route: string;
  readonly kind: VerdictKind;
  readonly freshness: Freshness;
  readonly ageDays: number;
  readonly detail?: string;
  /** Elements the map has that the live page no longer shows. */
  readonly missing: readonly string[];
}

export interface VerifyReport {
  readonly verdicts: readonly RouteVerdict[];
  readonly drifted: number;
  readonly unreachable: number;
  readonly stale: number;
}

export interface VerifyOptions {
  readonly projectRoot: string;
  readonly baseUrl?: string | undefined;
  readonly driver?: SnapshotDriver | undefined;
  /** Update `verifiedAt` on routes that came back unchanged. */
  readonly refresh?: boolean;
  readonly now?: Date;
}

function verifyRoute(loaded: LoadedRouteMap, options: VerifyOptions, now: Date): RouteVerdict {
  const { map } = loaded;
  const freshness = freshnessOf(map.verifiedAt, now);
  const ageDays = ageInDays(map.verifiedAt, now);
  const base = { route: map.route, freshness, ageDays, missing: [] as string[] };

  if (options.driver === undefined || options.baseUrl === undefined) {
    return { ...base, kind: 'skipped', detail: 'no environment URL given' };
  }

  const captured = options.driver.capture(`${options.baseUrl.replace(/\/$/, '')}${map.route}`);
  if (!captured.ok) {
    return { ...base, kind: 'unreachable', detail: captured.reason };
  }

  const parsed = parseSnapshot(captured.output);
  if (hashSnapshot(parsed.tree) === map.snapshotHash) {
    if (options.refresh === true) {
      writeRouteMap(options.projectRoot, { ...map, verifiedAt: now.toISOString() });
    }
    return {
      ...base,
      kind: 'unchanged',
      freshness: options.refresh === true ? 'fresh' : freshness,
    };
  }

  // A copy edit moves the hash; what matters is which recorded elements are gone.
  const live = new Set(parsed.elements.map((e) => `${e.role} ${e.name ?? ''}`));
  const missing = map.elements
    .filter((e) => !live.has(`${e.role} ${e.name ?? ''}`))
    .map((e) => e.locator);

  return {
    ...base,
    kind: 'drifted',
    missing,
    detail:
      missing.length > 0
        ? `${String(missing.length)} recorded element(s) are no longer on the page`
        : 'the page changed, but every recorded element is still present',
  };
}

export function verifyMap(options: VerifyOptions): VerifyReport {
  const now = options.now ?? new Date();
  const maps = readAllRouteMaps(options.projectRoot, now);
  const verdicts = maps.map((loaded) => verifyRoute(loaded, options, now));

  return {
    verdicts,
    drifted: verdicts.filter((v) => v.kind === 'drifted').length,
    unreachable: verdicts.filter((v) => v.kind === 'unreachable').length,
    stale: verdicts.filter((v) => v.freshness === 'stale').length,
  };
}

const MARK: Record<VerdictKind, string> = {
  unchanged: '  ok  ',
  drifted: 'drift ',
  unreachable: 'error ',
  skipped: '  ?   ',
};

export function formatVerifyReport(report: VerifyReport): string {
  if (report.verdicts.length === 0) {
    return '\nNothing to verify — the knowledge base has no surveyed routes.\nRun: understudy survey <url>';
  }

  const lines = [''];
  for (const verdict of report.verdicts) {
    lines.push(
      `[${MARK[verdict.kind]}] ${verdict.route}   ${verdict.freshness}, ${String(verdict.ageDays)}d old`,
    );
    if (verdict.detail) lines.push(`      ${verdict.detail}`);
    for (const locator of verdict.missing.slice(0, 5)) lines.push(`      gone: ${locator}`);
    if (verdict.missing.length > 5) {
      lines.push(`      …and ${String(verdict.missing.length - 5)} more`);
    }
  }

  lines.push('');
  if (report.drifted === 0 && report.unreachable === 0 && report.stale === 0) {
    lines.push('The map matches the application.');
  } else {
    lines.push(
      `${String(report.drifted)} drifted, ${String(report.unreachable)} unreachable, ${String(report.stale)} stale.`,
    );
    lines.push('Re-survey the affected routes: understudy survey <url>');
  }
  return lines.join('\n');
}

/** Drift and unreachable routes fail CI; staleness alone is a prompt, not a build break. */
export function verifyExitCode(report: VerifyReport): number {
  return report.drifted > 0 || report.unreachable > 0 ? 1 : 0;
}
