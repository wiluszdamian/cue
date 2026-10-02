<!-- GENERATED. Run `pnpm skills:generate`. Do not edit. -->

# Cue plugin

The skill catalog, packaged so coding agents can install it as a plugin rather
than copying markdown by hand. Procedures are the same files as `skills/`; this
directory is the installable unit around them.

Two MCP servers are bundled. `cue` answers point lookups —
`explain_rule`, `resolve_owner`, `resolve_locator`, `resolve_route`,
`resolve_api`, `get_evidence`, `get_freshness` and `find_knowledge` — against this
project's rules and knowledge base, and writes nothing. Playwright MCP handles
point-in-time browser calls. Exploration still goes through `playwright-cli`:
an accessibility tree costs more context than the question it answers. See the
ownership table in `AGENTS.md`.

## Install

| Agent               | Command                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| Claude Code         | `/plugin marketplace add wiluszdamian/cue` then `/plugin install cue@cue`             |
| Cursor              | add `wiluszdamian/cue` as a marketplace, install **cue**                              |
| Codex               | `codex plugin marketplace add wiluszdamian/cue`                                       |
| Grok                | `grok plugin marketplace add wiluszdamian/cue` then `grok plugin install cue --trust` |
| Gemini CLI          | `gemini extensions install https://github.com/wiluszdamian/cue.git`                   |
| OpenCode            | `npx skills add wiluszdamian/cue -a opencode`                                         |
| .agents (universal) | `npx skills add wiluszdamian/cue -a universal`                                        |

OpenCode and the `.agents/skills` convention do not have a marketplace of their
own that this package can publish to. `npx skills add` copies the catalog into
the directory those agents already read.

This is the light channel: conventions, not the ESLint guarantee. For
enforcement:

```bash
npx @wiluszdamian/cue init
```

## Skills

| Invocation         | Type  | What it does                                                                                                                 |
| ------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/cue`             | model | Use the Cue plugin to write Playwright tests in this repository.                                                             |
| `/compass`         | user  | Name the right Cue skill for the situation and stop.                                                                         |
| `/bind`            | user  | Wire this repository to Cue once: check the environment, choose agent targets, and install the constitution and scaffold.    |
| `/survey`          | user  | Map the running application into .agent-kb/app-map by exploring it with playwright-cli.                                      |
| `/extract`         | user  | Read the product source and write its structure into .agent-kb/product — routes, endpoints, entities, roles, test ids.       |
| `/pin`             | user  | Turn a testing intent into a concrete set of test cases with data, tags and locator candidates.                              |
| `/compose`         | user  | Write or change a Playwright test in this repository.                                                                        |
| `/inspect`         | user  | Audit an existing Playwright suite against the constitution, and report drift in the knowledge base and routes with no test. |
| `/resolve-owner`   | model | Decide which source of Playwright advice governs a topic when two of them disagree.                                          |
| `/resolve-locator` | model | Find the real selector for an element from the project knowledge base, with its freshness and confidence.                    |

`/cue` is the on-ramp a model may invoke. The rest of the getting-started
and main-flow skills stay user-invoked so a mention of testing does not start a
survey.

## Credits

Cue composes work maintained by others — the official Playwright skills
and CLI, and Playwright MCP (Microsoft, Apache-2.0), and a Playwright
best-practices reference skill (Currents Software Inc., MIT). It is not
affiliated with Microsoft, Anthropic, OpenAI, Google, xAI, or Currents.
