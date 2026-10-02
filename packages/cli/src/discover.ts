import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ADAPTERS,
  findPageObjectClasses,
  indexKnowledge,
  inspectPlaywrightConfig,
  loadKnowledge,
  scanSource,
  surveyCommand,
  type PlaywrightConfigFacts,
} from '@wiluszdamian/cue-engine';
import { detectAgents, type DetectedAgent } from './agents.js';
import { readManifest } from './manifest.js';

/**
 * `cue discover` — what is in this repository, and what could Cue
 * learn from it? Read-only from first line to last: it opens files and writes none,
 * and ends with the commands that would act on what it found, so a person sees the
 * plan before anything changes.
 */

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.next',
  '.nuxt',
  'out',
]);
const FILE_LIMIT = 20_000;
const POM_FILE_LIMIT = 500;

const CONFIG = /(^|\/)playwright\.config\.(ts|js|mjs|cjs|mts|cts)$/;
const SPEC = /\.(spec|test)\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$/;
const POM_DIR = new Set(['pages', 'page-objects', 'pageobjects', 'page_objects', 'pom', 'poms']);
const POM_FILE = /(page|pom)\.(ts|tsx)$/i;
const INSTRUCTION_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.cursorrules',
  '.cursor/rules',
];

export interface SourceFinding {
  readonly id: string;
  readonly label: string;
  /** What `extract` would record from it. Zero means it was not found. */
  readonly found: number;
  readonly unit: string;
}

export interface DiscoveryReport {
  readonly root: string;
  /** Files looked at, and whether the repository was bigger than the limit. */
  readonly filesSeen: number;
  readonly truncated: boolean;
  readonly playwright: {
    readonly config: string | undefined;
    readonly facts: PlaywrightConfigFacts | undefined;
    /** The `@playwright/test` range in package.json, if declared. */
    readonly declared: string | undefined;
  };
  readonly tests: { readonly specFiles: number; readonly folder: string | undefined };
  readonly pageObjects: {
    readonly classes: number;
    readonly files: number;
    readonly folders: readonly string[];
  };
  readonly sources: {
    readonly root: string;
    readonly filesRead: number;
    readonly findings: readonly SourceFinding[];
    readonly routes: readonly string[];
    readonly notes: readonly string[];
  };
  readonly agents: {
    readonly detected: readonly DetectedAgent[];
    readonly instructionFiles: readonly string[];
  };
  readonly cue: {
    readonly installed: boolean;
    readonly version: string | undefined;
    readonly surveyedRoutes: readonly string[];
    readonly elements: number;
  };
  readonly nextSteps: readonly string[];
}

