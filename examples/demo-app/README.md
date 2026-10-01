# demo-app

A small web application with no runtime dependencies, used to check Understudy
end to end and as the target of the benchmark. It is private and never published.

```bash
pnpm --filter @understudy/demo-app start                 # http://127.0.0.1:4310
pnpm --filter @understudy/demo-app exec playwright install chromium
pnpm --filter @understudy/demo-app test:e2e              # reference tests, real browser
pnpm --filter @understudy/demo-app test:mutations       # every mutation must be caught
```

`PORT` changes the server port; `DEMO_PORT` does the same for the test run.
The Playwright tests are not part of `pnpm test`: they need a browser, so CI runs
them in their own job.

## Routes

| Route                      | What it is                                                      |
| -------------------------- | --------------------------------------------------------------- |
| `/login`                   | Email, password, **Log in**, **Forgot password?**               |
| `/dashboard`               | Needs a session. The welcome heading appears after ~1.5 s       |
| `/signup`                  | Email validation, **Create account**                            |
| `/admin/settings/security` | Admin only. **Change password**                                 |
| `/items`                   | In-memory list: add and delete                                  |
| `/api/*`                   | `login`, `me`, `password`, `items` — see `openapi.json`/`.yaml` |

Users: `user@demo.test` / `user-pass` (role user) and `admin@demo.test` / `admin-pass`
(role admin). State is in memory and starts clean on every launch.

## What it offers `extract`

- `data-testid` on every interactive element, in the HTML templates.
- `openapi.json` and `openapi.yaml`: the same contract in both formats.
- `locales/en.json`: nested keys; the page templates read their text from it.

## Mutations

`DEMO_MUTATIONS=a,b` switches on controlled defects, so a test can be shown to
fail for the intended reason rather than merely pass.

| Id                        | Effect                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| `auth-silent-fail`        | Login reports success but never starts a session                  |
| `wrong-password-accepted` | Any password logs a known user in                                 |
| `signup-validation-off`   | The sign-up form accepts any email                                |
| `button-renamed`          | **Change password** becomes **Update password** (a stale locator) |
| `route-moved`             | `/admin/settings/security` moves to `/admin/security`             |

The reference tests live in `tests/` and follow the repository's own constitution:
tags on every test, locators in `pages/`, fixtures through
`fixtures/pom/test-options.ts`.
