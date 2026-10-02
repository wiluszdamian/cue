import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeFreshness,
  findProductRoot,
  indexKnowledge,
  loadKnowledge,
  readAllRouteMapsWithErrors,
  surveyCommand,
  SURVEY_STALE_COMMAND,
  workingTreeFiles,
  type FileStateProvider,
  type KnowledgeIndex,
  type LoadIssue,
} from '@wiluszdamian/cue-engine';
import { check } from './check.js';
import type { CheckResult } from './doctor.js';

/**
 * Whether what `.agent-kb` says can be believed, as a set of diagnoses. Each one is a
 * function of a probe — what was read from disk — so it can be tested without a disk,
 * and each says what is wrong, how much, and the command that mends it.
 *
 * A healthy knowledge base is one line. Only a problem adds lines: a report that
 * lists eight passing checks teaches people to stop reading it.
 */

/** Examples a diagnosis names before it says "and N more". */
const SHOWN = 5;

export interface KnowledgeProbe {
  readonly hasKb: boolean;
  readonly issues: readonly LoadIssue[];
  /** Routes whose map is still in the older format, which carries no evidence per element. */
  readonly legacyRoutes: readonly string[];
  readonly index: KnowledgeIndex;
  readonly now: Date;
  readonly files?: FileStateProvider | undefined;
  /** Test ids the notes hold that the product source no longer contains. */
  readonly testIdsGone: readonly string[];
  /** Locators in the project's tests that the notes do not know; `undefined` when not looked at. */
  readonly unknownInTests?: readonly { readonly where: string; readonly expression: string }[];
}

function listed(items: readonly string[], shown = SHOWN): string {
  const head = items.slice(0, shown).join('; ');
  return items.length > shown ? `${head}; and ${String(items.length - shown)} more` : head;
}

const plural = (count: number, one: string, many = `${one}s`): string =>
  `${String(count)} ${count === 1 ? one : many}`;

/** A route that can be asked for by name: no `[id]`, no `:id`, no `{id}`. */
const isStaticRoute = (path: string): boolean => !/[[\]:{}*]/.test(path);

