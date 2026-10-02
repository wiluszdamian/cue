---
name: resolve-owner
description: >
  Decide which source of Playwright advice governs a topic when two of them
  disagree. Use before following guidance that conflicts with this repository's
  rules, or when unsure whether a topic is Understudy's at all.
disable-model-invocation: false
---

# resolve-owner

Several sources of Playwright knowledge are loaded at once and none knows the
others exist. This resolves which one decides.

**Input:** a topic, as free text.
**Output:** the owner, its precedence, and what to consult.
**Source:** `rules/ownership.yaml`, and nothing else.

## Procedure

1. Match the topic against the table below, on whole words rather than fragments.
2. Report the owner, its precedence, and what that owner says to consult.
3. If two topics match comparably and disagree about the owner, say so — the
   table is too coarse there, and that is worth reporting rather than resolving
   by coin flip.
4. If nothing matches, return the gap verdict below. Do not fall back to
   judgement.

## Precedence

`absolute` beats everything, including a source that states the opposite with
complete confidence. It is reserved for the two things no upstream source can
know: what this repository decided, and what this application actually looks
like.

Everything else is `default` — authoritative on its topic unless an absolute
owner also covers the question.

## When there is no entry

Say the topic is unowned and stop. That is a gap in the table, to be filled by a
person, **never an invitation to improvise**. A convention invented on the spot is
indistinguishable from one everyone agreed to, right up until the second person
has to guess it too.

<!-- BEGIN GENERATED: ownership -->

## The table

| Topic                                                           | Decided by                      |
| --------------------------------------------------------------- | ------------------------------- |
| page object model and locator organisation                      | `understudy` **(wins)**         |
| test structure, tagging and assertions                          | `understudy` **(wins)**         |
| locator strategy and selector priority                          | `understudy` **(wins)**         |
| fixtures, dependency injection and environment configuration    | `understudy` **(wins)**         |
| API testing and response schemas                                | `understudy` **(wins)**         |
| type safety in the suite                                        | `understudy` **(wins)**         |
| test data strategy                                              | `understudy` **(wins)**         |
| how the knowledge base gets populated                           | `understudy` **(wins)**         |
| application-specific selectors and test ids                     | `agent-kb` **(wins)**           |
| application behaviour, routes and domain vocabulary             | `agent-kb` **(wins)**           |
| running, filtering and debugging tests                          | `playwright-official`           |
| tracing, video, screenshots and reports                         | `playwright-official`           |
| authentication state, request mocking and network interception  | `playwright-official`           |
| browser exploration and inspecting a live page                  | `playwright-official` _via cli_ |
| Playwright configuration, projects and parallelism              | `playwright-official`           |
| single scripted browser actions from an agent                   | `playwright-mcp` _via mcp_      |
| Electron, browser extensions and desktop targets                | `reference-skill`               |
| canvas, WebGL, service workers and other exotic surfaces        | `reference-skill`               |
| internationalisation and accessibility testing                  | `reference-skill`               |
| GraphQL, security testing and performance auditing              | `reference-skill`               |
| visual regression and component testing                         | `reference-skill`               |
| framework-specific testing concerns                             | `reference-skill`               |
| product specification, ticket breakdown and general code review | `external-process`              |

## What each owner means

- **`understudy`** — rules/constitution.yaml and docs/rules/. The ESLint plugin enforces it, so a disagreement here surfaces as a failing build, not as a style debate.
- **`agent-kb`** — .agent-kb/ — app-map for what the running application looks like, product/ for what the source says. Every entry carries a freshness marker; an entry marked stale is a lead to verify, not a fact to use.
- **`playwright-official`** — Read the installed skill. Do not restate or fork its content into this repository — their release is our free update, and a stale copy of it is worse than no copy.
- **`playwright-mcp`** — Point-in-time browser calls with small results. Not exploration: a full accessibility tree through MCP costs more context than the task it serves.
- **`reference-skill`** — The owner of general Playwright practice — the areas Cue has no opinion about because someone else already maintains one.
- **`external-process`** — Cue has no opinion here and will not grow one. It rules on testability and on the shape of a suite, never on a roadmap. Say the topic is outside Cue and hand it back to however your team already writes specs, splits tickets, and reviews features — duplicating that is how a focused tool turns into a worse version of a general one.

<!-- END GENERATED: ownership -->

## It is working if

The answer names an owner and a precedence, or states plainly that the table has
a gap. "Probably Understudy's" is not an answer.
