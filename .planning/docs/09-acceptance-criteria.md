# 09 — Acceptance Criteria

This document defines what should be true before major milestones are considered complete.

## Knowledge Core v1

Complete when:

- schema version is explicit,
- core entities serialize and deserialize,
- provenance is preserved,
- inferred and verified facts cannot be confused,
- invalid references fail clearly,
- migration behavior is tested,
- old `.agent-kb` data can be handled according to an explicit compatibility policy.

## Browser survey hardening

Complete when:

- no URL is interpreted as shell code,
- URLs with `&` are passed intact,
- paths with spaces work,
- Windows and Linux CI cases pass,
- at least one real browser E2E runs in CI,
- snapshot parsing has compatibility fixtures.

## Verification

Complete when:

- freshness and live verification are separate,
- skipped verification is visible,
- partial verification is visible,
- no live-check means no "application matches" claim,
- CI exit behavior is documented and tested.

## OpenAPI

Complete when:

- JSON works,
- YAML works,
- minified JSON works,
- equivalent documents normalize identically,
- unsupported input reports a useful error.

## KB-aware locator checking

Complete when:

- a known locator is matched reliably,
- an unknown locator is reported,
- route context is respected,
- nearest known entry can be suggested,
- CLI and ESLint reuse the same analyzer,
- tests include false-positive and false-negative cases.

## Git-aware freshness

Complete when:

- facts can declare source dependencies,
- a changed dependency marks them `possibly-stale`,
- unrelated changes do not invalidate everything,
- targeted refresh can act on affected entries.

## MCP / agent interface

Complete when:

- agent can obtain compact context without reading the whole KB,
- unknown facts return `unknown` rather than invented values,
- evidence and freshness are queryable,
- resolution APIs use the same Knowledge Core logic as CLI.

## Benchmark

Complete when:

- real model outputs are used,
- same model/task is compared with and without Cue,
- repeated trials are recorded,
- generated tests are executed,
- at least one mutation-based task is included,
- unfavorable runs are preserved,
- report is reproducible.

## Release gate

Before calling the new architecture production-ready:

1. `cue init/discover` works on an existing Playwright repo.
2. `extract` produces usable knowledge.
3. `survey` enriches knowledge safely.
4. agent can resolve context through MCP.
5. generated test can be checked against KB.
6. Playwright test is executed.
7. `cue verify` reports precise status.
8. one real benchmark demonstrates measurable behavior.
