# skips-need-a-reason

_A skipped test must say why and when it comes back_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

| Property    | Value        |
| ----------- | ------------ |
| Tier        | `MUST`       |
| Severity    | `warn`       |
| Enforcement | ESLint (AST) |
| Autofix     | no           |
| Skill       | `canon`      |
| Applies to  | `**/*.ts`    |
| Exempt      | —            |
| Since       | 0.8.0        |

## Why

An unexplained skip is indistinguishable from lost coverage. Nobody un-skips a test whose reason nobody remembers, so it decays into a file that costs maintenance and buys nothing.

## What to do instead

Annotate the skip with an issue reference on the line above, e.g. // TODO(PROJ-1234) un-skip once the async refresh lands. A skip with an owner and a ticket is tracked debt; a bare skip is silent lost coverage. A conditional skip is better still: test.skip(!!process.env.CI, 'reason').

## Examples

```ts
// ✗ skips-need-a-reason
test.skip('refund flow', async () => {});
```

```ts
// ✓
// TODO(PROJ-1234) un-skip once the refund webhook is stubbed
test.skip('refund flow', async () => {});
```
