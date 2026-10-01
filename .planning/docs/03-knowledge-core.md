# 03 — Knowledge Core

## Objective

`.agent-kb` should become a first-class, versioned domain model rather than a locator map with metadata.

The model should represent:

- what Cue knows,
- why it knows it,
- where the fact applies,
- how trustworthy it is,
- when it was verified,
- whether it may have become stale,
- which facts conflict.

## Minimum entity model

Start with a small extensible set:

- `application`
- `environment`
- `route`
- `component`
- `role`
- `state`
- `action`
- `locator`
- `api`
- `data_requirement`

Do not build a giant graph engine initially.

Simple IDs and typed relationships are sufficient.

## Example

```yaml
schema: cue/v1

applications:
  admin-panel:
    environments:
      staging:
        base_url: https://staging.example.com

routes:
  admin.security:
    path: /admin/settings/security
    application: admin-panel

components:
  security.password-form:
    route: admin.security

actions:
  settings.password.change:
    route: admin.security
    component: security.password-form
    intent: change-password

    requirements:
      roles:
        - admin
      states:
        - authenticated

    locator:
      strategy: role
      role: button
      name: Change password

    status: verified

    evidence:
      - id: ev_browser_01
        type: browser
        environment: staging
        observed_at: 2026-09-28T09:12:00Z

      - id: ev_source_01
        type: source-code
        file: src/features/settings/PasswordSection.tsx
        symbol: PasswordSection

    verified_at: 2026-09-28T09:12:00Z
```

## Knowledge lifecycle

Recommended statuses:

```text
inferred
   ↓
observed
   ↓
verified
   ↓
possibly-stale
   ↓
stale
```

Additional orthogonal state:

```text
conflicting
```

### `inferred`

Created from model reasoning or weak indirect evidence.

Rules:

- must be explicitly marked,
- must not silently become verified,
- should not be the default source for locator generation.

### `observed`

Seen in one evidence source.

Examples:

- browser snapshot,
- source-code extraction,
- existing test.

### `verified`

Supported by sufficient evidence or a designated source of truth.

Verification policy may differ by entity type.

### `possibly-stale`

A dependency changed or an environment differs, but invalidity is not yet proven.

### `stale`

The fact failed verification or passed its defined invalidation rule.

## Provenance and evidence

Separate:

- the **fact**,
- the **evidence** supporting it.

Example:

```yaml
evidence:
  - id: ev_123
    type: browser
    source:
      environment: staging
      url: https://staging.example.com/admin/settings/security
    observed_at: 2026-09-28T09:12:00Z

  - id: ev_124
    type: source-code
    source:
      file: src/features/settings/PasswordSection.tsx
      symbol: PasswordSection
      commit: 8dbe210
```

Suggested evidence types:

- `source-code`
- `browser`
- `existing-test`
- `page-object`
- `openapi`
- `manual`
- `import`
- `agent-inference`

## Confidence

Confidence should not replace status.

Example:

```yaml
status: observed

confidence:
  level: medium
  reason: single browser observation
```

Suggested levels:

- low,
- medium,
- high.

Avoid fake precision such as `0.8734` unless it is actually derived from a measurable process.

## Freshness

Time alone should not determine freshness.

Knowledge may depend on:

- source files,
- route definitions,
- API specs,
- commits,
- environment,
- role,
- locale,
- feature flags.

Example:

```yaml
verified_against:
  commit: 8dbe210
  environment: staging
  role: admin
  locale: en-US

dependencies:
  files:
    - src/features/settings/PasswordSection.tsx
    - src/routes/admin.ts
```

Then Cue can produce:

```text
settings.password.change
→ possibly stale

Reason:
src/features/settings/PasswordSection.tsx changed after verification.
```

## Conflict model

Never silently merge incompatible facts.

Example:

```yaml
conflicts:
  - entity: settings.password.change
    field: locator.name
    values:
      - value: Change password
        evidence: ev_browser_01
      - value: Update password
        evidence: ev_source_03
```

Resolution can be:

- manual,
- ownership-based,
- re-survey,
- source-priority based.

## Schema versioning

Use explicit schema versions.

Example:

```yaml
schema: cue/v1
```

Requirements:

- migration tests,
- round-trip serialization tests,
- backward compatibility policy,
- clear failure for unsupported future schemas.
