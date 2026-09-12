import type { DesiredFile } from '../install.js';
import { ciInstallCommand, execCommand, setupNodeCache } from '../package-manager.js';
import type { TargetContext } from './types.js';

/**
 * The Playwright suite skeleton.
 *
 * Several constitution rules are scoped to directories — `no-locators-in-tests`
 * to `tests/**`, `no-hardcoded-urls` to `pages/**` and `fixtures/**` — so until
 * something creates that layout the rules describe a structure nobody has. This
 * is that something.
 *
 * Everything here must pass the constitution it ships alongside. A scaffold that
 * violates its own rules on the first `lint` teaches the reader that the rules
 * are decorative, and no amount of documentation recovers from that.
 * `test/scaffold.test.ts` runs the engine over every generated file to keep it
 * honest.
 *
 * It is written to be edited. The example page object and spec exist to show the
 * shape — three locator sections, intent in the spec and addressing in the page
 * object — not because anybody's application has a login page exactly like this.
 */

const PLAYWRIGHT_CONFIG = `import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

/**
 * Options that belong to the environment live here, never in a spec. That is
 * what lets the same suite run against local, CI and staging without a diff.
 */
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  // Fail the build if a test was left focused. Locally .only is convenient; in
  // CI it silently reduces the suite to one test and still reports green.
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? '50%' : undefined,
  reporter: isCI
    ? [['blob'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,
    // Artefacts on failure only: always-on tracing makes every run slow and
    // every artefact store expensive, and the passing runs are not the ones
    // anybody opens.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Destructive tests mutate or delete shared data. Excluding them by default
  // means running the suite against a shared environment cannot quietly wreck
  // it; opt in with \`--grep @destructive\` on an isolated one.
  grepInvert: process.env.ALLOW_DESTRUCTIVE ? undefined : /@destructive/,

  projects: [
    // Authentication runs once and hands its storage state to everything else,
    // rather than every test logging in through the UI.
    { name: 'setup', testMatch: /.*\\.setup\\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], storageState: '.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
});
`;

const TEST_OPTIONS = `import { mergeTests } from '@playwright/test';
import { test as pageObjects } from './pom/page-object-fixture.js';
import { test as api } from './api/request-fixture.js';

/**
 * The single import point.
 *
 * Every spec imports \`test\` and \`expect\` from here and from nowhere else. Two
 * ways to reach a fixture means two places to change one, and the second one is
 * always the one somebody forgets.
 */
export const test = mergeTests(pageObjects, api);
export { expect } from '@playwright/test';
`;

const PAGE_OBJECT_FIXTURE = `import { test as base } from '@playwright/test';
import { LoginPage } from '../../pages/app/login.page.js';

/**
 * Page objects arrive by injection, not by construction inside a spec. A spec
 * that builds its own page object has to know how to build it, which is exactly
 * the detail the page object exists to hide.
 */
export interface PageObjects {
  loginPage: LoginPage;
}

export const test = base.extend<PageObjects>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
});
`;

const REQUEST_FIXTURE = `import { test as base, type APIRequestContext } from '@playwright/test';

export interface ApiFixtures {
  /** Pre-configured request context. baseURL comes from the config. */
  api: APIRequestContext;
}

/**
 * API tests go through this rather than through a bare \`request\`, so that auth
 * headers and the base URL are decided once.
 */
export const test = base.extend<ApiFixtures>({
  api: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      extraHTTPHeaders: process.env.API_TOKEN
        ? { Authorization: \`Bearer \${process.env.API_TOKEN}\` }
        : {},
    });
    await use(context);
    await context.dispose();
  },
});
`;

const LOGIN_PAGE = `import type { Locator, Page } from '@playwright/test';

/**
 * A page object in the house style.
 *
 * Locators are exposed as getters in three sections — inputs, actions, feedback
 * — so that the reader can find what they need without reading the whole class,
 * and so that the feedback locators (the ones assertions use) are not buried
 * among the ones interactions use.
 *
 * Every selector here should trace to \`.agent-kb\`. This file is a template, so
 * these are placeholders: replace them with the ids your application actually
 * has, from \`understudy survey\` or \`understudy extract\`.
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    // Relative: the environment decides the host, via baseURL in the config.
    await this.page.goto('/login');
  }

  // --- inputs ---------------------------------------------------------------

  get emailField(): Locator {
    return this.page.getByLabel('Email');
  }

  get passwordField(): Locator {
    return this.page.getByLabel('Password');
  }

  // --- actions --------------------------------------------------------------

  get logInButton(): Locator {
    return this.page.getByRole('button', { name: 'Log in' });
  }

  // --- feedback -------------------------------------------------------------

  get errorMessage(): Locator {
    return this.page.getByRole('alert');
  }

  get welcomeHeading(): Locator {
    return this.page.getByRole('heading', { name: /welcome/i });
  }

  // --- composed actions -----------------------------------------------------

  async logIn(email: string, password: string): Promise<void> {
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
    await this.logInButton.click();
  }
}
`;

