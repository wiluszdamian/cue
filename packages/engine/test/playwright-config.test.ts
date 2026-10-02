import { describe, expect, it } from 'vitest';
import { inspectPlaywrightConfig } from '../src/discovery/playwright-config.js';

describe('reading a Playwright config without running it', () => {
  it('finds the test folder and the projects in the usual defineConfig shape', () => {
    const facts = inspectPlaywrightConfig(`
      import { defineConfig, devices } from '@playwright/test';
      export default defineConfig({
        testDir: './e2e',
        use: { baseURL: 'http://localhost:3000' },
        projects: [
          { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ],
      });
    `);
    expect(facts).toEqual({
      testDir: './e2e',
      baseURL: 'http://localhost:3000',
      projects: ['chromium', 'webkit'],
    });
  });

  it('reads a plain exported object, a CommonJS one and a template literal', () => {
    expect(
      inspectPlaywrightConfig("export default { testDir: 'tests', projects: [] };").testDir,
    ).toBe('tests');
    expect(inspectPlaywrightConfig('module.exports = { testDir: `specs` };').testDir).toBe('specs');
  });

  it('reports only what is written down, and nothing it would have to work out', () => {
    const facts = inspectPlaywrightConfig(`
      const dir = process.env.DIR;
      export default defineConfig({
        testDir: dir,
        use: { baseURL: process.env.BASE },
        projects: [...shared, { name: variableName }, { name: 'api' }, 'not an object'],
      });
    `);
    expect(facts.testDir).toBeUndefined();
    expect(facts.baseURL).toBeUndefined();
    expect(facts.projects).toEqual(['api']);
  });

  it('takes the first of a repeated key, as written', () => {
    const facts = inspectPlaywrightConfig(
      "export default { testDir: 'first', projects: [{ name: 'a' }], other: { testDir: 'second', projects: [{ name: 'b' }] } };",
    );
    expect(facts).toMatchObject({ testDir: 'first', projects: ['a'] });
  });

  it('says it could not read a file that is not code, instead of throwing', () => {
    const facts = inspectPlaywrightConfig('this is { not ( typescript');
    expect(facts.projects).toEqual([]);
    expect(facts.unreadable).toBeDefined();
  });

  it('never executes the file', () => {
    // If this ran, the process would exit; reading it must be harmless.
    const facts = inspectPlaywrightConfig("process.exit(7); export default { testDir: 'safe' };");
    expect(facts.testDir).toBe('safe');
  });

  it('has nothing to say about an empty file', () => {
    expect(inspectPlaywrightConfig('')).toEqual({ projects: [] });
  });
});
