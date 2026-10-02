import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import parser from '@typescript-eslint/parser';
import { RuleTester } from '@typescript-eslint/rule-tester';
import { clearKnowledgeCache, writeRouteMap } from '@understudy/engine';
import { afterAll, describe, it } from 'vitest';
import { rules } from '../src/index.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({ languageOptions: { parser } });

/** A project that knows the login page, surveyed just now. */
function projectWithKnowledge(): string {
  const root = mkdtempSync(join(tmpdir(), 'understudy-eslint-kb-'));
  const at = new Date().toISOString();
  writeRouteMap(root, {
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
  return root;
}

function bareProject(): string {
  return mkdtempSync(join(tmpdir(), 'understudy-eslint-bare-'));
}

const code = (call: string): string =>
  `import { test } from '@playwright/test';\ntest('t', async ({ page }) => {\n  await page.goto('/login');\n  await ${call}.click();\n});\n`;

const rule = rules['selectors-from-agent-kb'];
if (rule === undefined) throw new Error('selectors-from-agent-kb should be exported');

const known = projectWithKnowledge();
const none = bareProject();
clearKnowledgeCache();

// The file is deep inside the project: the knowledge base is found by walking up.
const deep = (root: string): string => join(root, 'tests', 'app', 'login.spec.ts');
mkdirSync(dirname(deep(known)), { recursive: true });
writeFileSync(deep(known), '', 'utf8');

afterAll(() => {
  rmSync(known, { recursive: true, force: true });
  rmSync(none, { recursive: true, force: true });
});

ruleTester.run('selectors-from-agent-kb (finding the knowledge base)', rule, {
  valid: [
    {
      name: 'a locator the knowledge base knows',
      code: code("page.getByRole('button', { name: 'Log in' })"),
      filename: deep(known),
    },
    {
      name: 'silent where there is no .agent-kb at all',
      code: code("page.getByRole('button', { name: 'Anything at all' })"),
      filename: deep(none),
    },
    {
      name: 'not judged: a locator the code cannot decide',
      code: code("page.getByText('Welcome')"),
      filename: deep(known),
    },
  ],
  invalid: [
    {
      name: 'an invented locator, with the finding after the message',
      code: code("page.getByRole('button', { name: 'Sign in now' })"),
      filename: deep(known),
      errors: [
        {
          messageId: 'violation',
          line: 4,
          column: 14,
          data: {
            detail:
              "getByRole('button', { name: 'Sign in now' }) is not in the knowledge base. Nearest known: getByRole('button', { name: 'Log in' }) on /login. Use that, or run `understudy survey --route /login --base-url <url>` if the element is new.",
          },
        },
      ],
    },
  ],
});
