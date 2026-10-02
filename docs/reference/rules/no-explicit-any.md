# no-explicit-any

_No explicit any_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

| Property    | Value          |
| ----------- | -------------- |
| Tier        | `MUST_NOT`     |
| Severity    | `error`        |
| Enforcement | ESLint (AST)   |
| Autofix     | no             |
| Skill       | `strict-types` |
| Applies to  | `**/*.ts`      |
| Exempt      | `**/*.d.ts`    |
| Since       | 0.8.0          |

## Why

A test suite is the one codebase whose types are load-bearing for correctness rather than convenience: any on an API response turns a contract test into a test that the server returned something.

## What to do instead

Replace any with the real type. For a response body, infer it from the Zod schema: type User = z.infer\<typeof UserSchema>. When a value is genuinely unknown at the boundary, use unknown and narrow it — unknown forces the narrowing that any lets you skip.

## Examples

```ts
// ✗ no-explicit-any
const body: any = await response.json();
```

```ts
// ✓
const body = UserSchema.parse(await response.json());
```
