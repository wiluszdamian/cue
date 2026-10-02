# All the rules

_Every rule Understudy checks, why it exists, and what to write instead._

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

These are the rules Understudy owns outright. Everything else — how to drive the
browser, how to debug a test, how to handle Electron or i18n — belongs to another
source; see [Who decides what](ownership.md) for who owns what.

11 of 11 rules are mechanically
enforced by `@understudy/eslint-plugin`. The rest are stated here and checked in
review. That split is deliberate and published, because a standard that overstates
its own teeth stops being believed.

## Enforced

| Rule                                                          | Tier     | Severity | Checked by | Fix |                                                         |
| ------------------------------------------------------------- | -------- | -------- | ---------- | --- | ------------------------------------------------------- |
| [`no-hard-waits`](rules/no-hard-waits.md)                     | MUST_NOT | error    | lint       |     | No hard waits                                           |
| [`web-first-assertions`](rules/web-first-assertions.md)       | MUST     | error    | lint       |     | Assert on locators, not on awaited values               |
| [`no-raw-selectors`](rules/no-raw-selectors.md)               | MUST_NOT | error    | lint       |     | No CSS or XPath selector strings                        |
| [`no-locators-in-tests`](rules/no-locators-in-tests.md)       | MUST_NOT | error    | lint       |     | Locators live in page objects, not in tests             |
| [`strict-zod-objects`](rules/strict-zod-objects.md)           | MUST     | error    | lint       | ✓   | API schemas must be strict                              |
| [`no-focused-tests`](rules/no-focused-tests.md)               | MUST_NOT | error    | lint       |     | No focused tests                                        |
| [`skips-need-a-reason`](rules/skips-need-a-reason.md)         | MUST     | warn     | lint       |     | A skipped test must say why and when it comes back      |
| [`require-test-tags`](rules/require-test-tags.md)             | MUST     | error    | lint       |     | Every test carries a canonical tag                      |
| [`no-explicit-any`](rules/no-explicit-any.md)                 | MUST_NOT | error    | lint       |     | No explicit any                                         |
| [`no-hardcoded-urls`](rules/no-hardcoded-urls.md)             | MUST_NOT | warn     | lint       |     | No hardcoded environment URLs                           |
| [`selectors-from-agent-kb`](rules/selectors-from-agent-kb.md) | MUST     | warn     | lint       |     | Selectors come from .agent-kb or from fresh exploration |

## Documented, not enforced

| Rule | Tier | Severity | Checked by | Fix |     |
| ---- | ---- | -------- | ---------- | --- | --- |

## Canonical tags

Referenced by [`require-test-tags`](rules/require-test-tags.md).

| Tag            | Means                                                                                                                                          | Runs                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `@smoke`       | Fast, stable, and gating. Runs on every push. Adding @smoke is a promise that this test will not flake and will not take minutes.              | `every-push`        |
| `@regression`  | Full-coverage test. Runs on the nightly and pre-release suites.                                                                                | `nightly`           |
| `@api`         | Exercises the API directly through the request fixture, no browser.                                                                            | `every-push`        |
| `@e2e`         | Crosses more than one system or persists state that outlives the test.                                                                         | `nightly`           |
| `@destructive` | Mutates or deletes shared data. Excluded from shared environments by grep-invert in playwright.config.ts — never run this against production.  | `isolated-env-only` |
| `@flaky`       | Known-unstable and quarantined. Temporary by definition: an @flaky tag with no linked issue is a bug in the process, not a state of the world. | `quarantine`        |

## Rule details

### no-hard-waits

**No hard waits** · `MUST_NOT` · [full page](rules/no-hard-waits.md)

waitForTimeout couples the test to wall-clock time rather than to application state. It is the largest single source of flake, and it costs the full timeout on every run — including the runs where the app was ready immediately.

waitForTimeout waits on the clock, not on the app. Wait on the state you actually care about with a web-first assertion, which retries until the condition holds: await expect(locator).toBeVisible(), .toHaveText(), .toBeEnabled(). For a network round-trip, use await page.waitForResponse(...).

### web-first-assertions

**Assert on locators, not on awaited values** · `MUST` · [full page](rules/web-first-assertions.md)

expect(await locator.textContent()) samples the DOM once, at whatever moment the await resolved. If the app has not settled the test fails; if it settles a tick later the test still fails. Locator assertions retry until the timeout, which is what makes a test resilient rather than lucky.

Awaiting inside expect() takes a single snapshot and cannot retry. Pass the locator itself and let the matcher poll: await expect(locator).toHaveText('x') instead of expect(await locator.textContent()).toBe('x'). For values that are genuinely not locator-backed — an API response body, a computed total — use await expect.poll(() => ...).

### no-raw-selectors

**No CSS or XPath selector strings** · `MUST_NOT` · [full page](rules/no-raw-selectors.md)

CSS and XPath strings bind tests to markup structure and to class names that a styling change can rename without warning. Role, label, and test-id locators bind to the contract the application actually promises its users.

