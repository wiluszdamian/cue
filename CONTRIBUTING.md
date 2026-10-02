# Contributing

The most common contribution is a new rule, so that path is documented first and
in detail.

## Setup

```bash
pnpm install
pnpm generate
pnpm verify
```

Node `^22.13 || >=24`, pnpm 10+.

The repo runs **two TypeScripts on purpose**. `pnpm build` and `pnpm typecheck`
use TypeScript 7 via `scripts/tsc7.mjs`; ESLint, your editor, and the engine's
runtime parser use TypeScript 6.0.3. TypeScript 7 removed the JavaScript compiler
API that `@typescript-eslint` depends on, and that package is the entire basis of
the ESLint plugin. Never call bare `tsc` — `node_modules/.bin/tsc` is ambiguous
between the two. Use `pnpm tsc`. See the "Two TypeScripts" section of
[AGENTS.md](AGENTS.md) for the full reasoning.

## Adding a rule

### 1. Decide whether it is ours

Cue is an integrator. A rule belongs in the constitution only if it is
**prescriptive**, **enforceable**, and **owned by nobody else**.

It is _not_ ours if it is about:

- running, debugging, tracing, video, storage state, request mocking, browser
  sessions, or generating tests — that is the official Playwright skills'
- Electron, browser extensions, canvas/WebGL, service workers, i18n, GraphQL,
  Lighthouse, component testing, visual regression, or framework specifics —
  that is the reference skill's

A rule about how _this repo_ structures its tests, names its tags, models its
data, or addresses its UI is ours.

### 2. Write it in `rules/constitution.yaml`

```yaml
- id: kebab-case-id
  tier: MUST | SHOULD | MUST_NOT
  severity: error | warn
  title: A short imperative statement
  rationale: >
    What goes wrong in practice if this is ignored. Concrete, not moral.
  detector:
    kind: ast # ast | regex | knowledge | manual
    selector: "CallExpression[callee.property.name='waitForTimeout']"
    refine: optional-registered-refinement
  scope: ['**/*.ts']
  exclude: []
  autofix: false
  message: >
    What is wrong, why, and the concrete correct alternative.
  skill: test-standards
  docsAnchor: kebab-case-id
  examples:
    bad: 'the shortest code that violates it'
    good: 'the same intent, done right'
  since: '0.2.0'
  deprecated: null
```

Notes that save a review round-trip:

- **`selector` is esquery**, evaluated against a TypeScript-ESTree AST and handed
  verbatim to ESLint as a listener key. Both halves therefore agree by
  construction. Test one interactively at <https://astexplorer.net> with the
  `@typescript-eslint/parser` parser.
- **`message` is the whole product of a block.** Naming only the rule teaches an
  agent to work around it. Name the replacement.
- **Scope is anchored.** `tests/**/*.ts` is matched as `**/tests/**/*.ts`, so it
  works against both repo-relative paths (the engine) and absolute ones (ESLint).
- **`kind: knowledge`** checks against `.agent-kb` rather than the code alone, and
  needs an index passed to `analyze`; without one the result lists the rule under
  `notChecked` instead of passing. A fixture for it carries its own `.agent-kb/`
  next to `good.ts` and `bad.ts`.
- **`kind: manual`** is the honest choice for a rule no linter can check. It gets
  documented and never reported. Do not invent a weak detector to make a manual
  rule look enforced.

### 3. Add a fixture pair

`packages/engine/test/fixtures/<rule-id>/bad.ts` must trigger the rule;
`good.ts` must not. The suite fails if a rule has no fixtures or a fixture
directory has no rule.

Both files are analysed as `tests/app/functional/fixture.spec.ts`, with every
other rule disabled — so write `good.ts` to satisfy _this_ rule, not all of them.

### 4. Extend the registries, only if you must

If the selector cannot express the rule alone:

- a **refinement** in `packages/engine/src/detectors/refinements.ts` decides
  whether a structural match is really a violation (it can see comments, sibling
  arguments, and the canonical tag list), then name it in `detector.refine`;
- a **fixer** in `packages/engine/src/detectors/fixers.ts`, keyed by rule id,
  enables `autofix: true`.

A fix must be safe to apply unattended — a rename or a wrapper, never a rewrite
that changes what a test asserts. `validateRules` fails if `autofix: true` has no
registered fixer, or if `refine` names a function that does not exist.

### 5. Regenerate and verify

```bash
pnpm generate   # plugin constitution + docs/rules/*.md + docs/constitution.md
pnpm verify
```

Never edit `packages/*/src/generated/`, `docs/constitution.md`,
`docs/rules/*.md`, `plugins/cue/`, `.claude-plugin/`, `.cursor-plugin/`,
`.grok-plugin/`, `.agents/plugins/`, or root `gemini-extension.json` by hand.
`pnpm sync:check` compares them byte-for-byte with what `rules/` and `skills/`
produce, and CI runs it.

### 6. Version it

- A new rule at `severity: error` is a **major** change.
- A new rule at `severity: warn` is a **minor** change.
- Set `since` to the version that will ship it.
- To retire a rule, set `deprecated: <version>` rather than deleting it. It stops
  being enforced but stays documented for one major cycle.

## Changing an existing rule

Widening a rule (catching more) follows the same versioning as adding one.
Narrowing it is a patch. Either way, add a fixture that covers the case you
changed — a rule change with no new fixture is a rule change nobody can review.

## The end-to-end check

`node scripts/e2e.mjs` runs the whole path against a real browser: it builds a project
in a directory with a space in its name, extracts from the demo app, surveys it (one
URL carries `&` and `%`), looks a locator up, checks the reference page objects, runs
the demo's Playwright tests, verifies the map, then breaks the app and verifies again.
Run `pnpm build` first, and install Chromium once with
`pnpm --filter @wiluszdamian/cue-demo-app exec playwright install chromium`. CI runs it on
Ubuntu for every push and on Windows weekly (`e2e-windows.yml`); pass `--keep` to leave
the project it built behind for inspection.

## Supporting a new `@playwright/cli`

The snapshot format belongs to Microsoft and changes without notice. Bump the
version pinned in `examples/demo-app/package.json`, run
`node scripts/capture-snapshots.mjs`, and review the new
`packages/engine/test/snapshots/playwright-cli@<version>/` directory against the
old one. If the text parses unchanged, keep both directories (the suite checks
every one). If it moved, add a format in
`packages/engine/src/agent-kb/snapshot/` and leave the old one registered.

## Style

- ESM with `NodeNext`; import specifiers end in `.js`.
- The engine and plugin share one AST dialect and one selector language. If you
  are writing a second implementation of a detector, stop.
- Prettier and ESLint are enforced. The repo lints itself with its own plugin.
- Comments explain _why_, not _what_. If a decision has a non-obvious trade-off,
  the comment names it.

## Reporting a conflict between sources

If an installed source (an official Playwright skill, the reference skill)
recommends something the constitution forbids, that is a genuine finding and the
kind of issue this project most wants. Open an issue with the rule id, the source,
and the conflicting example. It is resolved in the ownership table, not by
quietly softening the rule.
