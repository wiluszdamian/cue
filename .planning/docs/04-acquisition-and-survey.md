# 04 — Acquisition and Survey

## Goal

Cue should acquire knowledge from deterministic sources first and use live browser observation where runtime truth is required.

Acquisition should be modular and evidence-preserving.

## Sources

### Source code

Potential extractors:

- Next.js routes,
- React components,
- `data-testid`,
- i18n keys,
- existing Playwright Page Objects,
- fixtures,
- enums,
- API clients.

### OpenAPI

Use a real JSON/YAML parser.

Do not identify paths using line-based regular expressions.

Requirements:

- JSON,
- YAML,
- minified JSON,
- methods,
- parameters,
- schemas where relevant,
- readable unsupported-document errors.

Equivalent JSON and YAML specs should normalize to the same knowledge result.

### Existing tests

Existing tests are evidence, not unquestionable truth.

Store provenance:

```yaml
source:
  type: existing-test
  file: tests/settings/password.spec.ts
```

### Browser survey

Live browser observation should capture evidence that can be tied back to Knowledge Core entities.

Possible observations:

- route,
- heading,
- accessible roles,
- labels,
- forms,
- navigation,
- dialog state,
- candidate locators.

## Fix browser process invocation first

The browser driver must not build a shell command from string concatenation.

Avoid:

```text
program + args.join(" ")
shell: true
```

Preferred:

- executable path,
- argument array,
- no shell interpretation,
- explicit Windows shim handling where needed.

Test cases must include:

- URL with `&`,
- URL with multiple query parameters,
- URL with encoded characters,
- executable path containing spaces,
- Windows,
- Linux.

## Snapshot compatibility

The browser snapshot parser should not assume one forever-stable textual format.

Introduce:

```text
BrowserDriver
   ↓
RawSnapshot
   ↓
VersionedSnapshotParser
   ↓
NormalizedBrowserObservation
   ↓
Knowledge Core
```

Maintain compatibility tests against supported Playwright CLI versions.

## Targeted survey

Do not make full-app crawling the default.

Support:

```bash
cue survey --route admin.security
cue survey --action settings.password.change
cue survey --stale
cue survey --affected-by HEAD~5..HEAD
```

The objective is to minimize redundant browser exploration.

## Brownfield discovery

Introduce an explicit discovery phase:

```bash
cue discover
```

or make it part of `cue init`.

Example output:

```text
Analyzing repository...

Playwright
✓ playwright.config.ts

Tests
✓ tests/
  183 specs

Page objects
✓ pages/
  27 objects

Detected knowledge sources
✓ Next.js routes
✓ OpenAPI
✓ i18n
✓ data-testid
✓ existing Page Objects
✓ existing tests

Agent integrations
✓ CLAUDE.md
✓ AGENTS.md
✓ Cursor

Suggested configuration created.
```

Discovery should produce a plan before mutation.

## End-to-end test fixture

Create a tiny local demo application for CI.

CI should validate:

```text
extract
  ↓
survey
  ↓
resolve locator
  ↓
generate/use test fixture
  ↓
verify
```

This is more valuable than only testing installation.
