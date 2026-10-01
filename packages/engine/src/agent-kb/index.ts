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

export { extractLocators, type LocatorUse } from './extract-locators.js';

export * from './extract/index.js';

export {
  formatLocatorAnswer,
  resolveLocator,
  type LocatorAnswer,
  type LocatorFound,
  type LocatorUnknown,
  type ResolveOptions,
} from './resolve-locator.js';
