# 05 — Verification and Governance

## Goal

Cue should distinguish clearly between:

- structurally valid knowledge,
- fresh knowledge,
- live-verified knowledge,
- partial verification,
- unverified knowledge,
- stale knowledge.

## Replace ambiguous `verify-map`

Move toward:

```bash
cue verify
```

Possible output:

```text
Cue Verify

Knowledge
  183 entries

Status
  verified           156
  fresh              142
  possibly stale      14
  unverified          21
  conflicting          3
  invalid              3

Live verification
  routes checked      12/14
  routes skipped       2

Result
  PARTIAL
```

Never print:

```text
The map matches the application.
```

unless the relevant application surface was actually checked.

## Verification dimensions

Treat these independently:

1. **Schema validity**
2. **Reference integrity**
3. **Provenance completeness**
4. **Freshness**
5. **Source consistency**
6. **Code usage consistency**
7. **Optional live browser verification**

## `cue doctor`

`cue doctor` should become the main diagnostic command.

It should detect:

- invalid KB entries,
- unsupported schema versions,
- missing provenance,
- stale facts,
- potentially stale facts,
- conflicting facts,
- duplicate logical elements,
- unknown locators used by tests,
- KB entries no longer found in source,
- broken references,
- environment mismatches,
- agent integration drift,
- unsupported dependency versions.

Diagnostics should be actionable.

Example:

```text
Knowledge entry may be stale:

settings.password.change

Reason:
src/features/settings/PasswordSection.tsx changed after
the locator was last verified.

Last verified:
2026-09-20

Recommended:
cue survey --action settings.password.change
```

## KB-aware locator enforcement

The current conceptual rule `selectors-from-agent-kb` should become mechanically useful.

Introduce:

```bash
cue check <files...>
```

Example:

```text
tests/settings/password.spec.ts:42

Unknown locator:
  getByText("Save")

Nearest verified knowledge:
  settings.save
  getByRole("button", { name: "Save changes" })

Route:
  admin.settings

Verified:
  2 days ago

Suggested action:
  use known locator
or
  cue survey --route admin.settings
```

Possible implementation layers:

- reusable analyzer in core verification package,
- ESLint integration,
- CLI,
- CI,
- optional agent hook.

Do not duplicate matching logic across all layers.

## Cue-aware rules

Prioritize rules that require application knowledge.

Examples:

- `unknown-application-locator`
- `stale-knowledge-reference`
- `wrong-route-locator`
- `role-incompatible-action`
- `state-incompatible-action`
- `unverified-knowledge-use`
- `conflicting-knowledge`
- `environment-mismatch`

Generic Playwright style rules should remain secondary.

## Ownership

Ownership should cover both policy and facts.

Examples:

```text
Playwright mechanics       → official Playwright behavior
team test architecture     → project constitution
selectors                  → verified Knowledge Core
API contract               → OpenAPI
browser-observed UI fact   → verified survey
```

Conflicts should be explicit and queryable.

Example:

```text
Conflict detected

Question:
Which tags are permitted?

Owner:
rules/constitution.yaml

Conflicting source:
docs/testing.md

Resolution:
constitution wins
```

## CI modes

Define explicit CI semantics.

Possible modes:

```text
cue verify --ci=advisory
cue verify --ci=strict
```

Strict mode may fail on:

- invalid schema,
- broken references,
- conflicting verified facts,
- unknown locators,
- selected stale categories.

Do not let "warning" and "error" semantics remain implicit.
