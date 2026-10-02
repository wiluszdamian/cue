# Understudy — working agreement

Understudy is an **integrator**, not an author of testing knowledge. It composes
the official Playwright skills (Microsoft), Playwright MCP (Microsoft), and a
third-party reference skill, and adds the two things nobody else can supply:
what _this_ repo's rules are, and what the tested application actually looks
like. When you are tempted to write a document explaining Playwright, stop — that
is someone else's job and their release is our free update.

## Who decides what

<!-- BEGIN GENERATED: ownership -->

<!-- Generated from rules/ownership.yaml. Run `pnpm docs:generate`. Do not edit by hand. -->

Three skill trees compete for your attention and none of them knows the other
two exist. This table decides. An owner marked **(wins)** outranks every other
source, including one that states the opposite confidently.

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

**A topic that is not listed is a gap in `rules/ownership.yaml`, not an invitation
to improvise.** Say the topic is unowned and open an issue. Full detail, including
what to consult for each owner, is in docs/reference/ownership.md.

<!-- END GENERATED: ownership -->

## Where things live

| Path                                                                                               | What it is                                            |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `rules/constitution.yaml`                                                                          | The rules we own. **Source of truth.**                |
| `rules/tags.yaml`                                                                                  | Canonical test tags.                                  |
| `compatibility.yaml`                                                                               | Tool versions this release was tested against.        |
| `packages/engine`                                                                                  | Loader, detectors, analyzer, reporters.               |
| `packages/engine/src/knowledge`                                                                    | The Knowledge Core model. Pure: no I/O, no CLI.       |
| `packages/eslint-plugin`                                                                           | ESLint rules **generated** from the constitution.     |
| `packages/mcp`                                                                                     | Read-only point lookups, over stdio.                  |
| `skills/*/SKILL.md`                                                                                | The skill catalog. Procedures, hand-written.          |
| `skills/reference/`, `skills/README.md`                                                            | **Generated.** Never hand-edited.                     |
| `plugins/understudy/`                                                                              | **Generated.** Agent plugin package around `skills/`. |
| `.claude-plugin/`, `.cursor-plugin/`, `.grok-plugin/`, `.agents/plugins/`, `gemini-extension.json` | **Generated.** Marketplace manifests.                 |
| `docs/reference/`                                                                                  | **Generated.** Never hand-edited.                     |
| `packages/*/src/generated/`                                                                        | **Generated.** Never hand-edited.                     |

## The one rule that shapes everything else

Change behaviour by editing `rules/constitution.yaml`, then run `pnpm generate`.

The plugin, the docs, and the MCP tools are all downstream of that one file. If
you find yourself editing a rule's message in two places, you have gone around
the design rather than through it. The only things that legitimately live in code
are the ones data cannot express — a refinement in
`packages/engine/src/detectors/refinements.ts` or a fixer in `fixers.ts`, both
keyed by name from the constitution, and both validated to exist by
`validateRules`.

## Adding or changing a rule

1. Edit `rules/constitution.yaml`. A rule needs a `detector`, a `scope`, an
   `examples` pair, and a `message` that says what is wrong, why, and the
   concrete correct alternative.
2. Add `packages/engine/test/fixtures/<rule-id>/{good,bad}.ts`. The suite fails
   if a rule has no fixture pair, and fails if a fixture has no rule.
3. `pnpm generate` — regenerates the plugin's constitution and the docs.
4. `pnpm verify` — format, lint, typecheck, test, drift check.

Use `detector.kind: manual` for a rule that is real but not mechanically
checkable. It will be documented and never reported. Do not invent a weak
detector to make a manual rule look enforced: the split between what we check and
what we merely state is published, and it is the reason the enforced half is
believed.

## Messages are written for a model

A blocked write is the whole product. `"Violates rule no-hard-waits"` teaches an
agent to route around the rule; naming the replacement teaches it to satisfy the
rule. Every message states the wrong thing, the reason, and the right thing.

## Two TypeScripts, on purpose

`pnpm build` and `pnpm typecheck` run **TypeScript 7** through
`scripts/tsc7.mjs`. Everything else — ESLint, the editor's language service, and
the engine's own parser at runtime — runs **TypeScript 6.0.3**.

TypeScript 7 removed the JavaScript compiler API: `typescript@7` exports `"."`
as `lib/version.cjs`, and `ts.createProgram` no longer exists. `@typescript-eslint`
needs that API, and every release of it caps its peer at `typescript <6.1.0`.
Since the ESLint plugin _is_ the product's mechanical guarantee, dropping
typescript-eslint is not an option, so TypeScript 7 is installed under the
`typescript7` alias and invoked explicitly.

Two consequences worth holding in mind:

- The build and the linter type-check with different compiler versions. They
  agree today, and `pnpm verify` runs both, so a disagreement shows up as a
  failing build rather than as a surprise later.
