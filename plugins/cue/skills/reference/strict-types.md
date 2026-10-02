<!-- GENERATED from rules/. Run `pnpm skills:generate`. Do not edit. -->

# strict-types

Owns: type safety in the suite.

This is Cue's topic outright — it outranks any other source that says otherwise.

### no-explicit-any

`MUST_NOT` · `error` · enforced by ESLint

A test suite is the one codebase whose types are load-bearing for correctness rather than convenience: any on an API response turns a contract test into a test that the server returned something.

**Do this instead.** Replace any with the real type. For a response body, infer it from the Zod schema: type User = z.infer<typeof UserSchema>. When a value is genuinely unknown at the boundary, use unknown and narrow it — unknown forces the narrowing that any lets you skip.

```ts
// wrong
const body: any = await response.json();
// right
const body = UserSchema.parse(await response.json());
```
