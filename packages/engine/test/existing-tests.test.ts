import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extract } from '../src/agent-kb/extract/run.js';
import { readExistingTests } from '../src/agent-kb/extract/tests.js';
import {
  analyzeLocators,
  hashSnapshot,
  indexKnowledge,
  loadKnowledge,
  parseSnapshot,
  validateKnowledge,
  writeRouteMap,
  type KnowledgeBase,
} from '../src/index.js';

/**
 * What the suite already says is evidence, and never more. These tests pin the three
 * things that keep it that way: it starts inferred, a survey can raise it and the tests
 * alone never can, and where the two disagree the disagreement is kept.
 */

const SETTINGS_PAGE = `// cue-route: /settings
import type { Page } from '@playwright/test';

export class SettingsPage {
  constructor(private readonly page: Page) {}

  get newPassword() {
    return this.page.getByRole('textbox', { name: 'New password' });
  }
  get changeButton() {
    return this.page.getByRole('button', { name: 'Change password' });
  }

  async open() {
    await this.page.goto('/settings');
  }

  async changePassword(value: string) {
    await this.newPassword.fill(value);
    await this.changeButton.click();
  }

  private async scroll() {
    await this.page.getByRole('button', { name: 'Hidden helper' }).click();
  }
}
`;

const LOGIN_SPEC = `import { test } from '@playwright/test';

test('logs in', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'log in' }).click();
  await page.getByTestId('only-a-test-id').click();
});

test('somewhere unknown', async ({ page }) => {
  await page.getByRole('button', { name: 'Orphan' }).click();
});
`;

const file = (path: string, text: string) => ({ path, lines: text.split('\n'), hash: 'h' });

let product: string;
let project: string;

