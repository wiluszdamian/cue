<!-- GENERATED from rules/. Run `pnpm skills:generate`. Do not edit. -->

# locator-policy

Owns: locator strategy and selector priority.

This is Cue's topic outright — it outranks any other source that says otherwise.

### no-raw-selectors

`MUST_NOT` · `error` · enforced by ESLint

CSS and XPath strings bind tests to markup structure and to class names that a styling change can rename without warning. Role, label, and test-id locators bind to the contract the application actually promises its users.

**Do this instead.** This is a CSS or XPath string. Prefer, in order: getByRole(...) — what the user sees and screen readers announce; then getByLabel / getByPlaceholder / getByText; then getByTestId(...) for anything with no accessible handle. Reach for locator() only for a stable semantic hook none of those can express, and confirm it exists in .agent-kb first.

```ts
// wrong
page.locator('div.card > button.primary');
// right
page.getByRole('button', { name: 'Continue' });
```

### selectors-from-agent-kb

`MUST` · `warn` · enforced by ESLint, against `.agent-kb`

This is the rule the whole knowledge-base layer exists to serve. A model asked for a selector it has never seen produces a plausible one, and a plausible selector fails at runtime in a way that reads like an application bug. A selector is a fact about the application, and facts have sources. It is checked against the .agent-kb found above the file, for getByRole, getByTestId and getByLabel with literal arguments: whether the locator is known, ambiguous, on the wrong route, stale or only inferred. What the code alone cannot decide is not judged — a variable, a regular expression, getByText, getByPlaceholder, a CSS locator — so a clean run does not mean those were checked. With no .agent-kb the rule stays silent in the linter; cue check says so out loud. It is a warning, not an error, until the false-positive rate on real suites is known.

**Do this instead.** This selector does not trace to .agent-kb/app-map/ or to an exploration run in this session. Use the nearest known locator suggested here, or run cue survey <url> for the page and use what it finds — do not guess. An entry marked stale is a lead to verify, not a fact to use.

```ts
// wrong
page.getByTestId('submit-order-btn'); // invented, not in .agent-kb
// right
page.getByTestId('checkout-submit'); // .agent-kb/app-map/checkout.yaml:31
```
