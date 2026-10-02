# When something goes wrong

_The problems people actually hit, and what to do about them._

## Start here

```bash
npx @wiluszdamian/cue doctor
```

It checks everything and gives you the exact command for each problem. Most of
this page is just the longer explanation behind those lines.

## A rule is blocking me and I think it is wrong

First, read the full reasoning:

```bash
npx @wiluszdamian/cue explain no-hard-waits
```

The message tells you what to write instead. If it genuinely does not fit your
case, that is worth reporting — a rule that fires on correct code is a bug in the
rule, and the fix belongs in the rule rather than in a workaround.

<Callout type="warn">
  Try not to switch the rule off. Every one of them exists because somebody lost time to the thing
  it prevents.
</Callout>

## "No entry for ..." when I look up an element

Cue has not seen that page yet.

```bash
npx @wiluszdamian/cue survey http://localhost:3000/the-page
```

This is working as intended. It would rather tell you it does not know than
invent something that fails later and looks like a broken app.

## The notes say "stale"

That page has not been confirmed in over a month.

```bash
npx @wiluszdamian/cue survey http://localhost:3000/that-page
```

The old note is not wrong, necessarily — but it has stopped being something to
rely on without checking.

## `survey` cannot reach my app

Check in order:

1. **Is the app running?** Open the URL in a browser.
2. **Are the browsers installed?** `npx playwright install`
3. **Is the CLI installed?** `npx @playwright/cli --help`

If the environment needs a VPN or credentials this machine does not have, capture
a snapshot somewhere that does and pass it in:

```bash
npx @wiluszdamian/cue survey http://internal/login --from snapshot.txt
```

## `survey` says the output is not a snapshot format it understands

`survey` reads the text that `playwright-cli snapshot` prints, and that text is
Microsoft's format, not ours. A release that changes it is refused with an error
naming the CLI version, rather than turned into an empty or partial map. Nothing is
written.

1. **Check the version.** `npx @playwright/cli --version`. Cue is tested
   against the versions that have a directory under
   `packages/engine/test/snapshots/` (today `0.1.22`).
2. **Install a tested one:** `npm install --save-dev @playwright/cli@0.1.22`.
3. **Or capture elsewhere** and pass the text in with `--from <file>`.

A page that parses but contains lines the parser did not understand is still
surveyed; the lines are listed under `Gaps` in the map so the loss is visible.

## `doctor` says a tool version is outside the tested range

Cue uses tools it does not own: `@playwright/cli` to look at pages,
`@playwright/test` to run them, and `@playwright/mcp` for browser calls from an agent.
`compatibility.yaml` in the repository lists, for each, the range it claims to work
with and the version it was last run against.

`cue doctor` compares what is installed in your project with those ranges. A tool
outside its range is a warning, not an error: it may well work, and nothing here has
shown that it does. The warning carries the command that installs the version that was
tested, for example `pnpm add -D @playwright/cli@0.1.22`.

The MCP configuration `init` writes names exact versions too, and not `@latest`: ours is
the release that wrote the file, and Playwright MCP is the version that was tested. After
upgrading Cue, `cue sync` shows the diff that moves them.

The project checks the other direction weekly. The `upstream` workflow looks up the newest
release of each tool and fails, saying which one and what to do, when it has moved outside
its range. That is a prompt to run the suite against the new release and then widen the
range, or to hold it and say why.

## `init` did not overwrite my file

By design. If you have edited a file Cue wrote, it leaves it alone and
tells you.

To deliberately take the new version and lose your changes:

```bash
npx @wiluszdamian/cue init --force
```

It will show you what it is about to discard first.

## Tests pass locally but fail in CI

Usually one of:

- **Different data.** CI may have a different database.
- **Timing.** CI machines are slower. If you are waiting properly, this should
  not matter — if it does, something is waiting on a timer somewhere.
- **Missing environment variables.** Check the secrets your workflow uses.

Start with the trace from the failed run, which the workflow uploads for you.

## `sync --check` fails in CI

The rules moved and this project has not caught up.

```bash
npx @wiluszdamian/cue sync
```

It shows a diff before changing anything.

## Something else

- [Every rule, explained](../reference/constitution.md)
- [Common questions](./faq.md)
- [Report an issue](https://github.com/wiluszdamian/cue/issues)
