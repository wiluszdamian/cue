# no-raw-selectors

_No CSS or XPath selector strings_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

| Property    | Value            |
| ----------- | ---------------- |
| Tier        | `MUST_NOT`       |
| Severity    | `error`          |
| Enforcement | ESLint (AST)     |
| Autofix     | no               |
| Skill       | `locator-policy` |
| Applies to  | `**/*.ts`        |
| Exempt      | —                |
| Since       | 0.8.0            |

## Why

CSS and XPath strings bind tests to markup structure and to class names that a styling change can rename without warning. Role, label, and test-id locators bind to the contract the application actually promises its users.

## What to do instead

This is a CSS or XPath string. Prefer, in order: getByRole(...) — what the user sees and screen readers announce; then getByLabel / getByPlaceholder / getByText; then getByTestId(...) for anything with no accessible handle. Reach for locator() only for a stable semantic hook none of those can express, and confirm it exists in .agent-kb first.

## Examples

```ts
// ✗ no-raw-selectors
page.locator('div.card > button.primary');
```

```ts
// ✓
page.getByRole('button', { name: 'Continue' });
```
