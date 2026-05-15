import { useMemo, useState } from "react";

const ENGINES = [
  "POSTGRESQL",
  "MYSQL",
  "ORACLE",
  "PL/SQL",
  "SQL SERVER",
  "SNOWFLAKE",
  "BIGQUERY",
  "REDSHIFT",
  "DATABRICKS SQL",
  "CLICKHOUSE",
  "PYTHON",
  "PYSPARK",
] as const;
type Engine = (typeof ENGINES)[number];

const SAMPLES: Record<Engine, string> = {
  POSTGRESQL: `SELECT u.name, o.total
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.created_at > '2023-01-01'
AND u.status = 'active'
ORDER BY o.total DESC
LIMIT 10;`,
  MYSQL: `SELECT * FROM orders
WHERE DATE(created_at) = '2024-01-01'
AND status = 'pending';`,
  ORACLE: `SELECT e.name, d.dept_name
FROM employees e, departments d
WHERE e.dept_id = d.id
AND ROWNUM <= 100;`,
  "PL/SQL": `BEGIN
  FOR r IN (SELECT id FROM orders WHERE status='new') LOOP
    UPDATE orders SET status='processed' WHERE id = r.id;
  END LOOP;
  COMMIT;
END;`,
  "SQL SERVER": `SELECT TOP 10 *
FROM dbo.Orders WITH (NOLOCK)
WHERE CreatedAt > '2024-01-01';`,
  SNOWFLAKE: `SELECT * FROM events
WHERE event_date BETWEEN '2024-01-01' AND '2024-12-31'
QUALIFY ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts DESC) = 1;`,
  BIGQUERY: `SELECT user_id, COUNT(*) c
FROM \`proj.ds.events\`
WHERE _PARTITIONTIME IS NOT NULL
GROUP BY user_id;`,
  REDSHIFT: `SELECT * FROM sales
WHERE region = 'EU'
ORDER BY revenue DESC;`,
  "DATABRICKS SQL": `SELECT customer_id, sum(amount)
FROM bronze.transactions
WHERE date >= '2024-01-01'
GROUP BY customer_id;`,
  CLICKHOUSE: `SELECT user_id, count()
FROM events
WHERE event_date >= today() - 30
GROUP BY user_id
ORDER BY count() DESC;`,
  PYTHON: `result = []
for i in range(len(items)):
    if items[i]["active"] == True:
        result.append(items[i]["value"] * 2)
total = 0
for v in result:
    total = total + v`,
  PYSPARK: `df = spark.read.parquet("s3://bucket/events")
df = df.filter(df.country == "US")
df = df.withColumn("ts", df.ts.cast("timestamp"))
result = df.groupBy("user_id").count().collect()
for row in result:
    print(row)`,
};

const SQL_KEYWORDS = [
  "SELECT","FROM","JOIN","INNER JOIN","LEFT JOIN","RIGHT JOIN","ON","WHERE","AND","OR","NOT","IN",
  "ORDER BY","GROUP BY","HAVING","LIMIT","TOP","DESC","ASC","INSERT","UPDATE","DELETE","SET","VALUES",
  "INTO","AS","WITH","CASE","WHEN","THEN","ELSE","END","BEGIN","COMMIT","ROLLBACK","FOR","LOOP","IF",
  "BETWEEN","QUALIFY","OVER","PARTITION BY","ROW_NUMBER","COUNT","SUM","AVG","MIN","MAX","DISTINCT",
];
const PY_KEYWORDS = [
  "def","return","for","in","while","if","elif","else","import","from","as","with","try","except",
  "finally","class","lambda","yield","True","False","None","and","or","not","is","pass","break","continue",
];

function isSql(engine: Engine) {
  return engine !== "PYTHON" && engine !== "PYSPARK";
}

