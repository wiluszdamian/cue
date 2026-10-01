import { existsSync, readFileSync } from 'node:fs';
import {
  correlate,
  describeRedactions,
  hashSnapshot,
  parseSnapshot,
  readTestIds,
  routeFromUrl,
  writeRouteMap,
  type ParsedSnapshot,
  type RouteMap,
  type WriteResult,
} from '@understudy/engine';
import { nodeRunner, type ProcessRunner } from './browser/process.js';
import { NOT_FOUND_ADVICE, resolvePlaywrightCli, type ResolvedCommand } from './browser/resolve.js';

/**
 * `understudy survey <url>` — map the running application into `.agent-kb`.
 *
 * Exploration goes through `playwright-cli`, not MCP: an accessibility tree
 * through MCP costs more context than the task it serves. It sits behind a
 * one-method interface, so everything downstream is testable without a browser.
 */

export interface SnapshotDriver {
  capture(url: string): { ok: true; output: string } | { ok: false; reason: string };
}

/** From `@playwright/cli`. The bare `playwright-cli` on npm is a deprecated different thing. */
export class PlaywrightCliDriver implements SnapshotDriver {
  constructor(
    private readonly command: ResolvedCommand,
    private readonly runner: ProcessRunner = nodeRunner,
  ) {}

  capture(url: string): { ok: true; output: string } | { ok: false; reason: string } {
    // `open <url>`, not `goto`: goto fails with "the browser is not open" on a
    // cold run, which is every run here. open navigates too, and is idempotent.
    const opened = this.run(['open', url]);
    if (!opened.ok) return opened;

    const snapshot = this.run(['snapshot']);
    // Best effort: a browser left running is untidy, not a failure.
    this.run(['close']);
    return snapshot;
  }

  private run(
    args: readonly string[],
  ): { ok: true; output: string } | { ok: false; reason: string } {
    // The URL is one element of an array, never part of a command line.
    const result = this.runner.run(this.command.executable, [...this.command.prefixArgs, ...args]);

    if (result.error !== undefined) return { ok: false, reason: result.error };
    if (!result.ok) {
      return {
        ok: false,
        reason: (result.stderr || result.stdout || 'playwright-cli exited non-zero').trim(),
      };
    }
    return { ok: true, output: result.stdout };
  }
}

/** Resolves `playwright-cli` for a project, or fails with the way to install it. */
export function createPlaywrightCliDriver(
  projectRoot: string,
  explicit?: string,
  runner: ProcessRunner = nodeRunner,
): PlaywrightCliDriver {
  const command = resolvePlaywrightCli(projectRoot, explicit);
  if (command === undefined) throw new SurveyError(NOT_FOUND_ADVICE);
  return new PlaywrightCliDriver(command, runner);
}

/** A snapshot captured earlier: for an environment behind credentials or a VPN, and for tests. */
export class FileDriver implements SnapshotDriver {
  constructor(private readonly path: string) {}

  capture(): { ok: true; output: string } | { ok: false; reason: string } {
    if (!existsSync(this.path)) return { ok: false, reason: `no such file: ${this.path}` };
    return { ok: true, output: readFileSync(this.path, 'utf8') };
  }
}

export interface SurveyOptions {
  readonly projectRoot: string;
  readonly url: string;
  readonly driver: SnapshotDriver;
  readonly now?: Date;
}

export interface SurveyResult {
  readonly route: string;
  readonly map: RouteMap;
  readonly written: WriteResult;
  readonly parsed: ParsedSnapshot;
  /** Test ids the correlation confirmed against the product source. */
  readonly confirmed: number;
}

export class SurveyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SurveyError';
  }
}

export function survey(options: SurveyOptions): SurveyResult {
  const captured = options.driver.capture(options.url);
  if (!captured.ok) {
    throw new SurveyError(
      `Could not explore ${options.url}: ${captured.reason}\n\n` +
        'Exploration is delegated to playwright-cli. Check it is installed:\n' +
        '  npx @playwright/cli --help\n' +
        'Or capture a snapshot elsewhere and pass it with --from <file>.',
    );
  }

  const parsed = parseSnapshot(captured.output);
  if (parsed.tree.length === 0) {
    throw new SurveyError(
      `${options.url} produced no accessibility snapshot.\n` +
        'Nothing is written when nothing was seen — an empty map entry would read as ' +
        '"this page has no elements", which is a claim rather than a gap.',
    );
  }

  const route = routeFromUrl(parsed.url ?? options.url);
  const timestamp = (options.now ?? new Date()).toISOString();

  // The two sources meet here, and only their intersection is `confirmed`.
  const elements = correlate(parsed.elements, readTestIds(options.projectRoot));
  const confirmed = elements.filter((e) => e.confidence === 'confirmed').length;

  const gaps: string[] = [];
  if (readTestIds(options.projectRoot) === undefined) {
    gaps.push(
      'No product/testids.yaml, so nothing here is confirmed against the source. Run `understudy extract`.',
    );
  }
  if (parsed.elements.length === 0) {
    gaps.push('The snapshot had no named elements — the page may render behind authentication.');
  }

  const map: RouteMap = {
    schemaVersion: 1,
    route,
    title: parsed.title,
    exploredAt: timestamp,
    verifiedAt: timestamp,
    snapshotHash: hashSnapshot(parsed.tree),
    elements,
    links: [...parsed.links],
    gaps,
  };

  return { route, map, written: writeRouteMap(options.projectRoot, map), parsed, confirmed };
}

export function formatSurveyResult(result: SurveyResult): string {
  const { map, written, confirmed } = result;
  const lines = [
    '',
    `Surveyed ${map.route} — "${map.title}"`,
    `  ${String(map.elements.length)} addressable element(s), ${String(confirmed)} confirmed against the product source`,
    `  ${String(map.links.length)} outgoing link(s)`,
    `  written to ${written.path}`,
  ];

  if (written.redactions.length > 0) {
    // Said out loud: staging is serving something that looks like a secret.
    lines.push('', `  Redacted before writing: ${describeRedactions(written.redactions)}.`);
  }

  if (map.gaps.length > 0) {
    lines.push('', '  Gaps:');
    for (const gap of map.gaps) lines.push(`    - ${gap}`);
  }

  if (map.links.length > 0) {
    lines.push('', '  Routes linked from here, not yet surveyed:');
    for (const link of map.links.slice(0, 8)) lines.push(`    ${link.href}`);
  }

  return lines.join('\n');
}
