import { defineConfig } from 'vitest/config';

/** Real Playwright against the demo application: not part of `pnpm test`. */
export default defineConfig({
  test: { include: ['test/integration/**/*.itest.ts'], testTimeout: 120_000 },
});
