# Keeping it current

_Apps change. Two commands stop the notes quietly going out of date._

Notes about your app decay silently. Nothing breaks on the day a button is
renamed — the tests keep passing, right up until somebody writes a new one from
an old note.

Two commands handle it.

## Check whether the notes still match

```bash
npx @wiluszdamian/cue verify --base-url http://localhost:3000
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
npx @wiluszdamian/cue survey http://localhost:3000/login
```

In CI, `--ci` turns breakage into a failed build:

```bash
npx @wiluszdamian/cue verify --base-url $STAGING_URL --ci
npx @wiluszdamian/cue verify --base-url $STAGING_URL --ci=strict
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

## When the code behind a note changes

Age is only part of it. A button can be renamed the day after you surveyed it, and a
month-old note about code nobody touched is fine. So a note that was confirmed by a
`data-testid` in your source also remembers **which file that came from**, and
`verify`, `locator` and `check` compare it with the file as it is now.

A route whose notes were read from a file that has since changed (or gone) is
**possibly stale**, and the report names the file:

```bash
npx @wiluszdamian/cue verify --base-url http://localhost:3000 --source ../my-app
```

Where the code lives is the place `extract` read it from, if that is still there, or
whatever you pass as `--source`. If it cannot be found, `verify` says so instead of
staying quiet. A route the live check just found unchanged is not in doubt any more,
whatever happened to the source.

To look only at what a change could have broken, give it the git range:

```bash
npx @wiluszdamian/cue verify --base-url http://localhost:3000 --source ../my-app --affected-by main..HEAD
```

Only the routes read from a changed file are checked; the others are listed as not
checked, so the result is `PARTIAL` rather than a claim about the whole app.

## When the rules themselves change

If Cue updates, or your team changes a rule, your project's copy of the
house rules falls behind. This catches that:

Report what has changed, without touching anything:

```bash
npx @wiluszdamian/cue sync --check
```

Show a diff and ask before writing:

```bash
npx @wiluszdamian/cue sync
```

`sync` never overwrites a file you have edited by hand. It reports it and leaves
it alone.

## A routine that works

- **`verify --ci=strict` nightly in CI**, against staging. Catches app changes.
- **`sync --check` on every push.** Catches rule changes.
- **`survey` whenever you touch a page.** The cheapest possible moment to do it.
