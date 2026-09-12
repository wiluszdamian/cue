import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { explainRule, resolveLocatorTool, resolveOwner, type ToolContext } from './tools.js';

/**
 * The Understudy MCP server: three tools, all read-only point lookups.
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

  return server;
}
