import { readRouteMap, type SurveyTarget } from '@wiluszdamian/cue-engine';
import { survey, type SnapshotDriver } from './survey.js';

/**
 * Surveying a chosen set of pages: shown first as a plan, then done one at a time,
 * each page's failure kept apart from the others so one broken page does not cost
 * the rest.
 */

export type TargetOutcome = 'updated' | 'unchanged' | 'failed' | 'skipped';

export interface TargetResult {
  readonly route: string;
  readonly outcome: TargetOutcome;
  readonly detail?: string;
}

export interface SurveyTargetsOptions {
  readonly projectRoot: string;
  /** Where the environment is. Used to open pages; never written to `.agent-kb`. */
  readonly baseUrl: string;
  readonly driver: SnapshotDriver;
  readonly targets: readonly SurveyTarget[];
  readonly environment?: string | undefined;
  readonly now?: Date;
}

/** An address, or the reason it is not one. */
export function parseBaseUrl(
  value: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, reason: `"${value}" is not an http or https address` };
    }
    return { ok: true, url: value.replace(/\/+$/, '') };
  } catch {
    return { ok: false, reason: `"${value}" is not an address` };
  }
}

export function surveyTargets(options: SurveyTargetsOptions): TargetResult[] {
  return options.targets.map((target): TargetResult => {
    if (target.skip !== undefined) {
      return { route: target.route, outcome: 'skipped', detail: target.skip };
    }

    const before = readRouteMap(options.projectRoot, target.route)?.map.snapshotHash;
    try {
      const result = survey({
        projectRoot: options.projectRoot,
        url: `${options.baseUrl}${target.route}`,
        driver: options.driver,
        ...(options.environment === undefined ? {} : { environment: options.environment }),
        ...(options.now === undefined ? {} : { now: options.now }),
      });
      // The page it landed on is the one recorded: a redirect to /login is not /admin.
      if (result.route !== target.route) {
        return {
          route: target.route,
          outcome: 'updated',
          detail: `the application sent it to ${result.route}, which is what was recorded`,
        };
      }
      return {
        route: target.route,
        outcome: before === result.map.snapshotHash ? 'unchanged' : 'updated',
      };
    } catch (error) {
      return {
        route: target.route,
        outcome: 'failed',
        detail: (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? 'failed',
      };
    }
  });
}

export function formatPlan(targets: readonly SurveyTarget[], baseUrl: string): string {
  const lines = ['', `Survey plan: ${String(targets.length)} route(s) against ${baseUrl}`, ''];
  const width = Math.max(...targets.map((target) => target.route.length), 0);
  for (const target of targets) {
    const [first = '', ...more] =
      target.skip === undefined ? target.reasons : [`skipped — ${target.skip}`];
    lines.push(`  ${target.route.padEnd(width)}  ${first}`);
    for (const reason of more) lines.push(`  ${' '.repeat(width)}  ${reason}`);
  }
  return lines.join('\n');
}

const MARK: Record<TargetOutcome, string> = {
  updated: 'updated  ',
  unchanged: 'unchanged',
  failed: 'FAILED   ',
  skipped: 'skipped  ',
};

export function formatResults(results: readonly TargetResult[]): string {
  const lines = [''];
  for (const result of results) {
    lines.push(
      `  ${MARK[result.outcome]} ${result.route}${result.detail ? ` — ${result.detail}` : ''}`,
    );
  }
  const count = (outcome: TargetOutcome): number =>
    results.filter((r) => r.outcome === outcome).length;
  lines.push(
    '',
    `${String(count('updated'))} updated, ${String(count('unchanged'))} unchanged, ` +
      `${String(count('failed'))} failed, ${String(count('skipped'))} skipped.`,
  );
  return lines.join('\n');
}

/** Failed pages fail the run; skipped ones are a choice, reported but not an error. */
export function targetsExitCode(results: readonly TargetResult[]): number {
  return results.some((result) => result.outcome === 'failed') ? 1 : 0;
}
