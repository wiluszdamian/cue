---
name: pin
description: >
  Turn a testing intent into a concrete set of test cases with data, tags and
  locator candidates. Use when you know what needs checking but the cases are not
  written down yet.
disable-model-invocation: true
---

# pin

Closes the gap between "we should test the refund flow" and a set of cases
somebody can implement.

It produces **test cases, not product requirements.** How the feature should
behave is your team's process. Whether and how it can be tested is this one's.

## Procedure

1. Read the knowledge base: `product/`, `app-map/`, `knowledge.md`.
2. Ask only about gaps in **testability** — actor, environment, data, negative
   cases, tag, stop criterion. One question at a time. Do not ask about the
   roadmap.
3. Write the case set in the project's canonical format, fixed at `bind` time.
   Each case carries: path, preconditions, data per `seed-policy`, assertions, a
   tag from `tags.yaml`, and locators.
4. For every UI step, take the locator from `resolve-locator`, or mark it
   `unverified` with the reason.
5. Finish with `confidence: high | medium | low`, and say what is missing from the
   knowledge base.

## It is working if

Every case has an owner in the constitution, and no case invents a selector
absent from the knowledge base without flagging it `unverified`.

## Prohibitions

- **Never invent a `data-testid`.** If it is not in `.agent-kb`, that is a gap —
  say so and name the route that needs surveying.
- No page objects and no test code. That is `compose`.
- Do not take over "how should we build this feature". That belongs to
  `external-process`; say so and hand it back.
- **At `confidence: low`, do not write in a confident voice.** State what is
  unknown before stating what is proposed.
