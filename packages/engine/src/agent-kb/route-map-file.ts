import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { evidenceId, locatorId } from '../knowledge/ids.js';
import type { FactStatus, KnowledgeEvidence } from '../knowledge/model.js';
import { coverageFrom } from '../knowledge/query.js';
import {
  ROUTE_MAP_VERSION,
  RouteMapFileV2Schema,
  RouteMapV1Schema,
  SourcesSchema,
  TestIdsSchema,
  type KbElement,
  type RouteMap,
  type RouteMapFileV2,
  type TestIds,
} from '../schema/agent-kb.js';
import { correlate } from './correlate.js';
import { PRODUCT_DIR } from './paths.js';

/**
 * Route maps on disk. Two versions are understood and one is written:
 *
 *   1  elements carry a `confidence` and nothing about where it came from
 *   2  elements carry a status, the evidence it rests on, and when it was confirmed
 *
 * Reading either gives the same in-memory map, so nothing downstream knows which it
 * was; reading version 1 migrates in memory and leaves the file alone. Whatever is
 * written is version 2. A version newer than this Cue knows is refused: an
 * older reader that carried on would drop whatever the newer one added, and then
 * save the loss.
 */

export class UnsupportedSchemaVersionError extends Error {
  constructor(
    readonly found: number,
    readonly file: string,
  ) {
    super(
      `${file} is schema version ${String(found)}, but this Cue reads up to ` +
        `${String(ROUTE_MAP_VERSION)}. Upgrade @wiluszdamian/cue rather than editing the file: ` +
        'an older reader would drop whatever the newer one added, and save the loss.',
    );
    this.name = 'UnsupportedSchemaVersionError';
  }
}

// ------------------------------------------------------------- the product's side

/** What the product extract knows, read once per operation. */
export interface SourceIndex {
  readonly testIds: TestIds | undefined;
  /** Content hashes of the product files, from `sources.json`. */
  readonly fileHashes: ReadonlyMap<string, string>;
}

export const NO_SOURCES: SourceIndex = { testIds: undefined, fileHashes: new Map() };

function readQuietly<T>(path: string, read: (text: string) => T): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return read(readFileSync(path, 'utf8'));
  } catch {
    // Not this module's business to report; `loadKnowledge` does, with the file named.
    return undefined;
  }
}

export function readSourceIndex(root: string): SourceIndex {
  const testIds = readQuietly(join(root, PRODUCT_DIR, 'testids.yaml'), (text) =>
    TestIdsSchema.parse(parse(text)),
  );
  const sources = readQuietly(join(root, PRODUCT_DIR, 'sources.json'), (text) =>
    SourcesSchema.parse(JSON.parse(text)),
  );
  return {
    testIds,
    fileHashes: new Map(sources?.files.map((file) => [file.path, file.hash])),
  };
}

// ---------------------------------------------------------------- evidence pool

class Pool {
  private readonly items = new Map<string, KnowledgeEvidence>();

  constructor(seed: readonly KnowledgeEvidence[] = []) {
    for (const item of seed) this.items.set(item.id, item);
  }

  add(evidence: Omit<KnowledgeEvidence, 'id'>): string {
    const id = evidenceId(evidence);
    if (!this.items.has(id)) this.items.set(id, { ...evidence, id });
    return id;
  }

  get(id: string): KnowledgeEvidence | undefined {
    return this.items.get(id);
  }

  list(): KnowledgeEvidence[] {
    return [...this.items.values()];
  }
}

