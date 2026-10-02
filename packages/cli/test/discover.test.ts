import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { survey, type SnapshotDriver } from '../src/survey.js';
import { discover, formatDiscovery, formatDiscoverySummary } from '../src/discover.js';
import { COMMANDS } from '../src/commands.js';
import { emptyManifest, writeManifest } from '../src/manifest.js';

let root: string;
let home: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cue-discover-'));
  home = mkdtempSync(join(tmpdir(), 'cue-home-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const write = (path: string, text: string, base = root): void => {
  const full = join(base, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, 'utf8');
};

const look = (options: { source?: string } = {}) =>
  discover({
    root,
    home,
    env: {},
    ...(options.source === undefined ? {} : { source: options.source }),
  });

/** Every file and what is in it, to prove nothing changed. */
function snapshotOf(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        result[path.slice(dir.length)] =
          `${createHash('sha256').update(readFileSync(path)).digest('hex')} ${String(statSync(path).mtimeMs)}`;
      }
    }
  };
  walk(dir);
  return result;
}

const CONFIG = `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  projects: [{ name: 'chromium' }, { name: 'firefox' }],
});
`;

function brownfield(): void {
  write('package.json', JSON.stringify({ devDependencies: { '@playwright/test': '^1.50.0' } }));
  write('playwright.config.ts', CONFIG);
  write(
    'e2e/login.spec.ts',
    "import { test } from '@playwright/test';\ntest('x', async () => {});\n",
  );
  write('e2e/cart.spec.ts', 'export {};\n');
  write('e2e/nested/pay.test.ts', 'export {};\n');
  write(
    'e2e/pages/login-page.ts',
    "import type { Page } from '@playwright/test';\nexport class LoginPage { constructor(private readonly page: Page) {} }\n",
  );
  write(
    'e2e/pages/cart-page.ts',
    "import type { Page } from '@playwright/test';\nexport class CartPage { constructor(readonly page: Page) {} }\nexport class CartRow { page: Page; }\n",
  );
  write('e2e/pages/helpers.ts', 'export const wait = 1;\n');
  write('src/Login.tsx', '<button data-testid="login-submit">Log in</button>\n');
  write(
    'openapi.json',
    JSON.stringify({ openapi: '3.0.0', paths: { '/api/cart': { get: {}, post: {} } } }),
  );
  // One entry to a line: the shape the label reader understands today.
  write('locales/en.json', '{\n  "cart.title": "Your cart"\n}\n');
}

describe('an empty repository', () => {
  it('finds nothing, says so, and suggests starting at the beginning', () => {
    const report = look();
    expect(report.playwright.config).toBeUndefined();
    expect(report.tests.specFiles).toBe(0);
    expect(report.pageObjects.classes).toBe(0);
    expect(report.sources.findings.every((f) => f.found === 0)).toBe(true);
    expect(report.cue).toMatchObject({ installed: false, elements: 0 });
    expect(report.nextSteps).toEqual(['cue init', 'cue survey <url>', 'cue doctor']);

    const text = formatDiscovery(report);
    expect(text).toContain('- no playwright.config found');
    expect(text).toContain('- none found');
    expect(text).toContain('Nothing was written.');
  });
});

