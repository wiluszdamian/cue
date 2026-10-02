/**
 * `.agent-kb` — what this repository knows about the application under test.
 *
 * The one layer no upstream source can supply, and the one where being wrong is
 * most expensive. Everything here is built around two rules: nothing is written
 * without passing the redaction filter, and nothing is read without its
 * freshness attached.
 */

export {
  AGEING_AFTER_DAYS,
  ageInDays,
  freshnessAdvice,
  freshnessOf,
  STALE_AFTER_DAYS,
} from './freshness.js';

export {
  containsSensitive,
  describeRedactions,
  redact,
  type Redaction,
  type RedactionResult,
} from './redact.js';

export {
  hashSnapshot,
  locatorFor,
  MARKDOWN_YAML_V1,
  parseRawSnapshot,
  parseSnapshot,
  routeFromUrl,
  routeToFilename,
  SNAPSHOT_FORMATS,
  UnsupportedSnapshotFormatError,
  type NormalizedBrowserObservation,
  type ParsedSnapshot,
  type RawSnapshot,
  type SnapshotFormat,
} from './snapshot/index.js';

export {
  APP_MAP_DIR,
  appMapDir,
  codeOnlyTestIds,
  correlate,
  PRODUCT_DIR,
  readAllRouteMaps,
  readAllRouteMapsWithErrors,
  readRouteMap,
  readTestIds,
  routeMapPath,
  writeRouteMap,
  type InvalidRouteMap,
  type LoadedRouteMap,
  type RouteMapReading,
  type WriteResult,
} from './store.js';

export {
  parseRouteMapFile,
  readSourceIndex,
  recordLiveCheck,
  serializeRouteMap,
  UnsupportedSchemaVersionError,
  type LiveCheck,
  type ParsedRouteMap,
  type SourceIndex,
} from './route-map-file.js';

export {
  extractLocators,
  pathFromTarget,
  routeContextFor,
  scanTestSource,
  type LocatorUse,
  type Navigation,
  type TestSourceScan,
} from './extract-locators.js';

export * from './extract/index.js';

export { cachedKnowledgeIndex, clearKnowledgeCache, findKnowledgeRoot } from './knowledge-cache.js';

export {
  buildTaskContext,
  DEFAULT_CONTEXT_TOKENS,
  describeEvidence,
  estimateTokens,
  MAX_CONTEXT_TOKENS,
  MIN_CONTEXT_TOKENS,
  stemsOf,
  type TaskContext,
  type TaskContextInput,
  type TaskContextOptions,
} from './task-context.js';

export {
  changedFiles,
  findProductRoot,
  hashContent,
  workingTreeFiles,
  type ChangedFiles,
} from './working-tree.js';

export { loadKnowledge, type LoadedKnowledge, type LoadIssue } from './load-knowledge.js';

export {
  formatLocatorAnswer,
  resolveLocator,
  type LocatorAnswer,
  type LocatorFound,
  type LocatorUnknown,
  type ResolveOptions,
} from './resolve-locator.js';

export { SURVEY_STALE_COMMAND, surveyCommand } from './advice.js';

export {
  normaliseRoute,
  selectSurveyTargets,
  type SurveySelectors,
  type SurveyTarget,
} from './survey-targets.js';
