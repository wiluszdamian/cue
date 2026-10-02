# @understudy/mcp

Point lookups over the Understudy rules and the project knowledge base.

Everything here is read-only, and every answer is short on purpose. An MCP
answer is paid for out of the same context window the actual task needs, so each
tool has a token ceiling that `test/tools.test.ts` asserts against every
reachable output rather than against one sample.

| Tool              | Answers                                                            | Ceiling    |
| ----------------- | ------------------------------------------------------------------ | ---------- |
| `explain_rule`    | why a rule exists and what to write instead                        | 400 tokens |
| `resolve_owner`   | which source of guidance governs a topic when several disagree     | 300 tokens |
| `resolve_locator` | the real selector for an element, with freshness and confidence    | 350 tokens |
| `resolve_route`   | a page: title, standing, freshness with reasons, elements, sources | 350 tokens |
| `resolve_api`     | endpoints matching a path, with the file each came from            | 350 tokens |
| `get_evidence`    | why a fact is believed: source lines, surveys, tests               | 300 tokens |
| `get_freshness`   | when a fact was confirmed, and what changed since                  | 250 tokens |
| `find_knowledge`  | up to five facts matching a few words                              | 350 tokens |

## What this server deliberately does not do

Browser exploration does not go through MCP. It goes through `playwright-cli`
and the official Playwright skills, which is Microsoft's own guidance and the
ownership table's ruling: a full accessibility tree costs more context than the
question it answers. This server exists to answer questions cheaply, not to
become another thing competing for the window.

`resolve_locator` returns a survey instruction rather than a guess when an
element is unknown. That refusal is the product — a selector invented on the
spot is the failure the knowledge base exists to prevent.

## Install

Installed for you by `understudy init`, alongside Playwright MCP. The snippets
below are for wiring it up by hand.

**Claude Code** — `.mcp.json`

```json
{
  "mcpServers": {
    "understudy": { "command": "npx", "args": ["-y", "@understudy/mcp@latest"] }
  }
}
```

**Cursor** — `.cursor/mcp.json`, same shape as above.

**Gemini CLI** — `.gemini/settings.json`, same shape as above.

**OpenCode** — `opencode.json`, same shape but under the `mcp` key.

**Codex** — `.codex/config.toml`

```toml
[mcp_servers.understudy]
command = "npx"
args = ["-y", "@understudy/mcp@latest"]
```

**Grok** — `~/.grok/config.toml`, same TOML block. Grok reads its MCP config
from your home directory rather than the project, so `understudy init` does not
write it and `understudy doctor` cannot verify it.

Swap `npx -y` for `pnpm dlx`, `yarn dlx` or `bunx` to match your package
manager; `understudy init` picks the right one from what it detects.

## Running it directly

```bash
npx -y @understudy/mcp@latest --project /path/to/project
```

`--project` defaults to the working directory and decides where the knowledge
base is read from. `--rules` points at a `rules/` directory explicitly.

Rules load from the project's `rules/` when it has one and from the copy baked
into this package otherwise — the fallback is the normal case, since the server
runs inside projects that have no `rules/` directory and must not need the CLI
or the ESLint plugin installed to answer a question. A malformed local `rules/`
falls back rather than taking the server down: over stdio, a crash on startup
reaches the client only as "connection closed".

Protocol traffic is the only thing written to stdout. Diagnostics go to stderr,
because a stray log line corrupts the stream and the failure looks like the
agent misbehaving.

## Contributing

The rules are generated. Edit `rules/constitution.yaml` at the repository root
and run `pnpm generate` — never `src/generated/rules.ts`.
