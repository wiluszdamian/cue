import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import type { ZodType } from 'zod';
import {
  SurfaceSchema,
  TestIdsSchema,
  VocabularySchema,
  type KbElement,
  type RouteMap,
  type Surface,
  type TestIds,
  type Vocabulary,
} from '../schema/agent-kb.js';
import { KnowledgeBuilder } from '../knowledge/builder.js';
import { apiId, locatorId, routeId, termId, testIdFactId } from '../knowledge/ids.js';
import type { FactConfidence, KnowledgeBase } from '../knowledge/model.js';
import { validateKnowledge } from '../knowledge/validate.js';
import { PRODUCT_DIR, correlate, readAllRouteMapsWithErrors } from './store.js';

/**
 * Reading `.agent-kb` as it exists today (the v1 files) into the Knowledge Core.
 *
 * This is the only place that knows both shapes. It maps; it does not judge:
 * a file it cannot use becomes an issue, never an exception and never silence.
 *
 * What the older `confidence` field said becomes a status plus its evidence, so
 * nothing is lost and nothing is claimed that the file did not claim:
 *
 *   confirmed    → verified   (seen running and in the product source)
 *   runtime-only → observed   (seen running)
 *   code-only    → inferred   (in the source, never seen)
 *   unknown      → inferred   (neither)
 */

export interface LoadIssue {
  readonly path: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface LoadedKnowledge {
  readonly kb: KnowledgeBase;
  readonly issues: readonly LoadIssue[];
}

/** `src/Login.tsx:12` → the file and the line. A reference with no line keeps just the file. */
function splitReference(reference: string): { file: string; line?: number } {
  const match = /^(.*):(\d+)$/.exec(reference);
  const line = match?.[2] === undefined ? undefined : Number.parseInt(match[2], 10);
  return match?.[1] === undefined || line === undefined || line < 1
    ? { file: reference }
    : { file: match[1], line };
}

const OPENAPI_FILE = /(openapi|swagger)\.(json|ya?ml)$/i;

/** Normalised to ISO with an offset, which is what the model requires; `undefined` when unreadable. */
function isoOrUndefined(value: string): string | undefined {
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function readYaml<T>(
  path: string,
  schema: ZodType<T>,
  displayPath: string,
  issues: LoadIssue[],
): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const result = schema.safeParse(parse(readFileSync(path, 'utf8')));
    if (result.success) return result.data;
    const first = result.error.issues[0];
    issues.push({
      path: displayPath,
      severity: 'error',
      message: `does not match its schema (${first === undefined ? 'unknown problem' : `${first.path.join('.') || 'file'}: ${first.message}`})`,
    });
  } catch (error) {
    issues.push({
      path: displayPath,
      severity: 'error',
      message: `could not be read (${(error instanceof Error ? error.message : String(error)).split('\n')[0] ?? 'unknown error'})`,
    });
  }
  return undefined;
}

const CONFIDENCE: Record<'confirmed' | 'runtime-only' | 'inferred', FactConfidence> = {
  confirmed: { level: 'high', reason: 'seen running and present in the product source' },
  'runtime-only': { level: 'medium', reason: 'seen running, absent from the product source' },
  inferred: { level: 'low', reason: 'not seen running, or not seen anywhere' },
};

export function loadKnowledge(root: string, now?: Date): LoadedKnowledge {
  const issues: LoadIssue[] = [];
  const builder = new KnowledgeBuilder();
  const shown = (path: string): string => relative(root, path).split(sep).join('/');

  const reading = readAllRouteMapsWithErrors(root, now);
  for (const invalid of reading.invalid) {
    issues.push({ path: shown(invalid.path), severity: 'error', message: invalid.reason });
  }

  const productPath = (name: string): string => join(root, PRODUCT_DIR, name);
  const testIds: TestIds | undefined = readYaml(
    productPath('testids.yaml'),
    TestIdsSchema,
    shown(productPath('testids.yaml')),
    issues,
  );
  const surface: Surface | undefined = readYaml(
    productPath('surface.yaml'),
    SurfaceSchema,
    shown(productPath('surface.yaml')),
    issues,
  );
  const vocabulary: Vocabulary | undefined = readYaml(
    productPath('vocabulary.yaml'),
    VocabularySchema,
    shown(productPath('vocabulary.yaml')),
    issues,
  );

  /** Evidence for a `file:line` the product source gave, typed by what the file is. */
  const sourceEvidence = (
    reference: string,
    commit: string | undefined,
    type: 'source-code' | 'openapi' = 'source-code',
  ): string => {
    const { file, line } = splitReference(reference);
    return builder.addEvidence({
      type,
      file,
      ...(line === undefined ? {} : { line }),
      ...(commit === undefined ? {} : { commit }),
    });
  };

  // ---------------------------------------------------------------- route maps
  const sourceOfTestId = new Map(testIds?.testIds.map((entry) => [entry.testId, entry.source]));

  for (const { map, path } of reading.maps) {
    mapRoute(builder, map, shown(path), correlate(map.elements, testIds), {
      sourceOfTestId,
      commit: testIds?.commit,
      sourceEvidence,
      issues,
    });
  }

  // --------------------------------------------------------------- product files
  for (const entry of testIds?.testIds ?? []) {
    builder.addFact({
      id: testIdFactId(entry.testId),
      kind: 'test-id',
      testId: entry.testId,
      status: 'observed',
      evidence: [sourceEvidence(entry.source, testIds?.commit)],
    });
  }

  for (const entry of surface?.entries ?? []) {
    const evidence = [
      sourceEvidence(
        entry.source,
        surface?.commit,
        OPENAPI_FILE.test(splitReference(entry.source).file) ? 'openapi' : 'source-code',
      ),
    ];
    if (entry.kind === 'route') {
      builder.addFact({
        id: routeId(entry.path),
        kind: 'route',
        path: entry.path,
        status: 'observed',
        evidence,
      });
    } else {
      builder.addFact({
        id: apiId(entry.method, entry.path),
        kind: 'api',
        path: entry.path,
        ...(entry.method === undefined ? {} : { method: entry.method.toUpperCase() }),
        status: 'observed',
        evidence,
      });
    }
  }

  for (const term of vocabulary?.terms ?? []) {
    builder.addFact({
      id: termId(term.key),
      kind: 'term',
      key: term.key,
      label: term.label,
      status: 'observed',
      evidence: [sourceEvidence(term.source, vocabulary?.commit)],
    });
  }

  const kb = builder.build();

  // Cross-checks the builder cannot make. They should find nothing; if they do,
  // the files disagree with the model in a way worth reporting rather than hiding.
  for (const problem of validateKnowledge(kb)) {
    issues.push({ path: '.agent-kb', severity: 'warning', message: problem.message });
  }
  for (const conflict of kb.conflicts ?? []) {
    issues.push({
      path: '.agent-kb',
      severity: 'warning',
      message: `${conflict.factId}.${conflict.field} is reported as ${conflict.values
        .map((entry) => JSON.stringify(entry.value))
        .join(' and ')} by different sources.`,
    });
  }

  return { kb, issues };
}

