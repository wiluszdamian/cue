# When advice conflicts

_Your assistant has several sources of Playwright guidance. This decides which one wins._

## The problem

An AI assistant working on your tests may have several sources of Playwright
guidance loaded at once — official docs, a best-practices guide, your project's
own rules.

None of them knows the others exist. When they disagree, the assistant picks one,
more or less at random. You get a different answer depending on the day.

## The fix

Cue keeps a list of topics and who decides each one. It lives in a file
every assistant reads automatically, so the tie-break happens before you notice
there was a tie.

Ask it directly:

```bash
npx @wiluszdamian/cue locator "how do I record a trace"
```

Or in an assistant that has the skills installed, `/resolve-owner`.

## Who owns what

| Topic                                            | Decided by                         |
| ------------------------------------------------ | ---------------------------------- |
| How your tests are structured, named, tagged     | **Cue** — your project's rules     |
| Which button is on which page                    | **Your app's notes**               |
| Running, debugging, tracing, recording           | **Official Playwright**            |
| Electron, i18n, visual testing, framework quirks | **A best-practices guide**         |
| Specs, tickets, roadmap                          | **Your team.** Not Cue's business. |

[The full table →](../reference/ownership.md)

## Two of these always win

Your project's rules and your app's notes beat everything else — even a source
that states the opposite very confidently.

The reason is simple: no outside source can possibly know what your team decided
or what your app looks like. On those two topics, they are guessing and you are
not.

## When nothing owns a topic

You get told so, plainly:

```
No owner is declared for "what colour should the button be".

This is a gap in rules/ownership.yaml, not an open question.
```

That is deliberate. An unowned topic is a gap for a person to fill, **not
permission to improvise**. A convention invented on the spot is indistinguishable
from one everyone agreed to — right up until the second person has to guess it
too.

## Why this isn't just documentation

The table can't live in a document an assistant might read. It has to be in the
layer that is always loaded, because a document has no way to announce that it
outranks another document.

That is why `init` writes it into `AGENTS.md`, and why `sync` keeps it current.
