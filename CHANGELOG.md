# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Rule-specific versioning policy: a new rule at `severity: error` is a major
change; at `severity: warn`, a minor one. Rules are retired via `deprecated:`
rather than deletion, and stay documented for one major cycle.

## [1.0.0] - 2026-10-02

The first release. Everything below is new.

Cue composes the Playwright skills other people maintain and adds the two
things nobody upstream can supply: what this repository's rules are, and what the
tested application actually looks like.

### The rules

- **`rules/constitution.yaml`** — 11 rules with a Zod schema, validated in CI, all
  mechanically enforced. `selectors-from-agent-kb` checks locators against the
  knowledge base and reports as a warning (an error under `strict`) until its
  false-positive rate on real suites is known.
- **`rules/tags.yaml`** — six canonical tags, referenced by `require-test-tags`.
- **Messages written for a model.** Every rule states what is wrong, why, and the
  concrete replacement. `"Violates no-hard-waits"` teaches an agent to route
  around a rule; naming the alternative teaches it to satisfy one.
- **One source of truth.** Editing `rules/constitution.yaml` and running
  `pnpm generate` updates the ESLint plugin, the documentation, the skill catalog
  and the MCP server together. `pnpm sync:check` is a byte-exact drift gate over
  every generated artefact.

### Enforcement

- **`@wiluszdamian/cue-engine`** — constitution loader with positioned error messages,
  AST (esquery) and regex detectors, a refinement and fixer registry, the
  `analyze` entry point, and five reporters: `pretty`, `json`, `sarif`, `github`,
  `agent`.
- **`@wiluszdamian/cue-eslint-plugin`** — ESLint rules generated from the constitution,
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
- **`whoOwns()`** and `cue-engine who-owns` — deterministic topic
  resolution, matching on whole tokens rather than substrings. "Unowned" is an
  explicit answer that names the gap instead of staying silent.
- Two cross-checks in CI: every `skill` the constitution cites must be claimed by
  a cue-owned absolute topic, and every topic must be reachable by its own
  name.
- The table is generated into `AGENTS.md` — the always-loaded layer, deliberately
  not a skill, because a skill cannot announce that it outranks another skill.

### The knowledge base

- **`.agent-kb`** — schemas, store, freshness, redaction and correlation, plus
  `cue survey <url>`, `verify` and `locator`. Exploration is delegated
  to `playwright-cli` behind a one-method driver, so parsing, correlating and
  writing are testable without a browser.
- **`cue extract --source <path>`** — the static half, read from the
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

- **`@wiluszdamian/cue`** — `init`, `doctor`, `sync`, `survey`, `extract`,
  `discover`, `check`, `verify`, `locator`, `context`, `explain`, `add`, `remove`,
  `list` and `uninstall`. `init` detects the agents
  and the package manager, shows a plan, and writes nothing until it is accepted.
- **`.cue/install.json`** — an install manifest with a hash per file, so
  `init` is idempotent, a hand-edited file is never silently overwritten, and
  `remove`/`uninstall` reverse exactly what was installed.
- **Region-based edits** — shared files like `.gitignore` and `AGENTS.md` keep the
  user's content; Cue owns only the block between its markers, which makes
  removal an exact reversal rather than a guess.
- **`cue sync --check`** reports drift for CI without writing. A
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

- **`skills/`** — the second distribution channel: `cue`, `compass`,
  `bind`, `survey`, `extract`, `pin`, `compose`, `inspect`, `resolve-owner`,
  `resolve-locator`. Installable with `npx skills add` and no engine at all.
- **`plugins/cue/`** — generated plugin package with Agent Plugins
  `plugin.json`, Claude / Cursor / Grok / Codex manifests, Gemini
  `gemini-extension.json` and Playwright MCP. Marketplace files live at the
  repository root so `/plugin marketplace add wiluszdamian/cue` works.
- `cue` is the on-ramp a model may invoke; `compose`, `resolve-owner` and
  `resolve-locator` stay model-invocable. Everything else is orchestration a
  person triggers, enforced by a test.
- `skills/reference/` is generated from `rules/` and joins the drift gate — a
  reference quoting a rule that changed is worse than none, because it is wrong
  with authority.

### The MCP server

- **`@wiluszdamian/cue-mcp`** — read-only point lookups over stdio:
  `explain_rule`, `resolve_owner`, `resolve_locator`, `resolve_route`,
  `resolve_action`, `resolve_api`, `get_evidence`, `get_freshness`,
  `find_knowledge` and `get_context`. It ships beside
  Playwright MCP rather than instead of it: that one drives a browser, this one
  answers questions about the rules and the knowledge base without one.
- Every tool has a token ceiling, asserted against every reachable output rather
  than one sample. An MCP answer is paid for out of the window the real task
  needs.

### Measurement

