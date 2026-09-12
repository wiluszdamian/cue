# selectors-from-agent-kb

_Selectors come from .agent-kb or from fresh exploration_

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

|             |                                |
| ----------- | ------------------------------ |
| Tier        | `MUST`                         |
| Severity    | `error`                        |
| Enforcement | **not enforced** — review only |
| Autofix     | no                             |
| Skill       | `locator-policy`               |
| Applies to  | `**/*.ts`                      |
| Exempt      | —                              |
| Since       | 0.8.0                          |

## Why

This is the rule the whole knowledge-base layer exists to serve. A model asked for a selector it has never seen produces a plausible one, and a plausible selector fails at runtime in a way that reads like an application bug. A selector is a fact about the application, and facts have sources. Not mechanically detectable — a linter cannot tell an invented test-id from a real one — so this rule documents the obligation and leaves enforcement to verify-map and review.

## What to do instead

Every selector must trace to .agent-kb/app-map/ or .agent-kb/product/testids.yaml, or to an exploration run in this session. If it is not there, run understudy survey \<url> and record it — do not guess. An entry marked stale is a lead to verify, not a fact to use.

## Examples

```ts
// ✗ selectors-from-agent-kb
page.getByTestId('submit-order-btn'); // invented, not in .agent-kb
```

```ts
// ✓
page.getByTestId('checkout-submit'); // .agent-kb/app-map/checkout.yaml:31
```

## A note on enforcement

No linter can check this one. It is written down here so the documented standard
and the enforced standard stay the same list, with the gap between them visible
rather than implied — see [All the rules](../constitution.md).
