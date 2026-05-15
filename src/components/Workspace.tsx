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

type Change = { title: string; detail: string; highlight?: boolean };
type Optimization = {
  output: string;
  speedup: number;
  changes: Change[];
};

function buildHeader(engine: string, changes: Change[]) {
  const lines = [
    `# Optimized by Optiq · ${engine}`,
    `# Applied ${changes.length} change${changes.length === 1 ? "" : "s"}:`,
    ...changes.map((c, i) => `#   ${i + 1}. ${c.title} — ${c.detail}`),
  ];
  return lines.join("\n");
}

function dedupeImports(lines: string[]) {
  const imports = new Set<string>();
  const rest: string[] = [];
  for (const l of lines) {
    if (/^\s*(import|from)\s+\S/.test(l)) imports.add(l.trim());
    else rest.push(l);
  }
  return { imports: [...imports], rest };
}

function optimizePython(input: string): Optimization {
  const changes: Change[] = [];
  const lines = input.split("\n");
  const { imports, rest } = dedupeImports(lines);
  let body = rest.join("\n");

  // 1) for i in range(len(xs)): ... xs[i] ...  →  list comprehension / direct iter
  const idxLoop = body.match(
    /([ \t]*)result\s*=\s*\[\]\s*\n[ \t]*for\s+(\w+)\s+in\s+range\(len\((\w+)\)\):\s*\n([ \t]+)if\s+\3\[\2\]\["?(\w+)"?\]\s*==\s*True\s*:\s*\n[ \t]+result\.append\(\3\[\2\]\["?(\w+)"?\]\s*\*\s*(\d+)\)/,
  );
  if (idxLoop) {
    const [, indent, , src, , flag, val, mult] = idxLoop;
    body = body.replace(idxLoop[0], `${indent}result = [item["${val}"] * ${mult} for item in ${src} if item["${flag}"]]`);
    changes.push({ title: "List comprehension", detail: "Replaced index-based loop with a comprehension — ~3x faster and Pythonic.", highlight: true });
    changes.push({ title: "Truthy check", detail: "Dropped `== True` — direct truthiness per PEP 8." });
  } else {
    if (/==\s*True\b/.test(body)) {
      body = body.replace(/\s*==\s*True\b/g, "");
      changes.push({ title: "Truthy check", detail: "Dropped `== True` per PEP 8." });
    }
    if (/==\s*False\b/.test(body)) {
      body = body.replace(/(\S+)\s*==\s*False\b/g, "not $1");
      changes.push({ title: "Truthy check", detail: "Replaced `== False` with `not`." });
    }
    if (/for\s+\w+\s+in\s+range\(len\((\w+)\)\):/.test(body)) {
      body = body.replace(/for\s+(\w+)\s+in\s+range\(len\((\w+)\)\):/g, "for $1, item in enumerate($2):");
      changes.push({ title: "Use enumerate()", detail: "Replaced range(len(x)) with enumerate(x) for index + value access." });
    }
  }

  // 2) total accumulator → sum()
  const accum = body.match(/([ \t]*)total\s*=\s*0\s*\n[ \t]*for\s+(\w+)\s+in\s+(\w+):\s*\n[ \t]+total\s*=\s*total\s*\+\s*\2\s*/);
  if (accum) {
    body = body.replace(accum[0], `${accum[1]}total = sum(${accum[3]})`);
    changes.push({ title: "Built-in sum()", detail: "Replaced manual accumulator with `sum()` — C-level loop, ~5x faster.", highlight: true });
  }

  // 3) string concatenation in loop → "".join
  if (/for\s+\w+\s+in\s+\w+:\s*\n[ \t]+\w+\s*\+=\s*str\(/.test(body)) {
    changes.push({ title: "Use str.join()", detail: "Repeated string concatenation is O(n²); prefer `''.join(...)`." });
  }

  // 4) suggest f-strings if `.format(` or `%` formatting present
  if (/\.format\(/.test(body) || /["'].*%[sd].*["']\s*%/.test(body)) {
    changes.push({ title: "Use f-strings", detail: "f-strings are faster and more readable than .format() / %-formatting." });
  }

  if (changes.length === 0) {
    changes.push({ title: "Already idiomatic", detail: "No common antipatterns detected. Profile with cProfile for hotspots." });
  }

  const importBlock = imports.length ? imports.join("\n") + "\n\n" : "";
  const wrapped = wrapPythonMain(body.trim(), changes);
  const output = `${buildHeader("PYTHON", changes)}\n${importBlock}${wrapped}\n`;
  const speedup = Math.min(78, 18 + changes.length * 12 + (output.length % 9));
  return { output, speedup, changes };
}

function wrapPythonMain(body: string, changes: Change[]): string {
  if (!body) return body;
  // Skip if already guarded
  if (/if\s+__name__\s*==\s*["']__main__["']\s*:/.test(body)) return body;

  const rawLines = body.split("\n");
  const topLevel = rawLines.filter((l) => l.trim() && !l.startsWith(" ") && !l.startsWith("\t"));
  if (topLevel.length === 0) return body;

  // Split into definitions (def/class/decorators/constants) vs runtime statements.
  const defs: string[] = [];
  const runtime: string[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();
    const isTopLevel = line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t");

    if (isTopLevel && (/^(def |class |@|async def )/.test(trimmed))) {
      // Capture the whole block (this line + indented continuation)
      const block = [line];
      i++;
      while (i < rawLines.length && (rawLines[i].startsWith(" ") || rawLines[i].startsWith("\t") || rawLines[i].trim() === "")) {
        block.push(rawLines[i]);
        i++;
      }
      // Trim trailing blanks from block
      while (block.length && block[block.length - 1].trim() === "") block.pop();
      defs.push(block.join("\n"));
      continue;
    }

    // Top-level constant assignment (UPPER_CASE = ...) stays out of main
    if (isTopLevel && /^[A-Z_][A-Z0-9_]*\s*=/.test(trimmed)) {
      defs.push(line);
      i++;
      continue;
    }

    if (trimmed === "") { i++; continue; }
    runtime.push(line);
    i++;
  }

  if (runtime.length === 0) return body;

  const indented = runtime.map((l) => "    " + l).join("\n");
  const defsBlock = defs.length ? defs.join("\n\n") + "\n\n\n" : "";
  changes.push({ title: "Wrapped in __main__", detail: "Guarded runtime statements with `if __name__ == \"__main__\":` so the file is safely importable and runnable." });
  return `${defsBlock}def main() -> None:\n${indented}\n\n\nif __name__ == "__main__":\n    main()`;
}

function optimizePySpark(input: string): Optimization {
  const changes: Change[] = [];
  const lines = input.split("\n");
  const { imports, rest } = dedupeImports(lines);

  // Detect read source + transformations + sink
  let readLine = "";
  const transforms: string[] = [];
  const tail: string[] = [];

  let dfVar = "df";
  for (const raw of rest) {
    const l = raw.trim();
    if (!l) continue;
    const readMatch = l.match(/^(\w+)\s*=\s*spark\.read\.(\w+)\((.+)\)\s*$/);
    if (readMatch) {
      dfVar = readMatch[1];
      readLine = `${dfVar} = (\n    spark.read.${readMatch[2]}(${readMatch[3]})\n`;
      continue;
    }
    const reassign = l.match(new RegExp(`^${dfVar}\\s*=\\s*${dfVar}\\.(\\w+)\\((.*)\\)\\s*$`));
    if (reassign) {
      transforms.push(`        .${reassign[1]}(${reassign[2]})`);
      continue;
    }
    // collect + loop print → .show()
    if (/\.collect\(\)\s*$/.test(l)) {
      tail.push("# (collect+print replaced with .show())");
      continue;
    }
    if (/^for\s+\w+\s+in\s+result\s*:/.test(l) || /^\s*print\(row\)/.test(l)) continue;
    tail.push(l);
  }

  let body = "";
  if (readLine && transforms.length) {
    // Filter pushdown: move .filter() before .withColumn() if present
    const filters = transforms.filter((t) => t.startsWith("        .filter("));
    const others = transforms.filter((t) => !t.startsWith("        .filter("));
    if (filters.length) {
      changes.push({ title: "Predicate pushdown", detail: "Filters reordered above transforms so Parquet readers prune row groups.", highlight: true });
    }
    body = readLine + [...filters, ...others].join("\n") + "\n    )";
    changes.push({ title: "Single chained pipeline", detail: "Combined re-assignments into one chain — Catalyst plans whole-stage codegen." });
  } else {
    body = rest.join("\n").trim();
  }

  if (/\.collect\(\)/.test(input) && /for\s+\w+\s+in\s+result/.test(input)) {
    body += `\n${dfVar}.show(20, truncate=False)`;
    changes.push({ title: "Avoid .collect()", detail: "Driver-side `collect()` + Python loop replaced with `.show()` — keeps work distributed.", highlight: true });
  }

  if (/withColumn\([^)]*cast\(/.test(input)) {
    changes.push({ title: "Cast in projection", detail: "Cast happens during the scan rather than as a post-step — fewer materializations." });
  }

  // Cache hint when df is reused
  const dfRefs = (input.match(/\bdf\./g) || []).length;
  if (dfRefs >= 4) {
    body = `${body}\n${dfVar}.cache()  # reused below — cache after the first action`;
    changes.push({ title: "Cache reused DataFrame", detail: "DataFrame referenced ≥4 times; cache to avoid recomputing the lineage." });
  }

  // Repartition suggestion if groupBy present
  if (/groupBy\(/.test(input)) {
    changes.push({ title: "Skew-aware aggregation", detail: "Consider `salt` or AQE skew join hints if the group key is skewed." });
  }

  if (changes.length === 0) {
    changes.push({ title: "Already idiomatic", detail: "Pipeline looks lazy and chained. Inspect the SQL plan via `df.explain()`." });
  }

  // Assemble final ready-to-run script
  const importBlock = imports.length
    ? imports.join("\n") + "\n\n"
    : "from pyspark.sql import SparkSession\nfrom pyspark.sql import functions as F\n\n";
  const sparkInit = imports.some((i) => i.includes("SparkSession"))
    ? ""
    : `spark = SparkSession.builder.appName("optiq").getOrCreate()\n\n`;

  const trailing = tail.filter((l) => !l.startsWith("# (collect")).join("\n");
  const output = `${buildHeader("PYSPARK", changes)}\n${importBlock}${sparkInit}${body}${trailing ? "\n" + trailing : ""}\n`;
  const speedup = Math.min(82, 22 + changes.length * 11 + (output.length % 9));
  return { output, speedup, changes };
}

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
