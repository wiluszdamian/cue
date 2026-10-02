import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashSnapshot, loadRules, parseSnapshot, writeRouteMap } from '@understudy/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';
import {
  estimateTokens,
  explainRule,
  loadContext,
  resolveLocatorTool,
  resolveOwner,
  TOKEN_BUDGET,
  type ToolContext,
} from '../src/tools.js';

/**
 * The MCP layer is thin: every answer comes from an already-tested engine
 * function. What is tested here is its own responsibility — that an answer stays
 * inside its budget, and that refusals survive the trip through a tool boundary.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const rules = loadRules(join(REPO_ROOT, 'rules'));

const SNAPSHOT = `### Page
- Page URL: http://localhost:3000/login
- Page Title: Sign in
### Snapshot
\`\`\`yaml
- main [ref=e2]:
  - heading "Welcome back" [level=1] [ref=e3]
  - textbox "Email" [ref=e5]
  - button "Log in" [ref=e7]
\`\`\`
`;

let root: string;
let context: ToolContext;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'understudy-mcp-'));
  const parsed = parseSnapshot(SNAPSHOT);
  const now = new Date().toISOString();
  writeRouteMap(root, {
    schemaVersion: 1,
    route: '/login',
    title: parsed.title,
    exploredAt: now,
    verifiedAt: now,
    snapshotHash: hashSnapshot(parsed.tree),
    elements: [...parsed.elements],
    links: [],
    gaps: [],
  });
  context = { rules, projectRoot: root };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('loading the rules', () => {
  it('uses the copy baked into the package when the project has no rules/', () => {
    // The normal case. An earlier version threw here on startup, which a stdio
    // client reports only as "connection closed".
    const standalone = loadContext(root);
    expect(standalone.rules.constitution.rules.length).toBeGreaterThan(0);
    expect(standalone.rules.ownership.topics.length).toBeGreaterThan(0);
  });

  it('prefers a local rules/ when the project has one', () => {
    const local = loadContext(REPO_ROOT);
    expect(local.rules.dir).toContain('rules');
    expect(local.rules.constitution.rules.map((r) => r.id)).toContain('no-hard-waits');
  });

  it('falls back rather than dying on a malformed rules/', () => {
    const broken = mkdtempSync(join(tmpdir(), 'understudy-broken-'));
    mkdirSync(join(broken, 'rules'), { recursive: true });
    writeFileSync(join(broken, 'rules', 'constitution.yaml'), 'not: [valid', 'utf8');

    expect(() => loadContext(broken)).not.toThrow();
    expect(loadContext(broken).rules.constitution.rules.length).toBeGreaterThan(0);
    rmSync(broken, { recursive: true, force: true });
  });
});

describe('the context budget', () => {
  // Paid out of the window the real task needs, so the ceiling is asserted rather
  // than intended.
  it.each(rules.constitution.rules.map((r) => [r.id] as const))(
    'explain_rule stays inside budget for %s',
    (ruleId) => {
      const tokens = estimateTokens(explainRule(context, ruleId));
      expect(tokens).toBeLessThanOrEqual(TOKEN_BUDGET.explain_rule);
    },
  );

  it.each(rules.ownership.topics.map((t) => [t.topic] as const))(
    'resolve_owner stays inside budget for %s',
    (topic) => {
      const tokens = estimateTokens(resolveOwner(context, topic));
      expect(tokens).toBeLessThanOrEqual(TOKEN_BUDGET.resolve_owner);
    },
  );

  it('resolve_locator stays inside budget, found or not', () => {
    for (const query of ['log in button', 'email field', 'a thing nobody surveyed']) {
      expect(estimateTokens(resolveLocatorTool(context, query))).toBeLessThanOrEqual(
        TOKEN_BUDGET.resolve_locator,
      );
    }
  });

  it('over-estimates rather than under-estimates', () => {
    // Erring high is the safe direction for a budget.
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});

describe('explain_rule', () => {
  it('gives the reason and the replacement, not just the rule name', () => {
    const answer = explainRule(context, 'no-hard-waits');
    expect(answer).toContain('Why:');
    expect(answer).toContain('Instead:');
    expect(answer).toContain('wrong:');
    expect(answer).toContain('right:');
  });

  it('says when a rule no linter can check is still binding', () => {
    // There may be none: every rule can become mechanical. Then there is nothing to say.
    for (const manual of rules.constitution.rules.filter((r) => r.detector.kind === 'manual')) {
      // An agent told a rule is enforced iterates against the linter. Not this one.
      expect(explainRule(context, manual.id)).toContain('Not mechanically enforced');
    }
  });

  it('says what a rule checked against the knowledge base does not cover', () => {
    const answer = explainRule(context, 'selectors-from-agent-kb');
    expect(answer).toContain('Checked against .agent-kb only');
    expect(answer).toContain('understudy check');
    expect(answer).not.toContain('Not mechanically enforced');
  });

  it('lists the rules when given an id that does not exist', () => {
    const answer = explainRule(context, 'no-such-rule');
    expect(answer).toContain('No rule called');
    expect(answer).toContain('no-hard-waits');
  });
});

describe('resolve_owner', () => {
  it('names the owner and its precedence', () => {
    const answer = resolveOwner(context, 'which locator should I use');
    expect(answer).toContain('understudy');
    expect(answer).toContain('ABSOLUTE');
  });

  it('sends browser exploration to the CLI, not to MCP', () => {
    // This server answering "use MCP" here would contradict the table it serves.
    const answer = resolveOwner(context, 'how do I explore the page and inspect elements');
    expect(answer).toContain('playwright-official');
    expect(answer).toContain('Use via: cli');
  });

  it('reports a gap rather than improvising', () => {
    const answer = resolveOwner(context, 'what colour should the primary button be');
    expect(answer).toContain('gap in rules/ownership.yaml');
    expect(answer).toContain('do not pick a convention');
  });

  it('hands product planning back to the team', () => {
    expect(resolveOwner(context, 'write a product spec and break it into tickets')).toContain(
      'external-process',
    );
  });
});

describe('resolve_locator', () => {
  it('answers with a real selector and its confidence', () => {
    const answer = resolveLocatorTool(context, 'log in button');
    expect(answer).toContain("getByRole('button', { name: 'Log in' })");
    expect(answer).toContain('Confidence:');
    expect(answer).toContain('Freshness:');
  });

  it('refuses to guess through the tool boundary too', () => {
    // The point of the knowledge base, and the easiest thing to lose in a protocol.
    const answer = resolveLocatorTool(context, 'delete account button');
    expect(answer).toContain('Do not guess a selector');
    expect(answer).toContain('understudy survey');
  });

  it('can be narrowed to one route', () => {
    expect(resolveLocatorTool(context, 'email', '/login')).toContain('Email');
  });
});

describe('the server', () => {
  it('registers exactly the tools it documents', () => {
    const server = createServer(context);
    // The only way to see what a client sees without standing up a transport.
    const registered = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools,
    ).sort();
    expect(registered).toEqual([
      'explain_rule',
      'find_knowledge',
      'get_context',
      'get_evidence',
      'get_freshness',
      'resolve_api',
      'resolve_locator',
      'resolve_owner',
      'resolve_route',
    ]);
  });

  it('declares every tool read-only', () => {
    const server = createServer(context);
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { annotations?: { readOnlyHint?: boolean } }>;
      }
    )._registeredTools;

    for (const [name, tool] of Object.entries(tools)) {
      // Nothing here writes, and a client should know that without asking.
      expect(tool.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it('describes each tool in terms of when to reach for it', () => {
    const server = createServer(context);
    const tools = (
      server as unknown as { _registeredTools: Record<string, { description?: string }> }
    )._registeredTools;

    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.description, name).toBeDefined();
      // A description is loaded on every turn, so it is a budget line as well.
      expect(tool.description?.toLowerCase(), name).toContain('use ');
      expect(estimateTokens(tool.description ?? ''), name).toBeLessThanOrEqual(80);
    }
  });
});
