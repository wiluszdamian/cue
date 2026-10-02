# Common questions

_Why Understudy works the way it does._

## Do I need an AI assistant to use this?

No. The rules run as ordinary checks in your editor and in CI. If you never let
an AI near your tests, you still get a suite where the conventions are actually
enforced.

The AI part is what happens when you _do_ use one: it follows the same rules,
because it cannot get past them either.

## Why not just write the conventions in a document?

Because documents get skipped when someone is in a hurry, and an AI assistant can
talk itself past one very fluently.

A check that fails the build works every time, for everyone, whether or not
anyone read anything. That is the difference between a convention and a
guarantee.

## Why doesn't it teach me Playwright?

Playwright's own documentation is good, current, and maintained by the people who
build it. Copying it here would produce a second version that slowly goes wrong.

Understudy covers the two things nobody else can: your team's conventions, and
your app.

## Why won't it guess a selector?

Because a wrong guess is expensive in a specific way.

It does not fail with "I made this up". It fails as though your application is
broken — so somebody investigates the app, not the test. A tool that guesses here
costs more time than it saves.

## Can I change the rules?

Yes. They live in one file, `rules/constitution.yaml`. Change it, run
`pnpm generate`, and the checks, the documentation and the assistant instructions
all update together.

## Does every rule actually get checked?

Ten rules are checked from the code alone. The eleventh — "every selector must come
from your app's notes" — can only be checked against those notes, so it needs an
`.agent-kb` to run: no tool can tell an invented test id from a real one by reading
the code.

Where there is an `.agent-kb`, the linter checks `getByRole`, `getByTestId` and
`getByLabel` against it. Where there is none, the rule stays silent — and
`understudy check` says so, rather than reporting a clean run. Locators the code
cannot settle (a variable, a regular expression, `getByText`, CSS) are never
judged. A rule that cannot be checked at all would be written down and marked as not
enforced; being honest about which half has teeth is what makes the enforced half
believable.

## Will it slow my tests down?

No. The checks run on your code, not during your tests.

If anything, tests get faster: the most common rule violation is a fixed wait,
and removing those is usually the single biggest speed-up available.

## What if I already have a test suite?

```bash
npx @understudy/cli init --bare
```

That gives you the rules without imposing a folder layout. Expect the first run
of `npx eslint .` to find things — that is the point. Work through them, or turn
individual rules to warnings while you catch up.

## Does it send my code anywhere?

No. Everything runs locally. There is no telemetry and no network call except
when you explicitly ask it to visit your own app.

## What does it record about my app?

Structure only: page titles, element roles and names, links. Never your source
code, and never page content.

Anything resembling a password, token, key or email address is stripped out
before the file is written.

## Is it tied to one AI assistant?

No. The main file, `AGENTS.md`, is read automatically by most assistants. Claude
Code reads it through a one-line import. Nothing is locked to a vendor.

## Why "Understudy"?

An understudy learns the whole production — every line, every cue — so they can
step in and get it right. That is the job: know the show well enough to perform
it properly.