export interface DiscoverOptions {
  readonly root: string;
  /** Where the product's source is, when it is not this repository. */
  readonly source?: string | undefined;
  readonly home?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

function listFiles(root: string): { files: string[]; truncated: boolean } {
  const files: string[] = [];
  const queue: string[] = [''];
  while (queue.length > 0 && files.length < FILE_LIMIT) {
    const relative = queue.pop() ?? '';
    let entries;
    try {
      entries = readdirSync(join(root, relative), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }
  return { files: files.sort(), truncated: queue.length > 0 };
}

const readText = (root: string, path: string): string | undefined => {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    return undefined;
  }
};

function declaredPlaywright(root: string): string | undefined {
  const text = readText(root, 'package.json');
  if (text === undefined) return undefined;
  try {
    const pkg = JSON.parse(text) as Record<string, Record<string, string> | undefined>;
    return (
      pkg['devDependencies']?.['@playwright/test'] ?? pkg['dependencies']?.['@playwright/test']
    );
  } catch {
    return undefined;
  }
}

/** The shallowest config wins: a monorepo's root one over a package's. */
function pickConfig(files: readonly string[]): string | undefined {
  return files
    .filter((file) => CONFIG.test(file))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
}

export function discover(options: DiscoverOptions): DiscoveryReport {
  const root = resolve(options.root);
  const { files, truncated } = listFiles(root);

  // ---- Playwright
  const configPath = pickConfig(files);
  const configText = configPath === undefined ? undefined : readText(root, configPath);
  const facts = configText === undefined ? undefined : inspectPlaywrightConfig(configText);

  // ---- tests
  const specs = files.filter((file) => SPEC.test(file));
  const configDir =
    configPath?.includes('/') === true ? configPath.slice(0, configPath.lastIndexOf('/')) : '';
  const testDir = facts?.testDir?.replace(/^\.\//, '').replace(/\/+$/, '');
  const folder =
    testDir !== undefined
      ? [configDir, testDir].filter((part) => part !== '' && part !== '.').join('/') || '.'
      : mostCommonFolder(specs);

  // ---- page objects
  const candidates = files
    .filter((file) => {
      if (!/\.(ts|tsx)$/.test(file) || SPEC.test(file) || file.endsWith('.d.ts')) return false;
      const segments = file.split('/');
      return segments.slice(0, -1).some((s) => POM_DIR.has(s.toLowerCase())) || POM_FILE.test(file);
    })
    .slice(0, POM_FILE_LIMIT);
  let classes = 0;
  const withClasses: string[] = [];
  for (const file of candidates) {
    const text = readText(root, file);
    const found = text === undefined ? [] : findPageObjectClasses(text);
    if (found.length > 0) {
      classes += found.length;
      withClasses.push(file);
    }
  }
  const pomFolders = [
    ...new Set(withClasses.map((file) => file.slice(0, Math.max(file.lastIndexOf('/'), 0)) || '.')),
  ].sort();

  // ---- what the product source could supply
  const sourceRoot = resolve(options.source ?? root);
  const scan = scanSource(sourceRoot);
  const context = { files: scan.files };
  const counts = { testIds: 0, routes: [] as string[], endpoints: 0, terms: 0 };
  let openApi = 0;
  for (const adapter of ADAPTERS) {
    if (!adapter.detect(context)) continue;
    const result = adapter.extract(context);
    counts.testIds += result.testIds?.length ?? 0;
    counts.terms += result.terms?.length ?? 0;
    for (const entry of result.surface ?? []) {
      if (entry.kind === 'route') counts.routes.push(entry.path);
      else {
        counts.endpoints += 1;
        if (adapter.id === 'openapi') openApi += 1;
      }
    }
  }
  const findings: SourceFinding[] = [
    { id: 'test-ids', label: 'data-testid attributes', found: counts.testIds, unit: 'test id(s)' },
    { id: 'routes', label: 'routes (Next.js)', found: counts.routes.length, unit: 'route(s)' },
    { id: 'openapi', label: 'OpenAPI endpoints', found: openApi, unit: 'endpoint(s)' },
    { id: 'i18n', label: 'user-visible labels (i18n)', found: counts.terms, unit: 'label(s)' },
  ];

  // ---- agents
  const detected = detectAgents({
    cwd: root,
    ...(options.home === undefined ? {} : { home: options.home }),
    ...(options.env === undefined ? {} : { env: options.env }),
  });
  const instructionFiles = INSTRUCTION_FILES.filter((file) => existsSync(join(root, file)));

  // ---- Cue itself
  let manifestVersion: string | undefined;
  let installed = false;
  try {
    const manifest = readManifest(root);
    installed = manifest !== undefined;
    manifestVersion = manifest?.cueVersion;
  } catch {
    // A manifest that cannot be read is `doctor`'s to explain.
  }
  const index = indexKnowledge(loadKnowledge(root).kb);
  const surveyed = index
    .routes()
    .filter((route) => index.evidenceFor(route.id).some((evidence) => evidence.type === 'browser'))
    .map((route) => route.path)
    .sort();

  const report: Omit<DiscoveryReport, 'nextSteps'> = {
    root,
    filesSeen: files.length,
    truncated,
    playwright: {
      config: configPath,
      facts,
      declared: declaredPlaywright(root),
    },
    tests: { specFiles: specs.length, folder },
    pageObjects: { classes, files: withClasses.length, folders: pomFolders },
    sources: {
      root: sourceRoot,
      filesRead: scan.files.length,
      findings,
      routes: [...new Set(counts.routes)].sort(),
      notes: scan.notes,
    },
    agents: { detected, instructionFiles },
    cue: {
      installed,
      version: manifestVersion,
      surveyedRoutes: surveyed,
      elements: index.allLocators().length,
    },
  };

  return { ...report, nextSteps: nextSteps(report, options.source) };
}

function mostCommonFolder(paths: readonly string[]): string | undefined {
  if (paths.length === 0) return undefined;
  const tally = new Map<string, number>();
  for (const path of paths) {
    const folder = path.includes('/') ? path.slice(0, path.indexOf('/')) : '.';
    tally.set(folder, (tally.get(folder) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

/** Only commands that exist, in the order a person would run them. */
function nextSteps(
  report: Omit<DiscoveryReport, 'nextSteps'>,
  source: string | undefined,
): string[] {
  const steps: string[] = [];
  const { cue, sources } = report;

  if (!cue.installed) steps.push('cue init');

  const supplies = sources.findings.some((finding) => finding.found > 0);
  if (supplies && cue.elements === 0) {
    steps.push(`cue extract --source ${source ?? '.'}`);
  }

  const unsurveyed = sources.routes.filter((route) => !cue.surveyedRoutes.includes(route));
  const concrete = unsurveyed.filter((route) => !/[[\]{}:]/.test(route));
  for (const route of concrete.slice(0, 3)) steps.push(surveyCommand(route));
  if (concrete.length > 3)
    steps.push(`…and ${String(concrete.length - 3)} more route(s) the source declares`);
  if (concrete.length === 0 && cue.surveyedRoutes.length === 0) steps.push(surveyCommand());

  if (report.tests.specFiles > 0 && cue.elements > 0) steps.push('cue check');

  steps.push('cue doctor');
  return steps;
}

// ------------------------------------------------------------------- output

const yes = '✓';
const no = '-';

export function formatDiscovery(report: DiscoveryReport): string {
  const lines: string[] = ['', `Cue discover — ${report.root}`, ''];

  lines.push('Playwright');
  if (report.playwright.config === undefined) {
    lines.push(
      `  ${no} no playwright.config found${report.playwright.declared ? ` (but @playwright/test ${report.playwright.declared} is declared)` : ''}`,
    );
  } else {
    const facts = report.playwright.facts;
    const bits = [
      facts?.testDir === undefined ? undefined : `testDir ${facts.testDir}`,
      facts !== undefined && facts.projects.length > 0
        ? `projects ${facts.projects.join(', ')}`
        : undefined,
      report.playwright.declared === undefined
        ? undefined
        : `@playwright/test ${report.playwright.declared}`,
    ].filter((bit): bit is string => bit !== undefined);
    lines.push(
      `  ${yes} ${report.playwright.config}${bits.length > 0 ? `   ${bits.join(' · ')}` : ''}`,
    );
    if (facts?.unreadable !== undefined) lines.push(`    (could not read it: ${facts.unreadable})`);
  }
  lines.push('');

  lines.push('Tests');
  lines.push(
    report.tests.specFiles === 0
      ? `  ${no} no *.spec / *.test files`
      : `  ${yes} ${String(report.tests.specFiles)} spec file(s)${report.tests.folder === undefined ? '' : ` (${report.tests.folder}/)`}`,
  );
  lines.push('');

  lines.push('Page objects');
  lines.push(
    report.pageObjects.classes === 0
      ? `  ${no} none found`
      : `  ${yes} ${String(report.pageObjects.classes)} class(es) in ${String(report.pageObjects.files)} file(s) (${report.pageObjects.folders.join(', ')})`,
  );
  lines.push('');

  lines.push(
    `What the source could tell Cue (${String(report.sources.filesRead)} file(s) read in ${report.sources.root})`,
  );
  for (const finding of report.sources.findings) {
    lines.push(
      finding.found > 0
        ? `  ${yes} ${finding.label.padEnd(28)} ${String(finding.found)} ${finding.unit}`
        : `  ${no} ${finding.label.padEnd(28)} none`,
    );
  }
  for (const note of report.sources.notes) lines.push(`    ${note}`);
  lines.push('');

  lines.push('Agent integrations');
  if (report.agents.detected.length === 0 && report.agents.instructionFiles.length === 0) {
    lines.push(`  ${no} none detected`);
  }
  for (const agent of report.agents.detected) {
    lines.push(`  ${yes} ${agent.name} (${agent.evidence.join(', ')})`);
  }
  if (report.agents.instructionFiles.length > 0) {
    lines.push(`  ${yes} instruction files: ${report.agents.instructionFiles.join(', ')}`);
  }
  lines.push('');

  lines.push('Cue here');
  lines.push(
    report.cue.installed
      ? `  ${yes} set up${report.cue.version === undefined ? '' : ` (${report.cue.version})`}`
      : `  ${no} not set up`,
  );
  lines.push(
    report.cue.elements > 0
      ? `  ${yes} .agent-kb knows ${String(report.cue.surveyedRoutes.length)} surveyed route(s), ${String(report.cue.elements)} element(s)`
      : `  ${no} .agent-kb knows nothing about the application yet`,
  );
  lines.push('');

  if (report.truncated) {
    lines.push(
      `! Looked at the first ${String(report.filesSeen)} files only; the repository is larger.`,
      '',
    );
  }

  lines.push('Suggested next steps');
  let number = 0;
  for (const step of report.nextSteps) {
    if (step.startsWith('…')) lines.push(`     ${step}`);
    else {
      number += 1;
      lines.push(`  ${String(number)}. ${step}`);
    }
  }
  lines.push('', 'Nothing was written.');
  return lines.join('\n');
}

/** A few lines for the top of `init`'s plan: what the plan is being made around. */
export function formatDiscoverySummary(report: DiscoveryReport): string {
  const found = [
    report.playwright.config === undefined
      ? 'no Playwright config'
      : `Playwright (${report.playwright.config})`,
    `${String(report.tests.specFiles)} spec file(s)`,
    `${String(report.pageObjects.classes)} page object(s)`,
    ...report.sources.findings
      .filter((f) => f.found > 0)
      .map((f) => `${String(f.found)} ${f.unit}`),
  ];
  return `Found: ${found.join(' · ')}. (cue discover shows the detail.)`;
}