const AUTH_SETUP = `import { test as setup } from '@playwright/test';
import { LoginPage } from '../../pages/app/login.page.js';

const STORAGE_STATE = '.auth/user.json';

/**
 * Runs once, before everything else, and saves the signed-in state to disk.
 *
 * The alternative — logging in through the UI at the start of every test — turns
 * one flaky login into a suite-wide outage, and spends most of the run time on
 * the one journey already covered by its own test.
 *
 * Setup files are exempt from the tagging and locator rules: this is plumbing,
 * not a test.
 */
setup('authenticate', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.logIn(
    process.env.TEST_USER_EMAIL ?? 'user@example.com',
    process.env.TEST_USER_PASSWORD ?? 'password',
  );
  await page.context().storageState({ path: STORAGE_STATE });
});
`;

const EXAMPLE_SPEC = `import { expect, test } from '../../../fixtures/pom/test-options.js';

/**
 * The shape a spec should have: intent here, addressing in the page object.
 *
 * Delete this once you have real tests — it is a template, and it asserts
 * against a login page your application probably does not have.
 */
test.describe('sign in', () => {
  test('a known user reaches their dashboard', { tag: ['@smoke', '@auth'] }, async ({
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.logIn('user@example.com', 'correct-horse-battery-staple');

    // A web-first assertion: it retries until the heading appears or the timeout
    // expires, rather than sampling the DOM once and hoping.
    await expect(loginPage.welcomeHeading).toBeVisible();
  });

  test('a wrong password is refused', { tag: ['@regression', '@auth'] }, async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.logIn('user@example.com', 'wrong');

    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.welcomeHeading).toBeHidden();
  });
});
`;

const INVALID_VALUES = `/**
 * Values that should be rejected wherever they are accepted.
 *
 * Shared rather than re-invented per test: a negative case everybody writes
 * slightly differently is a negative case nobody can audit.
 */
export const INVALID_EMAILS = [
  '',
  ' ',
  'not-an-email',
  '@example.com',
  'user@',
  'user@@example.com',
  \`\${'a'.repeat(256)}@example.com\`,
] as const;

export const INVALID_PASSWORDS = ['', ' ', 'short'] as const;

/** Strings that have historically broken form handling somewhere. */
export const HOSTILE_STRINGS = [
  "'; DROP TABLE users; --",
  '<script>alert(1)</script>',
  '../../etc/passwd',
  '𝓊𝓃𝒾𝒸𝑜𝒹𝑒',
  '\\u0000',
] as const;
`;

const ENV_EXAMPLE = `# Copy to .env and fill in. .env is gitignored; this file is not.
BASE_URL=http://localhost:3000

TEST_USER_EMAIL=user@example.com
TEST_USER_PASSWORD=change-me

# Optional: bearer token for API tests.
# API_TOKEN=

# Set to run @destructive tests. Never set this against a shared environment.
# ALLOW_DESTRUCTIVE=1
`;

function testsWorkflow(context: TargetContext): string {
  const pm = context.packageManager;
  const cache = setupNodeCache(pm);
  const setup = cache
    ? `      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: ${cache}`
    : '      - uses: oven-sh/setup-bun@v2';
  return `name: tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
${setup}

      - run: ${ciInstallCommand(pm)}
      # Browsers are installed by an explicit step, never a postinstall hook:
      # bun does not run postinstall for untrusted packages, and a setup that
      # depends on it works for three package managers and fails for the fourth.
      - run: ${execCommand(pm, 'playwright install --with-deps')}

      - run: ${execCommand(pm, 'playwright test')} --shard=\${{ matrix.shard }}/2
        env:
          BASE_URL: \${{ vars.BASE_URL }}
          TEST_USER_EMAIL: \${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: \${{ secrets.TEST_USER_PASSWORD }}

      - uses: actions/upload-artifact@v4
        if: \${{ !cancelled() }}
        with:
          name: blob-report-\${{ matrix.shard }}
          path: blob-report/
          retention-days: 7

  report:
    # One HTML report from every shard, so a failure is read in one place.
    if: \${{ !cancelled() }}
    needs: [test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
${setup}
      - run: ${ciInstallCommand(pm)}
      - uses: actions/download-artifact@v5
        with:
          path: all-blob-reports
          pattern: blob-report-*
          merge-multiple: true
      - run: ${execCommand(pm, 'playwright merge-reports')} --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v4
        with:
          name: html-report
          path: playwright-report/
          retention-days: 14
`;
}

function understudyWorkflow(context: TargetContext): string {
  const pm = context.packageManager;
  const cache = setupNodeCache(pm);
  const setup = cache
    ? `      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: ${cache}`
    : '      - uses: oven-sh/setup-bun@v2';
  return `name: understudy

on:
  push:
    branches: [main]
  pull_request:

jobs:
  guardrails:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
${setup}
      - run: ${ciInstallCommand(pm)}

      # The mechanical guarantee. Everything else here is advisory; this is not.
      - name: Constitution
        run: ${execCommand(pm, 'eslint .')}

      # Is the wiring still intact? Fails only on errors, never on warnings.
      - name: Environment
        run: ${execCommand(pm, 'understudy doctor --ci')}

      # Did the rules move without this project regenerating?
      - name: Drift
        run: ${execCommand(pm, 'understudy sync --check')}
`;
}