/** The route inside a fact id such as `route:/login` or `locator:/login#button:log-in`. */
function routeOfFactId(id: string): string | undefined {
  const match = /^(?:route:|locator:)(\/[^#\s]*)/.exec(id);
  return match?.[1];
}

// -------------------------------------------------------------------- checks

function summary(probe: KnowledgeProbe): CheckResult {
  const { index } = probe;
  if (!probe.hasKb) {
    return {
      id: 'agent-kb',
      title: 'Knowledge base',
      status: 'warn',
      detail:
        'No .agent-kb/. Without it, every selector an agent writes is a guess. It is filled by looking at the running application, or by reading the product source if it is here.',
      fix: 'cue survey <url>   # or: cue extract --source <dir>',
    };
  }

  const locators = index.allLocators().length;
  if (index.routes().length === 0 && locators === 0) {
    return {
      id: 'agent-kb',
      title: 'Knowledge base',
      status: 'warn',
      detail:
        '.agent-kb/ exists but holds nothing usable, so it cannot answer a single question about the application.',
      fix: 'cue survey <url>',
    };
  }

  return {
    id: 'agent-kb',
    title: 'Knowledge base',
    status: 'ok',
    detail: `${plural(index.routes().length, 'route')}, ${plural(locators, 'element')}, ${plural(index.apis().length, 'endpoint')}.`,
  };
}

function unusableFiles(probe: KnowledgeProbe): CheckResult[] {
  const results: CheckResult[] = [];
  const groups = [
    {
      id: 'kb:files',
      title: 'Surveyed pages are readable',
      match: (path: string) => path.startsWith('.agent-kb/app-map/'),
      fix: 'delete the file named above, then: cue survey --route <route> --base-url <url>',
    },
    {
      id: 'kb:product-files',
      title: 'Extracted product files are readable',
      match: (path: string) => !path.startsWith('.agent-kb/app-map/'),
      fix: 'cue extract --source <dir>',
    },
  ] as const;

  for (const group of groups) {
    const problems = probe.issues.filter((issue) => group.match(issue.path));
    if (problems.length === 0) continue;
    results.push({
      id: group.id,
      title: group.title,
      // A file the knowledge base could not read is knowledge it cannot offer, and silence about
      // it would read as a clean map.
      status: problems.some((issue) => issue.severity === 'error') ? 'error' : 'warn',
      detail: `${plural(problems.length, 'file')} could not be used: ${listed(problems.map((issue) => `${issue.path} ${issue.message}`))}.`,
      fix: group.fix,
    });
  }
  return results;
}

function legacyFormat(probe: KnowledgeProbe): CheckResult[] {
  const [first] = probe.legacyRoutes;
  if (first === undefined) return [];
  return [
    {
      id: 'kb:legacy',
      title: 'Surveyed pages carry their evidence',
      status: 'warn',
      detail: `${plural(probe.legacyRoutes.length, 'page')} saved in the older format, which does not say what each element rests on: ${listed(probe.legacyRoutes)}. Looking again rewrites them.`,
      fix: surveyCommand(first),
    },
  ];
}

function ageing(probe: KnowledgeProbe): CheckResult[] {
  const stale: string[] = [];
  let possibly = 0;
  let old = 0;

  for (const fact of [...probe.index.routes(), ...probe.index.allLocators()]) {
    // Never confirmed is not old: it is covered by the coverage check, and by `check` for elements.
    if (fact.verifiedAt === undefined) continue;
    const verdict = computeFreshness(fact, probe.now, probe.files);
    if (verdict.freshness !== 'stale' && verdict.freshness !== 'possibly-stale') continue;
    if (verdict.freshness === 'stale') old += 1;
    else possibly += 1;
    const label = fact.kind === 'route' ? fact.path : fact.expression;
    stale.push(`${label} (${verdict.reasons[0] ?? verdict.freshness})`);
  }

  if (stale.length === 0) return [];
  const parts = [
    ...(old > 0 ? [`${String(old)} not confirmed for over a month`] : []),
    ...(possibly > 0 ? [`${String(possibly)} possibly out of date because the code changed`] : []),
  ];
  return [
    {
      id: 'kb:fresh',
      title: 'What the notes say is recent',
      status: 'warn',
      detail: `${parts.join(', ')}: ${listed(stale)}. Treat these as candidates, not facts.`,
      fix: SURVEY_STALE_COMMAND,
    },
  ];
}

function conflicts(probe: KnowledgeProbe): CheckResult[] {
  const found = probe.index.conflicts();
  const [first] = found;
  if (first === undefined) return [];
  const route = routeOfFactId(first.factId);
  return [
    {
      id: 'kb:conflicts',
      title: 'Sources agree with each other',
      status: 'warn',
      detail: `${plural(found.length, 'fact')} where two sources disagree: ${listed(found.map((c) => `${c.factId} (${c.field}: ${c.values.map((v) => String(v.value)).join(' vs ')})`))}. Neither is picked for you; look at the page again and keep the one that is true.`,
      fix: route === undefined ? 'cue verify --base-url <url>' : surveyCommand(route),
    },
  ];
}

function testsAgainstNotes(probe: KnowledgeProbe): CheckResult[] {
  const unknown = probe.unknownInTests ?? [];
  if (unknown.length === 0) return [];
  return [
    {
      id: 'kb:tests',
      title: 'Locators in tests are known',
      status: 'warn',
      detail: `${plural(unknown.length, 'locator')} in the tests that the notes do not know about: ${listed(unknown.map((u) => `${u.where} ${u.expression}`))}.`,
      fix: 'cue check',
    },
  ];
}

function testIdsInSource(probe: KnowledgeProbe): CheckResult[] {
  if (probe.testIdsGone.length === 0) return [];
  return [
    {
      id: 'kb:test-ids',
      title: 'Test ids are still in the source',
      status: 'warn',
      detail: `${plural(probe.testIdsGone.length, 'test id')} in the notes that the product source no longer contains: ${listed(probe.testIdsGone)}. A test using one will not find it.`,
      fix: 'cue extract --source <dir>',
    },
  ];
}

function duplicates(probe: KnowledgeProbe): CheckResult[] {
  const seen = new Map<string, string[]>();
  for (const locator of probe.index.allLocators()) {
    const key = `${locator.route}\u0000${locator.testId ?? locator.expression}`;
    seen.set(key, [...(seen.get(key) ?? []), locator.id]);
  }
  const repeated = [...seen.values()].filter((ids) => ids.length > 1);
  if (repeated.length === 0) return [];

  const route = routeOfFactId(repeated[0]?.[0] ?? '');
  return [
    {
      id: 'kb:duplicates',
      title: 'Each element is noted once',
      status: 'warn',
      detail: `${plural(repeated.length, 'element')} noted under more than one id, so a lookup may answer with either: ${listed(repeated.map((ids) => ids.join(' = ')))}.`,
      fix: route === undefined ? 'cue survey <url>' : surveyCommand(route),
    },
  ];
}

function coverage(probe: KnowledgeProbe): CheckResult[] {
  const unseen = probe.index
    .routes()
    .filter(
      // Elements read from existing tests do not count as having looked: they are what the
      // tests expected, and only a survey shows what is there.
      (route) => !probe.index.evidenceFor(route.id).some((item) => item.type === 'browser'),
    )
    .map((route) => route.path);
  if (unseen.length === 0) return [];

  const reachable = unseen.find(isStaticRoute);
  return [
    {
      id: 'kb:coverage',
      title: 'Every known page has been looked at',
      status: 'warn',
      detail: `${plural(unseen.length, 'page')} known from the code that nobody has looked at, so nothing is known about what is on them: ${listed(unseen)}.`,
      // A page with a parameter cannot be named; it has to be reached through a real address.
      fix: reachable === undefined ? 'cue survey <url>' : surveyCommand(reachable),
    },
  ];
}

export function knowledgeChecks(probe: KnowledgeProbe): CheckResult[] {
  if (!probe.hasKb) return [summary(probe)];
  return [
    summary(probe),
    ...unusableFiles(probe),
    ...legacyFormat(probe),
    ...ageing(probe),
    ...conflicts(probe),
    ...testsAgainstNotes(probe),
    ...testIdsInSource(probe),
    ...duplicates(probe),
    ...coverage(probe),
  ];
}

// ------------------------------------------------------------------------ I/O

/** The one place that reads the disk for these diagnoses. */
export function probeKnowledge(
  projectRoot: string,
  now: Date = new Date(),
  source?: string,
): KnowledgeProbe {
  if (!existsSync(join(projectRoot, '.agent-kb'))) {
    return {
      hasKb: false,
      issues: [],
      legacyRoutes: [],
      index: indexKnowledge(loadKnowledge(projectRoot, now).kb),
      now,
      testIdsGone: [],
    };
  }

  const loaded = loadKnowledge(projectRoot, now);
  const index = indexKnowledge(loaded.kb);

  const productRoot = findProductRoot(projectRoot, source);
  const state = productRoot === undefined ? undefined : workingTreeFiles(productRoot);
  // Every freshness verdict asks about the same few files; ask the disk once for each.
  const hashes = new Map<string, string | undefined>();
  const files: FileStateProvider | undefined =
    state === undefined
      ? undefined
      : {
          hashOf(path) {
            if (!hashes.has(path)) hashes.set(path, state.hashOf(path));
            return hashes.get(path);
          },
        };

  const legacyRoutes = readAllRouteMapsWithErrors(projectRoot, now)
    .maps.filter((loadedMap) => loadedMap.fileVersion === 1)
    .map((loadedMap) => loadedMap.map.route);

  const testIdsGone: string[] = [];
  if (productRoot !== undefined) {
    const texts = new Map<string, string | undefined>();
    const textOf = (file: string): string | undefined => {
      if (!texts.has(file)) {
        const path = join(productRoot, file);
        texts.set(file, existsSync(path) ? readFileSync(path, 'utf8') : undefined);
      }
      return texts.get(file);
    };
    for (const fact of loaded.kb.facts) {
      if (fact.kind !== 'test-id') continue;
      const cited = index.evidenceFor(fact.id).find((item) => item.type === 'source-code');
      if (cited?.file === undefined) continue;
      const text = textOf(cited.file);
      if (!text?.includes(fact.testId)) testIdsGone.push(fact.testId);
    }
  }

  let unknownInTests: KnowledgeProbe['unknownInTests'];
  const nothingKnown = index.allLocators().length === 0;
  if (!nothingKnown) {
    try {
      const report = check({ projectRoot, targets: [], now, files });
      unknownInTests = report.files.flatMap((file) =>
        file.findings
          .filter((finding) => finding.verdict === 'unknown' || finding.verdict === 'wrong-route')
          .map((finding) => ({
            where: `${file.path}:${String(finding.line)}`,
            expression: finding.expression,
          })),
      );
    } catch {
      // Tests that cannot be read are `check`'s to report. Doctor says nothing rather than half of it.
      unknownInTests = undefined;
    }
  }

  return {
    hasKb: true,
    issues: loaded.issues,
    legacyRoutes,
    index,
    now,
    files,
    testIdsGone,
    ...(unknownInTests === undefined ? {} : { unknownInTests }),
  };
}