- `node_modules/.bin/tsc` is ambiguous — both packages want that name. Never call
  bare `tsc`; use `pnpm tsc`, which routes to `scripts/tsc7.mjs`.

`scripts/check-ts7-support.mjs` fails the moment typescript-eslint accepts
TypeScript 7, which is the signal to delete the alias, the wrapper, and this
section. A workaround nobody is watching becomes permanent.

## Publishing

Release with `pnpm release`. Never `npm publish`.

Two things make the npm path quietly wrong:

- **`workspace:*` is rewritten by pnpm and not by npm.** Every package here
  depends on `@understudy/engine` that way. `pnpm publish` turns it into a real
  version; `npm publish` ships the literal string `workspace:*`, which no
  consumer can resolve. The tarball builds, uploads and installs-fails — and npm
  releases cannot be replaced, only deprecated.
- **Scoped packages default to restricted.** Each publishable package carries
  `publishConfig.access: public` for that reason. Removing it turns a release
  into a paywall error that reads like an auth problem.

`pnpm release:dry` runs the whole thing without uploading. Private packages
(`@understudy/benchmark`) are skipped automatically.

### The name on the registry is not the name you type

The CLI publishes as **`@understudy/cli`** and installs a bin called
**`understudy`**. The bare name `understudy` belongs to an unrelated package on
npm, so `npx understudy init` on a machine that has not installed it yet fetches
a stranger's code. Advice aimed at a fresh project therefore says
`npx @understudy/cli <command>`; advice aimed at a project that already installed
it says `understudy <command>`, which resolves to the local bin.

`packages/cli/test/advice.test.ts` checks every command the CLI advises actually
exists, and it recognises both spellings. It has to: when the package was
renamed, a pattern matching only the bare form silently stopped checking the npx
advice and the suite stayed green.

## Conventions

- TypeScript, ESM, `NodeNext`. Import specifiers end in `.js`.
- `pnpm` workspaces. Node `^22.13 || >=24`. See "Two TypeScripts" above before
  touching anything version-related.
- The engine and the plugin share one AST dialect (typescript-estree) and one
  selector language (esquery). Never re-implement a detector on one side.
- Windows is a first-class target: paths are normalised, and `.gitattributes`
  forces LF.

## The MCP server

`packages/mcp` serves read-only point lookups over stdio: `explain_rule`,
`resolve_owner`, `resolve_locator`, and the knowledge lookups `resolve_route`,
`resolve_action`, `resolve_api`, `get_evidence`, `get_freshness`, `find_knowledge` and
`get_context`. It ships in the plugin
manifests and in every agent config `understudy init` writes, next to Playwright
MCP rather than instead of it: that one drives a browser, this one answers
questions about the rules and the knowledge base without one.

Two things about it are load-bearing:

- **Exploration never goes through MCP.** It goes through `playwright-cli`, per
  the ownership table. An accessibility tree costs more context than the
  question it answers.
- **Every tool has a token ceiling**, asserted against every reachable output
  rather than one sample. An MCP answer is paid for out of the window the real
  task needs, so a rule message that grew unboundedly would start costing more
  every release with nobody noticing.

Every unknown answers `status: unknown` plus the command that would find out, never
a value that was made up. There is no `resolve_role`/`resolve_state`/`resolve_component`
until acquisition produces such facts: a tool that always says unknown costs context.

Later tools — `list_rules`, `validate_source`, `describe_feature`,
`list_surface`, `resolve_pattern`, `playwright_docs`, `inspect_suite`,
`contract_coverage` — do not block v1.

## Not yet built

The benchmark harness records and scores; **no benchmark has been run.**
`understudy-benchmark record` is the only paid network call in the repository,
and nothing here carries credentials — until a run exists, the docs and the
landing page say plainly that the project makes no claim about writing better
tests. The build order is in `.planning/README.md`.

## Vocabulary

The blueprint renamed several things after the first packages were written. The
current names are the only ones that should appear in new work:

| Not this          | This              |
| ----------------- | ----------------- |
| `describe`        | `extract`         |
| `explore`         | `survey`          |
| `audit`           | `inspect`         |
| `page-objects`    | `stage-map`       |
| `selectors`       | `locator-policy`  |
| `test-standards`  | `canon`           |
| `fixtures`        | `harness`         |
| `api-testing`     | `wire-contract`   |
| `type-safety`     | `strict-types`    |
| `data-strategy`   | `seed-policy`     |
| `app-exploration` | `cartography`     |
| `who_owns`        | `resolve_owner`   |
| `lookup_selector` | `resolve_locator` |

## Writing to somebody else's repository

`packages/cli` writes files into projects that are not this one, so two rules are
absolute there:

- **Never overwrite a file the user edited.** Every write goes through
  `plan` → manifest → `apply`, and a hash mismatch means the file is theirs now.
- **Touch an existing file only through a marked region.** That is what makes
  removal an exact reversal instead of a guess.

Adding an agent means adding one `Target` — see `packages/cli/src/targets/`.
