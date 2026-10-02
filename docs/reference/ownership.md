# Who decides what

_When two sources of advice disagree, this table settles it._

<!-- GENERATED from rules/. Run `pnpm docs:generate`. Do not edit. -->

Cue is an integrator. It composes sources maintained by other people and
adds the two nobody else can supply — this repo's rules, and this application's
actual shape. That leaves one problem no other project has: deciding which source
wins when they disagree.

This file is that decision, generated from
[`rules/ownership.yaml`](../../rules/ownership.yaml).

## How precedence works

`absolute` beats everything, including a source that says the opposite with
total confidence. It is reserved for the two things nobody upstream can know:
what this repository has decided, and what this application actually looks like.

Everything else is `default`: authoritative on its topic unless an absolute
owner also covers the question.

Two invariants are checked in CI rather than asserted here:

1. **Every topic the constitution covers is Cue's, absolutely.** Each
   `skill` a rule cites must be claimed by an understudy-owned topic at absolute
   precedence, so a rule cannot be added on a topic whose ownership nobody
   decided.
2. **Every topic is reachable.** Asking about a topic by its own name must
   resolve to that topic, which catches keyword lists so narrow the arbitration
   can never fire, and topics so overlapping they shadow each other.

## When nothing matches

An unowned topic is a gap in the table, never a licence to improvise. `whoOwns`
returns that verdict explicitly instead of staying silent, because a convention
invented on the spot is indistinguishable from a convention everyone agreed to —
right up until the second person has to guess it too.

## Owners

### Cue `understudy`

- **Kind:** internal
- **Maintained by:** The Cue Authors

rules/constitution.yaml and docs/rules/. The ESLint plugin enforces it, so a disagreement here surfaces as a failing build, not as a style debate.

Decides 8 topics:

- page object model and locator organisation — **wins over every other source**
- test structure, tagging and assertions — **wins over every other source**
- locator strategy and selector priority — **wins over every other source**
- fixtures, dependency injection and environment configuration — **wins over every other source**
- API testing and response schemas — **wins over every other source**
- type safety in the suite — **wins over every other source**
- test data strategy — **wins over every other source**
- how the knowledge base gets populated — **wins over every other source**

### The project knowledge base `agent-kb`

- **Kind:** internal
- **Maintained by:** This repository

.agent-kb/ — app-map for what the running application looks like, product/ for what the source says. Every entry carries a freshness marker; an entry marked stale is a lead to verify, not a fact to use.

Decides 2 topics:

- application-specific selectors and test ids — **wins over every other source**
- application behaviour, routes and domain vocabulary — **wins over every other source**

### Official Playwright skills and CLI `playwright-official`

- **Kind:** external
- **Maintained by:** Microsoft
- **Obtained via:** `playwright-cli install --skills`

Read the installed skill. Do not restate or fork its content into this repository — their release is our free update, and a stale copy of it is worse than no copy.

Decides 5 topics:

- running, filtering and debugging tests
- tracing, video, screenshots and reports
- authentication state, request mocking and network interception
- browser exploration and inspecting a live page
- Playwright configuration, projects and parallelism

### Playwright MCP `playwright-mcp`

- **Kind:** external
- **Maintained by:** Microsoft
- **Obtained via:** `@playwright/mcp`

Point-in-time browser calls with small results. Not exploration: a full accessibility tree through MCP costs more context than the task it serves.

Decides 1 topic:

- single scripted browser actions from an agent

### Playwright best-practices reference skill `reference-skill`

- **Kind:** external
- **Maintained by:** Currents Software Inc. (MIT)
- **Obtained via:** `optional, chosen during `understudy init``

The owner of general Playwright practice — the areas Cue has no opinion about because someone else already maintains one.

Decides 6 topics:

- Electron, browser extensions and desktop targets
- canvas, WebGL, service workers and other exotic surfaces
- internationalisation and accessibility testing
- GraphQL, security testing and performance auditing
- visual regression and component testing
- framework-specific testing concerns

### Your team's own engineering process `external-process`

- **Kind:** external
- **Maintained by:** Whoever runs your product process

