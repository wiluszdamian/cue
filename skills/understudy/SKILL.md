---
name: understudy
description: >
  Use the Understudy plugin to write Playwright tests in this repository. Use
  when adding, changing, or reviewing e2e, functional, or API tests, looking up
  a selector, or resolving conflicting Playwright advice.
disable-model-invocation: false
---

# understudy

On-ramp for the Understudy plugin. The catalog is already installed; this skill
says which of its procedures to follow, and for `/compose`, `/resolve-locator`
and `/resolve-owner`, follows them.

It does not set the repository up, map the app, or invent a selector.

## Procedure

1. If this repository has no `AGENTS.md` Understudy block, no `.agent-kb/`, or
   `understudy doctor` would error — **stop** and tell the person to run
   `/bind`. Setup is user-invoked. Do not run `understudy init` unprompted.
2. If two Playwright sources disagree (official skills vs this repo vs a
   general best-practices skill) — follow `/resolve-owner`. The table in
   `AGENTS.md` is the answer; an unlisted topic is a gap, not a vote.
   Starting on a task that touches the application, call `get_context` once
   (MCP) or run `understudy context "<task>"`: the page, its known elements,
   endpoints, the rules and how fresh each is, in one answer. `status: unknown`
   means nothing is known yet; follow its suggested action instead of guessing.
3. If the task is a selector, a locator, or "how do I click X" — follow
   `/resolve-locator`. No entry means survey that route, not a guessed CSS
   string.
4. If the task is writing or changing a test — follow `/compose`. Locators from
   `.agent-kb` or from a survey in this session; fixtures from the single
   harness entry; tags from `tags.yaml`.
5. Anything else — name the user-invoked skill and **stop**:

   | Situation                        | Skill      |
   | -------------------------------- | ---------- |
   | Fresh repo, nothing wired        | `/bind`    |
   | Don't know the live UI           | `/survey`  |
   | Product source is alongside      | `/extract` |
   | Know what to check, no cases yet | `/pin`     |
   | Existing suite to assess         | `/inspect` |
   | Don't know which of the above    | `/compass` |

## It is working if

The next step is a named Understudy skill or a finished test that satisfies
`/compose`. A selector with no `.agent-kb` entry was refused, not invented.

## Prohibitions

- Do not guess a selector.
- Do not skip `/bind` on a repo that is not wired up by running the rest of the
  catalog anyway — the constitution is not in force there.
- Do not re-teach Playwright. Driving the browser, tracing, and config are
  `playwright-official`. This plugin owns how tests are structured _here_.
