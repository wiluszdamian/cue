# Teach it about your app

_Let Cue visit your app and write down what is actually there._

This is the step that stops the guessing.

## The problem, concretely

Ask an AI assistant for the checkout button and it might give you
`getByTestId('checkout-btn')`. Reasonable. Confident. Completely made up.

Your test fails. The failure looks like a broken checkout page. Somebody spends
the afternoon on it before realising the app was fine all along.

## The fix

Let Cue look at the real thing:

```bash
npx @wiluszdamian/cue-cli survey http://localhost:3000/login
```

It opens the page, notes everything you can interact with, and saves it:

```yaml title=".agent-kb/app-map/login.yaml"
route: /login
title: Sign in
verifiedAt: 2026-09-10T18:39:26.471Z
elements:
  - role: textbox
    name: Email
    locator: "getByRole('textbox', { name: 'Email' })"
    confidence: runtime-only
  - role: button
    name: Log in
    locator: "getByRole('button', { name: 'Log in' })"
    confidence: runtime-only
links:
  - name: Forgot password?
    href: /forgot
```

Now anyone — you or an assistant — can look up a real answer instead of
inventing one.

## Survey the pages you test

`survey` does one page at a time, and lists the links it found so you know where
to go next. Work through the pages your tests actually touch:

```bash
npx @wiluszdamian/cue-cli survey http://localhost:3000/login
npx @wiluszdamian/cue-cli survey http://localhost:3000/forgot
npx @wiluszdamian/cue-cli survey http://localhost:3000/dashboard
```

<Callout>
  Point it at a development or staging environment, never production. It only reads, but there's no
  reason to have a test tool browsing your live site.
</Callout>

## Looking things up

```bash
npx @wiluszdamian/cue-cli locator "log in button"
```

```
Route:      /login
Locator:    getByRole('button', { name: 'Log in' })
Confidence: runtime-only — Seen running, but absent from the product source.
Freshness:  fresh — Confirmed recently. Safe to use.
```

And when it doesn't know:

```
No entry for "delete account button".

Do not guess a selector. A plausible one that does not exist fails at runtime
in a way that reads like an application bug.

Run: cue survey <url>
```

**That refusal is the feature.** A tool that guesses here is worse than no tool.

## What "confidence" is telling you

| Confidence     | Meaning                                                                              |
| -------------- | ------------------------------------------------------------------------------------ |
| `confirmed`    | It's in your app's code **and** it appeared on the page. Solid.                      |
| `runtime-only` | Seen on the page, but not found in your code. Might come from a library, might move. |
| `code-only`    | In your code, never actually seen. Might be dead, might be behind a feature flag.    |

## Keep it committed

`.agent-kb/` belongs in git. It's knowledge worth keeping and worth reviewing —
treat changes to it like changes to code.

<Callout type="warn">
  Anything that looks like a password, token or email address is stripped out before the file is
  written. But do glance at what gets committed the first time, the way you would with any generated
  file.
</Callout>

## Next

- **[Keeping it current](../guides/keeping-it-current.md)** — Apps change. Here's how the notes keep up.
- **[Finding elements](../guides/finding-elements.md)**