Cue has no opinion here and will not grow one. It rules on testability and on the shape of a suite, never on a roadmap. Say the topic is outside Cue and hand it back to however your team already writes specs, splits tickets, and reviews features — duplicating that is how a focused tool turns into a worse version of a general one.

Decides 1 topic:

- product specification, ticket breakdown and general code review

## Topics

### page object model and locator organisation

|                     |                                          |
| ------------------- | ---------------------------------------- |
| Decided by          | `understudy` (Cue)                       |
| Precedence          | `absolute` — outranks every other source |
| Constitution skills | `stage-map`                              |

Locators live in page objects, exposed as getters, in three sections. A spec names intent; the page object holds the addressing.

### test structure, tagging and assertions

|                     |                                          |
| ------------------- | ---------------------------------------- |
| Decided by          | `understudy` (Cue)                       |
| Precedence          | `absolute` — outranks every other source |
| Constitution skills | `canon`                                  |

Canonical tags come from rules/tags.yaml. Web-first assertions only, no hard waits, no committed .only.

### locator strategy and selector priority

|                     |                                          |
| ------------------- | ---------------------------------------- |
| Decided by          | `understudy` (Cue)                       |
| Precedence          | `absolute` — outranks every other source |
| Constitution skills | `locator-policy`                         |

Which _kind_ of locator to reach for is ours. Which selector actually exists in the application is agent-kb's — see "application-specific selectors and test ids". The two are routinely confused, and the answers come from different places.

### fixtures, dependency injection and environment configuration

|                     |                                          |
| ------------------- | ---------------------------------------- |
| Decided by          | `understudy` (Cue)                       |
| Precedence          | `absolute` — outranks every other source |
| Constitution skills | `harness`                                |

One import point for the merged test object. baseURL belongs to the config, never to a spec.

### API testing and response schemas

|                     |                                          |
| ------------------- | ---------------------------------------- |
| Decided by          | `understudy` (Cue)                       |
| Precedence          | `absolute` — outranks every other source |
| Constitution skills | `wire-contract`                          |

Strict schemas, complete negative cases. A schema that ignores unknown keys is not an assertion.

### type safety in the suite

|                     |                                          |
| ------------------- | ---------------------------------------- |
| Decided by          | `understudy` (Cue)                       |
| Precedence          | `absolute` — outranks every other source |
| Constitution skills | `strict-types`                           |

A test suite's types are load-bearing for correctness, not convenience.

### test data strategy

|                     |                                          |
| ------------------- | ---------------------------------------- |
| Decided by          | `understudy` (Cue)                       |
| Precedence          | `absolute` — outranks every other source |
| Constitution skills | `seed-policy`                            |

Not yet backed by a constitution rule — the three-level rule for factories versus static data is still to be written.

### how the knowledge base gets populated

|                     |                                          |
| ------------------- | ---------------------------------------- |
| Decided by          | `understudy` (Cue)                       |
| Precedence          | `absolute` — outranks every other source |
| Constitution skills | `cartography`                            |

Which command feeds which part of .agent-kb, and what a freshness marker obliges you to do, is ours. How to drive the browser while doing it is playwright-official's — see "browser exploration and inspecting a live page".

### application-specific selectors and test ids

|            |                                          |
| ---------- | ---------------------------------------- |
| Decided by | `agent-kb` (The project knowledge base)  |
| Precedence | `absolute` — outranks every other source |

No model has ever seen this application. A plausible selector fails at runtime in a way that reads like an application bug. If it is not in .agent-kb, run `understudy survey` — do not guess.

### application behaviour, routes and domain vocabulary

|            |                                          |
| ---------- | ---------------------------------------- |
| Decided by | `agent-kb` (The project knowledge base)  |
| Precedence | `absolute` — outranks every other source |

.agent-kb/product/ is extracted from the product source with file:line references. A claim about the application without a reference is a guess.

### running, filtering and debugging tests

|            |                                                            |
| ---------- | ---------------------------------------------------------- |
| Decided by | `playwright-official` (Official Playwright skills and CLI) |
| Precedence | `default`                                                  |

