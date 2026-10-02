# How it all fits together

_The idea behind Cue, in plain terms._

## The situation

Your AI assistant already knows a lot about Playwright. It has read the docs, the
blog posts, and thousands of test files.

What it doesn't know is two things:

1. **How your team writes tests.** Which folder, which naming, which patterns.
2. **What your app looks like.** Every button, every field, every page.

Cue supplies exactly those two, and deliberately nothing else.

## Why it doesn't teach you Playwright

There are already good sources for that:

- **Playwright's own guides**, kept current by the people who build it.
- **Playwright's browser tools**, for exploring a page.
- **Community best-practice guides**, for the specialised corners.

Cue doesn't rewrite any of that. Their updates become your updates, for
free, and there's no second copy sitting here going stale.

What Cue adds is small, and it ages slowly.

## The three pieces

### 1. Rules that actually run

A short list of things a test here must do. Not a style guide nobody reads — real
checks that run when you save and when you push.

The important part: **a rule that's broken fails the build.** An assistant can
talk its way past a document. It cannot talk its way past a red build.

[See every rule →](../reference/constitution.md)

### 2. Notes about your app

What's on each page, written down after actually looking. With a date attached,
so you can tell fresh knowledge from stale.

[How to build them →](../start/teach-it-your-app.md)

### 3. A tie-breaker

When your assistant has three sources of Playwright advice loaded and they
disagree, something has to decide. Otherwise it picks one more or less at random.

[How that works →](./conflicting-advice.md)

## The order things happen in

```
Set up once          npx @wiluszdamian/cue init
     ↓
Learn the app        npx @wiluszdamian/cue survey <url>
     ↓
Write tests          your assistant, or you
     ↓
Checks run           on save, and on every push
```

## Why the rules are checks, not advice

This is the part worth understanding.

A document saying "don't use fixed waits" works right up until someone is in a
hurry. A check that fails the build works every time, for everyone, whether or
not an AI was involved — in your editor, in code review, and in two years when
everyone who wrote the rule has moved on.

That's the difference between a convention and a guarantee.

## What it deliberately won't do

Cue has opinions about tests. It has none about:

- how features should be specified
- how work should be split into tickets
- how your team reviews code generally

If you ask it about those, it will say so and point you back to however your team
already works. A tool that also claimed your roadmap would just be a worse
version of the tools you already have for that.
