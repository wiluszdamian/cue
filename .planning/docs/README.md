# Project Cue — Improvement Pack

This package defines the recommended product and architecture direction for **Project Cue**.

The core decision is simple:

> **Project Cue is not primarily a Playwright scaffold.**
>
> **Project Cue is the persistent application-context and policy layer that lets AI agents understand how a real application works and how a team expects it to be tested.**

The central product primitive should be a versioned **Knowledge Core** built around `.agent-kb`.

## Package contents

| File | Purpose |
| --- | --- |
| `01-product-direction.md` | Product positioning, scope, and non-goals |
| `02-target-architecture.md` | Proposed architecture and module boundaries |
| `03-knowledge-core.md` | `.agent-kb` domain model, provenance, evidence, confidence, freshness |
| `04-acquisition-and-survey.md` | `extract`, `survey`, discovery, browser integration, OpenAPI parsing |
| `05-verification-and-governance.md` | `cue verify`, `cue doctor`, ownership, conflicts, KB-aware checks |
| `06-agent-interface-and-mcp.md` | Agent-facing APIs, MCP, context budgeting, resolution operations |
| `07-benchmark-and-evaluation.md` | Real benchmark methodology and metrics |
| `08-roadmap.md` | Prioritized implementation plan: P0 / P1 / P2 |
| `09-acceptance-criteria.md` | Definition of done and release gates |
| `AGENT-PROMPT.md` | Master prompt for Astra as orchestrator with smaller agents doing implementation |

## Strategic differentiation

Project Cue should avoid competing primarily on:

- generic Playwright scaffolding,
- generic Playwright best-practice prompts,
- sheer number of skills,
- generic lint rules,
- framework conventions already solved elsewhere.

Its differentiated value should be:

- application knowledge,
- provenance,
- evidence,
- freshness,
- ownership,
- conflict resolution,
- brownfield discovery,
- targeted browser survey,
- agent-facing resolution APIs,
- knowledge-aware verification,
- measurable reduction in hallucinated application facts.

## Core workflow

```text
discover
   ↓
extract
   ↓
survey
   ↓
Knowledge Core
   ↓
resolve
   ↓
agent writes test
   ↓
cue check
   ↓
playwright
   ↓
cue verify
```

The system should favor deterministic evidence over model inference and should never silently treat inferred knowledge as verified truth.
