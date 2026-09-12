/**
 * The commands the CLI actually implements, as a list that can be asserted
 * against: `doctor` promises a fix for every problem it reports, and `understudy
 * sync` was advertised as one for two checks before it was written.
 *
 * A planned command may still be named, provided the text says so.
 * `test/advice.test.ts` enforces that, and its removal once the command ships.
 */

export const COMMANDS = [
  'init',
  'doctor',
  'sync',
  'add',
  'remove',
  'list',
  'explain',
  'survey',
  'extract',
  'verify-map',
  'locator',
  'uninstall',
] as const;

export type Command = (typeof COMMANDS)[number];

export function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

/** How a not-yet-built command must be flagged wherever it is mentioned. */
export const NOT_IMPLEMENTED_MARKER = 'not implemented yet';