- **`@wiluszdamian/cue-benchmark`** — measures whether the layer changes what an
  assistant writes: constitution violations per generated file, and the share of
  written selectors that name something real, both as comparisons of the same
  prompts with and without Cue.
- Ten fixed, versioned prompts that never hint at the rules being measured, and a
  test asserting they do not.
- Scoring is deterministic and needs no API key: agents sit behind a one-method
  interface and runs are recorded, so anyone can re-score somebody else's run.
- **No benchmark has been run.** The harness records and scores; until a real run
  exists, this project makes no claim that assistants write better tests with
  Cue.

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

### Also in this release

- **Releases are one manual workflow run.** `.github/workflows/release.yml` (Run workflow, with a
  version) sets the version everywhere, regenerates what follows it, checks that the version, the
  changelog and every package agree, verifies, commits and tags, publishes the four public
  packages to npm together with provenance, and creates the GitHub release from the changelog.
  It has no push, tag or schedule trigger, and `dry_run` (the default) stops short of every step
  that leaves the runner.

- **Existing tests and page objects are read as evidence.** `extract` now records the role
  locators the suite already uses (with the page each was on) and the actions its page objects
  perform, in `.agent-kb/product/from-tests.yaml`. They load as `inferred` and cite the file,
  line and class; a survey of the same element raises them and keeps the test as one more
  reason, and a spelling that differs between the test and the page is kept as a conflict. A
  test alone can never make a fact `observed` or `verified` (the knowledge model refuses it). A
  locator that only a test has seen is judged `unverified`, not `stale`. New MCP tool
  `resolve_action` answers "what does the project already do on this page".

- **Translation catalogues are read by a parser.** `extract` used to match one `key: "label"`
  per line, so a nested catalogue gave the last segment (`submit`) and a minified one gave
  nothing. JSON and YAML now give the full dotted key (`auth.login.submit`) with the line of
  its value, list items as `steps.0`, placeholders (`{{name}}`, ICU plurals) exactly as written,
  and the same answer for the same catalogue in either format. A file that cannot be parsed is
  a gap and the rest are still read. With several locales the English label is kept and the
  others are named as left out, because a term does not record its locale.

- **`compatibility.yaml`**: the range and the tested version of each tool Cue composes
  (`@playwright/cli`, `@playwright/mcp`, `@playwright/test`, typescript-eslint). The MCP
  configuration `init` writes and the plugin manifests now pin exact versions instead of
  `@latest`; `doctor` warns, with the command to install the tested version, when an installed
  tool is outside its range; and the weekly `upstream` workflow fails, saying which tool and what
  to do, when a new release has moved outside it.

- **`doctor` looks at the knowledge, not only the setup.** Unreadable or unsupported files,
  pages in the older format, facts that are old or whose code changed, sources that disagree,
  locators in your tests that the notes do not know, test ids that left the source, one element
  noted twice, and pages known only from the code. A healthy knowledge base is still one line,
  every problem comes with a command that exists, and only an unreadable file fails `--ci`.

- **`get_context`** (MCP) and **`cue context "<task>"`**: one answer, at the start of a
  task, with the page it is about, the matching elements, endpoints, vocabulary, the rules, and
  how fresh each part is, inside a token budget the caller sets (200 to 3000). Retrieval is by
  words, not a model, so the same task over the same notes gives the same answer. Trimming drops
  a second page, vocabulary, endpoints and elements in that order, never the rules or the ages.

- **Five MCP lookups over the knowledge base**: `resolve_route`, `resolve_api`, `get_evidence`,
  `get_freshness` and `find_knowledge`. Each answers from the same engine functions the CLI uses,
  has a token ceiling asserted over hits, misses and oversized input, and answers a miss with
  `status: unknown` and the command that would find out, never a value that was made up.

- **`cue discover`** looks at a repository without changing it and reports the
  Playwright config (read as text, never run: test folder and projects), how many spec
  files, how many page objects (classes that hold a `Page`, wherever they live), what the
  product's source could supply (test ids, Next.js routes, OpenAPI endpoints, labels, with
  counts), the coding agents and instruction files it can see, and what is already set up. It
  ends with the commands that would act on it. `--source` points at the product when it is
  elsewhere; `--json` prints the report. `init` opens its plan with one line of the same.

- **`survey` can look at some pages again.** `--route /a,/b` surveys the pages you name,
  `--stale` those with something stale or read from code that has changed, and
  `--affected-by <git range>` those read from files changed over the range. It prints a plan
  with the reason for each page before opening anything (`--dry-run` stops there), skips pages
  with a parameter and says why, carries on past a page that fails, and reports each as
  updated, unchanged or failed. The address comes from `--base-url` or `CUE_BASE_URL` and
  is never written to `.agent-kb`.

