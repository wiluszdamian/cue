# 08 — Roadmap

## P0 — Reliability and product core

### P0.1 Harden browser process invocation

- remove shell interpolation,
- pass executable and args separately,
- handle Windows shims,
- test special-character URLs,
- test executable paths with spaces.

### P0.2 Add real browser E2E in CI

Create a tiny demo app and validate:

```text
extract → survey → resolve → verify
```

### P0.3 Replace ambiguous verification semantics

- separate freshness from live verification,
- introduce structured result statuses,
- never claim application match without live evidence.

### P0.4 Fix OpenAPI extraction

- real JSON parser,
- real YAML parser,
- minified JSON,
- JSON/YAML equivalence tests.

### P0.5 Establish Knowledge Core v1

- versioned schema,
- entities,
- relationships,
- evidence,
- provenance,
- confidence,
- lifecycle state,
- serialization tests.

### P0.6 Automate KB-aware locator checking

Implement shared analysis used by:

- CLI,
- ESLint,
- CI,
- optional agent hooks.

### P0.7 Run first real benchmark

Evaluate:

- generated code,
- first-run pass rate,
- locator correctness,
- intended bug detection,
- browser exploration count.

---

## P1 — Intelligence and brownfield quality

### P1.1 Git-aware freshness

Track dependencies and invalidate affected facts.

### P1.2 Targeted survey

Support:

```bash
cue survey --route ...
cue survey --action ...
cue survey --stale
cue survey --affected-by ...
```

### P1.3 `cue discover`

Detect:

- Playwright config,
- tests,
- Page Objects,
- routes,
- OpenAPI,
- i18n,
- test IDs,
- agent integrations.

### P1.4 Expand MCP resolution

Add:

- resolve_action,
- resolve_route,
- resolve_component,
- resolve_api,
- resolve_role,
- resolve_state,
- get_context,
- get_evidence,
- get_freshness.

### P1.5 Expand `cue doctor`

Add:

- knowledge diagnostics,
- conflict detection,
- unknown locator diagnostics,
- compatibility checks.

### P1.6 Compatibility matrix

Define and test supported:

- Node versions,
- Playwright versions,
- Playwright CLI versions,
- snapshot formats,
- agent integrations.

Avoid uncontrolled `@latest` dependencies in generated critical configuration.

---

## P2 — Product refinement

### P2.1 Simplify generic skills

Remove or merge skills that do not provide Cue-specific value.

### P2.2 Improve agent context budgeting

Optimize compact task-specific responses.

### P2.3 Visual knowledge explorer

Only after core workflows are proven.

Potential views:

- route graph,
- stale knowledge,
- conflicts,
- provenance,
- knowledge coverage.

### P2.4 Branding cleanup

Complete any Understudy → Cue naming migration only after contracts stabilize.

---

## Explicitly defer

Do not prioritize yet:

- full-app autonomous crawling,
- large semantic graph database,
- cloud control plane,
- dozens of generic Playwright rules,
- agent-specific forks of core logic,
- advanced UI before CLI/MCP workflows are solid.
