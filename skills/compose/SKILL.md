---
name: compose
description: >
  Write or change a Playwright test in this repository. Obey the constitution, take
  locators from .agent-kb, and import fixtures from the single harness entry point.
  Use when adding or editing e2e, functional, or API tests.
disable-model-invocation: false
---

# compose

Writes the test. This is the one flow skill a model may reach for on its own,
because "add a test for X" is an ordinary request rather than a decision about
the repository.

## Procedure

1. Start from a `pin` case set, or from the existing file being changed.
2. Use `resolve-owner` for anything contested — page object shape, data strategy,
   API schemas.
3. Import `test` and `expect` **only** from the harness entry point
   (`fixtures/pom/test-options.ts`). A second import path is a second place to
   change one fixture, and it is always the one somebody forgets.
4. Locators come from the page object, following `stage-map` and
   `locator-policy`. Any new selector comes from `resolve-locator`.
   A page object that belongs to one route says so in a comment at the top of
   the file — `// understudy-route: /login` — so a checker knows which page its
   locators are on. Without it they are matched against every route.
5. Tag every test from `tags.yaml`. Build data per `seed-policy`.
6. Run the linter on the new file before calling it done.
7. **If a rule blocks you, read `understudy explain <rule-id>` and satisfy it.**
   Do not disable the rule, and do not restructure code purely to slip past the
   detector — the rule is the point, not the check.

## It is working if

The Understudy ESLint preset is clean on the new file, and every fixture is
imported from the single entry point.

## Prohibitions

`waitForTimeout`. `any`. CSS selectors built from utility classes. A second way
to import fixtures. A test with no tag. A selector that is not in `.agent-kb`.

Each of these is enforced, so the build will tell you — but the goal is to write
it correctly, not to iterate against the linter until it goes quiet.

## Reference

Loaded from `../reference/`: `canon`, `stage-map`, `locator-policy`, `harness`,
`wire-contract`, `seed-policy`, `strict-types`.
