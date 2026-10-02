import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  explainRule,
  findKnowledge,
  getContext,
  getEvidence,
  getFreshness,
  resolveApi,
  resolveLocatorTool,
  resolveOwner,
  resolveRoute,
  type ToolContext,
} from './tools.js';

/**
 * The Understudy MCP server: nine tools, all read-only point lookups.
 *
 * What is not here matters as much — browser exploration goes through
 * `playwright-cli`, never through MCP. This server answers questions cheaply
 * rather than becoming another thing competing for the context window.
 */

export const SERVER_NAME = 'understudy';
export const SERVER_VERSION = '0.1.0';

/** Every tool here only reads. Nothing in this server writes to the project. */
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

const text = (value: string): { content: { type: 'text'; text: string }[] } => ({
  content: [{ type: 'text', text: value }],
});

export function createServer(context: ToolContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'explain_rule',
    {
      title: 'Explain a rule',
      // So a model reaches for this when a rule blocks it, rather than
      // restructuring code until the linter goes quiet.
      description:
        'Why an Understudy rule exists and what to write instead. Use when a lint rule blocks a change, before rewriting code to get around it.',
      inputSchema: {
        rule_id: z
          .string()
          .describe('The rule id, e.g. no-hard-waits. Omit-safe: an unknown id lists them all.'),
      },
      annotations: READ_ONLY,
    },
    ({ rule_id }) => text(explainRule(context, rule_id)),
  );

  server.registerTool(
    'resolve_owner',
    {
      title: 'Who decides this',
      description:
        'Which source of Playwright guidance governs a topic when several disagree. Use before following advice that conflicts with this project, or when unsure whether a topic is Understudy’s at all.',
      inputSchema: {
        topic: z.string().describe('The topic, in plain words, e.g. "how do I record a trace".'),
      },
      annotations: READ_ONLY,
    },
    ({ topic }) => text(resolveOwner(context, topic)),
  );

  server.registerTool(
    'resolve_locator',
    {
      title: 'Find a selector',
      description:
        'The real selector for an element, from the project knowledge base, with its freshness and confidence. Use before writing any locator. Returns a survey instruction rather than a guess when the element is unknown.',
      inputSchema: {
        element: z.string().describe('What the element is, e.g. "log in button".'),
        route: z
          .string()
          .optional()
          .describe('Restrict to one route, e.g. /login. Omit to search everything surveyed.'),
      },
      annotations: READ_ONLY,
    },
    ({ element, route }) => text(resolveLocatorTool(context, element, route)),
  );

  server.registerTool(
    'get_context',
    {
      title: 'Context for a task',
      description:
        'Everything relevant to a task in one answer that fits a token budget: the page, its known elements, endpoints, vocabulary, the rules, and how fresh each is. Use once at the start of a task, before reading anything else.',
      inputSchema: {
        task: z.string().describe('The task in plain words, e.g. "test changing the password".'),
        max_tokens: z
          .number()
          .int()
          .optional()
          .describe('Budget for the answer, 200 to 3000. Default 1200.'),
        route: z.string().optional().describe('A route you already know is the right one.'),
      },
      annotations: READ_ONLY,
    },
    ({ task, max_tokens, route }) =>
      text(getContext(context, task, { maxTokens: max_tokens, route })),
  );

  server.registerTool(
    'resolve_route',
    {
      title: 'Find a page',
      description:
        'What is known about one page of the application: its title, how far to trust it, how many elements it has and where that came from. Use before relying on a page; unknown comes with the command that finds out.',
      inputSchema: {
        route: z.string().describe('A path such as /login, or a few words such as "sign up".'),
      },
      annotations: READ_ONLY,
    },
    ({ route }) => text(resolveRoute(context, route)),
  );

  server.registerTool(
    'resolve_api',
    {
      title: 'Find an endpoint',
      description:
        'The API endpoints the project is known to have, with the file each came from. Use before writing a request against an endpoint.',
      inputSchema: {
        path: z.string().describe('A path such as /api/login, or a few words from one.'),
        method: z.string().optional().describe('GET, POST, … Omit to match any method.'),
      },
      annotations: READ_ONLY,
    },
    ({ path, method }) => text(resolveApi(context, path, method)),
  );

  server.registerTool(
    'get_evidence',
    {
      title: 'Why is this believed',
      description:
        'The reasons behind one known fact: source lines, surveyed pages, tests. Use when a fact surprises you, before trusting or discarding it.',
      inputSchema: {
        fact_id: z.string().describe('A fact id, e.g. route:/login. find_knowledge lists them.'),
      },
      annotations: READ_ONLY,
    },
    ({ fact_id }) => text(getEvidence(context, fact_id)),
  );

  server.registerTool(
    'get_freshness',
    {
      title: 'How recent is this',
      description:
        'When a fact was last confirmed and whether the code it was read from has changed since. Use before trusting an old fact; give a fact id or a route.',
      inputSchema: {
        fact_id: z.string().optional().describe('A fact id.'),
        route: z.string().optional().describe('A route path, e.g. /login.'),
      },
      annotations: READ_ONLY,
    },
    ({ fact_id, route }) => text(getFreshness(context, { factId: fact_id, route })),
  );

  server.registerTool(
    'find_knowledge',
    {
      title: 'Search what is known',
      description:
        'Up to five known facts matching a few words: routes, locators, endpoints, vocabulary. Use to find an id for get_evidence, or to see whether something is known at all.',
      inputSchema: {
        query: z.string().describe('A few words, e.g. "checkout total".'),
        kind: z
          .string()
          .optional()
          .describe('Restrict to route, locator, api or term. Omit to search all.'),
      },
      annotations: READ_ONLY,
    },
    ({ query, kind }) => text(findKnowledge(context, query, kind)),
  );

  return server;
}
