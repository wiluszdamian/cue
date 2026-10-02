# selectors-from-agent-kb

_Selectors come from .agent-kb or from fresh exploration_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

|             |                                                                               |
| ----------- | ----------------------------------------------------------------------------- |
| Tier        | `MUST`                                                                        |
| Severity    | `warn`                                                                        |
| Enforcement | ESLint, against `.agent-kb` (silent where there is none; `cue check` says so) |
| Autofix     | no                                                                            |
| Skill       | `locator-policy`                                                              |
| Applies to  | `**/*.ts`                                                                     |
| Exempt      | —                                                                             |
| Since       | 0.8.0                                                                         |

## Why

This is the rule the whole knowledge-base layer exists to serve. A model asked for a selector it has never seen produces a plausible one, and a plausible selector fails at runtime in a way that reads like an application bug. A selector is a fact about the application, and facts have sources. It is checked against the .agent-kb found above the file, for getByRole, getByTestId and getByLabel with literal arguments: whether the locator is known, ambiguous, on the wrong route, stale or only inferred. What the code alone cannot decide is not judged — a variable, a regular expression, getByText, getByPlaceholder, a CSS locator — so a clean run does not mean those were checked. With no .agent-kb the rule stays silent in the linter; cue check says so out loud. It is a warning, not an error, until the false-positive rate on real suites is known.

## What to do instead

This selector does not trace to .agent-kb/app-map/ or to an exploration run in this session. Use the nearest known locator suggested here, or run cue survey \<url> for the page and use what it finds — do not guess. An entry marked stale is a lead to verify, not a fact to use.

## Examples

```ts
// ✗ selectors-from-agent-kb
page.getByTestId('submit-order-btn'); // invented, not in .agent-kb
```

```ts
// ✓
page.getByTestId('checkout-submit'); // .agent-kb/app-map/checkout.yaml:31
```
