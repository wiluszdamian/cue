# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Rule-specific versioning policy: a new rule at `severity: error` is a major
change; at `severity: warn`, a minor one. Rules are retired via `deprecated:`
rather than deletion, and stay documented for one major cycle.

## [0.8.0] — 2026-09-12

First public release. Everything below is new.

Understudy composes the Playwright skills other people maintain and adds the two
things nobody upstream can supply: what this repository's rules are, and what the
tested application actually looks like.

### The rules

- **`rules/constitution.yaml`** — 11 rules with a Zod schema, validated in CI. Ten
  are mechanically enforced; `selectors-from-agent-kb` is marked `manual` and
  published as unenforced, because a standard that overstates its own teeth stops
  being believed.
- **`rules/tags.yaml`** — six canonical tags, referenced by `require-test-tags`.
- **Messages written for a model.** Every rule states what is wrong, why, and the
  concrete replacement. `"Violates no-hard-waits"` teaches an agent to route
  around a rule; naming the alternative teaches it to satisfy one.
- **One source of truth.** Editing `rules/constitution.yaml` and running
  `pnpm generate` updates the ESLint plugin, the documentation, the skill catalog
  and the MCP server together. `pnpm sync:check` is a byte-exact drift gate over
  every generated artefact.

### Enforcement

- **`@understudy/engine`** — constitution loader with positioned error messages,
  AST (esquery) and regex detectors, a refinement and fixer registry, the
  `analyze` entry point, and five reporters: `pretty`, `json`, `sarif`, `github`,
  `agent`.
- **`@understudy/eslint-plugin`** — ESLint rules generated from the constitution,
  with `recommended` and `strict` flat presets and an autofix for
  `strict-zod-objects`.
- The repository lints itself with its own plugin.
- Every enforceable rule ships a `good.ts`/`bad.ts` fixture pair. The suite fails
  if a rule has no fixture, and fails if a fixture has no rule.
- The plugin's expected diagnostics are computed by running the engine over those
  same fixtures, so the two halves cannot drift apart silently.

### Arbitration

- **`rules/ownership.yaml`** — the table that decides which source wins when three
  skill trees disagree: 23 topics across 6 owners, with `precedence: absolute`
  reserved for the two sources nobody upstream can know.
- **`whoOwns()`** and `understudy-engine who-owns` — deterministic topic
  resolution, matching on whole tokens rather than substrings. "Unowned" is an
  explicit answer that names the gap instead of staying silent.
- Two cross-checks in CI: every `skill` the constitution cites must be claimed by
  an understudy-owned absolute topic, and every topic must be reachable by its own
  name.
- The table is generated into `AGENTS.md` — the always-loaded layer, deliberately
  not a skill, because a skill cannot announce that it outranks another skill.

### The knowledge base

- **`.agent-kb`** — schemas, store, freshness, redaction and correlation, plus
  `understudy survey <url>`, `verify-map` and `locator`. Exploration is delegated
  to `playwright-cli` behind a one-method driver, so parsing, correlating and
  writing are testable without a browser.
- **`understudy extract --source <path>`** — the static half, read from the
  product's own source. Four adapters: `data-testid` attributes on any stack,
  Next.js routes from both routers, OpenAPI endpoints, and i18n labels. An
  unrecognised stack degrades to a generic scan; a missing source reports the gap
  and points at `survey`.
- Selectors carry where they came from and when they were last confirmed. An
  element nobody surveyed produces a survey instruction, never a guess; a stale
  entry is returned as a candidate with an explicit instruction not to sound
  certain.
- Everything is redacted on the way in, because `.agent-kb` is committed. The
  scanner never opens `.env`, keys, certificates, dependencies or build output,
  and only names and `file:line` references are recorded — never product code.

### The CLI

- **`@understudy/cli`** — `init`, `doctor`, `sync`, `survey`, `extract`,
  `explain`, `add`, `remove`, `list` and `uninstall`. `init` detects the agents
  and the package manager, shows a plan, and writes nothing until it is accepted.
- **`.understudy/install.json`** — an install manifest with a hash per file, so
  `init` is idempotent, a hand-edited file is never silently overwritten, and
  `remove`/`uninstall` reverse exactly what was installed.
