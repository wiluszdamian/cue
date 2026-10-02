# Every command

_The full list, with what each one is for._

## Setting up

### `understudy init`

Sets up a project. Shows you the plan first and waits for a yes. Without a terminal
it applies nothing unless you pass `--yes`.

```bash
npx @understudy/cli init
npx @understudy/cli init --bare
npx @understudy/cli init --yes
```

| Option            | Does                                            |
| ----------------- | ----------------------------------------------- |
| `--target <a,b>`  | Set up for specific assistants                  |
| `--all`           | Every assistant found in the project            |
| `--baseline-only` | Shared setup only, nothing assistant-specific   |
| `--bare`          | Skip the Playwright folder layout               |
| `--yes`           | Do not ask (required when there is no terminal) |
| `--force`         | Overwrite files you have edited. Use with care. |

### `understudy doctor`

Checks everything is wired up. Every problem comes with the command that fixes it.

```bash
npx @understudy/cli doctor
npx @understudy/cli doctor --ci
npx @understudy/cli doctor --offline
```

`--ci` fails the build when there are errors. `--offline` skips anything that
needs the network.

### `understudy add` / `remove` / `list`

Manage which assistants are set up.

```bash
npx @understudy/cli add cursor
npx @understudy/cli remove cursor
npx @understudy/cli list
```

## Learning your app

### `understudy survey <url>`

Visit a page and write down what is on it.

```bash
npx @understudy/cli survey http://localhost:3000/login
npx @understudy/cli survey http://localhost:3000/login --from snapshot.txt
```

`--from` reads a snapshot captured elsewhere — useful when the environment needs
credentials this machine does not have.

Surveying a live page needs `@playwright/cli`. It is found in the project's
`node_modules`, then on `PATH`; `--playwright-cli <path>` points at a specific copy.
It is never run through a shell, so URLs with `&` or `%` arrive intact.

#### Looking at some pages again

You rarely need the whole app again. Name the pages, or let Understudy pick them:

```bash
npx @understudy/cli survey --route /login,/admin/settings/security --base-url http://localhost:3000
npx @understudy/cli survey --stale --base-url http://localhost:3000
npx @understudy/cli survey --affected-by main..HEAD --base-url http://localhost:3000 --source ../my-app
npx @understudy/cli survey --stale --base-url http://localhost:3000 --dry-run
```

| Option                  | Chooses                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `--route <a,b>`         | The pages you name. They need not have been surveyed before.                                                                |
| `--stale`               | Pages not confirmed for over a month, with an element that failed its last check, or read from code that has since changed. |
| `--affected-by <range>` | Pages read from files that changed over this git range (needs `--source`).                                                  |
| `--base-url <url>`      | Where the environment is (or set `UNDERSTUDY_BASE_URL`). Used to open pages; never saved.                                   |
| `--dry-run`             | Show the plan and stop.                                                                                                     |

It shows the plan first, with the reason for each page. A page with a parameter
(`/items/[id]`) is skipped and says why: survey a real URL for it. One page failing does
not stop the others; the run fails if any did. `--action` is not implemented yet.

### `understudy locator <description>`

Look up how to point at something.

```bash
npx @understudy/cli locator "log in button"
npx @understudy/cli locator "submit" --route /checkout
```

### `understudy check`

Check that the locators in your tests name things the notes know about.

```bash
npx @understudy/cli check
npx @understudy/cli check tests/login.spec.ts
npx @understudy/cli check tests --ci
npx @understudy/cli check --ci=strict --format github
```

With no arguments it looks at test files (`*.spec.ts`, `*.test.ts`) and any file with an
`// understudy-route: /login` comment, which is how a page object says which page it is
on. Given a directory it takes everything TypeScript in it; given a pattern, whatever matches.

Each locator comes back as one of:

| Verdict       | Meaning                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| `known`       | Exactly one element the notes trust matches.                                           |
| `unknown`     | Nothing matches. Very likely invented. The nearest real locator is shown.              |
| `wrong-route` | It exists, but on a different page from the one the test is on.                        |
| `ambiguous`   | Several elements match, so Playwright would refuse it.                                 |
| `stale`       | It matches something that failed its last check, or has not been confirmed in a month. |
| `unverified`  | It matches something only inferred, never seen on a page.                              |
| `undecidable` | The code alone cannot say: a variable, a regular expression, `getByText`, CSS.         |

Undecidable locators are always counted and listed. They are not judged, and nothing
here pretends otherwise.

| Option            | Does                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `--ci[=advisory]` | Exit 1 on `unknown` and `wrong-route`: what fails at runtime.    |
| `--ci=strict`     | Exit 1 on any finding, and when nothing could be checked at all. |
| `--format <name>` | `human` (default), `agent`, `json`, `sarif` or `github`.         |

Without `--ci` the exit code is always 0. With nothing in `.agent-kb`, it says to run
`extract` and `survey` rather than listing every locator as unknown.

### `understudy verify`

Check the notes still match the real app, and say plainly what was not checked.
(`verify-map` is the old name and still works, with a warning.)

```bash
npx @understudy/cli verify --base-url http://localhost:3000
npx @understudy/cli verify --base-url $STAGING_URL --route /login,/signup
npx @understudy/cli verify --base-url $STAGING_URL --ci=strict
npx @understudy/cli verify --base-url $STAGING_URL --refresh
npx @understudy/cli verify --json
```

The verdict is one of `PASS`, `PARTIAL`, `NOT VERIFIED`, `FAIL` or `EMPTY`. Only
`PASS` says the notes match the app, and only when every page was checked.

| Option                  | Does                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `--base-url <url>`      | The environment to look at. Without it nothing is checked.             |
| `--route <a,b>`         | Check only these pages; the others count as not checked (`PARTIAL`).   |
| `--ci[=advisory]`       | Exit 1 on `FAIL` only: drift, an unreachable page, an unreadable file. |
| `--ci=strict`           | Exit 1 unless `PASS`, so "nobody looked" is not a green build.         |
| `--refresh`             | Record today as the confirmation date for pages found unchanged.       |
| `--source <path>`       | The product's code, to see whether what a note was read from changed.  |
| `--affected-by <range>` | Check only the pages read from files changed over this git range.      |
| `--json`                | Print the report as JSON.                                              |

Without `--ci` the exit code is always 0.

## Staying current

### `understudy sync`

Bring your project's copy of the rules up to date. Shows a diff first.

```bash
npx @understudy/cli sync
npx @understudy/cli sync --check
```

`--check` reports and changes nothing, which is what you want in CI.

## Understanding a rule

### `understudy explain <rule>`

Why a rule exists and what to write instead.

```bash
npx @understudy/cli explain
npx @understudy/cli explain no-hard-waits
```

With no rule name, it lists them all.

## Removing it

### `understudy uninstall`

Takes out everything `init` put in, using a record of exactly what that was.
Anything you edited is kept and reported.

```bash
npx @understudy/cli uninstall
```

## Not built yet

These are planned and named in the docs. They do not exist yet, and Understudy
says so rather than pretending:

- `extract` — read your app's source code for extra detail
- `inspect` — audit an existing test suite
- `from-openapi` — generate API tests from a spec
- `upgrade` — move a project to a newer version
