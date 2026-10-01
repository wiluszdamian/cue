import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env['DEMO_PORT'] ?? 4310);
const baseURL = `http://127.0.0.1:${String(port)}`;

/**
 * One worker: the app keeps its state in memory, so tests share a server and run
 * one after another. `DEMO_MUTATIONS` is forwarded to it, which is how
 * `test:mutations` proves these tests fail when the app is broken.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15_000,
  reporter: 'list',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node server.mjs',
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    env: { PORT: String(port), DEMO_MUTATIONS: process.env['DEMO_MUTATIONS'] ?? '' },
  },
});
