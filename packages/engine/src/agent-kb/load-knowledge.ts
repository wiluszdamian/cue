import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import type { ZodType } from 'zod';
import {
  FromTestsSchema,
  SurfaceSchema,
  TestIdsSchema,
  VocabularySchema,
  type RouteMap,
  type FromTests,
  type Surface,
  type TestIds,
  type Vocabulary,
} from '../schema/agent-kb.js';
import { KnowledgeBuilder } from '../knowledge/builder.js';
import {
  apiId,
  locatorId,
  namedId,
  normaliseName,
  routeId,
  termId,
  testIdFactId,
} from '../knowledge/ids.js';
import type { FactConfidence, FactStatus, KnowledgeBase } from '../knowledge/model.js';
import { validateKnowledge } from '../knowledge/validate.js';
import { PRODUCT_DIR, readAllRouteMapsWithErrors } from './store.js';

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

const CONFIDENCE: Record<FactStatus, FactConfidence> = {
  verified: { level: 'high', reason: 'seen running and present in the product source' },
  observed: { level: 'medium', reason: 'seen running, absent from the product source' },
  inferred: { level: 'low', reason: 'not seen running, or not seen anywhere' },
  stale: { level: 'low', reason: 'a check against the running application failed' },
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

  const fromTests: FromTests | undefined = readYaml(
    productPath('from-tests.yaml'),
    FromTestsSchema,
    shown(productPath('from-tests.yaml')),
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
  // The reader has already given every element its standing and evidence, whichever
  // version the file was, and confirmed it against the test ids as it always did.
  for (const { map, path } of reading.maps) mapRoute(builder, map, shown(path), issues);

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

  // ------------------------------------------------------------ existing tests
  // A claim somebody once wrote into a test. Read last, so that when a survey has seen the same
  // element, what it saw is what stands and the test's version is only recorded beside it. The
  // status is always inferred: a test may be dead, and agreeing with itself proves nothing.
  for (const entry of fromTests?.locators ?? []) {
    const { file, line } = splitReference(entry.source);
    const evidence = builder.addEvidence({
      type: entry.origin,
      file,
      ...(line === undefined ? {} : { line }),
      ...(entry.symbol === undefined ? {} : { symbol: entry.symbol }),
      ...(fromTests?.commit === undefined ? {} : { commit: fromTests.commit }),
    });
    builder.addFact({
      id: routeId(entry.route),
      kind: 'route',
      path: entry.route,
      status: 'inferred',
      evidence: [evidence],
    });
    builder.addFact({
      id: locatorId(entry.route, entry.role, entry.name),
      kind: 'locator',
      route: routeId(entry.route),
      role: entry.role,
      ...(entry.name === undefined ? {} : { name: entry.name }),
      expression: entry.expression,
      status: 'inferred',
      evidence: [evidence],
    });
  }

  for (const entry of fromTests?.actions ?? []) {
    const { file, line } = splitReference(entry.source);
    const evidence = builder.addEvidence({
      type: 'page-object',
      file,
      ...(line === undefined ? {} : { line }),
      symbol: entry.symbol,
      ...(fromTests?.commit === undefined ? {} : { commit: fromTests.commit }),
    });
    builder.addFact({
      id: routeId(entry.route),
      kind: 'route',
      path: entry.route,
      status: 'inferred',
      evidence: [evidence],
    });
    // The locators the method uses are facts in their own right (above); the action names the
    // first of them, because an action holds one reference.
    const used = (fromTests?.locators ?? []).find(
      (candidate) =>
        candidate.route === entry.route && entry.locators.includes(candidate.expression),
    );
    builder.addFact({
      id: namedId('action', `${entry.route}#${normaliseName(entry.intent)}`),
      kind: 'action',
      route: routeId(entry.route),
      intent: entry.intent,
      ...(used === undefined ? {} : { locator: locatorId(used.route, used.role, used.name) }),
      status: 'inferred',
      evidence: [evidence],
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

function mapRoute(
  builder: KnowledgeBuilder,
  map: RouteMap,
  mapPath: string,
  issues: LoadIssue[],
): void {
  const observedAt = isoOrUndefined(map.exploredAt);
  const verifiedAt = isoOrUndefined(map.verifiedAt);
  for (const [field, value, ok] of [
    ['exploredAt', map.exploredAt, observedAt],
    ['verifiedAt', map.verifiedAt, verifiedAt],
  ] as const) {
    if (ok === undefined) {
      issues.push({
        path: mapPath,
        severity: 'warning',
        message: `${field} "${value}" is not a date, so it counts for nothing and the route reads as stale`,
      });
    }
  }

  // The map's evidence, re-recorded under the builder's ids (which hash the content).
  const evidenceIds = new Map<string, string>();
  for (const { id, ...rest } of map.evidence ?? []) evidenceIds.set(id, builder.addEvidence(rest));
  const cited = (ids: readonly string[]): string[] =>
    ids.flatMap((id) => {
      const mapped = evidenceIds.get(id);
      return mapped === undefined ? [] : [mapped];
    });

  // What the route itself rests on: that somebody looked at it, then.
  const browser = builder.addEvidence({
    type: 'browser',
    route: map.route,
    ...(map.environment === undefined ? {} : { environment: map.environment }),
    snapshotHash: map.snapshotHash,
    ...(observedAt === undefined ? {} : { observedAt }),
  });
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
  for (const element of map.elements) {
    const id = locatorId(map.route, element.role, element.name);
    if (seen.has(id)) {
      issues.push({
        path: mapPath,
        severity: 'warning',
        message: `${element.locator} appears more than once (names are compared ignoring case); the first is kept`,
      });
      continue;
    }
    seen.add(id);

    const status = element.status ?? 'observed';
    const evidence = cited(element.evidence ?? []);
    const confirmedAt = isoOrUndefined(element.verifiedAt ?? map.verifiedAt);

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
      // An element that cites nothing still rests on the route having been looked at.
      evidence: evidence.length > 0 ? evidence : [browser],
      confidence: CONFIDENCE[status],
      ...(confirmedAt === undefined ? {} : { verifiedAt: confirmedAt }),
      ...(element.dependencies === undefined ? {} : { dependencies: element.dependencies }),
    });
  }
}