/** Normalised to ISO with an offset, which evidence requires; `undefined` when it is not a date. */
function iso(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function splitReference(reference: string): { file: string; line?: number } {
  const match = /^(.*):(\d+)$/.exec(reference);
  const line = match?.[2] === undefined ? undefined : Number.parseInt(match[2], 10);
  return match?.[1] === undefined || line === undefined || line < 1
    ? { file: reference }
    : { file: match[1], line };
}

interface Standing {
  readonly status: FactStatus;
  readonly evidence: string[];
  readonly dependencies?: KbElement['dependencies'];
}

/** The product's `file:line` for a test id, as evidence, and the file it makes the element depend on. */
function sourceFor(
  pool: Pool,
  sources: SourceIndex,
  testId: string | undefined,
): { evidence: string; dependencies: NonNullable<KbElement['dependencies']> } | undefined {
  if (testId === undefined) return undefined;
  const entry = sources.testIds?.testIds.find((candidate) => candidate.testId === testId);
  if (entry === undefined) return undefined;

  const { file, line } = splitReference(entry.source);
  const commit = sources.testIds?.commit;
  const hash = sources.fileHashes.get(file);
  return {
    evidence: pool.add({
      type: 'source-code',
      file,
      ...(line === undefined ? {} : { line }),
      ...(commit === undefined ? {} : { commit }),
    }),
    dependencies: { files: [{ path: file, ...(hash === undefined ? {} : { hash }) }] },
  };
}

/**
 * What an element's old `confidence` says, as a standing with its evidence:
 * `confirmed` → verified, `runtime-only` → observed, `code-only` and `unknown` →
 * inferred. The strength of the claim is exactly what the file made.
 */
function standingOf(
  element: KbElement,
  browser: string,
  imported: string,
  pool: Pool,
  sources: SourceIndex,
): Standing {
  const source = sourceFor(pool, sources, element.testId);
  const dependencies = source === undefined ? {} : { dependencies: source.dependencies };

  switch (element.confidence) {
    case 'confirmed':
      // With the product's reference when it can be found; otherwise the file's own word.
      return {
        status: 'verified',
        evidence: [browser, source?.evidence ?? imported],
        ...dependencies,
      };
    case 'runtime-only':
      return { status: 'observed', evidence: [browser] };
    case 'code-only':
      return { status: 'inferred', evidence: [source?.evidence ?? imported], ...dependencies };
    case 'unknown':
      return { status: 'inferred', evidence: [imported] };
  }
}

function withCoverage(element: Omit<KbElement, 'confidence'>, pool: Pool): KbElement {
  const types = (element.evidence ?? []).flatMap((id) => {
    const found = pool.get(id);
    return found === undefined ? [] : [found.type];
  });
  return { ...element, confidence: coverageFrom(element.status ?? 'inferred', types) };
}

/**
 * A source file that has turned up since the survey can confirm what the survey
 * only saw. Applied when reading, so the order of `extract` and `survey` does not
 * matter, and never to an element a check has marked stale.
 */
function confirmFromSource(
  elements: readonly KbElement[],
  pool: Pool,
  sources: SourceIndex,
): KbElement[] {
  return elements.map((element) => {
    if (element.status !== 'observed' || element.testId !== undefined) return element;

    const [upgraded] = correlate([element], sources.testIds);
    if (upgraded?.confidence !== 'confirmed') return element;

    const source = sourceFor(pool, sources, upgraded.testId);
    if (source === undefined) return element;
    return {
      ...element,
      testId: upgraded.testId,
      status: 'verified',
      evidence: [...(element.evidence ?? []), source.evidence],
      dependencies: source.dependencies,
      confidence: 'confirmed',
    };
  });
}

// ----------------------------------------------------------------------- reading

export interface ParseContext {
  /** Where the file is, as shown to people and cited as `import` evidence. */
  readonly displayPath: string;
  readonly sources: SourceIndex;
}

export interface ParsedRouteMap {
  readonly map: RouteMap;
  readonly fileVersion: 1 | 2;
}

export function parseRouteMapFile(data: unknown, context: ParseContext): ParsedRouteMap {
  const version =
    typeof data === 'object' && data !== null && 'schemaVersion' in data
      ? data.schemaVersion
      : undefined;
  if (typeof version === 'number' && version > ROUTE_MAP_VERSION) {
    throw new UnsupportedSchemaVersionError(version, context.displayPath);
  }
  return version === 1
    ? { map: fromV1(data, context), fileVersion: 1 }
    : { map: fromV2(data, context), fileVersion: 2 };
}

function fromV1(data: unknown, { displayPath, sources }: ParseContext): RouteMap {
  const file = RouteMapV1Schema.parse(data);
  const pool = new Pool();
  const observedAt = iso(file.exploredAt);
  const browser = pool.add({
    type: 'browser',
    route: file.route,
    snapshotHash: file.snapshotHash,
    ...(observedAt === undefined ? {} : { observedAt }),
  });
  const imported = pool.add({ type: 'import', file: displayPath });
  const verifiedAt = iso(file.verifiedAt);

  // As it always did: a match with the product's test ids confirms, whatever the file said.
  const elements = correlate(file.elements, sources.testIds).map((element) => {
    const standing = standingOf(element, browser, imported, pool, sources);
    return withCoverage(
      {
        ...element,
        id: locatorId(file.route, element.role, element.name),
        ...standing,
        ...(verifiedAt === undefined ? {} : { verifiedAt }),
      },
      pool,
    );
  });

  return {
    schemaVersion: ROUTE_MAP_VERSION,
    route: file.route,
    title: file.title,
    ...(file.environment === undefined ? {} : { environment: file.environment }),
    exploredAt: file.exploredAt,
    verifiedAt: file.verifiedAt,
    snapshotHash: file.snapshotHash,
    links: file.links,
    gaps: file.gaps,
    evidence: pool.list(),
    // Already matched against the test ids above, so there is nothing left to confirm.
    elements,
  };
}

function fromV2(data: unknown, { sources }: ParseContext): RouteMap {
  const file = RouteMapFileV2Schema.parse(data);
  const pool = new Pool(file.evidence);

  const elements = file.elements.map((element) => withCoverage(element, pool));
  return {
    ...file,
    evidence: pool.list(),
    elements: confirmFromSource(elements, pool, sources),
  };
}

// ----------------------------------------------------------------------- writing

export interface SerializeContext {
  readonly displayPath: string;
  readonly sources: SourceIndex;
}

/**
 * The map as version 2. An element that already says where it stands is written as
 * it is; one that does not (a fresh survey) has its standing worked out from its
 * `confidence`, with evidence from the observation and from the product's test ids.
 */
export function serializeRouteMap(map: RouteMap, context: SerializeContext): RouteMapFileV2 {
  const pool = new Pool(map.evidence);
  const observedAt = iso(map.exploredAt);
  const browser = pool.add({
    type: 'browser',
    route: map.route,
    ...(map.environment === undefined ? {} : { environment: map.environment }),
    ...(observedAt === undefined ? {} : { observedAt }),
    snapshotHash: map.snapshotHash,
    ...(map.tool === undefined ? {} : { tool: map.tool }),
  });
  const imported = pool.add({ type: 'import', file: context.displayPath });
  const verifiedAt = iso(map.verifiedAt);

  const elements = map.elements.map((element) => {
    const standing =
      element.status !== undefined && element.evidence !== undefined
        ? { status: element.status, evidence: element.evidence }
        : standingOf(element, browser, imported, pool, context.sources);

    const dependencies =
      element.dependencies ?? ('dependencies' in standing ? standing.dependencies : undefined);
    const confirmedAt = element.verifiedAt ?? verifiedAt;
    return {
      id: element.id ?? locatorId(map.route, element.role, element.name),
      role: element.role,
      ...(element.name === undefined ? {} : { name: element.name }),
      ...(element.level === undefined ? {} : { level: element.level }),
      locator: element.locator,
      ...(element.testId === undefined ? {} : { testId: element.testId }),
      status: standing.status,
      evidence: standing.evidence,
      ...(confirmedAt === undefined ? {} : { verifiedAt: confirmedAt }),
      ...(dependencies === undefined ? {} : { dependencies }),
    };
  });

  // Only what is cited: replaced observations do not linger as orphans.
  const cited = new Set(elements.flatMap((element) => element.evidence));
  for (const id of cited) {
    if (pool.get(id) === undefined) {
      throw new Error(`${map.route} cites evidence ${id}, which the map does not contain`);
    }
  }

  return {
    schemaVersion: ROUTE_MAP_VERSION,
    route: map.route,
    title: map.title,
    ...(map.environment === undefined ? {} : { environment: map.environment }),
    exploredAt: map.exploredAt,
    verifiedAt: map.verifiedAt,
    snapshotHash: map.snapshotHash,
    evidence: pool.list().filter((item) => cited.has(item.id)),
    elements,
    links: map.links,
    gaps: map.gaps,
  };
}

// ------------------------------------------------------------ recording a live check

export interface LiveCheck {
  readonly at: Date;
  /** The hash of what the running application served. */
  readonly snapshotHash: string;
  /** Element ids that the running page no longer shows. */
  readonly missing: ReadonlySet<string>;
  readonly environment?: string | undefined;
  readonly tool?: RouteMap['tool'];
}

/**
 * What a live check learned, written into the map. A page that matches is
 * confirmed now: its elements get the new observation in place of the one before
 * (evidence stays bounded) and a fresh `verifiedAt`. A page that has changed
 * confirms nothing, but marks the elements it lost as stale — kept, not removed,
 * because "this used to be here" is knowledge too.
 */
export function recordLiveCheck(map: RouteMap, check: LiveCheck): RouteMap {
  const pool = new Pool(map.evidence);
  const environment = check.environment ?? map.environment;
  const at = check.at.toISOString();
  const unchanged = check.missing.size === 0 && check.snapshotHash === map.snapshotHash;

  const isOlderObservation = (id: string): boolean => {
    const found = pool.get(id);
    return found?.type === 'browser' && found.environment === environment;
  };

  const fresh = unchanged
    ? pool.add({
        type: 'browser',
        route: map.route,
        ...(environment === undefined ? {} : { environment }),
        observedAt: at,
        snapshotHash: check.snapshotHash,
        ...(check.tool === undefined ? {} : { tool: check.tool }),
      })
    : undefined;

  const elements = map.elements.map((element) => {
    const id = element.id ?? locatorId(map.route, element.role, element.name);
    const evidence = element.evidence ?? [];

    if (check.missing.has(id)) {
      return withCoverage({ ...element, id, status: 'stale' }, pool);
    }
    if (fresh === undefined) return element;

    const kept = evidence.filter((cited) => !isOlderObservation(cited));
    const cites = [fresh, ...kept];
    const hasSource = cites.some((cited) => pool.get(cited)?.type === 'source-code');
    // A stale element that is back is observed again, and verified only if the source backs it.
    const status: FactStatus =
      element.status === 'stale'
        ? hasSource
          ? 'verified'
          : 'observed'
        : (element.status ?? 'observed');
    return withCoverage({ ...element, id, status, evidence: cites, verifiedAt: at }, pool);
  });

  return {
    ...map,
    schemaVersion: ROUTE_MAP_VERSION,
    ...(unchanged ? { verifiedAt: at } : {}),
    evidence: pool.list(),
    elements,
  };
}