This is a CSS or XPath string. Prefer, in order: getByRole(...) — what the user sees and screen readers announce; then getByLabel / getByPlaceholder / getByText; then getByTestId(...) for anything with no accessible handle. Reach for locator() only for a stable semantic hook none of those can express, and confirm it exists in .agent-kb first.

### no-locators-in-tests

**Locators live in page objects, not in tests** · `MUST_NOT` · [full page](rules/no-locators-in-tests.md)

A locator defined inline in a spec is invisible to every other spec. When the markup changes, the edit has to be found by grep across the suite rather than made once in the page object. Tests read as intent; page objects hold the addressing.

Move this locator into the page object for the screen, expose it as a getter, and use it through the fixture: await loginPage.submitButton.click(). A spec file should name intent, not addressing. See the page-objects skill for the three-section locator layout.

### strict-zod-objects

**API schemas must be strict** · `MUST` · [full page](rules/strict-zod-objects.md)

z.object ignores unknown keys. A contract test built on it keeps passing after the backend adds, renames, or misspells a field — precisely the regression the test existed to catch. z.strictObject fails on unknown keys, which makes the schema an actual assertion about the response.

Use z.strictObject({...}) so an unexpected field in the response fails the test instead of passing silently. If a payload legitimately carries keys you do not model, say so explicitly with .passthrough() and leave a comment naming the reason.

### no-focused-tests

**No focused tests** · `MUST_NOT` · [full page](rules/no-focused-tests.md)

A .only committed to a shared branch silently reduces CI to a single test while still reporting green. This is the failure mode where the signal inverts: the worse the mistake, the healthier the build looks. Only a _call_ counts: passing `it.only` around as a value, as test harnesses do, focuses nothing.

Remove .only before committing. To run one test locally, use the CLI, which leaves no trace in the repo: npx playwright test path/to/spec.ts -g "test title".

### skips-need-a-reason

**A skipped test must say why and when it comes back** · `MUST` · [full page](rules/skips-need-a-reason.md)

An unexplained skip is indistinguishable from lost coverage. Nobody un-skips a test whose reason nobody remembers, so it decays into a file that costs maintenance and buys nothing.

Annotate the skip with an issue reference on the line above, e.g. // TODO(PROJ-1234) un-skip once the async refresh lands. A skip with an owner and a ticket is tracked debt; a bare skip is silent lost coverage. A conditional skip is better still: test.skip(!!process.env.CI, 'reason').

### require-test-tags

**Every test carries a canonical tag** · `MUST` · [full page](rules/require-test-tags.md)

Tags are what let CI run a smoke subset on every push and the full suite nightly, and what keeps destructive tests out of shared environments via grep-invert. An untagged test either runs everywhere or nowhere, and both are wrong.

Add at least one canonical tag from rules/tags.yaml using the tag option: test('title', { tag: ['@smoke'] }, async ({ page }) => {}). Pick the narrowest tag that is true; @smoke is a promise that the test is fast and stable enough to gate every push.

### no-explicit-any

**No explicit any** · `MUST_NOT` · [full page](rules/no-explicit-any.md)

A test suite is the one codebase whose types are load-bearing for correctness rather than convenience: any on an API response turns a contract test into a test that the server returned something.

Replace any with the real type. For a response body, infer it from the Zod schema: type User = z.infer\<typeof UserSchema>. When a value is genuinely unknown at the boundary, use unknown and narrow it — unknown forces the narrowing that any lets you skip.

### no-hardcoded-urls

**No hardcoded environment URLs** · `MUST_NOT` · [full page](rules/no-hardcoded-urls.md)

A literal host pins the test to one environment and leaks internal hostnames into a repository that may become public. baseURL belongs in playwright.config.ts, where the environment picks it.

Use a relative path and let baseURL resolve it: await page.goto('/login'). Set baseURL per project in playwright.config.ts from an env var. For API calls, use the request fixture's configured baseURL rather than a literal host.

### selectors-from-agent-kb

**Selectors come from .agent-kb or from fresh exploration** · `MUST` · [full page](rules/selectors-from-agent-kb.md)

This is the rule the whole knowledge-base layer exists to serve. A model asked for a selector it has never seen produces a plausible one, and a plausible selector fails at runtime in a way that reads like an application bug. A selector is a fact about the application, and facts have sources. It is checked against the .agent-kb found above the file, for getByRole, getByTestId and getByLabel with literal arguments: whether the locator is known, ambiguous, on the wrong route, stale or only inferred. What the code alone cannot decide is not judged — a variable, a regular expression, getByText, getByPlaceholder, a CSS locator — so a clean run does not mean those were checked. With no .agent-kb the rule stays silent in the linter; understudy check says so out loud. It is a warning, not an error, until the false-positive rate on real suites is known.

This selector does not trace to .agent-kb/app-map/ or to an exploration run in this session. Use the nearest known locator suggested here, or run understudy survey \<url> for the page and use what it finds — do not guess. An entry marked stale is a lead to verify, not a fact to use.
