# no-hardcoded-urls

_No hardcoded environment URLs_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

| Property    | Value                                                |
| ----------- | ---------------------------------------------------- |
| Tier        | `MUST_NOT`                                           |
| Severity    | `warn`                                               |
| Enforcement | ESLint (text)                                        |
| Autofix     | no                                                   |
| Skill       | `harness`                                            |
| Applies to  | `tests/**/*.ts`, `pages/**/*.ts`, `fixtures/**/*.ts` |
| Exempt      | —                                                    |
| Since       | 0.8.0                                                |

## Why

A literal host pins the test to one environment and leaks internal hostnames into a repository that may become public. baseURL belongs in playwright.config.ts, where the environment picks it.

## What to do instead

Use a relative path and let baseURL resolve it: await page.goto('/login'). Set baseURL per project in playwright.config.ts from an env var. For API calls, use the request fixture's configured baseURL rather than a literal host.

## Examples

```ts
// ✗ no-hardcoded-urls
await page.goto('https://staging.internal.acme.com/login');
```

```ts
// ✓
await page.goto('/login');
```
