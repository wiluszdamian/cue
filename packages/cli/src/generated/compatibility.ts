// GENERATED FILE — do not edit.
//
// Source:     compatibility.yaml
// Regenerate: pnpm --filter @wiluszdamian/cue generate
//
// The versions of other people's tools this release was run against. They travel with
// the package because the MCP configuration `init` writes pins them, and `doctor`
// compares what a project has installed with them.

import type { Compatibility } from '@wiluszdamian/cue-engine';

export const COMPATIBILITY = {
  schemaVersion: 1,
  node: '^22.13 || >=24',
  tools: {
    '@playwright/cli': {
      range: '>=0.1.22 <0.2.0',
      tested: '0.1.22',
      role: 'the browser, for survey and verify',
      snapshotFormats: ['playwright-cli/markdown-yaml@1'],
    },
    '@playwright/mcp': {
      range: '>=0.0.83 <0.1.0',
      tested: '0.0.83',
      role: 'browser calls from an agent, next to the Cue server',
    },
    '@playwright/test': {
      range: '>=1.63.0 <2.0.0',
      tested: '1.63.0',
      role: 'the test runner the suite is written for',
    },
    'typescript-eslint': {
      range: '>=8.70.0 <9.0.0',
      tested: '8.70.0',
      role: 'the linter the rules run in',
    },
  },
} as unknown as Compatibility;
