/**
 * @understudy/mcp — three point lookups over the rules and the knowledge base.
 *
 * Exported so the tools can be driven from tests and from other packages without
 * standing up a transport.
 */

export { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

export {
  estimateTokens,
  explainRule,
  loadContext,
  resolveLocatorTool,
  resolveOwner,
  TOKEN_BUDGET,
  type ToolContext,
} from './tools.js';