- **Region-based edits** — shared files like `.gitignore` and `AGENTS.md` keep the
  user's content; Understudy owns only the block between its markers, which makes
  removal an exact reversal rather than a guess.
- **`understudy sync --check`** reports drift for CI without writing. A
  hand-edited file is reported, never rewritten, and is not treated as drift;
  `--force` overrides and shows what it discards first.
- Orphan detection: a file the manifest still lists but no installed target
  produces is reported rather than silently deleted.
- Targets for Claude Code, Cursor, Codex, OpenCode, Gemini and Grok. Grok's
  limitation — per-user config outside the repository — is stated rather than
  silently skipped.
- A Playwright scaffold, skippable with `--bare`: config with sharding, artefacts
  on failure and a `grepInvert` guard on `@destructive`; one fixture import point;
  a page object in the house style; an auth setup that logs in once; shared
  negative-case data; husky, lint-staged and CI workflows. It is rendered for the
  detected package manager, and the engine runs over every generated file to prove
  the scaffold obeys the constitution it ships with.

### The skill catalog

- **`skills/`** — the second distribution channel: `understudy`, `compass`,
  `bind`, `survey`, `extract`, `pin`, `compose`, `inspect`, `resolve-owner`,
  `resolve-locator`. Installable with `npx skills add` and no engine at all.
- **`plugins/understudy/`** — generated plugin package with Agent Plugins
  `plugin.json`, Claude / Cursor / Grok / Codex manifests, Gemini
  `gemini-extension.json` and Playwright MCP. Marketplace files live at the
  repository root so `/plugin marketplace add wiluszdamian/understudy` works.
- `understudy` is the on-ramp a model may invoke; `compose`, `resolve-owner` and
  `resolve-locator` stay model-invocable. Everything else is orchestration a
  person triggers, enforced by a test.
- `skills/reference/` is generated from `rules/` and joins the drift gate — a
  reference quoting a rule that changed is worse than none, because it is wrong
  with authority.

### The MCP server

- **`@understudy/mcp`** — three read-only point lookups over stdio:
  `explain_rule`, `resolve_owner` and `resolve_locator`. It ships beside
  Playwright MCP rather than instead of it: that one drives a browser, this one
  answers questions about the rules and the knowledge base without one.
- Every tool has a token ceiling, asserted against every reachable output rather
  than one sample. An MCP answer is paid for out of the window the real task
  needs.

### Measurement

- **`@understudy/benchmark`** — measures whether the layer changes what an
  assistant writes: constitution violations per generated file, and the share of
  written selectors that name something real, both as comparisons of the same
  prompts with and without Understudy.
- Ten fixed, versioned prompts that never hint at the rules being measured, and a
  test asserting they do not.
- Scoring is deterministic and needs no API key: agents sit behind a one-method
  interface and runs are recorded, so anyone can re-score somebody else's run.
- **No benchmark has been run.** The harness records and scores; until a real run
  exists, this project makes no claim that assistants write better tests with
  Understudy.

### Documentation

- Plain Markdown in [`docs/`](docs/index.md) — read on GitHub, in an editor, or by
  an agent, with nothing to build. `docs/reference/` is generated from `rules/`;
  everything else is written by hand.
- Two checks stand in for what a site build used to catch: every relative link
  resolves against the filesystem, and `docs/index.md` must link into every
  section, since it is the only navigation.

### Toolchain

- The build and typecheck run **TypeScript 7** via `scripts/tsc7.mjs`, while
  ESLint, the editor and the engine's runtime parser run **TypeScript 6.0.3**.
  TypeScript 7 removed the JavaScript compiler API that `@typescript-eslint`
  requires, and that package is the basis of the ESLint plugin.
  `scripts/check-ts7-support.mjs` fails the moment the workaround becomes
  unnecessary, so nobody has to remember it.
- Windows is a first-class target: paths are normalised, `.gitattributes` forces
  LF, and the test matrix covers Linux, Windows and macOS on Node 22 and 24.

[0.8.0]: https://github.com/wiluszdamian/understudy/releases/tag/v0.8.0
