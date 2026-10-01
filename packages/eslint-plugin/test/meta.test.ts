import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import plugin from '../src/index.js';

describe('plugin metadata', () => {
  it('reports the version in package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(plugin.meta.version).toBe(pkg.version);
  });
});