interface MapContext {
  readonly sourceOfTestId: ReadonlyMap<string, string>;
  readonly commit: string | undefined;
  readonly sourceEvidence: (reference: string, commit: string | undefined) => string;
  readonly issues: LoadIssue[];
}

function mapRoute(
  builder: KnowledgeBuilder,
  map: RouteMap,
  mapPath: string,
  elements: readonly KbElement[],
  context: MapContext,
): void {
  const observedAt = isoOrUndefined(map.exploredAt);
  const verifiedAt = isoOrUndefined(map.verifiedAt);
  for (const [field, value, ok] of [
    ['exploredAt', map.exploredAt, observedAt],
    ['verifiedAt', map.verifiedAt, verifiedAt],
  ] as const) {
    if (ok === undefined) {
      context.issues.push({
        path: mapPath,
        severity: 'warning',
        message: `${field} "${value}" is not a date, so it counts for nothing and the route reads as stale`,
      });
    }
  }

  const browser = builder.addEvidence({
    type: 'browser',
    route: map.route,
    snapshotHash: map.snapshotHash,
    ...(observedAt === undefined ? {} : { observedAt }),
  });
  // The file itself, for entries whose only support is that the file says so.
  const imported = builder.addEvidence({ type: 'import', file: mapPath });
  const route = routeId(map.route);

  builder.addFact({
    id: route,
    kind: 'route',
    path: map.route,
    title: map.title,
    status: 'observed',
    evidence: [browser],
    ...(verifiedAt === undefined ? {} : { verifiedAt }),
  });

  const seen = new Set<string>();
  for (const element of elements) {
    const id = locatorId(map.route, element.role, element.name);
    if (seen.has(id)) {
      context.issues.push({
        path: mapPath,
        severity: 'warning',
        message: `${element.locator} appears more than once (names are compared ignoring case); the first is kept`,
      });
      continue;
    }
    seen.add(id);

    const testIdSource =
      element.testId === undefined ? undefined : context.sourceOfTestId.get(element.testId);
    const source =
      testIdSource === undefined ? undefined : context.sourceEvidence(testIdSource, context.commit);

    const { status, evidence, confidence } = standing(element, browser, source, imported);

    builder.addFact({
      id,
      kind: 'locator',
      route,
      role: element.role,
      ...(element.name === undefined ? {} : { name: element.name }),
      ...(element.level === undefined ? {} : { level: element.level }),
      expression: element.locator,
      ...(element.testId === undefined ? {} : { testId: element.testId }),
      status,
      evidence,
      confidence,
      // For an element the route map's date *is* the date it was last confirmed.
      ...(verifiedAt === undefined ? {} : { verifiedAt }),
    });
  }
}

function standing(
  element: KbElement,
  browser: string,
  source: string | undefined,
  imported: string,
): {
  status: 'verified' | 'observed' | 'inferred';
  evidence: string[];
  confidence: FactConfidence;
} {
  switch (element.confidence) {
    case 'confirmed':
      return {
        status: 'verified',
        // With the product's reference when it can be found; otherwise the map's own
        // word for it, which is exactly as strong as it ever was.
        evidence: [browser, source ?? imported],
        confidence: CONFIDENCE.confirmed,
      };
    case 'runtime-only':
      return { status: 'observed', evidence: [browser], confidence: CONFIDENCE['runtime-only'] };
    case 'code-only':
      return {
        status: 'inferred',
        evidence: [source ?? imported],
        confidence: CONFIDENCE.inferred,
      };
    case 'unknown':
      return { status: 'inferred', evidence: [imported], confidence: CONFIDENCE.inferred };
  }
}
