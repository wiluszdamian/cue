# require-test-tags

_Every test carries a canonical tag_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

| Property    | Value                 |
| ----------- | --------------------- |
| Tier        | `MUST`                |
| Severity    | `error`               |
| Enforcement | ESLint (AST)          |
| Autofix     | no                    |
| Skill       | `canon`               |
| Applies to  | `tests/**/*.ts`       |
| Exempt      | `tests/**/*.setup.ts` |
| Since       | 0.8.0                 |

## Why

Tags are what let CI run a smoke subset on every push and the full suite nightly, and what keeps destructive tests out of shared environments via grep-invert. An untagged test either runs everywhere or nowhere, and both are wrong.

## What to do instead

Add at least one canonical tag from rules/tags.yaml using the tag option: test('title', { tag: ['@smoke'] }, async ({ page }) => {}). Pick the narrowest tag that is true; @smoke is a promise that the test is fast and stable enough to gate every push.

## Examples

```ts
// ✗ require-test-tags
test('user can log in', async ({ page }) => {});
```

```ts
// ✓
test('user can log in', { tag: ['@smoke', '@auth'] }, async ({ page }) => {});
```
