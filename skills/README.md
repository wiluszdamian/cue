<!-- GENERATED from rules/. Run `pnpm skills:generate`. Do not edit. -->

# Cue skills

The light half of Cue: procedures an agent can follow, with no engine, no
ESLint and no manifest.

```bash
npx skills add wiluszdamian/cue
npx skills add wiluszdamian/cue --skill=compass
```

Or install the same catalog as a plugin for Claude Code, Cursor, Codex, Grok,
Gemini, OpenCode, or `.agents` — see `plugins/cue/README.md`.

That gets you the conventions. It does not get you the **guarantee** — the ESLint
preset that fails a build when a rule is broken, whether or not an agent was
involved. For that, install the product:

```bash
npm create cue
cue init
```

| Skill                                          | Group           | Type  | What it does                                                                                                                 |
| ---------------------------------------------- | --------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| [`/cue`](cue/SKILL.md)                         | Getting started | model | Use the Cue plugin to write Playwright tests in this repository.                                                             |
| [`/compass`](compass/SKILL.md)                 | Getting started | user  | Name the right Cue skill for the situation and stop.                                                                         |
| [`/bind`](bind/SKILL.md)                       | Getting started | user  | Wire this repository to Cue once: check the environment, choose agent targets, and install the constitution and scaffold.    |
| [`/survey`](survey/SKILL.md)                   | Main flow       | user  | Map the running application into .agent-kb/app-map by exploring it with playwright-cli.                                      |
| [`/extract`](extract/SKILL.md)                 | Main flow       | user  | Read the product source and write its structure into .agent-kb/product — routes, endpoints, entities, roles, test ids.       |
| [`/pin`](pin/SKILL.md)                         | Main flow       | user  | Turn a testing intent into a concrete set of test cases with data, tags and locator candidates.                              |
| [`/compose`](compose/SKILL.md)                 | Main flow       | user  | Write or change a Playwright test in this repository.                                                                        |
| [`/inspect`](inspect/SKILL.md)                 | Main flow       | user  | Audit an existing Playwright suite against the constitution, and report drift in the knowledge base and routes with no test. |
| [`/resolve-owner`](resolve-owner/SKILL.md)     | Invoked layer   | model | Decide which source of Playwright advice governs a topic when two of them disagree.                                          |
| [`/resolve-locator`](resolve-locator/SKILL.md) | Invoked layer   | model | Find the real selector for an element from the project knowledge base, with its freshness and confidence.                    |

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

## Reference

[`reference/`](reference/) is generated from the project constitution and cited
by `/compose` and `/pin`. It is not invoked directly.

- [`canon`](reference/canon.md)
- [`cartography`](reference/cartography.md)
- [`harness`](reference/harness.md)
- [`locator-policy`](reference/locator-policy.md)
- [`seed-policy`](reference/seed-policy.md)
- [`stage-map`](reference/stage-map.md)
- [`strict-types`](reference/strict-types.md)
- [`wire-contract`](reference/wire-contract.md)

## Credits

Cue composes work maintained by others — the official Playwright skills
and CLI, and Playwright MCP (Microsoft, Apache-2.0), and a Playwright
best-practices reference skill (Currents Software Inc., MIT). It is not
affiliated with Microsoft, Anthropic, OpenAI, Google, xAI, or Currents.
