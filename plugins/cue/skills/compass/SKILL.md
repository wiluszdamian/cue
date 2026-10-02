---
name: compass
description: >
  Name the right Cue skill for the situation and stop. Use when you do not
  know where to start with testing this repository, or which of survey, extract,
  pin, compose or inspect applies.
disable-model-invocation: true
---

# compass

Router for the Cue catalog. It tells you which skill to reach for, why,
and what not to do instead — then stops.

It does not run the skill it names. A router that also does the work is a router
you stop trusting to be honest about the alternatives.

## Procedure

1. Read the ownership table in `AGENTS.md` and the catalog below.
2. Classify the situation against the table.
3. Report: the skill, why it fits, and the plausible-but-wrong alternative.
4. **Stop.** Do not invoke the named skill.

<!-- BEGIN GENERATED: catalog -->

## The catalog

**Getting started**

| Invocation | Type  | What it does                                                                                                              |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| `/cue`     | model | Use the Cue plugin to write Playwright tests in this repository.                                                          |
| `/compass` | user  | Name the right Cue skill for the situation and stop.                                                                      |
| `/bind`    | user  | Wire this repository to Cue once: check the environment, choose agent targets, and install the constitution and scaffold. |

**Main flow**

| Invocation | Type | What it does                                                                                                                 |
| ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/survey`  | user | Map the running application into .agent-kb/app-map by exploring it with playwright-cli.                                      |
| `/extract` | user | Read the product source and write its structure into .agent-kb/product — routes, endpoints, entities, roles, test ids.       |
| `/pin`     | user | Turn a testing intent into a concrete set of test cases with data, tags and locator candidates.                              |
| `/compose` | user | Write or change a Playwright test in this repository.                                                                        |
| `/inspect` | user | Audit an existing Playwright suite against the constitution, and report drift in the knowledge base and routes with no test. |

**Invoked layer**

| Invocation         | Type  | What it does                                                                                              |
| ------------------ | ----- | --------------------------------------------------------------------------------------------------------- |
| `/resolve-owner`   | model | Decide which source of Playwright advice governs a topic when two of them disagree.                       |
| `/resolve-locator` | model | Find the real selector for an element from the project knowledge base, with its freshness and confidence. |

## What you have → what to reach for

| You have                                 | Reach for                         |
| ---------------------------------------- | --------------------------------- |
| The Cue plugin, and a testing task       | `/cue`                            |
| No idea where to start                   | `/compass`                        |
| A fresh repo, nothing wired up           | `/bind`                           |
| No knowledge of the live UI              | `/survey`                         |
| The product source alongside             | `/extract`                        |
| Agreement on what to check, no cases yet | `/pin`                            |
| Cases, but no test code                  | `/compose`                        |
| An existing suite you want assessed      | `/inspect`                        |
| Two sources giving conflicting advice    | `/resolve-owner`                  |
| An uncertain selector                    | `/resolve-locator`                |
| A product spec or ticket breakdown       | outside Cue — your team's process |

<!-- END GENERATED: catalog -->

## The spine

```
bind          (once per repository)
   ↓
extract | survey     (build the map; either order, or both)
   ↓
pin           (test cases, locator candidates, tags)
   ↓
compose       (the test itself)
   ↓
inspect       (constitution, drift, coverage)
```

## Branches worth naming

- **No product source** — skip `extract`; use `survey` plus any OpenAPI spec.
- **Black box, no URL either** — say so plainly and stop. The knowledge base
  cannot be fed, so every test written will violate `locator-policy`. That is a
  real answer, and a better one than a suite built on invented selectors.
- **One selector changed** — do not run the spine. `resolve-locator`, then
  `compose`.
- **Two sources disagree** — `resolve-owner`. If the table has no entry, that is
  a gap to fill, not a licence to pick one.

## It is working if

The person knows what to run next, and why the other options were rejected.

## Prohibitions

No interviews. No writing tests. No editing `.agent-kb`. Naming the skill is the
entire job.
