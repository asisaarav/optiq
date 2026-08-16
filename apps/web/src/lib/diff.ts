/**
 * Line-level diff via longest-common-subsequence. Dependency-free and linear in
 * memory for typical inputs, so it runs comfortably in the browser with no API.
 *
 * The output is a flat list of rows suited to a side-by-side or unified view:
 * each row is tagged equal / added / removed, with the line numbers it occupies
 * on each side.
 */

export type DiffOp = "equal" | "added" | "removed";

export interface DiffRow {
  op: DiffOp;
  left?: string;
  right?: string;
  leftLine?: number;
  rightLine?: number;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export interface DiffResult {
  rows: DiffRow[];
  stats: DiffStats;
  identical: boolean;
}

/**
 * Compute the LCS length table for two line arrays. Kept as a separate step so
 * the backtrack below reads clearly.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const table: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = m - 1; i >= 0; i--) {
    const rowNext = table[i + 1]!;
    const row = table[i]!;
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        row[j] = rowNext[j + 1]! + 1;
      } else {
        row[j] = Math.max(rowNext[j]!, row[j + 1]!);
      }
    }
  }
  return table;
}

/** Split text into lines, dropping a single trailing newline's empty tail. */
function toLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Diff two texts by line. Optionally ignores leading/trailing whitespace and
 * case so a pure reformat does not show as a change.
 */
export function diffLines(
  leftText: string,
  rightText: string,
  opts: { ignoreWhitespace?: boolean; ignoreCase?: boolean } = {},
): DiffResult {
  const rawLeft = toLines(leftText);
  const rawRight = toLines(rightText);

  const norm = (s: string): string => {
    let out = s;
    if (opts.ignoreWhitespace) out = out.trim();
    if (opts.ignoreCase) out = out.toLowerCase();
    return out;
  };
  const a = rawLeft.map(norm);
  const b = rawRight.map(norm);

  const table = lcsTable(a, b);
  const rows: DiffRow[] = [];
  const stats: DiffStats = { added: 0, removed: 0, unchanged: 0 };

  let i = 0;
  let j = 0;
  let leftNo = 1;
  let rightNo = 1;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({
        op: "equal",
        left: rawLeft[i],
        right: rawRight[j],
        leftLine: leftNo++,
        rightLine: rightNo++,
      });
      stats.unchanged++;
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      rows.push({ op: "removed", left: rawLeft[i], leftLine: leftNo++ });
      stats.removed++;
      i++;
    } else {
      rows.push({ op: "added", right: rawRight[j], rightLine: rightNo++ });
      stats.added++;
      j++;
    }
  }
  while (i < a.length) {
    rows.push({ op: "removed", left: rawLeft[i], leftLine: leftNo++ });
    stats.removed++;
    i++;
  }
  while (j < b.length) {
    rows.push({ op: "added", right: rawRight[j], rightLine: rightNo++ });
    stats.added++;
    j++;
  }

  return { rows, stats, identical: stats.added === 0 && stats.removed === 0 };
}
