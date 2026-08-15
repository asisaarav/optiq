import { useMemo } from "react";

type Row = { kind: "same" | "add" | "del"; text: string; left?: number; right?: number };

/** Classic LCS line diff — small inputs only, capped for safety. */
function diffLines(a: string[], b: string[]): Row[] {
  const MAX = 1200;
  if (a.length > MAX || b.length > MAX) {
    return [
      ...a.map((text, i) => ({ kind: "del" as const, text, left: i + 1 })),
      ...b.map((text, i) => ({ kind: "add" as const, text, right: i + 1 })),
    ];
  }

  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const rows: Row[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: "same", text: a[i], left: i + 1, right: j + 1 });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      rows.push({ kind: "del", text: a[i], left: i + 1 });
      i++;
    } else {
      rows.push({ kind: "add", text: b[j], right: j + 1 });
      j++;
    }
  }
  while (i < n) rows.push({ kind: "del", text: a[i], left: ++i });
  while (j < m) rows.push({ kind: "add", text: b[j], right: ++j });
  return rows;
}

/**
 * Line-level diff between the pasted source and the optimized rewrite.
 * Text is rendered as React children (never innerHTML), so untrusted input
 * cannot inject markup.
 */
export function DiffView({ original, optimized }: { original: string; optimized: string }) {
  const rows = useMemo(
    () => diffLines(original.split("\n"), optimized.split("\n")),
    [original, optimized],
  );

  const added = rows.filter((r) => r.kind === "add").length;
  const removed = rows.filter((r) => r.kind === "del").length;

  if (!added && !removed) {
    return (
      <div className="font-mono text-xs text-muted-foreground py-6 text-center">
        No line-level differences — the rewrite is identical to your input.
      </div>
    );
  }

  return (
    <div className="font-mono text-[12px] leading-relaxed">
      <div className="flex gap-3 text-[10px] uppercase tracking-widest mb-2">
        <span className="text-primary">+{added} added</span>
        <span className="text-rose-400">−{removed} removed</span>
      </div>
      <div className="rounded-lg overflow-hidden ring-1 ring-border">
        {rows.map((r, idx) => (
          <div
            key={idx}
            className={`flex gap-3 px-3 py-0.5 whitespace-pre-wrap break-words ${
              r.kind === "add"
                ? "bg-primary/10 text-primary"
                : r.kind === "del"
                  ? "bg-rose-500/10 text-rose-300"
                  : "text-muted-foreground/80"
            }`}
          >
            <span className="select-none opacity-50 w-10 shrink-0 text-right">
              {r.kind === "add" ? r.right : r.left}
            </span>
            <span className="select-none w-3 shrink-0" aria-hidden>
              {r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}
            </span>
            <span className="min-w-0">{r.text || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
