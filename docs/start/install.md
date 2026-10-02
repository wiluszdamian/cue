# Set it up

_Add Cue to a project in about five minutes._

## Before you start

You need [Node.js](https://nodejs.org) version 22 or newer. To check:

```bash
node --version
```

That's it. Cue works with npm, pnpm, yarn and bun, and figures out which
one you use on its own.

## Run it

From the folder your tests live in — or will live in:

```bash
npx @wiluszdamian/cue-cli init
```

It will:

1. Look for AI assistants you already use, like Claude Code or Cursor.
2. Show you a list of every file it wants to create, and why.
3. Wait. **Nothing is written until you say yes.**

If a file already exists and you've changed it, Cue leaves it alone and
tells you. It never overwrites your work.

## What you get

| File or folder                  | What it's for                                                     |
| ------------------------------- | ----------------------------------------------------------------- |
| `AGENTS.md`                     | The house rules, in a file every AI assistant reads automatically |
| `eslint.config.mjs`             | Turns the rules into checks that actually run                     |
| `playwright.config.ts`          | Sensible settings for running tests                               |
| `tests/`, `pages/`, `fixtures/` | Where things go, with a working example of each                   |
| `.agent-kb/`                    | Where knowledge about your app will be stored                     |

Already have a test suite and just want the rules? Use `--bare` and Cue
will skip the folder layout.

```bash
npx @wiluszdamian/cue-cli init --bare
```

## Finish the setup

`init` prints the remaining steps, written for whichever package manager you use.
Usually:

```bash
npm install --save-dev @understudy/eslint-plugin @wiluszdamian/cue-cli
npx playwright install
```

Then check everything landed:

```bash
npx @wiluszdamian/cue-cli doctor
```

## Reading the doctor report

`doctor` lists everything it checked, one line each:

| What you see | What it means                                                       |
| ------------ | ------------------------------------------------------------------- |
| `ok`         | Working.                                                            |
| `warn`       | Worth knowing, not urgent. Some warnings are permanent and fine.    |
| `error`      | Something isn't working. Fix these.                                 |
| `?`          | Couldn't check — usually you're offline. Not a pass and not a fail. |

**Every problem comes with the exact command that fixes it.** If a line doesn't
tell you what to run, that's a bug in Cue — please report it.

## Next

- **[Install for your assistant](./plugins.md)** — Claude Code, Cursor, Codex, Grok, Gemini, OpenCode, .agents
- **[Write your first test](./first-test.md)**
- **[Teach it about your app](./teach-it-your-app.md)**
