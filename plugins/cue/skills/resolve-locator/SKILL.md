---
name: resolve-locator
description: >
  Find the real selector for an element from the project knowledge base, with its
  freshness and confidence. Use before writing any locator, and whenever a
  selector in a test looks uncertain.
disable-model-invocation: false
---

# resolve-locator

**Input:** a page or route, plus a description of the element.
**Output:** the selector, where it came from, how fresh it is, how confident.

## Where answers come from

| Source                                                        | Confidence                                               |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `.agent-kb/product/testids.yaml` **and** `.agent-kb/app-map/` | confirmed — it exists in the source and was seen running |
| Code only                                                     | may be dead, or behind a flag                            |
| Runtime only                                                  | present but absent from the source; treat as unstable    |
| Neither                                                       | **unknown — do not answer with a selector**              |

## Procedure

1. Look the route up in `.agent-kb/app-map/`, then the element.
2. Cross-check `.agent-kb/product/testids.yaml` and report which sides agree.
3. Report `freshness` from the entry's `verifiedAt`, and `confidence` from the
   correlation above.
4. If the entry is stale: return it as a **candidate**, and say that
   `/survey` on that route (or `cue extract --check`) must confirm it
   before use.
5. If there is no entry: **do not guess.** Say which route needs surveying.

## Why this is strict

A model asked for a selector it has never seen will produce a plausible one. A
plausible selector fails at runtime in a way that reads like an application bug,
so the time is spent debugging the product rather than the test. That is the most
expensive way to be wrong, and it is why `selectors-from-agent-kb` exists.

## It is working if

Every returned selector carries a source and a freshness marker, and an unknown
element produces a survey instruction rather than a guess.