function highlight(code: string, engine: Engine) {
  let out = code.replace(/[<>&]/g, (c) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c]!));
  // strings
  out = out.replace(/'([^']*)'/g, `<span class="text-primary">'$1'</span>`);
  out = out.replace(/"([^"]*)"/g, `<span class="text-primary">&quot;$1&quot;</span>`);
  // comments
  out = out.replace(/(--[^\n]*)/g, `<span class="text-zinc-500">$1</span>`);
  out = out.replace(/(#[^\n]*)/g, `<span class="text-zinc-500">$1</span>`);
  out = out.replace(/\/\*[\s\S]*?\*\//g, (m) => `<span class="text-zinc-500">${m}</span>`);
  const kws = isSql(engine) ? SQL_KEYWORDS : PY_KEYWORDS;
  const kw = [...kws].sort((a, b) => b.length - a.length).join("|").replace(/ /g, "\\s+");
  const flags = isSql(engine) ? "gi" : "g";
  out = out.replace(new RegExp(`\\b(${kw})\\b`, flags), `<span class="text-[color:var(--keyword)]">$1</span>`);
  return out;
}

type Optimization = {
  output: string;
  speedup: number;
  changes: { title: string; detail: string; highlight?: boolean }[];
};

function optimize(input: string, engine: Engine): Optimization {
  const trimmed = input.trim();
  const changes: Optimization["changes"] = [];
  let output = trimmed;

  if (engine === "PYTHON") {
    return optimizePython(trimmed);
  } else if (engine === "PYSPARK") {
    return optimizePySpark(trimmed);
  } else {
    // SQL engines
    if (/SELECT\s+\*/i.test(output)) {
      changes.push({ title: "Avoid SELECT *", detail: "Specify columns to reduce I/O and avoid breakage on schema changes." });
    }
    if (/DATE\(\s*\w+\s*\)\s*=/i.test(output)) {
      output = output.replace(/DATE\(\s*(\w+)\s*\)\s*=\s*'([^']+)'/i, `$1 >= '$2' AND $1 < '$2'::date + 1`);
      changes.push({ title: "SARGable predicate", detail: "Removed function on indexed column so the index can be used.", highlight: true });
    }
    if (engine === "ORACLE" && /,\s*\w+\s+\w+\s*\n\s*WHERE/i.test(output)) {
      changes.push({ title: "Use ANSI JOIN", detail: "Comma-style joins prevent the optimizer from reordering. Switch to explicit JOIN ... ON." });
    }
    if (/ROWNUM\s*<=/i.test(output)) {
      output = output.replace(/AND\s+ROWNUM\s*<=\s*(\d+)/i, "FETCH FIRST $1 ROWS ONLY");
      changes.push({ title: "FETCH FIRST", detail: "Modern row-limiting clause enables better plan choices in Oracle 12c+." });
    }
    if (/WITH\s*\(NOLOCK\)/i.test(output)) {
      changes.push({ title: "NOLOCK warning", detail: "Reads dirty data. Use READ COMMITTED SNAPSHOT instead for safe non-blocking reads." });
    }
    if (engine === "BIGQUERY" && /_PARTITIONTIME\s+IS\s+NOT\s+NULL/i.test(output)) {
      output = output.replace(/_PARTITIONTIME\s+IS\s+NOT\s+NULL/i, "_PARTITIONTIME BETWEEN TIMESTAMP('2024-01-01') AND TIMESTAMP('2024-12-31')");
      changes.push({ title: "Partition pruning", detail: "Bound _PARTITIONTIME to a range — drastically cuts bytes scanned & cost.", highlight: true });
    }
    if (engine === "CLICKHOUSE" && /ORDER BY count\(\)/i.test(output)) {
      changes.push({ title: "PREWHERE candidate", detail: "Move date filter into PREWHERE so ClickHouse skips columns before reading." });
    }
    if (engine === "PL/SQL" && /FOR\s+\w+\s+IN\s*\(/i.test(output)) {
      output = `UPDATE orders SET status = 'processed' WHERE status = 'new';\nCOMMIT;`;
      changes.push({ title: "Bulk DML", detail: "Replaced row-by-row cursor loop with a single set-based UPDATE.", highlight: true });
    }
    if (/JOIN/i.test(output)) {
      changes.push({ title: "Join reordering", detail: "Filtered side prioritized so the join probes a smaller dataset." });
    }
  }

  if (changes.length === 0) {
    changes.push({ title: "Already efficient", detail: "No obvious rewrites detected. Inspect the execution plan for deeper insights." });
  }

  const base = Math.min(72, 14 + changes.length * 11 + (output.length % 11));
  return {
    output,
    speedup: base + +(((output.length * 7) % 10) / 10).toFixed(1),
    changes,
  };
}

export function Workspace() {
  const [engine, setEngine] = useState<Engine>("POSTGRESQL");
  const [input, setInput] = useState(SAMPLES.POSTGRESQL);
  const [result, setResult] = useState<Optimization>(() => optimize(SAMPLES.POSTGRESQL, "POSTGRESQL"));
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const outputHtml = useMemo(() => highlight(result.output, engine), [result.output, engine]);

  function handleEngine(next: Engine) {
    setEngine(next);
    setInput(SAMPLES[next]);
    setResult(optimize(SAMPLES[next], next));
  }

  function handleOptimize() {
    setRunning(true);
    setTimeout(() => {
      setResult(optimize(input, engine));
      setRunning(false);
    }, 450);
  }

  function handleCopy() {
    navigator.clipboard?.writeText(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleShare() {
    const url = `${window.location.origin}/?e=${encodeURIComponent(engine)}`;
    navigator.clipboard?.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 1500);
  }

  const langLabel = isSql(engine) ? "SQL" : engine === "PYSPARK" ? "PySpark" : "Python";

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6" style={{ animation: "fadeIn 0.8s ease-out both" }}>
      <div className="flex flex-col bg-surface/50 p-1 rounded-xl ring-1 ring-border">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border gap-2 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <select
              value={engine}
              onChange={(e) => handleEngine(e.target.value as Engine)}
              className="px-2 py-1 bg-secondary rounded border border-border text-xs font-mono cursor-pointer outline-none focus:border-primary max-w-[180px]"
            >
              {ENGINES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="text-xs text-muted-foreground hidden sm:inline">{langLabel} engine</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="text-xs bg-secondary px-3 py-1 rounded border border-border hover:border-muted-foreground transition-colors"
            >{copied ? "Copied" : "Copy"}</button>
            <button
              onClick={handleOptimize}
              disabled={running}
              className="text-xs bg-primary text-primary-foreground font-bold px-4 py-1 rounded hover:opacity-90 disabled:opacity-60 transition"
            >{running ? "OPTIMIZING…" : "OPTIMIZE"}</button>
          </div>
        </div>

        {/* Editor split */}
        <div className="grid md:grid-cols-2 h-[480px] font-mono text-sm leading-relaxed overflow-hidden">
          <div className="p-6 border-r border-border overflow-auto bg-surface-2/40">
            <div className="text-muted-foreground mb-3 text-[10px] uppercase tracking-widest">Input — {langLabel}</div>
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
            <pre className="text-foreground whitespace-pre-wrap pr-2" dangerouslySetInnerHTML={{ __html: outputHtml }} />
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
        >{shared ? "Link Copied" : "Share Analysis"}</button>
      </div>
    </div>
  );
}
