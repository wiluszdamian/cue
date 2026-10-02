---
name: survey
description: >
  Map the running application into .agent-kb/app-map by exploring it with
  playwright-cli. Use when the UI is not yet in the knowledge base, or when
  locators have gone stale.
disable-model-invocation: true
---

# survey

Builds the runtime half of the knowledge base: what the application actually
looks like when it is running.

## Procedure

1. Check `understudy doctor` first — `playwright-cli` and the official Playwright
   skills must be present.
2. **Explore through `playwright-cli`, not through MCP.** Microsoft's own guidance
   is that a CLI-as-skill avoids loading large tool schemas and verbose
   accessibility trees into context. A full accessibility tree through MCP costs
   more context than the task it serves.
3. For each route, write `.agent-kb/app-map/<route>.yaml`: title, accessibility
   tree, verified selectors, outgoing links, `verifiedAt`, snapshot hash.
4. Record multi-step journeys under `flows/` with their checkpoints.
5. To refresh rather than start over, survey only what needs it: `understudy survey --stale
--base-url <url>` (or `--route <path>`, or `--affected-by <git range>`). Prefer that to a
   full crawl; it names the pages and why before it opens any.
6. If `extract` has already run, flag any disagreement with
   `.agent-kb/product/testids.yaml` — a selector present in one and not the other
   is a finding, not a detail.

## It is working if

Every route written has a `verifiedAt` and a hash, and `understudy doctor` does
not report the entries as stale.

## Prohibitions

- **No raw HTML, no screenshots carrying personal data.** The knowledge base is
  committed and reviewed; it must not become the place where production data
  lands in version control.
- **No confident voice on a failed verification.** A selector that could not be
  confirmed is recorded as unconfirmed. A knowledge base that reports a selector
  which no longer exists is worse than no knowledge base at all.
