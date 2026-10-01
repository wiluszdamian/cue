# 01 — Product Direction

## Product statement

**Project Cue gives AI coding and testing agents reliable, maintainable knowledge about how a specific application works and how a specific team expects it to be tested.**

Cue should work as a sidecar/tooling layer around existing Playwright repositories rather than forcing users into a new framework architecture.

## Primary target

The most valuable user is a team that already has some combination of:

- TypeScript,
- Playwright,
- an existing test suite,
- Page Objects or another test abstraction,
- project-specific conventions,
- multiple developers,
- AI coding assistants,
- application-specific routes, roles, states, APIs, and locators.

Cue should be especially strong in **brownfield** repositories.

## What Cue should own

Cue should own:

1. **Application knowledge**
   - routes,
   - pages,
   - components,
   - roles,
   - states,
   - actions,
   - locators,
   - APIs,
   - data requirements,
   - relationships.

2. **Knowledge quality**
   - provenance,
   - evidence,
   - verification state,
   - confidence,
   - freshness,
   - affected-by-change detection,
   - conflicts.

3. **Project policy**
   - constitution,
   - ownership,
   - Cue-aware rules,
   - CI verification.

4. **Agent access**
   - compact context,
   - MCP,
   - resolution operations,
   - targeted refresh.

## What Cue should not become

Cue should not become:

- another generic Playwright scaffold,
- a clone of Agentic Playwright,
- a giant prompt bundle,
- a replacement for Playwright,
- a framework that requires users to rewrite their Page Object architecture,
- a crawler that attempts to fully reverse-engineer the entire product before becoming useful,
- a system that relies on LLM inference where deterministic parsing is possible.

## Competitive positioning

A useful mental model:

```text
Agentic Playwright:
"Teach the agent how good Playwright tests should be written."

Project Cue:
"Teach the agent what is actually true about this application
and which project-specific rules apply here."
```

Cue can integrate with other Playwright frameworks instead of replacing them.

## Product principles

### Deterministic before probabilistic

Prefer:

- AST,
- real parsers,
- OpenAPI parsers,
- browser accessibility data,
- git metadata,
- explicit configuration,
- Playwright runtime evidence.

Use model inference only where semantic interpretation is genuinely required.

### Evidence before assumption

Every meaningful fact should preserve enough information to answer:

> Why does Cue believe this?

### Incremental knowledge

Cue should be useful with partial knowledge.

A repository does not need to be fully mapped before Cue adds value.

### Targeted refresh

If one route or action is stale, re-survey that route or action rather than crawling the full application.

### Local-first core

Core functionality should work locally without requiring a hosted service.

### Agent-independent core

Claude Code may be a first-class integration, but the knowledge layer should not depend on one specific agent.