Read the installed skill. Do not restate or fork its content into this repository — their release is our free update, and a stale copy of it is worse than no copy.

### tracing, video, screenshots and reports

|            |                                                            |
| ---------- | ---------------------------------------------------------- |
| Decided by | `playwright-official` (Official Playwright skills and CLI) |
| Precedence | `default`                                                  |

Read the installed skill. Do not restate or fork its content into this repository — their release is our free update, and a stale copy of it is worse than no copy.

### authentication state, request mocking and network interception

|            |                                                            |
| ---------- | ---------------------------------------------------------- |
| Decided by | `playwright-official` (Official Playwright skills and CLI) |
| Precedence | `default`                                                  |

Read the installed skill. Do not restate or fork its content into this repository — their release is our free update, and a stale copy of it is worse than no copy.

### browser exploration and inspecting a live page

|             |                                                            |
| ----------- | ---------------------------------------------------------- |
| Decided by  | `playwright-official` (Official Playwright skills and CLI) |
| Precedence  | `default`                                                  |
| Reached via | `cli`                                                      |

Through `playwright-cli`, not through MCP. Microsoft's own guidance is that CLI-as-skill avoids loading large tool schemas and verbose accessibility trees into context — see blueprint section 8. Write what you find to .agent-kb.

### Playwright configuration, projects and parallelism

|            |                                                            |
| ---------- | ---------------------------------------------------------- |
| Decided by | `playwright-official` (Official Playwright skills and CLI) |
| Precedence | `default`                                                  |

How the options work is theirs. Which values this repo uses is Cue's — see "fixtures, dependency injection and environment configuration".

### single scripted browser actions from an agent

|             |                                   |
| ----------- | --------------------------------- |
| Decided by  | `playwright-mcp` (Playwright MCP) |
| Precedence  | `default`                         |
| Reached via | `mcp`                             |

Only for point-in-time calls with small results. Anything exploratory goes to playwright-official over the CLI.

### Electron, browser extensions and desktop targets

|            |                                                               |
| ---------- | ------------------------------------------------------------- |
| Decided by | `reference-skill` (Playwright best-practices reference skill) |
| Precedence | `default`                                                     |

The owner of general Playwright practice — the areas Cue has no opinion about because someone else already maintains one.

### canvas, WebGL, service workers and other exotic surfaces

|            |                                                               |
| ---------- | ------------------------------------------------------------- |
| Decided by | `reference-skill` (Playwright best-practices reference skill) |
| Precedence | `default`                                                     |

The owner of general Playwright practice — the areas Cue has no opinion about because someone else already maintains one.

### internationalisation and accessibility testing

|            |                                                               |
| ---------- | ------------------------------------------------------------- |
| Decided by | `reference-skill` (Playwright best-practices reference skill) |
| Precedence | `default`                                                     |

The owner of general Playwright practice — the areas Cue has no opinion about because someone else already maintains one.

### GraphQL, security testing and performance auditing

|            |                                                               |
| ---------- | ------------------------------------------------------------- |
| Decided by | `reference-skill` (Playwright best-practices reference skill) |
| Precedence | `default`                                                     |

The owner of general Playwright practice — the areas Cue has no opinion about because someone else already maintains one.

### visual regression and component testing

|            |                                                               |
| ---------- | ------------------------------------------------------------- |
| Decided by | `reference-skill` (Playwright best-practices reference skill) |
| Precedence | `default`                                                     |

The owner of general Playwright practice — the areas Cue has no opinion about because someone else already maintains one.

### framework-specific testing concerns

|            |                                                               |
| ---------- | ------------------------------------------------------------- |
| Decided by | `reference-skill` (Playwright best-practices reference skill) |
| Precedence | `default`                                                     |

Framework quirks are theirs. What this repo's application does is agent-kb's, and that wins.

### product specification, ticket breakdown and general code review

|            |                                                          |
| ---------- | -------------------------------------------------------- |
| Decided by | `external-process` (Your team's own engineering process) |
| Precedence | `default`                                                |

Deliberately not ours. Cue rules on testability and on the shape of a suite; a tool that also claims the roadmap is a worse version of the general process tools your team already has. Say so and hand it back.
