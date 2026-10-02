# web-first-assertions

_Assert on locators, not on awaited values_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

| Property    | Value        |
| ----------- | ------------ |
| Tier        | `MUST`       |
| Severity    | `error`      |
| Enforcement | ESLint (AST) |
| Autofix     | no           |
| Skill       | `canon`      |
| Applies to  | `**/*.ts`    |
| Exempt      | —            |
| Since       | 0.8.0        |

## Why

expect(await locator.textContent()) samples the DOM once, at whatever moment the await resolved. If the app has not settled the test fails; if it settles a tick later the test still fails. Locator assertions retry until the timeout, which is what makes a test resilient rather than lucky.

## What to do instead

Awaiting inside expect() takes a single snapshot and cannot retry. Pass the locator itself and let the matcher poll: await expect(locator).toHaveText('x') instead of expect(await locator.textContent()).toBe('x'). For values that are genuinely not locator-backed — an API response body, a computed total — use await expect.poll(() => ...).

## Examples

```ts
// ✗ web-first-assertions
expect(await page.locator('.total').textContent()).toBe('42');
```

```ts
// ✓
await expect(page.getByTestId('total')).toHaveText('42');
```
