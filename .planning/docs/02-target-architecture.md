# 02 — Target Architecture

## Architectural goal

The current feature set should be reorganized around one center:

> **Knowledge Core**

`extract`, `survey`, MCP, freshness, verification, linting, and agent integrations should either feed, query, or verify the Knowledge Core.

## Proposed architecture

```text
                         Project Cue

        ┌───────────────────────────────────────┐
        │            Knowledge Core             │
        │                                       │
        │ entities      relations               │
        │ provenance    evidence                │
        │ confidence    freshness               │
        │ conflicts     resolution              │
        └───────────────────┬───────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
   Acquisition         Verification       Agent Interface
         │                  │                  │
   source extractors    cue verify            MCP
   OpenAPI              cue doctor            compact context
   existing tests       git invalidation      integrations
   browser survey       live verification     resolution APIs
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
                            ▼
                        Governance

                     constitution
                     ownership
                     Cue-aware rules
                     ESLint / CI
```

## Recommended module boundaries

### `packages/knowledge-core`

Owns:

- schema,
- entities,
- relationships,
- status lifecycle,
- provenance,
- evidence,
- confidence,
- freshness,
- conflict representation,
- serialization,
- migrations,
- query/resolution primitives.

It should not own:

- CLI rendering,
- browser process management,
- agent-specific configuration,
- benchmark orchestration.

### `packages/acquisition`

Owns:

- source extractors,
- OpenAPI adapter,
- source-code adapters,
- existing-test extraction,
- browser snapshot ingestion,
- normalization into Knowledge Core facts.

### `packages/browser`

Owns:

- Playwright CLI driver,
- process invocation,
- snapshot parsing,
- browser evidence capture,
- compatibility layer for supported Playwright CLI versions.

This isolates external tool instability from the Knowledge Core.

### `packages/verification`

Owns:

- static KB validation,
- knowledge status computation,
- git-aware invalidation,
- live verification,
- KB/code consistency checks,
- verification result model.

### `packages/mcp`

Owns:

- `resolve_*`,
- `get_context`,
- `get_evidence`,
- `get_freshness`,
- `explain_policy`,
- `resolve_owner`.

MCP should not duplicate business logic from the Knowledge Core.

### `packages/governance`

Owns:

- constitution,
- ownership,
- Cue-aware rule definitions,
- policy resolution,
- rule metadata.

### `packages/eslint-plugin`

Should remain a thin integration over reusable analysis logic.

### `packages/cli`

Should orchestrate services and render output.

Avoid placing domain logic directly in CLI command files.

## Dependency direction

Preferred:

```text
knowledge-core
   ↑
acquisition
verification
mcp
governance
   ↑
cli / eslint / integrations
```

Avoid:

```text
knowledge-core → cli
knowledge-core → agent-specific code
knowledge-core → shell process implementation
```

## Migration strategy

Do not rewrite everything at once.

1. Define stable Knowledge Core interfaces.
2. Adapt existing `.agent-kb` read/write paths behind them.
3. Move existing provenance/freshness logic into the new model.
4. Add compatibility serialization for current data.
5. Gradually route CLI/MCP/enforcement through the new interfaces.
6. Only then remove obsolete paths.
