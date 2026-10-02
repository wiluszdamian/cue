<!-- GENERATED from rules/. Run `pnpm skills:generate`. Do not edit. -->

# canon

Owns: test structure, tagging and assertions.

This is Cue's topic outright — it outranks any other source that says otherwise.

### no-hard-waits

`MUST_NOT` · `error` · enforced by ESLint

waitForTimeout couples the test to wall-clock time rather than to application state. It is the largest single source of flake, and it costs the full timeout on every run — including the runs where the app was ready immediately.

**Do this instead.** waitForTimeout waits on the clock, not on the app. Wait on the state you actually care about with a web-first assertion, which retries until the condition holds: await expect(locator).toBeVisible(), .toHaveText(), .toBeEnabled(). For a network round-trip, use await page.waitForResponse(...).

```ts
// wrong
await page.click('#submit');
await page.waitForTimeout(5000);
// right
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByRole('status')).toHaveText('Saved');
```

### web-first-assertions

`MUST` · `error` · enforced by ESLint

expect(await locator.textContent()) samples the DOM once, at whatever moment the await resolved. If the app has not settled the test fails; if it settles a tick later the test still fails. Locator assertions retry until the timeout, which is what makes a test resilient rather than lucky.

**Do this instead.** Awaiting inside expect() takes a single snapshot and cannot retry. Pass the locator itself and let the matcher poll: await expect(locator).toHaveText('x') instead of expect(await locator.textContent()).toBe('x'). For values that are genuinely not locator-backed — an API response body, a computed total — use await expect.poll(() => ...).

```ts
// wrong
expect(await page.locator('.total').textContent()).toBe('42');
// right
await expect(page.getByTestId('total')).toHaveText('42');
```

### no-focused-tests

`MUST_NOT` · `error` · enforced by ESLint

A .only committed to a shared branch silently reduces CI to a single test while still reporting green. This is the failure mode where the signal inverts: the worse the mistake, the healthier the build looks. Only a _call_ counts: passing `it.only` around as a value, as test harnesses do, focuses nothing.

**Do this instead.** Remove .only before committing. To run one test locally, use the CLI, which leaves no trace in the repo: npx playwright test path/to/spec.ts -g "test title".

```ts
// wrong
test.only('checkout succeeds', async () => {});
// right
test('checkout succeeds', async () => {});
```

### skips-need-a-reason

`MUST` · `warn` · enforced by ESLint

An unexplained skip is indistinguishable from lost coverage. Nobody un-skips a test whose reason nobody remembers, so it decays into a file that costs maintenance and buys nothing.

**Do this instead.** Annotate the skip with an issue reference on the line above, e.g. // TODO(PROJ-1234) un-skip once the async refresh lands. A skip with an owner and a ticket is tracked debt; a bare skip is silent lost coverage. A conditional skip is better still: test.skip(!!process.env.CI, 'reason').

```ts
// wrong
test.skip('refund flow', async () => {});
// right
// TODO(PROJ-1234) un-skip once the refund webhook is stubbed
test.skip('refund flow', async () => {});
```

### require-test-tags

`MUST` · `error` · enforced by ESLint

Tags are what let CI run a smoke subset on every push and the full suite nightly, and what keeps destructive tests out of shared environments via grep-invert. An untagged test either runs everywhere or nowhere, and both are wrong.

**Do this instead.** Add at least one canonical tag from rules/tags.yaml using the tag option: test('title', { tag: ['@smoke'] }, async ({ page }) => {}). Pick the narrowest tag that is true; @smoke is a promise that the test is fast and stable enough to gate every push.

```ts
// wrong
test('user can log in', async ({ page }) => {});
// right
test('user can log in', { tag: ['@smoke', '@auth'] }, async ({ page }) => {});
```
