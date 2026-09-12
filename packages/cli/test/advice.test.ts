import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMANDS, isCommand, NOT_IMPLEMENTED_MARKER } from '../src/commands.js';

/**
 * Every command Understudy tells a user to run must exist. `understudy sync` was
 * advertised as the fix for two checks before it was written, and anyone who
 * followed that advice got "Unknown command" — worse than no advice, because it
 * spends the user's trust to tell them nothing.
 *
 * Naming a command that does not exist yet is allowed, as long as the text says so.
 */

const SRC = join(import.meta.dirname, '..', 'src');

/** Files that hand instructions to a user. */
const ADVICE_FILES = ['doctor.ts', 'init.ts', 'sync.ts', 'survey.ts', 'targets/baseline.ts'];

interface Mention {
  readonly file: string;
  readonly line: number;
  readonly command: string;
  readonly text: string;
}

function mentionsIn(file: string): Mention[] {
  const source = readFileSync(join(SRC, file), 'utf8');
  const found: Mention[] = [];

  source.split('\n').forEach((text, index) => {
    // Both spellings: `understudy <word>` is the installed bin, `@understudy/cli
    // <word>` the npx form. Matching one lets the other drift unchecked.
    // Excluded: `.understudy/install.json`, and an `import understudy from ...`.
    for (const match of text.matchAll(
      /(?<![.\w/])(?<!import )(?:@understudy\/cli|understudy) ([a-z][a-z-]*)/g,
    )) {
      const command = match[1];
      if (command !== undefined) found.push({ file, line: index + 1, command, text });
    }
  });

  return found;
}

const mentions = ADVICE_FILES.flatMap(mentionsIn);

describe('advice the CLI gives', () => {
  it('mentions at least one command, or this test is checking nothing', () => {
    expect(mentions.length).toBeGreaterThan(0);
  });

  it('sees both the bin form and the npx form', () => {
    // Renaming the package once emptied this file's coverage: the pattern still
    // matched the bin form, so the npx advice went unchecked and the suite stayed
    // green. Pin both spellings.
    const seen = (source: string): string[] =>
      [
        ...source.matchAll(
          /(?<![.\w/])(?<!import )(?:@understudy\/cli|understudy) ([a-z][a-z-]*)/g,
        ),
      ].map((m) => m[1] ?? '');

    expect(seen('run `understudy doctor` to check')).toEqual(['doctor']);
    expect(seen('npx @understudy/cli explain <rule-id>')).toEqual(['explain']);
    // The package name inside a path or an import is not an invocation.
    expect(seen("import understudy from '@understudy/eslint-plugin';")).toEqual([]);
    expect(seen('.understudy/install.json lists the files')).toEqual([]);
  });

  it.each(mentions.map((m) => [`${m.file}:${m.line} → understudy ${m.command}`, m] as const))(
    'can honour: %s',
    (_label, mention) => {
      if (isCommand(mention.command)) return;

      // Not built yet is acceptable — silently pretending otherwise is not.
      expect(
        mention.text.includes(NOT_IMPLEMENTED_MARKER),
        `"understudy ${mention.command}" is not a command. Implement it, or say ` +
          `"${NOT_IMPLEMENTED_MARKER}" in the same message. Known: ${COMMANDS.join(', ')}`,
      ).toBe(true);
    },
  );

  // Shipping a command is the moment nobody thinks to remove its marker. `survey`
  // and `extract` were both advertised as unimplemented after they shipped —
  // including in every scaffolded `.agent-kb/README.md`, which told an agent the
  // two commands that populate the knowledge base did not exist.
  it('never calls a shipped command unimplemented', () => {
    const stale = mentions
      .filter((m) => isCommand(m.command) && m.text.includes(NOT_IMPLEMENTED_MARKER))
      .map((m) => `${m.file}:${String(m.line)} → understudy ${m.command}`);

    expect(
      stale,
      `These commands ship but are still advertised as "${NOT_IMPLEMENTED_MARKER}":\n  ${stale.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('the usage text', () => {
  const usage = readFileSync(join(SRC, 'cli.ts'), 'utf8');

  it('documents every implemented command', () => {
    for (const command of COMMANDS) {
      expect(usage.includes(`case '${command}'`), `${command} has no handler`).toBe(true);
    }
  });

  it('implements every command it documents', () => {
    const handled = [...usage.matchAll(/case '([a-z-]+)':/g)]
      .map((m) => m[1])
      .filter((c): c is string => c !== undefined)
      // Handled before the switch, and not part of the advertised command set.
      .filter((c) => c !== 'help' && c !== 'version');

    expect([...new Set(handled)].sort()).toEqual([...COMMANDS].sort());
  });
});
