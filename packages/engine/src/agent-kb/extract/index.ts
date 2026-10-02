/**
 * `cue extract` — the product's structure, from its own source.
 *
 * The static half of the knowledge base. Where `survey` reports what a page
 * looked like when it ran, this reports what the code says exists — and the
 * overlap between the two is the only thing that earns the word `confirmed`.
 */

export {
  ADAPTERS,
  existingTestsAdapter,
  i18nAdapter,
  nextAdapter,
  openApiAdapter,
  testIdAdapter,
} from './adapters.js';
export type { Adapter, AdapterContext, AdapterResult } from './adapters.js';
export { reference, scanSource, type ScanResult, type SourceFileRef } from './scan.js';
export { extract, formatExtractResult, type ExtractOptions, type ExtractResult } from './run.js';