function testingMd(context: TargetContext): string {
  const pm = context.packageManager;
  return `# Testing

This suite was scaffolded by [Understudy](https://github.com/understudy-dev/understudy).
It is a starting shape, not a finished suite — the login page and example specs
are templates to replace.

## Running

\`\`\`bash
${execCommand(pm, 'playwright install --with-deps')}
cp env/.env.example .env
${execCommand(pm, 'playwright test')}
\`\`\`

Fill in \`.env\` after copying it. To run only the fast, gating subset:

\`\`\`bash
${execCommand(pm, 'playwright test')} --grep @smoke
\`\`\`

## The layout, and why

| Path | Holds |
| --- | --- |
| \`tests/app/{api,functional,e2e}/\` | specs — intent only |
| \`pages/app/\`, \`pages/components/\` | page objects — all addressing |
| \`fixtures/pom/test-options.ts\` | **the only place a spec imports \`test\` from** |
| \`test-data/static/\`, \`test-data/factories/\` | shared inputs |
| \`.agent-kb/\` | what is known about the application under test |

A spec names what a user does. A page object knows how to reach it. That split is
what makes a markup change one edit instead of a grep across the suite.

## Rules that are enforced, not suggested

\`${execCommand(pm, 'eslint .')}\` runs the project constitution. A violation fails the build rather
than the review, and the message says what to do instead:

\`\`\`bash
${execCommand(pm, 'understudy explain no-hard-waits')}
\`\`\`

## Selectors

Never invent one. Every selector traces to \`.agent-kb/\`, populated by
\`understudy survey\` (the running app) and \`understudy extract\` (the product
source). A plausible-but-wrong selector fails at runtime in a way that reads like
an application bug, which is the most expensive kind of wrong.

## Tags

Every test carries one, from \`@smoke\`, \`@regression\`, \`@api\`, \`@e2e\`,
\`@destructive\`, \`@flaky\`. \`@smoke\` is a promise the test is fast and stable
enough to gate every push. \`@destructive\` is excluded by default and must never
run against a shared environment.
`;
}

const LINTSTAGED = `{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yaml,yml}": ["prettier --write"]
}
`;

const PRE_COMMIT = `npx lint-staged
`;

/**
 * The scaffold's own `.gitignore` additions. Kept in the baseline region so that
 * removal stays exact.
 */
export const SCAFFOLD_GITIGNORE = `
# Playwright
test-results/
playwright-report/
blob-report/
playwright/.cache/

# Signed-in state produced by tests/app/auth.setup.ts. Never commit it: it is a
# live session.
.auth/

# Real environment files. env/.env.example is committed; nothing else is.
.env
env/.env.*
!env/.env.example
`;

export function scaffoldFiles(context: TargetContext): DesiredFile[] {
  const file = (path: string, content: string, reason: string): DesiredFile => ({
    path,
    target: 'agents',
    content,
    reason,
  });

  return [
    file(
      'playwright.config.ts',
      PLAYWRIGHT_CONFIG,
      'projects, artefacts, and the destructive-test guard',
    ),
    file('fixtures/pom/test-options.ts', TEST_OPTIONS, 'the single import point for every spec'),
    file('fixtures/pom/page-object-fixture.ts', PAGE_OBJECT_FIXTURE, 'page objects by injection'),
    file(
      'fixtures/api/request-fixture.ts',
      REQUEST_FIXTURE,
      'a configured request context for API tests',
    ),
    file(
      'pages/app/login.page.ts',
      LOGIN_PAGE,
      'a page object in the house style — three locator sections',
    ),
    file('tests/app/auth.setup.ts', AUTH_SETUP, 'log in once, reuse the state everywhere'),
    file('tests/app/functional/login.spec.ts', EXAMPLE_SPEC, 'the shape a spec should have'),
    file('test-data/static/util/invalid-values.ts', INVALID_VALUES, 'shared negative-case inputs'),
    file('env/.env.example', ENV_EXAMPLE, 'the environment contract, committed'),
    file('.lintstagedrc.json', LINTSTAGED, 'lint what is being committed, not the whole tree'),
    file(
      '.husky/pre-commit',
      PRE_COMMIT,
      'the constitution runs before a commit, not after review',
    ),
    file(
      '.github/workflows/tests.yml',
      testsWorkflow(context),
      'sharded runs, merged into one report',
    ),
    file(
      '.github/workflows/understudy.yml',
      understudyWorkflow(context),
      'constitution, environment and drift in CI',
    ),
    file('TESTING.md', testingMd(context), 'how to run the suite, and why it is laid out this way'),
  ];
}
