# Keeping it current

_Apps change. Two commands stop the notes quietly going out of date._

Notes about your app decay silently. Nothing breaks on the day a button is
renamed — the tests keep passing, right up until somebody writes a new one from
an old note.

Two commands handle it.

## Check whether the notes still match

```bash
npx @understudy/cli verify-map --base-url http://localhost:3000
```

It revisits each page you have surveyed and compares. For each you get one of:

| Result  | Meaning                                                            |
| ------- | ------------------------------------------------------------------ |
| `ok`    | The page is exactly as recorded.                                   |
| `drift` | Something changed. It lists which recorded elements have vanished. |
| `error` | The page could not be reached at all.                              |
| `?`     | Not checked — no URL was given.                                    |

Where a page has drifted, survey it again:

```bash
npx @understudy/cli survey http://localhost:3000/login
```

In CI, `--ci` turns drift into a failed build:

```bash
npx @understudy/cli verify-map --base-url $STAGING_URL --ci
```

## How old is too old

Every note records when it was last confirmed.

| Age               | What it means                                                              |
| ----------------- | -------------------------------------------------------------------------- |
| Under a week      | Fresh. Use it.                                                             |
| One to four weeks | Ageing. Fine, but mention it if it matters.                                |
| Over a month      | Stale. **Treat it as a lead, not a fact.** Re-survey before relying on it. |

A stale note is not deleted, because a good idea of where to look still beats no
idea at all. It just stops being presented as certain.

## When the rules themselves change

If Understudy updates, or your team changes a rule, your project's copy of the
house rules falls behind. This catches that:

Report what has changed, without touching anything:

```bash
npx @understudy/cli sync --check
```

Show a diff and ask before writing:

```bash
npx @understudy/cli sync
```

`sync` never overwrites a file you have edited by hand. It reports it and leaves
it alone.

## A routine that works

- **`verify-map` nightly in CI**, against staging. Catches app changes.
- **`sync --check` on every push.** Catches rule changes.
- **`survey` whenever you touch a page.** The cheapest possible moment to do it.
