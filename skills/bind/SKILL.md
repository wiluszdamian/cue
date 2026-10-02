---
name: bind
description: >
  Wire this repository to Understudy once: check the environment, choose agent
  targets, and install the constitution and scaffold. Use on a fresh repository,
  or when understudy doctor reports errors.
disable-model-invocation: true
---

# bind

A thin wrapper over `understudy init` and `understudy doctor`. Run once per
repository, and again when `doctor` reports an error.

## Procedure

1. Run `understudy discover` first: it is read-only, and says what is already here
   (the Playwright config, the specs, the page objects, the agents in use) and what
   Understudy could learn from the product's source.
2. Run `understudy init` and **show the plan before accepting it**. The plan
   lists every file, why it is being written, and what will be left alone.
3. Apply it, or print the commands for the detected package manager so the person
   can run them.
4. Run `understudy doctor` and work the report top down. Every failure carries
   the command that fixes it.

```bash
understudy init                              # detects, plans, asks
understudy init --target claude-code,cursor  # explicit
understudy init --bare                       # rules only, no suite skeleton
understudy doctor                            # what is still missing
```

## It is working if

`understudy doctor` reports no errors. Warnings are acceptable and often
permanent — an unconfigured agent nobody on the team uses is a warning, not a
problem.

## Prohibitions

- **Never overwrite a file whose hash changed.** It has been edited by hand and
  is the user's now. `init` already refuses; do not reach for `--force` to get
  past it without being asked.
- **Never install browsers through `postinstall`.** Bun does not run it for
  untrusted packages, so a setup that depends on it works for three package
  managers and silently fails for the fourth. Install them as an explicit step.
- Do not guess targets. Detection pre-ticks boxes; the person confirms.
