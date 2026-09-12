# Writing tests

_The habits that keep a test suite trustworthy as it grows._

## A test should read like a sentence

Someone who has never seen your code should understand what a test checks by
reading it once.

```ts
test('a wrong password is refused', { tag: ['@regression'] }, async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.logIn('user@example.com', 'wrong');

  await expect(loginPage.errorMessage).toBeVisible();
});
```

Nothing in there about CSS classes or HTML structure. That all lives in the page
object.

## Waiting

This is where most unreliable tests come from.

```ts
// Waits 5 seconds. Every time. Whether or not it needs to.
await page.waitForTimeout(5000);

// Waits until the thing appears, then carries on. Usually milliseconds.
await expect(loginPage.welcomeHeading).toBeVisible();
```

The second is faster _and_ more reliable, which is unusual and worth remembering.

<Callout type="warn">
  `waitForTimeout` is blocked by a check. If your app takes a moment and there is nothing on screen
  to wait for, wait for the network call instead: `await page.waitForResponse('**/api/login')`.
</Callout>

## Checking things

Always check the element, never a value you grabbed a moment ago.

```ts
// Looks once, at whatever instant it ran. If the app was still working, it fails.
expect(await page.locator('.total').textContent()).toBe('42');

// Keeps checking until it is true, or until time runs out.
await expect(totalDisplay).toHaveText('42');
```

## Tags

Every test carries at least one.

| Tag            | Use it when                                                                  |
| -------------- | ---------------------------------------------------------------------------- |
| `@smoke`       | Fast and reliable. Runs on every push.                                       |
| `@regression`  | Thorough. Runs nightly.                                                      |
| `@api`         | Talks to the API directly, no browser.                                       |
| `@e2e`         | Crosses systems, or leaves data behind.                                      |
| `@destructive` | Deletes or changes shared data. **Never runs against a shared environment.** |
| `@flaky`       | Known unreliable, quarantined. Should always have a linked issue.            |

## Test data

Put values other tests might want in `test-data/`.

```ts
import { INVALID_EMAILS } from '../../test-data/static/util/invalid-values.js';

for (const email of INVALID_EMAILS) {
  test(`rejects ${email}`, { tag: ['@regression'] }, async ({ signUpPage }) => {
    // ...
  });
}
```

Shared, so that a negative case everybody writes slightly differently does not
become a negative case nobody can audit.

## One place to import from

```ts
// Yes
import { expect, test } from '../../../fixtures/pom/test-options.js';

// No — this bypasses every fixture the project set up
import { expect, test } from '@playwright/test';
```

Two ways to import means two places to change one thing, and the second is always
the one somebody forgets.

## Skipping a test

If you must, say why and when it comes back.

```ts
// TODO(PROJ-1234): un-skip once the refund webhook is stubbed
test.skip('refund flow', { tag: ['@regression'] }, async () => {});
```

A skip nobody can explain is lost coverage wearing the disguise of a passing
suite.
