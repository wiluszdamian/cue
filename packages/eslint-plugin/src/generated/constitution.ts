// GENERATED FILE — do not edit.
//
// Source:    rules/constitution.yaml, rules/tags.yaml
// Regenerate: pnpm --filter @wiluszdamian/cue-eslint-plugin generate
//
// Committed on purpose: a constitution change shows up as a diff here in review,
// and the published package works without rules/.

import type { Constitution, TagSet } from '@wiluszdamian/cue-engine';

export const CONSTITUTION = {
  "schemaVersion": 1,
  "rules": [
    {
      "id": "no-hard-waits",
      "tier": "MUST_NOT",
      "severity": "error",
      "title": "No hard waits",
      "rationale": "waitForTimeout couples the test to wall-clock time rather than to application state. It is the largest single source of flake, and it costs the full timeout on every run — including the runs where the app was ready immediately.\n",
      "detector": {
        "kind": "ast",
        "selector": "CallExpression[callee.property.name='waitForTimeout']"
      },
      "scope": [
        "**/*.ts"
      ],
      "exclude": [
        "**/*.config.ts"
      ],
      "autofix": false,
      "message": "waitForTimeout waits on the clock, not on the app. Wait on the state you actually care about with a web-first assertion, which retries until the condition holds: await expect(locator).toBeVisible(), .toHaveText(), .toBeEnabled(). For a network round-trip, use await page.waitForResponse(...).\n",
      "skill": "canon",
      "docsAnchor": "no-hard-waits",
      "examples": {
        "bad": "await page.click('#submit');\nawait page.waitForTimeout(5000);\n",
        "good": "await page.getByRole('button', { name: 'Submit' }).click();\nawait expect(page.getByRole('status')).toHaveText('Saved');\n"
      },
      "since": "0.8.0",
      "deprecated": null
    },
    {
      "id": "web-first-assertions",
      "tier": "MUST",
      "severity": "error",
      "title": "Assert on locators, not on awaited values",
      "rationale": "expect(await locator.textContent()) samples the DOM once, at whatever moment the await resolved. If the app has not settled the test fails; if it settles a tick later the test still fails. Locator assertions retry until the timeout, which is what makes a test resilient rather than lucky.\n",
      "detector": {
        "kind": "ast",
        "selector": "CallExpression[callee.name='expect'] > AwaitExpression"
      },
      "scope": [
        "**/*.ts"
      ],
      "exclude": [],
      "autofix": false,
      "message": "Awaiting inside expect() takes a single snapshot and cannot retry. Pass the locator itself and let the matcher poll: await expect(locator).toHaveText('x') instead of expect(await locator.textContent()).toBe('x'). For values that are genuinely not locator-backed — an API response body, a computed total — use await expect.poll(() => ...).\n",
      "skill": "canon",
      "docsAnchor": "web-first-assertions",
      "examples": {
        "bad": "expect(await page.locator('.total').textContent()).toBe('42');",
        "good": "await expect(page.getByTestId('total')).toHaveText('42');"
      },
      "since": "0.8.0",
      "deprecated": null
    },
    {
      "id": "no-raw-selectors",
      "tier": "MUST_NOT",
      "severity": "error",
      "title": "No CSS or XPath selector strings",
      "rationale": "CSS and XPath strings bind tests to markup structure and to class names that a styling change can rename without warning. Role, label, and test-id locators bind to the contract the application actually promises its users.\n",
      "detector": {
        "kind": "ast",
        "selector": "CallExpression[callee.property.name=/^(locator|waitForSelector|click|dblclick|fill|type|press|check|uncheck|hover|focus|tap|selectOption|setInputFiles|dispatchEvent|textContent|innerText|innerHTML|getAttribute|inputValue|isVisible|isHidden|isEnabled|isDisabled|isChecked|isEditable|\\$|\\$\\$|\\$eval|\\$\\$eval)$/]",
        "refine": "first-argument-is-raw-selector"
      },
      "scope": [
        "**/*.ts"
      ],
      "exclude": [],
      "autofix": false,
      "message": "This is a CSS or XPath string. Prefer, in order: getByRole(...) — what the user sees and screen readers announce; then getByLabel / getByPlaceholder / getByText; then getByTestId(...) for anything with no accessible handle. Reach for locator() only for a stable semantic hook none of those can express, and confirm it exists in .agent-kb first.\n",
      "skill": "locator-policy",
      "docsAnchor": "no-raw-selectors",
      "examples": {
        "bad": "page.locator('div.card > button.primary')",
        "good": "page.getByRole('button', { name: 'Continue' })"
      },
      "since": "0.8.0",
      "deprecated": null
    },
    {
      "id": "no-locators-in-tests",
      "tier": "MUST_NOT",
      "severity": "error",
      "title": "Locators live in page objects, not in tests",
      "rationale": "A locator defined inline in a spec is invisible to every other spec. When the markup changes, the edit has to be found by grep across the suite rather than made once in the page object. Tests read as intent; page objects hold the addressing.\n",
      "detector": {
        "kind": "ast",
        "selector": "CallExpression[callee.property.name=/^(locator|getByRole|getByTestId|getByText|getByLabel|getByPlaceholder|getByTitle|getByAltText)$/]"
      },
      "scope": [
        "tests/**/*.ts"
      ],
      "exclude": [
        "tests/**/*.setup.ts"
      ],
      "autofix": false,
      "message": "Move this locator into the page object for the screen, expose it as a getter, and use it through the fixture: await loginPage.submitButton.click(). A spec file should name intent, not addressing. See the page-objects skill for the three-section locator layout.\n",
      "skill": "stage-map",
      "docsAnchor": "no-locators-in-tests",
      "examples": {
        "bad": "await page.getByRole('button', { name: 'Log in' }).click();",
        "good": "await loginPage.logInButton.click();"
      },
      "since": "0.8.0",
      "deprecated": null
    },
    {
      "id": "strict-zod-objects",
      "tier": "MUST",
      "severity": "error",
      "title": "API schemas must be strict",
      "rationale": "z.object ignores unknown keys. A contract test built on it keeps passing after the backend adds, renames, or misspells a field — precisely the regression the test existed to catch. z.strictObject fails on unknown keys, which makes the schema an actual assertion about the response.\n",
      "detector": {
        "kind": "ast",
        "selector": "CallExpression[callee.object.name='z'][callee.property.name='object']"
      },
      "scope": [
        "**/*.ts"
      ],
      "exclude": [],
      "autofix": true,
      "message": "Use z.strictObject({...}) so an unexpected field in the response fails the test instead of passing silently. If a payload legitimately carries keys you do not model, say so explicitly with .passthrough() and leave a comment naming the reason.\n",
      "skill": "wire-contract",
      "docsAnchor": "strict-zod-objects",
      "examples": {
        "bad": "const User = z.object({ id: z.string() });",
        "good": "const User = z.strictObject({ id: z.string() });"
      },
      "since": "0.8.0",
      "deprecated": null
    },
    {
      "id": "no-focused-tests",
      "tier": "MUST_NOT",
      "severity": "error",
      "title": "No focused tests",
      "rationale": "A .only committed to a shared branch silently reduces CI to a single test while still reporting green. This is the failure mode where the signal inverts: the worse the mistake, the healthier the build looks. Only a *call* counts: passing `it.only` around as a value, as test harnesses do, focuses nothing.\n",
      "detector": {
        "kind": "ast",
        "selector": "CallExpression[callee.object.name=/^(test|describe|it|suite)$/][callee.property.name='only']"
      },
      "scope": [
        "**/*.ts"
      ],
      "exclude": [],
      "autofix": false,
      "message": "Remove .only before committing. To run one test locally, use the CLI, which leaves no trace in the repo: npx playwright test path/to/spec.ts -g \"test title\".\n",
      "skill": "canon",
      "docsAnchor": "no-focused-tests",
      "examples": {
        "bad": "test.only('checkout succeeds', async () => {});",
        "good": "test('checkout succeeds', async () => {});"
      },
      "since": "0.8.0",
      "deprecated": null
    },
    {
      "id": "skips-need-a-reason",
      "tier": "MUST",
      "severity": "warn",
      "title": "A skipped test must say why and when it comes back",
      "rationale": "An unexplained skip is indistinguishable from lost coverage. Nobody un-skips a test whose reason nobody remembers, so it decays into a file that costs maintenance and buys nothing.\n",
      "detector": {
        "kind": "ast",
        "selector": "CallExpression[callee.object.name=/^(test|describe|it|suite)$/][callee.property.name=/^(skip|fixme|fail)$/]",
        "refine": "skip-lacks-issue-reference"
      },
      "scope": [
        "**/*.ts"
      ],
      "exclude": [],
      "autofix": false,
      "message": "Annotate the skip with an issue reference on the line above, e.g. // TODO(PROJ-1234) un-skip once the async refresh lands. A skip with an owner and a ticket is tracked debt; a bare skip is silent lost coverage. A conditional skip is better still: test.skip(!!process.env.CI, 'reason').\n",
      "skill": "canon",
      "docsAnchor": "skips-need-a-reason",
      "examples": {
        "bad": "test.skip('refund flow', async () => {});",
        "good": "// TODO(PROJ-1234) un-skip once the refund webhook is stubbed\ntest.skip('refund flow', async () => {});\n"
      },
      "since": "0.8.0",
      "deprecated": null
    },
    {
      "id": "require-test-tags",
      "tier": "MUST",
      "severity": "error",
      "title": "Every test carries a canonical tag",
      "rationale": "Tags are what let CI run a smoke subset on every push and the full suite nightly, and what keeps destructive tests out of shared environments via grep-invert. An untagged test either runs everywhere or nowhere, and both are wrong.\n",
      "detector": {
        "kind": "ast",
        "selector": "CallExpression[callee.name=/^(test|it)$/]",
        "refine": "test-lacks-canonical-tag"
      },
      "scope": [
        "tests/**/*.ts"
      ],
      "exclude": [
        "tests/**/*.setup.ts"
      ],
      "autofix": false,
      "message": "Add at least one canonical tag from rules/tags.yaml using the tag option: test('title', { tag: ['@smoke'] }, async ({ page }) => {}). Pick the narrowest tag that is true; @smoke is a promise that the test is fast and stable enough to gate every push.\n",
      "skill": "canon",
      "docsAnchor": "require-test-tags",
      "examples": {
        "bad": "test('user can log in', async ({ page }) => {});",
        "good": "test('user can log in', { tag: ['@smoke', '@auth'] }, async ({ page }) => {});"
      },
      "since": "0.8.0",
      "deprecated": null
    },
    {
      "id": "no-explicit-any",
      "tier": "MUST_NOT",
      "severity": "error",
      "title": "No explicit any",
      "rationale": "A test suite is the one codebase whose types are load-bearing for correctness rather than convenience: any on an API response turns a contract test into a test that the server returned something.\n",
      "detector": {
        "kind": "ast",
        "selector": "TSAnyKeyword"
      },
      "scope": [
        "**/*.ts"
      ],
      "exclude": [
        "**/*.d.ts"
      ],
      "autofix": false,
      "message": "Replace any with the real type. For a response body, infer it from the Zod schema: type User = z.infer<typeof UserSchema>. When a value is genuinely unknown at the boundary, use unknown and narrow it — unknown forces the narrowing that any lets you skip.\n",
      "skill": "strict-types",
      "docsAnchor": "no-explicit-any",
      "examples": {
        "bad": "const body: any = await response.json();",
        "good": "const body = UserSchema.parse(await response.json());"
      },
      "since": "0.8.0",
      "deprecated": null
    },
    {
      "id": "no-hardcoded-urls",
      "tier": "MUST_NOT",
      "severity": "warn",
      "title": "No hardcoded environment URLs",
      "rationale": "A literal host pins the test to one environment and leaks internal hostnames into a repository that may become public. baseURL belongs in playwright.config.ts, where the environment picks it.\n",
      "detector": {
        "kind": "regex",
        "pattern": "https?://(?!example\\.(com|org)\\b)[a-zA-Z0-9.-]+(:\\d+)?",
        "flags": "g"
      },
      "scope": [
        "tests/**/*.ts",
        "pages/**/*.ts",
        "fixtures/**/*.ts"
      ],
      "exclude": [],
      "autofix": false,
      "message": "Use a relative path and let baseURL resolve it: await page.goto('/login'). Set baseURL per project in playwright.config.ts from an env var. For API calls, use the request fixture's configured baseURL rather than a literal host.\n",
      "skill": "harness",
      "docsAnchor": "no-hardcoded-urls",
      "examples": {
        "bad": "await page.goto('https://staging.internal.acme.com/login');",
        "good": "await page.goto('/login');"
      },
      "since": "0.8.0",
      "deprecated": null
    },
    {
      "id": "selectors-from-agent-kb",
      "tier": "MUST",
      "severity": "warn",
      "title": "Selectors come from .agent-kb or from fresh exploration",
      "rationale": "This is the rule the whole knowledge-base layer exists to serve. A model asked for a selector it has never seen produces a plausible one, and a plausible selector fails at runtime in a way that reads like an application bug. A selector is a fact about the application, and facts have sources. It is checked against the .agent-kb found above the file, for getByRole, getByTestId and getByLabel with literal arguments: whether the locator is known, ambiguous, on the wrong route, stale or only inferred. What the code alone cannot decide is not judged — a variable, a regular expression, getByText, getByPlaceholder, a CSS locator — so a clean run does not mean those were checked. With no .agent-kb the rule stays silent in the linter; cue check says so out loud. It is a warning, not an error, until the false-positive rate on real suites is known.\n",
      "detector": {
        "kind": "knowledge",
        "check": "locators"
      },
      "scope": [
        "**/*.ts"
      ],
      "exclude": [],
      "autofix": false,
      "message": "This selector does not trace to .agent-kb/app-map/ or to an exploration run in this session. Use the nearest known locator suggested here, or run cue survey <url> for the page and use what it finds — do not guess. An entry marked stale is a lead to verify, not a fact to use.\n",
      "skill": "locator-policy",
      "docsAnchor": "selectors-from-agent-kb",
      "examples": {
        "bad": "page.getByTestId('submit-order-btn') // invented, not in .agent-kb",
        "good": "page.getByTestId('checkout-submit') // .agent-kb/app-map/checkout.yaml:31"
      },
      "since": "0.8.0",
      "deprecated": null
    }
  ]
} as unknown as Constitution;

