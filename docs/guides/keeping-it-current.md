# Keeping it current

_Apps change. Two commands stop the notes quietly going out of date._

Notes about your app decay silently. Nothing breaks on the day a button is
renamed — the tests keep passing, right up until somebody writes a new one from
an old note.

Two commands handle it.

## Check whether the notes still match

```bash
npx @wiluszdamian/cue-cli verify --base-url http://localhost:3000
```

It revisits each page you have surveyed and compares. For each you get one of:

| Result  | Meaning                                                            |
| ------- | ------------------------------------------------------------------ |
| `ok`    | The page is exactly as recorded.                                   |
| `drift` | Something changed. It lists which recorded elements have vanished. |
| `error` | The page could not be reached at all.                              |
| `?`     | Not checked — no URL was given, or the page was not selected.      |

The report ends with one verdict, and it says "matches" only when it looked:

| Verdict        | Meaning                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| `PASS`         | Every page was checked against the running app and still matches.           |
| `PARTIAL`      | Some pages were checked and match; the rest were not, and nothing is said.  |
| `NOT VERIFIED` | The app was not checked at all (no `--base-url`). Age is all that is known. |
| `FAIL`         | A page drifted, could not be reached, or a notes file could not be read.    |
| `EMPTY`        | There is nothing surveyed yet.                                              |

How old a note is and whether it still matches are separate questions. Age comes
from the date alone; only a live check can say the app still looks that way.

Where a page has drifted, survey it again:

```bash
npx @wiluszdamian/cue-cli survey http://localhost:3000/login
```

In CI, `--ci` turns breakage into a failed build:

```bash
npx @wiluszdamian/cue-cli verify --base-url $STAGING_URL --ci
npx @wiluszdamian/cue-cli verify --base-url $STAGING_URL --ci=strict
```

The first fails only on `FAIL`; the second fails unless the verdict is `PASS`.

`strict` is the setting for a nightly job: a green build then means somebody
actually looked.

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

If Cue updates, or your team changes a rule, your project's copy of the
house rules falls behind. This catches that:

Report what has changed, without touching anything:

```bash
npx @wiluszdamian/cue-cli sync --check
```

Show a diff and ask before writing:

```bash
npx @wiluszdamian/cue-cli sync
```

`sync` never overwrites a file you have edited by hand. It reports it and leaves
it alone.

## A routine that works

- **`verify --ci=strict` nightly in CI**, against staging. Catches app changes.
- **`sync --check` on every push.** Catches rule changes.
- **`survey` whenever you touch a page.** The cheapest possible moment to do it.