describe('an existing Playwright repository', () => {
  beforeEach(brownfield);

  it('reads the config without running it', () => {
    const { playwright } = look();
    expect(playwright.config).toBe('playwright.config.ts');
    expect(playwright.facts).toEqual({ testDir: './e2e', projects: ['chromium', 'firefox'] });
    expect(playwright.declared).toBe('^1.50.0');
  });

  it('counts spec files wherever they are, and names the folder the config points at', () => {
    expect(look().tests).toEqual({ specFiles: 3, folder: 'e2e' });
  });

  it('counts page object classes, not files that sit in a pages folder', () => {
    const { pageObjects } = look();
    expect(pageObjects).toEqual({ classes: 3, files: 2, folders: ['e2e/pages'] });
  });

  it('says what the source could supply, with counts', () => {
    const { findings } = look().sources;
    const found = Object.fromEntries(findings.map((f) => [f.id, f.found]));
    expect(found).toEqual({ 'test-ids': 1, routes: 0, openapi: 2, i18n: 1 });
  });

  it('suggests initialising, extracting, and looking at the pages', () => {
    expect(look().nextSteps).toEqual([
      'cue init',
      'cue extract --source .',
      'cue survey <url>',
      'cue doctor',
    ]);
  });

  it('shows all of it in the text a person reads', () => {
    const text = formatDiscovery(look());
    expect(text).toContain(
      '✓ playwright.config.ts   testDir ./e2e · projects chromium, firefox · @playwright/test ^1.50.0',
    );
    expect(text).toContain('✓ 3 spec file(s) (e2e/)');
    expect(text).toContain('✓ 3 class(es) in 2 file(s) (e2e/pages)');
    expect(text).toContain('✓ data-testid attributes       1 test id(s)');
    expect(text).toContain('- routes (Next.js)             none');
  });

  it('sums itself up in a line for the top of init’s plan', () => {
    expect(formatDiscoverySummary(look())).toBe(
      'Found: Playwright (playwright.config.ts) · 3 spec file(s) · 3 page object(s) · 1 test id(s) · 2 endpoint(s) · 1 label(s). (cue discover shows the detail.)',
    );
  });
});

describe('only looking', () => {
  it('changes nothing: not a file, not its contents, not its time', () => {
    brownfield();
    write('.claude/settings.json', '{}');
    write('CLAUDE.md', '# notes\n');
    const before = snapshotOf(root);
    const after = (() => {
      look();
      formatDiscovery(look());
      return snapshotOf(root);
    })();
    expect(after).toEqual(before);
  });

  it('does not create .agent-kb, .cue or anything else', () => {
    brownfield();
    look();
    expect(existsSync(join(root, '.agent-kb'))).toBe(false);
    expect(existsSync(join(root, '.cue'))).toBe(false);
  });

  it('never runs the Playwright config', () => {
    write(
      'playwright.config.ts',
      "require('node:fs').writeFileSync('ran.txt', 'x');\nexport default { testDir: 'e2e' };\n",
    );
    look();
    expect(existsSync(join(root, 'ran.txt'))).toBe(false);
  });
});

describe('agents and what is already set up', () => {
  it('lists the agents it can see, and the instruction files that exist', () => {
    write('.claude/settings.json', '{}');
    write('CLAUDE.md', '# x\n');
    write('AGENTS.md', '# y\n');
    write('.github/copilot-instructions.md', '# z\n');
    const { agents } = look();
    expect(agents.detected.map((a) => a.name)).toEqual(['Claude Code']);
    expect(agents.instructionFiles).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      '.github/copilot-instructions.md',
    ]);
  });

  it('notices a project that already has Cue and a knowledge base, and suggests checking', () => {
    brownfield();
    writeManifest(root, emptyManifest('0.8.0', 'pnpm'));
    const snapshot = readFileSync(
      join(
        import.meta.dirname,
        '..',
        '..',
        'engine',
        'test',
        'snapshots',
        'playwright-cli@0.1.22',
        'login.txt',
      ),
      'utf8',
    );
    const driver: SnapshotDriver = { capture: () => ({ ok: true, output: snapshot }) };
    survey({ projectRoot: root, url: 'http://app.test/login', driver });

    const report = look();
    expect(report.cue.surveyedRoutes).toEqual(['/login']);
    expect(report.cue.elements).toBeGreaterThan(0);
    expect(report.nextSteps).not.toContain('cue init');
    expect(report.nextSteps).not.toContain('cue extract --source .');
    expect(report.nextSteps).toContain('cue check');
    expect(formatDiscovery(report)).toContain('.agent-kb knows 1 surveyed route(s)');
  });
});

