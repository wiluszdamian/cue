import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { extract, writeRouteMap } from '@understudy/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { estimateTokens, loadContext, resolveLocatorTool, TOKEN_BUDGET } from '../src/tools.js';

/**
 * `resolve_locator` is paid for out of the context the real task needs. Telling the
 * agent that the code behind an answer has changed must fit the same ceiling.
 */

let product: string;
let project: string;

const write = (root: string, path: string, text: string): void => {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, 'utf8');
};

beforeEach(() => {
  product = mkdtempSync(join(tmpdir(), 'understudy-mcp-product-'));
  project = mkdtempSync(join(tmpdir(), 'understudy-mcp-project-'));
  write(product, 'app/Login.tsx', '<button data-testid="login-submit">Log in</button>\n');
  extract({ projectRoot: project, sourceRoot: product });

  const at = new Date().toISOString();
  writeRouteMap(project, {
    schemaVersion: 2,
    route: '/login',
    title: 'Sign in',
    exploredAt: at,
    verifiedAt: at,
    snapshotHash: 'h',
    links: [],
    gaps: [],
    elements: [
      {
        role: 'button',
        name: 'Log in',
        locator: "getByRole('button', { name: 'Log in' })",
        confidence: 'runtime-only',
      },
    ],
  });
});

afterEach(() => {
  rmSync(product, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

describe('resolve_locator when the code behind the answer has changed', () => {
  const answer = () => resolveLocatorTool(loadContext(project), 'log in button');

  it('gives the plain answer while the code is as it was', () => {
    expect(answer()).not.toContain('Changed:');
  });

  it('says the code changed, naming the file, and still fits its budget', () => {
    write(product, 'app/Login.tsx', 'rewritten\n');
    const text = answer();
    expect(text).toContain('Changed:    app/Login.tsx changed since it was confirmed');
    expect(text).toContain('A file it was read from has changed');
    expect(estimateTokens(text)).toBeLessThanOrEqual(TOKEN_BUDGET.resolve_locator);
  });

  it('is silent about code when the product is no longer where it was read from', () => {
    rmSync(product, { recursive: true, force: true });
    expect(answer()).not.toContain('Changed:');
  });
});
