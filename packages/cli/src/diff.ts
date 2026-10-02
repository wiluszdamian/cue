/**
 * A minimal line diff, so `sync` can show what it is about to change. Cue
 * rewrites files in repositories it does not own, where "trust me" is not good
 * enough — and a dependency is not worth it at this size.
 */

export interface DiffLine {
  readonly kind: 'context' | 'added' | 'removed';
  readonly text: string;
}

/** Above this the LCS table stops being reasonable to build, and the diff to read. */
const MAX_LINES = 2000;

export function isDiffable(before: string, after: string): boolean {
  return before.split('\n').length <= MAX_LINES && after.split('\n').length <= MAX_LINES;
}

/** Classic LCS. Small inputs, so clarity beats cleverness. */
function longestCommonSubsequence(before: readonly string[], after: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );

  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const row = table[i];
      const nextRow = table[i + 1];
      if (!row || !nextRow) continue;
      row[j] =
        before[i] === after[j]
          ? (nextRow[j + 1] ?? 0) + 1
          : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  return table;
}

export function diffLines(before: string, after: string): DiffLine[] {
  const left = before.split('\n');
  const right = after.split('\n');
  const table = longestCommonSubsequence(left, right);
  const out: DiffLine[] = [];

  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      out.push({ kind: 'context', text: left[i] ?? '' });
      i += 1;
      j += 1;
    } else if ((table[i + 1]?.[j] ?? 0) >= (table[i]?.[j + 1] ?? 0)) {
      out.push({ kind: 'removed', text: left[i] ?? '' });
      i += 1;
    } else {
      out.push({ kind: 'added', text: right[j] ?? '' });
      j += 1;
    }
  }
  while (i < left.length) {
    out.push({ kind: 'removed', text: left[i] ?? '' });
    i += 1;
  }
  while (j < right.length) {
    out.push({ kind: 'added', text: right[j] ?? '' });
    j += 1;
  }

  return out;
}

const MARK: Record<DiffLine['kind'], string> = {
  context: '  ',
  added: '+ ',
  removed: '- ',
};

/** Context around each change, long unchanged stretches elided: an unread diff is no diff. */
export function renderDiff(before: string, after: string, context = 2): string {
  if (!isDiffable(before, after)) {
    const removed = before.split('\n').length;
    const added = after.split('\n').length;
    return `      (too large to show — ${removed} lines become ${added})`;
  }

  const lines = diffLines(before, after);
  const interesting = new Set<number>();
  lines.forEach((line, index) => {
    if (line.kind === 'context') return;
    for (let k = index - context; k <= index + context; k += 1) {
      if (k >= 0 && k < lines.length) interesting.add(k);
    }
  });

  const out: string[] = [];
  let skipping = false;
  lines.forEach((line, index) => {
    if (!interesting.has(index)) {
      if (!skipping) {
        out.push('      …');
        skipping = true;
      }
      return;
    }
    skipping = false;
    out.push(`      ${MARK[line.kind]}${line.text}`);
  });

  return out.join('\n');
}

export function countChanges(before: string, after: string): { added: number; removed: number } {
  if (!isDiffable(before, after)) {
    return { added: after.split('\n').length, removed: before.split('\n').length };
  }
  let added = 0;
  let removed = 0;
  for (const line of diffLines(before, after)) {
    if (line.kind === 'added') added += 1;
    else if (line.kind === 'removed') removed += 1;
  }
  return { added, removed };
}
