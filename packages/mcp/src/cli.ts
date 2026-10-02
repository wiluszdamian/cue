#!/usr/bin/env node
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadContext } from './tools.js';
import { createServer } from './server.js';

/**
 * stdio entry point.
 *
 * Nothing is written to stdout except protocol traffic — a stray log line
 * corrupts the stream and the failure looks like the agent misbehaving. Every
 * diagnostic goes to stderr.
 */

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const projectRoot = resolve(flag('project') ?? process.cwd());

  // `loadContext` prefers a local rules/ when the project has one — this
  // repository does — and falls back to the copy baked into the package, which
  // is the normal case everywhere else.
  const context = loadContext(projectRoot, flag('rules'));
  await createServer(context).connect(new StdioServerTransport());

  process.stderr.write(`cue mcp ready — project ${projectRoot}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
