# What Cue is

_Helps you and your AI assistant write browser tests that match how your team already works._

Cue helps you write browser tests — and helps an AI assistant write them
the way your team already writes them.

If you have ever asked an AI to write a test and got back something that looked
right but used a button that doesn't exist, or ignored every convention in your
project, this is built for that problem.

## The two things it does

- **[Checks your tests automatically](guides/writing-tests.md)** — A set of rules about what a good test looks like here. They run every time you save and every time you push, so a test that breaks them fails the build — not the code review.
- **[Learns what your app looks like](start/teach-it-your-app.md)** — It visits your app, writes down what's actually on each page, and remembers. So nobody has to guess what a button is called.

## Why guessing is the expensive part

An AI has never seen your app. Ask it for the "log in" button and it will invent
something plausible — `#login-btn`, maybe, or `.submit`.

Plausible is the problem. The test doesn't fail with "I made this up." It fails
like your app is broken. So somebody spends an afternoon debugging a login page
that works perfectly.

Cue fixes this by writing down what's really there. When something isn't
written down, it says **"I don't know, go and look"** instead of guessing. That
refusal is the whole point.

## Try it

```bash
npx @wiluszdamian/cue-cli init
```

It looks at your project, shows you exactly what it plans to write, and waits for
you to say yes. Nothing happens until you agree.

- **[Set it up](start/install.md)** — Five minutes, start to finish.
- **[How it all fits together](guides/how-it-works.md)** — The idea behind it, in plain terms.

## What it isn't

- **Not a Playwright tutorial.** Playwright's own docs are excellent and kept up
  to date by the people who build it. Cue points you at them.
- **Not a replacement for your process.** It has opinions about tests. It has
  none about your roadmap, your tickets, or how you plan features.
- **Not magic.** It won't write good tests for a feature nobody can explain. It
  will stop an assistant from inventing details it doesn't have.

## Everything here

The site in `site/` renders these same files, in this order; on GitHub, this
index is the way around them.

**Getting started**

- [Set it up](start/install.md) — five minutes, start to finish.
- [Install for your assistant](start/plugins.md) — Claude Code, Cursor, Codex and the rest.
- [Teach it about your app](start/teach-it-your-app.md) — so nobody has to guess a selector.
- [Write your first test](start/first-test.md)

**Guides**

- [How it all fits together](guides/how-it-works.md)
- [Writing tests](guides/writing-tests.md)
- [Finding elements](guides/finding-elements.md)
- [When advice conflicts](guides/conflicting-advice.md) — which source wins, and why.
- [Keeping it current](guides/keeping-it-current.md)
- [Working as a team](guides/team-setup.md)
- [Does it actually work?](guides/does-it-work.md)

**Reference**

- [All the rules](reference/constitution.md) — generated from `rules/constitution.yaml`.
- [Who decides what](reference/ownership.md) — generated from `rules/ownership.yaml`.

**Help**

- [Every command](help/commands.md)
- [When something goes wrong](help/troubleshooting.md)
- [Common questions](help/faq.md)
