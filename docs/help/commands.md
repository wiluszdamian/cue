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

### `understudy locator <description>`

Look up how to point at something.

```bash
npx @understudy/cli locator "log in button"
npx @understudy/cli locator "submit" --route /checkout
```

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

| Option             | Does                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| `--base-url <url>` | The environment to look at. Without it nothing is checked.             |
| `--route <a,b>`    | Check only these pages; the others count as not checked (`PARTIAL`).   |
| `--ci[=advisory]`  | Exit 1 on `FAIL` only: drift, an unreachable page, an unreadable file. |
| `--ci=strict`      | Exit 1 unless `PASS`, so "nobody looked" is not a green build.         |
| `--refresh`        | Record today as the confirmation date for pages found unchanged.       |
| `--json`           | Print the report as JSON.                                              |

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
