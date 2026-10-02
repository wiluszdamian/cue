import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument, type Node } from 'yaml';
import type { TermEntryLike } from './types.js';
import { reference, type SourceFileRef } from './scan.js';

/**
 * A translation catalogue, read by a parser and not by a pattern. The words a user
 * sees are what a `getByRole` name has to match, and they live under keys such as
 * `auth.login.submit`, spread over as many levels as the project likes. A line-by-line
 * match saw only the last segment (`submit`) and, in a minified file, nothing at all.
 *
 * JSON is read as YAML, which it is a subset of, so that one parser gives both formats
 * the same keys and the same line numbers. The line of a term is the line of its value.
 *
 * - A list contributes one key per item, with the position in it: `steps.0`, `steps.1`.
 *   The position is what i18next and most catalogues use to address one.
 * - A value that is not a string (a number, a boolean, null) is not a label and is skipped.
 * - A label is kept exactly as written: `{{name}}`, `{count, plural, …}` and `%s` are part
 *   of what the user sees, and part of what a test has to match.
 * - A key that appears twice, flat and nested (`"a.b"` and `a: { b }`), keeps its first
 *   line and says so as a gap.
 * - A file that cannot be parsed is a gap, and the rest of the catalogues are still read.
 */

/** Deeper than any catalogue is, and a bound on what a hostile file can ask of this reader. */
const MAX_DEPTH = 32;

export interface CatalogueResult {
  readonly terms: readonly TermEntryLike[];
  readonly gaps: readonly string[];
}

const firstLine = (message: string): string => message.split('\n')[0] ?? message;

export function readCatalogue(file: SourceFileRef): CatalogueResult {
  const gaps: string[] = [];
  // Rejoined with the original separator, so offsets and line numbers match the file.
  const text = file.lines.join('\n');
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });

  // A repeated key is legal JSON and a mistake in YAML; the last value wins either way,
  // and the label is still worth reading. Anything else means the file cannot be trusted.
  const fatal = doc.errors.find((error) => error.code !== 'DUPLICATE_KEY');
  if (fatal !== undefined) {
    gaps.push(
      `${file.path}: not valid JSON or YAML, so no labels were read from it (${firstLine(fatal.message)})`,
    );
    return { terms: [], gaps };
  }
  if (doc.errors.length > 0) {
    gaps.push(`${file.path}: a key appears more than once; the last value is the one in use`);
  }

  const root = doc.contents;
  if (!isMap(root)) {
    gaps.push(`${file.path}: the top level is not a mapping, so no labels were read from it`);
    return { terms: [], gaps };
  }

  const found = new Map<string, TermEntryLike>();
  const limits = { tooDeep: false };

  const lineOf = (node: Node): number => lineCounter.linePos(node.range?.[0] ?? 0).line - 1;

  const visit = (node: unknown, key: string, depth: number): void => {
    if (depth > MAX_DEPTH) {
      limits.tooDeep = true;
      return;
    }
    if (isAlias(node)) return;

    if (isMap(node)) {
      for (const pair of node.items) {
        const name = pair.key;
        if (!isScalar(name)) continue;
        const raw: unknown = name.value;
        if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean')
          continue;
        const segment = String(raw);
        visit(pair.value, key === '' ? segment : `${key}.${segment}`, depth + 1);
      }
      return;
    }

    if (isSeq(node)) {
      node.items.forEach((item, position) => {
        visit(item, key === '' ? String(position) : `${key}.${String(position)}`, depth + 1);
      });
      return;
    }

    if (isScalar(node) && typeof node.value === 'string' && node.value.length > 0 && key !== '') {
      const term: TermEntryLike = {
        key,
        label: node.value,
        source: reference(file, lineOf(node)),
      };
      if (found.has(key)) {
        gaps.push(`${file.path}: the key ${key} is defined twice; the first is kept`);
      } else {
        found.set(key, term);
      }
    }
  };

  visit(root, '', 0);
  if (limits.tooDeep) {
    gaps.push(
      `${file.path}: nested more than ${String(MAX_DEPTH)} levels deep; the rest was not read`,
    );
  }

  return { terms: [...found.values()], gaps };
}
