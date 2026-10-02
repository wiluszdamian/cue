# no-hard-waits

_No hard waits_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

| Property    | Value            |
| ----------- | ---------------- |
| Tier        | `MUST_NOT`       |
| Severity    | `error`          |
| Enforcement | ESLint (AST)     |
| Autofix     | no               |
| Skill       | `canon`          |
| Applies to  | `**/*.ts`        |
| Exempt      | `**/*.config.ts` |
| Since       | 1.0.0            |

## Why

waitForTimeout couples the test to wall-clock time rather than to application state. It is the largest single source of flake, and it costs the full timeout on every run — including the runs where the app was ready immediately.

## What to do instead

waitForTimeout waits on the clock, not on the app. Wait on the state you actually care about with a web-first assertion, which retries until the condition holds: await expect(locator).toBeVisible(), .toHaveText(), .toBeEnabled(). For a network round-trip, use await page.waitForResponse(...).

## Examples

```ts
// ✗ no-hard-waits
await page.click('#submit');
await page.waitForTimeout(5000);
```

```ts
// ✓
await page.getByRole('button', { name: 'Submit' }).click();
await expect(page.getByRole('status')).toHaveText('Saved');
```
