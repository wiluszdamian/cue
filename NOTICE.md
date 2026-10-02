# NOTICE

Cue
Copyright 2026 The Cue Authors

This product includes software developed by The Cue Authors, licensed
under the MIT License. See [LICENSE](LICENSE).

## Third-party components

Cue is an integrator. It composes work maintained by others, and it is
important that the boundary is legible.

### Installed, not copied

These are installed on the user's machine by their own tooling. Cue
detects, configures, and defers to them; it vendors no part of them.

- **Playwright**, **`playwright-cli`**, and the official Playwright agent skills
  — Microsoft Corporation, Apache-2.0.
  <https://github.com/microsoft/playwright>
- **Playwright MCP** (`@playwright/mcp`) — Microsoft Corporation, Apache-2.0.
  <https://github.com/microsoft/playwright-mcp>

### Referenced

- **`playwright-best-practices-skill`** — Currents Software Inc., MIT. Installed
  at the user's option as the owner of general Playwright practice. Not
  redistributed here.
  <https://github.com/currents-dev/playwright-best-practices-skill>

### Build and runtime dependencies

Declared in each package's `package.json` and resolved from npm. Notable direct
dependencies: `@typescript-eslint/*` (MIT), `esquery` (BSD-3-Clause), `zod`
(MIT), `yaml` (ISC), `picomatch` (MIT), `eslint` (MIT).

## Attribution and independence

Every rule, skill, example, and line of documentation authored in this repository
is original work.

Cue is not affiliated with, endorsed by, or sponsored by Microsoft,
Anthropic, OpenAI, Google, xAI, or Currents Software Inc. Product names are the
trademarks of their respective owners and are used only to identify the software
Cue integrates with.
