---
name: inspect
description: >
  Audit an existing Playwright suite against the constitution, and report drift in
  the knowledge base and routes with no test. Use to assess a suite you inherited
  or have not checked in a while.
disable-model-invocation: true
---

# inspect

Produces evidence about a suite, not an opinion about it.

## Procedure

1. Run the engine's analysis over the suite glob — the whole constitution.
2. Run `cue verify` if an environment URL is available, to find
   knowledge-base entries that no longer match the running application. Report its
   verdict as it stands: only `PASS` means the entries match.
3. Compare `.agent-kb/product/surface.yaml` against the tests: which routes and
   endpoints exist and are never exercised.
4. Report with the `agent` reporter for a person, or SARIF in CI.

## It is working if

Either there are zero constitution errors, or there is an explicit written list of
accepted exceptions. "Mostly clean" is not a result.

## Prohibitions

- **No autofix beyond the rules marked safe.** A fix that rewrites what a test
  asserts changes what the suite proves, which is the one thing an audit must not
  do.
- **Never downgrade an error to a warning to make a report look better.** The
  split between what is enforced and what is merely stated is published, and it
  is the only reason the enforced half is believed.
