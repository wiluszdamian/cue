# strict-zod-objects

_API schemas must be strict_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

|             |                      |
| ----------- | -------------------- |
| Tier        | `MUST`               |
| Severity    | `error`              |
| Enforcement | ESLint (AST)         |
| Autofix     | yes — `eslint --fix` |
| Skill       | `wire-contract`      |
| Applies to  | `**/*.ts`            |
| Exempt      | —                    |
| Since       | 0.8.0                |

## Why

z.object ignores unknown keys. A contract test built on it keeps passing after the backend adds, renames, or misspells a field — precisely the regression the test existed to catch. z.strictObject fails on unknown keys, which makes the schema an actual assertion about the response.

## What to do instead

Use z.strictObject({...}) so an unexpected field in the response fails the test instead of passing silently. If a payload legitimately carries keys you do not model, say so explicitly with .passthrough() and leave a comment naming the reason.

## Examples

```ts
// ✗ strict-zod-objects
const User = z.object({ id: z.string() });
```

```ts
// ✓
const User = z.strictObject({ id: z.string() });
```
