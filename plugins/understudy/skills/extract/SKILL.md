---
name: extract
description: >
  Read the product source and write its structure into .agent-kb/product — routes,
  endpoints, entities, roles, test ids. Use when the application's code is
  available alongside the test suite.
disable-model-invocation: true
---

# extract

Builds the static half of the knowledge base, from the product's own source.

The suite usually lives beside the product rather than inside it, so **access is a
design constraint, not a detail.**

| Access                                       | What can be established                        |
| -------------------------------------------- | ---------------------------------------------- |
| Full repository or monorepo                  | everything below                               |
| Read-only clone or submodule                 | everything below                               |
| Artefacts only (OpenAPI, build output, i18n) | endpoints, entities, vocabulary, some test ids |
| Black box                                    | nothing — fall back to `survey` plus OpenAPI   |

## Procedure

1. Establish the access level and say which one applies.
2. Run the adapter for the stack. Extract **facts deterministically**: routes, API
   surface, ORM entities, guards and roles, `data-testid` values, i18n keys,
   feature flags.
3. Synthesise `overview.md` and `vocabulary.md` **from the extracted facts only**,
   with a `file:line` anchor on every sentence. A model handed the whole codebase
   and asked to describe the product returns confident fabrication.
4. Write `sources.json`: the product's commit SHA, the paths analysed, the hashes.
5. **Report what could not be established.** A named gap is one somebody can
   close; a papered-over gap is a wrong answer waiting to be used.

An unrecognised stack degrades to a generic extraction — grep for `data-testid`,
read i18n files and any OpenAPI document. It does not fail.

## It is working if

Every sentence in `overview.md` carries a `file:line` anchor, or is explicitly
marked as a gap.

## Prohibitions

- **Never write anything into the product repository.** It is read-only, and it
  may not even be yours.
- **Never copy function bodies or any product source** into `.agent-kb`.
  Structure, names and references only.
- Filter secrets, tokens in URLs, and personal data in seed files before writing.
