# no-focused-tests

_No focused tests_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

|             |              |
| ----------- | ------------ |
| Tier        | `MUST_NOT`   |
| Severity    | `error`      |
| Enforcement | ESLint (AST) |
| Autofix     | no           |
| Skill       | `canon`      |
| Applies to  | `**/*.ts`    |
| Exempt      | —            |
| Since       | 0.8.0        |

## Why

A .only committed to a shared branch silently reduces CI to a single test while still reporting green. This is the failure mode where the signal inverts: the worse the mistake, the healthier the build looks. Only a _call_ counts: passing `it.only` around as a value, as test harnesses do, focuses nothing.

## What to do instead

Remove .only before committing. To run one test locally, use the CLI, which leaves no trace in the repo: npx playwright test path/to/spec.ts -g "test title".

## Examples

```ts
// ✗ no-focused-tests
test.only('checkout succeeds', async () => {});
```

```ts
// ✓
test('checkout succeeds', async () => {});
```
