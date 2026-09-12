# Working as a team

_Different people use different AI assistants. Here is how that stays tidy._

## Everyone gets the rules, whatever they use

One file, `AGENTS.md`, carries your project's rules. Codex, Cursor, OpenCode,
Gemini and Grok all read it automatically. Claude Code reads it through a
one-line `CLAUDE.md`.

So the baseline covers everybody with no per-person setup.

If someone wants the skill catalog inside their assistant rather than through
`init`, they can [install the plugin](../start/plugins.md) for Claude Code,
Cursor, Codex, Grok, Gemini, OpenCode, or `.agents`. That is the procedures,
not the ESLint guarantee — both can be installed.

## Adding what a particular assistant needs

If a teammate uses something that needs its own small config:

```bash
npx @understudy/cli add cursor
npx @understudy/cli add claude-code
```

To see what is set up right now:

```bash
npx @understudy/cli list
```

To take one out again:

```bash
npx @understudy/cli remove cursor
```

`remove` uses a record of exactly what was installed, so it takes out what it put
in and nothing else. Anything you edited by hand is kept and reported rather than
deleted.

## Nobody is forced

`doctor` notices an assistant somebody is using and mentions it:

```
[ warn ] Cursor detected but not configured
      Evidence: .cursor/ in this project.
      fix: understudy add cursor
```

A warning, not an error. Detection is a suggestion, never a decision — a folder
left over from an experiment is not consent to write files.

## What ends up in git

**Commit these.** They are shared knowledge:

- `AGENTS.md` and any assistant config
- `.agent-kb/` — what is known about your app
- `eslint.config.mjs`, `playwright.config.ts`
- `.understudy/install.json` — the record of what was installed

**Ignore these.** Handled for you:

- `.auth/` — a live signed-in session
- `test-results/`, `playwright-report/`
- `.env` and other real environment files

## Reviewing changes to the app notes

Treat `.agent-kb/` like code. When a survey lands in a pull request, the diff
shows exactly which elements appeared or vanished — which is often the clearest
summary of a UI change anybody will get.

## In CI

`init` writes two workflows.

**Your tests**, sharded and merged into one report.

**Your guardrails:**

```yaml
- name: Constitution
  run: npx eslint . # the rules

- name: Environment
  run: npx @understudy/cli doctor --ci # is everything wired up

- name: Drift
  run: npx @understudy/cli sync --check # have the rules moved
```

Only genuine errors fail the build. Warnings never do — a team that has to
suppress warnings to ship stops reading them, and then stops reading the errors
too.
