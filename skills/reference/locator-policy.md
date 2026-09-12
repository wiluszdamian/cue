<!-- GENERATED from rules/. Run `pnpm skills:generate`. Do not edit. -->

# locator-policy

Owns: locator strategy and selector priority.

This is Understudy's topic outright — it outranks any other source that says otherwise.

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

`MUST` · `error` · **not enforced** — checked in review

This is the rule the whole knowledge-base layer exists to serve. A model asked for a selector it has never seen produces a plausible one, and a plausible selector fails at runtime in a way that reads like an application bug. A selector is a fact about the application, and facts have sources. Not mechanically detectable — a linter cannot tell an invented test-id from a real one — so this rule documents the obligation and leaves enforcement to verify-map and review.

**Do this instead.** Every selector must trace to .agent-kb/app-map/ or .agent-kb/product/testids.yaml, or to an exploration run in this session. If it is not there, run understudy survey <url> and record it — do not guess. An entry marked stale is a lead to verify, not a fact to use.

```ts
// wrong
page.getByTestId('submit-order-btn'); // invented, not in .agent-kb
// right
page.getByTestId('checkout-submit'); // .agent-kb/app-map/checkout.yaml:31
```
