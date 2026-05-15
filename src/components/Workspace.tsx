import { useMemo, useState } from "react";

const DIALECTS = ["POSTGRESQL", "MYSQL", "SNOWFLAKE", "BIGQUERY"] as const;
type Dialect = (typeof DIALECTS)[number];

const DEFAULT_INPUT = `SELECT u.name, o.total
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.created_at > '2023-01-01'
AND u.status = 'active'
ORDER BY o.total DESC
LIMIT 10;`;

const KEYWORDS = [
  "SELECT","FROM","JOIN","INNER JOIN","LEFT JOIN","ON","WHERE","AND","OR",
  "ORDER BY","GROUP BY","LIMIT","DESC","ASC","INSERT","UPDATE","DELETE","SET","VALUES","INTO","AS","WITH",
];

function highlight(sql: string) {
  const escaped = sql.replace(/[<>&]/g, (c) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c]!));
  let out = escaped;
  // strings
  out = out.replace(/'([^']*)'/g, `<span class="text-primary">'$1'</span>`);
  // comments /*+ ... */
  out = out.replace(/\/\*\+([^*]|\*(?!\/))*\*\//g, (m) => `<span class="text-zinc-500">${m}</span>`);
  // keywords
  const kw = KEYWORDS.sort((a,b)=>b.length-a.length).join("|").replace(/ /g, "\\s+");
  out = out.replace(new RegExp(`\\b(${kw})\\b`, "gi"), `<span class="text-[color:var(--keyword)]">$1</span>`);
  return out;
}

type Optimization = {
  input: string;
  output: string;
  speedup: number;
  changes: { title: string; detail: string; highlight?: boolean }[];
};

function optimize(input: string, dialect: Dialect): Optimization {
  const trimmed = input.trim();
  // Lightweight heuristic optimizer for demo purposes.
  const changes: Optimization["changes"] = [];
  let output = trimmed;

  if (/SELECT\s+\*/i.test(output)) {
    output = output.replace(/SELECT\s+\*/i, "SELECT /* explicit columns */ *");
    changes.push({
      title: "Avoid SELECT *",
      detail: "Replace wildcard with explicit column list to reduce I/O and network payload.",
    });
  }

  if (/JOIN/i.test(output) && /WHERE[^;]*>/i.test(output)) {
    changes.push({
      title: "Join Reordering",
      detail: "Smaller filtered table prioritized to narrow the dataset before joining.",
    });
  }

  if (/created_at|updated_at|date/i.test(output)) {
    const hint = dialect === "POSTGRESQL" ? "/*+ INDEX(o idx_orders_created) */" : "USE INDEX (idx_created_at)";
    if (!output.includes(hint)) {
      output = output.replace(/FROM\s+(\w+)\s+(\w+)?/i, (m) => `${m} ${hint}`);
      changes.push({
        title: "Index Hint Injection",
        detail: `Forcing ${hint} to skip a sequential scan on date-filtered rows.`,
        highlight: true,
      });
    }
  }

  if (/status\s*=\s*'/i.test(output)) {
    changes.push({
      title: "Predicate Pushdown",
      detail: "Status filter moved earlier in the execution plan to shrink intermediate results.",
    });
  }

  if (changes.length === 0) {
    changes.push({
      title: "Already efficient",
      detail: "No obvious rewrites detected. Consider analyzing the query plan for deeper insights.",
    });
  }

  // Estimate speedup (deterministic-ish based on changes + length)
  const base = Math.min(60, 12 + changes.length * 9 + (output.length % 13));
  return {
    input: trimmed,
    output,
    speedup: base + +(((output.length * 7) % 10) / 10).toFixed(1),
    changes,
  };
}

export function Workspace() {
  const [dialect, setDialect] = useState<Dialect>("POSTGRESQL");
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [result, setResult] = useState<Optimization>(() => optimize(DEFAULT_INPUT, "POSTGRESQL"));
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const inputHtml = useMemo(() => highlight(input), [input]);
  const outputHtml = useMemo(() => highlight(result.output), [result.output]);

  function handleOptimize() {
    setRunning(true);
    setTimeout(() => {
      setResult(optimize(input, dialect));
      setRunning(false);
    }, 450);
  }

  function handleCopy() {
    navigator.clipboard?.writeText(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleShare() {
    const url = `${window.location.origin}/?q=${encodeURIComponent(result.output).slice(0, 200)}`;
    navigator.clipboard?.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 1500);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6" style={{ animation: "fadeIn 0.8s ease-out both" }}>
      <div className="flex flex-col bg-surface/50 p-1 rounded-xl ring-1 ring-border">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="flex items-center gap-3">
            <select
              value={dialect}
              onChange={(e) => setDialect(e.target.value as Dialect)}
              className="flex items-center gap-1.5 px-2 py-1 bg-secondary rounded border border-border text-xs font-mono cursor-pointer outline-none focus:border-primary"
            >
              {DIALECTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground hidden sm:inline">Production DB v15.4</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="text-xs bg-secondary px-3 py-1 rounded border border-border hover:border-muted-foreground transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={handleOptimize}
              disabled={running}
              className="text-xs bg-primary text-primary-foreground font-bold px-4 py-1 rounded hover:opacity-90 disabled:opacity-60 transition"
            >
              {running ? "OPTIMIZING…" : "OPTIMIZE"}
            </button>
          </div>
        </div>

        {/* Editor split */}
        <div className="grid md:grid-cols-2 h-[480px] font-mono text-sm leading-relaxed overflow-hidden">
          <div className="p-6 border-r border-border overflow-auto bg-surface-2/40">
            <div className="text-muted-foreground mb-3 text-[10px] uppercase tracking-widest">Input Query</div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              className="w-full h-[calc(100%-1.5rem)] bg-transparent resize-none outline-none text-zinc-300 font-mono text-sm leading-relaxed"
            />
          </div>
          <div className="p-6 overflow-auto bg-surface/40 relative">
            <div className="text-primary mb-3 text-[10px] uppercase tracking-widest flex items-center gap-2">
              Optimized Output
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            </div>
            <pre
              className="text-foreground whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: outputHtml }}
            />
            <div className="absolute bottom-6 right-6">
              <div className="bg-primary/10 border border-primary/20 rounded px-4 py-3 backdrop-blur-sm">
                <div className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1">Est. Speedup</div>
                <div className="text-3xl font-mono font-bold text-primary tracking-tighter">
                  {result.speedup.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* hidden but keeps highlighter referenced for future inline preview */}
        <span className="sr-only" dangerouslySetInnerHTML={{ __html: inputHtml }} />
      </div>

      {/* Analysis panel */}
      <div className="flex flex-col gap-4">
        <div className="bg-surface/50 p-4 rounded-xl ring-1 ring-border">
          <h3 className="text-xs font-bold uppercase tracking-widest mb-4">Applied Changes</h3>
          <div className="space-y-4">
            {result.changes.map((c, i) => (
              <div key={i} className="space-y-1">
                <div className={`text-sm font-medium ${c.highlight ? "text-primary" : ""}`}>{c.title}</div>
                <div className="text-xs text-muted-foreground">{c.detail}</div>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={handleShare}
          className="w-full py-3 bg-secondary rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors"
        >
          {shared ? "Link Copied" : "Share Analysis"}
        </button>
      </div>
    </div>
  );
}
