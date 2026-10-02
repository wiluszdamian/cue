# Install for your assistant

_Add Cue as a plugin for Claude Code, Cursor, Codex, Grok, Gemini, OpenCode, or any agent that reads .agents/skills._

The catalog of procedures can be installed as a **plugin**, so your assistant
loads it the way it loads everything else — not as a folder of markdown you
copied in.

This is the light half of Cue: the skills. It does not install the ESLint
preset that fails a build when a rule is broken. For that, [set the project
up](./install.md) with `cue init`.

## Claude Code

```bash
/plugin marketplace add wiluszdamian/cue
/plugin install cue@cue
```

## Cursor

Add `wiluszdamian/cue` as a plugin marketplace, then install **cue**.
Cursor also loads the same package as an [Agent Plugin](https://agent-plugins.org)
from `plugins/cue/plugin.json`.

## Codex

```bash
codex plugin marketplace add wiluszdamian/cue
```

Then `/plugins` and install **cue**. Codex also reads the repo marketplace
at `.agents/plugins/marketplace.json`.

## Grok

```bash
grok plugin marketplace add wiluszdamian/cue
grok plugin install cue --trust
```

## Gemini CLI

```bash
gemini extensions install https://github.com/wiluszdamian/cue.git
```

## OpenCode

OpenCode does not have a marketplace this package can publish to. It already
reads `.opencode/skills/` and `.agents/skills/`:

```bash
npx skills add wiluszdamian/cue -a opencode
```

## .agents

The same command, targeting the directory several agents share:

```bash
npx skills add wiluszdamian/cue -a universal
```

That lands in `.agents/skills/`. Codex, Cursor, Gemini CLI, OpenCode and others
read it from there.

## What the plugin gives the assistant

`/cue` is the on-ramp. A model may invoke it when you ask for tests. It
routes to the rest of the catalog: `/compose` to write a test, `/resolve-locator`
for a selector, `/bind` if the repo is not wired up yet.

The plugin starts two MCP servers. `cue` answers read-only point
lookups — `explain_rule` for why a rule blocked a change and what to write
instead, `resolve_owner` for which source of guidance governs a topic,
`resolve_locator` for a real selector from the knowledge base rather than a
guessed one, and `resolve_route`, `resolve_api`, `get_evidence`, `get_freshness`
and `find_knowledge` for what is known about a page, an endpoint, and how far to
trust it. Playwright MCP handles point-in-time browser calls.

Mapping the live app still goes through `playwright-cli` and `/survey`: an
accessibility tree costs more context than the question it answers, which is why
exploration is the one thing deliberately kept out of MCP.

## Next

- **[Set up the project](./install.md)** — The guarantee — ESLint, AGENTS.md, the knowledge base.
- **[Write your first test](./first-test.md)**