function write(root: string, path: string, content: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

beforeEach(() => {
  product = mkdtempSync(join(tmpdir(), 'cue-tests-product-'));
  project = mkdtempSync(join(tmpdir(), 'cue-tests-project-'));
  write(product, 'pages/settings-page.ts', SETTINGS_PAGE);
  write(product, 'tests/login.spec.ts', LOGIN_SPEC);
});

afterEach(() => {
  rmSync(product, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

describe('reading a page object', () => {
  const read = readExistingTests(file('pages/settings-page.ts', SETTINGS_PAGE));

  it('records the role locators with the page they are on and the method they sit in', () => {
    expect(read.locators).toEqual([
      expect.objectContaining({
        route: '/settings',
        role: 'textbox',
        name: 'New password',
        origin: 'page-object',
        symbol: 'SettingsPage.newPassword',
        source: 'pages/settings-page.ts:8',
      }),
      expect.objectContaining({
        route: '/settings',
        role: 'button',
        name: 'Change password',
        origin: 'page-object',
      }),
      expect.objectContaining({ name: 'Hidden helper', symbol: 'SettingsPage.scroll' }),
    ]);
  });

  it('turns a public method into an action, following this.x into its getters', () => {
    expect(read.actions).toEqual([
      {
        route: '/settings',
        intent: 'change password',
        symbol: 'SettingsPage.changePassword',
        source: 'pages/settings-page.ts:18',
        locators: [
          "getByRole('textbox', { name: 'New password' })",
          "getByRole('button', { name: 'Change password' })",
        ],
      },
    ]);
  });

  it('does not make an action of a method that only navigates, or of a private one', () => {
    const names = read.actions.map((a) => a.symbol);
    expect(names).not.toContain('SettingsPage.open');
    expect(names).not.toContain('SettingsPage.scroll');
  });
});

describe('reading a spec', () => {
  const read = readExistingTests(file('tests/login.spec.ts', LOGIN_SPEC));

  it('records a role locator after a goto, as coming from a test', () => {
    expect(read.locators).toEqual([
      expect.objectContaining({
        route: '/login',
        role: 'button',
        name: 'log in',
        origin: 'existing-test',
      }),
    ]);
  });

  it('leaves out what the knowledge base cannot hold, and says what had no page', () => {
    expect(read.locators.map((l) => l.name)).not.toContain('Orphan');
    expect(read.gaps.join(' ')).toContain('1 role locator(s) had no page to attach to');
  });
});

describe('extract and load', () => {
  const run = () => extract({ projectRoot: project, sourceRoot: product });
  const load = () => loadKnowledge(project);

  it('writes from-tests.yaml and says how much it found', () => {
    const result = run();
    expect(result.adapters).toContain('existing-tests');
    expect(result.fromTests).toEqual({ locators: 4, actions: 1 });
    expect(existsSync(join(project, '.agent-kb', 'product', 'from-tests.yaml'))).toBe(true);
  });

  it('loads every one of them as inferred, citing the test or page object', () => {
    run();
    const { kb, issues } = load();
    expect(issues).toEqual([]);
    const index = indexKnowledge(kb);

    const locators = index.allLocators();
    expect(locators.length).toBe(4);
    for (const locator of locators) {
      expect(locator.status).toBe('inferred');
      const types = index.evidenceFor(locator.id).map((e) => e.type);
      expect(types.every((t) => t === 'existing-test' || t === 'page-object')).toBe(true);
    }
    const [action] = index.actions();
    expect(action).toMatchObject({ intent: 'change password', status: 'inferred' });
    expect(index.fact(action?.locator ?? '')?.kind).toBe('locator');
  });

  it('never calls anything verified or observed on the strength of tests alone', () => {
    run();
    const { kb } = load();
    expect(kb.facts.every((fact) => fact.status === 'inferred')).toBe(true);
  });

  it('forgets claims the suite no longer makes', () => {
    run();
    rmSync(join(product, 'pages'), { recursive: true });
    rmSync(join(product, 'tests'), { recursive: true });
    run();
    expect(existsSync(join(project, '.agent-kb', 'product', 'from-tests.yaml'))).toBe(false);
  });
});

describe('a survey of the same element', () => {
  const SNAPSHOT = `### Page
- Page URL: http://localhost:3000/login
- Page Title: Sign in
### Snapshot
\`\`\`yaml
- main [ref=e2]:
  - button "Log in" [ref=e7]
\`\`\`
`;

  function survey(): void {
    const parsed = parseSnapshot(SNAPSHOT);
    const now = new Date().toISOString();
    writeRouteMap(project, {
      schemaVersion: 1,
      route: '/login',
      title: parsed.title,
      exploredAt: now,
      verifiedAt: now,
      snapshotHash: hashSnapshot(parsed.tree),
      elements: [...parsed.elements],
      links: [],
      gaps: [],
    });
  }

  it('raises it, and keeps the test as one more reason', () => {
    extract({ projectRoot: project, sourceRoot: product });
    survey();
    const index = indexKnowledge(loadKnowledge(project).kb);
    const login = index.allLocators().find((l) => l.route === 'route:/login');
    expect(login?.status).not.toBe('inferred');
    const types = index.evidenceFor(login?.id ?? '').map((e) => e.type);
    expect(types).toContain('browser');
    expect(types).toContain('existing-test');
  });

  it('keeps the disagreement when the test and the page spell the element differently', () => {
    extract({ projectRoot: project, sourceRoot: product });
    survey();
    const { kb } = loadKnowledge(project);
    const conflict = kb.conflicts?.find((c) => c.field === 'expression');
    expect(conflict?.factId).toContain('locator:/login#button:');
    expect(conflict?.values.map((v) => v.value)).toEqual(
      expect.arrayContaining([
        "getByRole('button', { name: 'Log in' })",
        "getByRole('button', { name: 'log in' })",
      ]),
    );
  });

  it('leaves untouched what only the tests mention', () => {
    extract({ projectRoot: project, sourceRoot: product });
    survey();
    const index = indexKnowledge(loadKnowledge(project).kb);
    const settings = index.allLocators().find((l) => l.route === 'route:/settings');
    expect(settings?.status).toBe('inferred');
  });
});

describe('judging a test against what the tests said', () => {
  it('does not let a locator vouch for itself', () => {
    extract({ projectRoot: project, sourceRoot: product });
    const index = indexKnowledge(loadKnowledge(project).kb);
    const findings = analyzeLocators({
      filePath: 'tests/again.spec.ts',
      source:
        "await page.goto('/settings');\nawait page.getByRole('button', { name: 'Change password' }).click();\n",
      index,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.verdict).toBe('unverified');
  });
});

describe('the rule behind it', () => {
  const base: KnowledgeBase = {
    modelVersion: 1,
    evidence: [{ id: 'e1', type: 'existing-test', file: 'a.spec.ts', line: 1 }],
    facts: [
      {
        id: 'route:/x',
        kind: 'route',
        path: '/x',
        status: 'verified',
        evidence: ['e1'],
        verifiedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
  };

  it('refuses verified on the strength of a test alone', () => {
    const issues = validateKnowledge(base);
    expect(issues.map((i) => i.code)).toContain('verified-on-inference');
    expect(issues[0]?.message).toContain('only existing tests stand behind it');
  });

  it('refuses observed on the strength of a test alone', () => {
    const kb: KnowledgeBase = {
      ...base,
      facts: base.facts.map((f) => ({ ...f, status: 'observed' as const })),
    };
    expect(validateKnowledge(kb).map((i) => i.code)).toContain('status-above-inference');
  });

  it('accepts it once something other than a test agrees', () => {
    const kb: KnowledgeBase = {
      ...base,
      evidence: [...base.evidence, { id: 'e2', type: 'browser', route: '/x' }],
      facts: base.facts.map((f) => ({ ...f, evidence: ['e1', 'e2'] })),
    };
    expect(validateKnowledge(kb)).toEqual([]);
  });
});
