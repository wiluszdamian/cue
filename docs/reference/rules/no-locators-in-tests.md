# no-locators-in-tests

_Locators live in page objects, not in tests_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

|             |                       |
| ----------- | --------------------- |
| Tier        | `MUST_NOT`            |
| Severity    | `error`               |
| Enforcement | ESLint (AST)          |
| Autofix     | no                    |
| Skill       | `stage-map`           |
| Applies to  | `tests/**/*.ts`       |
| Exempt      | `tests/**/*.setup.ts` |
| Since       | 0.8.0                 |

## Why

A locator defined inline in a spec is invisible to every other spec. When the markup changes, the edit has to be found by grep across the suite rather than made once in the page object. Tests read as intent; page objects hold the addressing.

## What to do instead

Move this locator into the page object for the screen, expose it as a getter, and use it through the fixture: await loginPage.submitButton.click(). A spec file should name intent, not addressing. See the page-objects skill for the three-section locator layout.

## Examples

```ts
// ✗ no-locators-in-tests
await page.getByRole('button', { name: 'Log in' }).click();
```

```ts
// ✓
await loginPage.logInButton.click();
```
