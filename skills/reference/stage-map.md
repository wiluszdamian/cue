<!-- GENERATED from rules/. Run `pnpm skills:generate`. Do not edit. -->

# stage-map

Owns: page object model and locator organisation.

This is Understudy's topic outright — it outranks any other source that says otherwise.

### no-locators-in-tests

`MUST_NOT` · `error` · enforced by ESLint

A locator defined inline in a spec is invisible to every other spec. When the markup changes, the edit has to be found by grep across the suite rather than made once in the page object. Tests read as intent; page objects hold the addressing.

**Do this instead.** Move this locator into the page object for the screen, expose it as a getter, and use it through the fixture: await loginPage.submitButton.click(). A spec file should name intent, not addressing. See the page-objects skill for the three-section locator layout.

```ts
// wrong
await page.getByRole('button', { name: 'Log in' }).click();
// right
await loginPage.logInButton.click();
```