export const TAGS = {
  "schemaVersion": 1,
  "tags": [
    {
      "name": "@smoke",
      "means": "Fast, stable, and gating. Runs on every push. Adding @smoke is a promise that this test will not flake and will not take minutes.\n",
      "ci": "every-push"
    },
    {
      "name": "@regression",
      "means": "Full-coverage test. Runs on the nightly and pre-release suites.",
      "ci": "nightly"
    },
    {
      "name": "@api",
      "means": "Exercises the API directly through the request fixture, no browser.",
      "ci": "every-push"
    },
    {
      "name": "@e2e",
      "means": "Crosses more than one system or persists state that outlives the test.",
      "ci": "nightly"
    },
    {
      "name": "@destructive",
      "means": "Mutates or deletes shared data. Excluded from shared environments by grep-invert in playwright.config.ts — never run this against production.\n",
      "ci": "isolated-env-only"
    },
    {
      "name": "@flaky",
      "means": "Known-unstable and quarantined. Temporary by definition: an @flaky tag with no linked issue is a bug in the process, not a state of the world.\n",
      "ci": "quarantine"
    }
  ]
} as unknown as TagSet;

export const CANONICAL_TAGS: readonly string[] = ["@smoke","@regression","@api","@e2e","@destructive","@flaky"];