- **Notes go stale when the code behind them changes, not only with age.** A route whose
  elements were confirmed by a `data-testid` records the product file it came from; `verify`
  now compares that file with the one on disk (found where `extract` read it, or with
  `--source`) and reports the route as *possibly stale*, naming the file, unless a live check
  just found it unchanged. `verify --affected-by <git-range>` checks only the routes read from
  files changed over that range. `locator`, the `resolve_locator` MCP tool and `check` say when
  the code behind an answer has changed (`check` calls it stale). Nothing is claimed when the
  product cannot be found: `verify` says it did not compare. Unrelated changes invalidate
  nothing.

- `scripts/prepare-benchmark-project.mjs` builds the project a benchmark is run against
  (Cue installed, and a knowledge base of the demo application made with `extract`
  and `survey`), and `benchmarks/RUNBOOK.md` is the procedure for the first real,
  paid run. The default benchmark model is now `claude-opus-5-5`.

- **Benchmark: repetitions, defects, and a report.** `record --runs N` asks for several
  answers per prompt and condition (default 1, since each is a paid call; the total is
  printed first), and scoring finds how many it has and reports the spread across runs.
  Prompts that name a defect of the demo application are run a second time with it
  switched on, and a test that still passes is reported as one that does not notice it.
  `--report <dir>` writes `report.md` and `report.json` with the commit, tool versions and
  model, both conditions side by side, every failure linked to its recording, the metrics
  that were not measured (never shown as zero), and what the numbers cannot show. Answers
  written by hand are labelled as such at the top. Recordings made before this are read as
  they were.

- **The benchmark can run what a model wrote.** A second prompt set (`--prompt-set 2`,
  seven tasks on the demo application, several tied to a defect it can be given) and
  `--execute` compile each answer with the project's TypeScript and run it once, with
  no retries, in a real browser, reporting compile success and first-run pass per
  condition and per answer. Locators are judged by the same analyzer as `cue
  check` (right element, right page, unique), with those it cannot decide counted
  separately and never as invented. A path in a model's answer that leaves the workspace
  is refused. `pnpm --filter @wiluszdamian/cue-benchmark test:integration` runs the real thing.
  Nothing has been measured with a model yet.

- `scripts/e2e.mjs` runs the whole user path against a real browser, from `init` to a
  deliberately broken app, and CI runs it on Ubuntu for every push (Windows weekly).
  The demo app gained a `login-button-renamed` mutation, so that `verify` has a page
  that needs no session to drift on.

- **`cue check [files…]`** reports which locators in your tests the knowledge base
  does not know, with the nearest real locator and the command to run, using the same
  analyzer the lint rule will. Output is `human`, `agent`, `json`, `sarif` or `github`.
  `--ci` fails on what breaks at runtime (an invented locator, or a real one on the wrong
  page); `--ci=strict` fails on any finding and when nothing could be checked. Locators the
  code alone cannot decide are always counted and listed as not judged.

- **`analyzeLocators`** (`@wiluszdamian/cue-engine`): for each locator in a test file, says
  whether the knowledge base knows it — `known`, `ambiguous` (several elements match,
  which Playwright's strict mode refuses), `unknown`, `wrong-route`, `stale`,
  `unverified` or `undecidable` — with the nearest known locators and a sentence on
  what to do. Matching follows Playwright (case-insensitive substring, `exact`),
  the route comes from the closest earlier `page.goto` or an `cue-route`
  comment, and anything that cannot be decided from the code (variables, regular
  expressions, `getByText`, CSS) is reported as undecidable instead of guessed at.
  Nothing uses it yet; `cue check` and a lint rule follow.

- **Knowledge Core model** (`packages/engine/src/knowledge`, exported from
  `@wiluszdamian/cue-engine`). A versioned, typed model of what is known about an
  application: twelve kinds of fact (application, environment, route, component,
  role, state, action, locator, test-id, api, term, data-requirement), each citing
  evidence by id, with a stored status (`inferred`, `observed`, `verified`, `stale`).
  Facts that rest only on an agent's inference cannot be `observed` or `verified`;
  references must resolve; a model version newer than this Cue is refused
  with an instruction to upgrade.
- **`loadKnowledge(root)`** reads the existing `.agent-kb` files (route maps,
  `testids.yaml`, `surface.yaml`, `vocabulary.yaml`) into that model, and
  `indexKnowledge(kb)` answers questions about it: routes, locators on a route,
  who has a test id, evidence, coverage, freshness. Files it cannot use come back
  as issues instead of being skipped. The old `confidence` field becomes a status
  plus evidence (`confirmed` → verified, `runtime-only` → observed, `code-only` and
  `unknown` → inferred).
- **Conflicts are recorded, not resolved.** When two sources disagree about a field
  — two translation files giving different labels for one key, say — the first
  value stays and the disagreement is kept with the evidence on each side.

[1.0.0]: https://github.com/wiluszdamian/cue/releases/tag/v1.0.0
