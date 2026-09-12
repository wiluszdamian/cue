# When something goes wrong

_The problems people actually hit, and what to do about them._

## Start here

```bash
npx @understudy/cli doctor
```

It checks everything and gives you the exact command for each problem. Most of
this page is just the longer explanation behind those lines.

## A rule is blocking me and I think it is wrong

First, read the full reasoning:

```bash
npx @understudy/cli explain no-hard-waits
```

The message tells you what to write instead. If it genuinely does not fit your
case, that is worth reporting — a rule that fires on correct code is a bug in the
rule, and the fix belongs in the rule rather than in a workaround.

<Callout type="warn">
  Try not to switch the rule off. Every one of them exists because somebody lost time to the thing
  it prevents.
</Callout>

## "No entry for ..." when I look up an element

Understudy has not seen that page yet.

```bash
npx @understudy/cli survey http://localhost:3000/the-page
```

This is working as intended. It would rather tell you it does not know than
invent something that fails later and looks like a broken app.

## The notes say "stale"

That page has not been confirmed in over a month.

```bash
npx @understudy/cli survey http://localhost:3000/that-page
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
npx @understudy/cli survey http://internal/login --from snapshot.txt
```

## `init` did not overwrite my file

By design. If you have edited a file Understudy wrote, it leaves it alone and
tells you.

To deliberately take the new version and lose your changes:

```bash
npx @understudy/cli init --force
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
npx @understudy/cli sync
```

It shows a diff before changing anything.

## Something else

- [Every rule, explained](../reference/constitution.md)
- [Common questions](./faq.md)
- [Report an issue](https://github.com/understudy-dev/understudy/issues)