describe('a product that lives somewhere else', () => {
  it('reads the source from --source and the tests from here', () => {
    const product = mkdtempSync(join(tmpdir(), 'cue-product-'));
    try {
      write('playwright.config.ts', CONFIG);
      write('e2e/a.spec.ts', 'export {};\n');
      write('next.config.js', 'module.exports = {};\n', product);
      write('app/billing/page.tsx', 'x', product);
      write('app/login/page.tsx', 'x', product);
      write('app/items/[id]/page.tsx', 'x', product);
      write('src/B.tsx', '<i data-testid="billing-pay" />', product);

      const report = look({ source: product });
      expect(report.tests.specFiles).toBe(1);
      expect(report.sources.root).toBe(product);
      expect(report.sources.routes).toEqual(['/billing', '/items/[id]', '/login']);
      // A route with a parameter is not offered: there is no page for it until it has a value.
      expect(report.nextSteps).toEqual([
        'cue init',
        `cue extract --source ${product}`,
        'cue survey --route /billing --base-url <url>',
        'cue survey --route /login --base-url <url>',
        'cue doctor',
      ]);
    } finally {
      rmSync(product, { recursive: true, force: true });
    }
  });

  it('offers a handful of routes and says how many more there are', () => {
    write('next.config.js', 'module.exports = {};\n');
    for (const name of ['a', 'b', 'c', 'd', 'e']) write(`app/${name}/page.tsx`, 'x');
    const steps = look().nextSteps;
    expect(steps.filter((s) => s.startsWith('cue survey --route'))).toHaveLength(3);
    expect(steps).toContain('…and 2 more route(s) the source declares');
  });
});

describe('things that go wrong', () => {
  it('says a config it cannot read could not be read, and carries on', () => {
    write('playwright.config.ts', 'this is { not ( code');
    write('e2e/a.spec.ts', 'export {};\n');
    const report = look();
    expect(report.playwright.config).toBe('playwright.config.ts');
    expect(report.playwright.facts?.unreadable).toBeDefined();
    expect(formatDiscovery(report)).toContain('(could not read it:');
    expect(report.tests.specFiles).toBe(1);
  });

  it('prefers the config nearest the root in a monorepo', () => {
    write('packages/web/playwright.config.ts', "export default { testDir: 'deep' };\n");
    write('playwright.config.ts', "export default { testDir: 'top' };\n");
    expect(look().playwright.facts?.testDir).toBe('top');
  });

  it('keeps out of node_modules and build output', () => {
    write('node_modules/pkg/x.spec.ts', 'export {};\n');
    write('dist/y.spec.ts', 'export {};\n');
    write('e2e/real.spec.ts', 'export {};\n');
    expect(look().tests.specFiles).toBe(1);
  });
});

describe('the command', () => {
  it('is registered, so advice that names it can be honoured', () => {
    expect(COMMANDS).toContain('discover');
  });
});

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

describe.skipIf(!existsSync(CLI))('the built command', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args, '--cwd', root], { encoding: 'utf8', input: '' });

  it('prints what it found and exits 0, writing nothing', () => {
    brownfield();
    const before = snapshotOf(root);
    const result = run('discover');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Cue discover');
    expect(result.stdout).toContain('Suggested next steps');
    expect(snapshotOf(root)).toEqual(before);
  });

  it('prints the report as JSON with --json', () => {
    brownfield();
    const report = JSON.parse(run('discover', '--json').stdout) as {
      tests: { specFiles: number };
      nextSteps: string[];
    };
    expect(report.tests.specFiles).toBe(3);
    expect(report.nextSteps[0]).toBe('cue init');
  });

  it('starts init’s plan with a line about what was found, before anything is written', () => {
    brownfield();
    const before = snapshotOf(root);
    const result = run('init');
    // No terminal and no --yes: it shows the plan and applies nothing.
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/^\s*Found: Playwright \(playwright\.config\.ts\)/);
    expect(snapshotOf(root)).toEqual(before);
  });
});
