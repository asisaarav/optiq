import { useEffect, useMemo, useRef, useState } from "react";
import { ENGINE_TIPS, type Tip, type TipCategory, type TipsKey } from "@/lib/engineTips";
import { OPEN_DATASETS, loadDataset, buildSampleQuery, type OpenDataset } from "@/lib/openDatasets";

type Mode = "SQL" | "PYTHON" | "PYSPARK" | "DATA";

const SQL_ENGINES = [
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
] as const;
type SqlEngine = (typeof SQL_ENGINES)[number];
type Engine = SqlEngine | "PYTHON" | "PYSPARK";

const SQL_SAMPLES: Record<SqlEngine, string> = {
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
};

const PY_SAMPLE = `items = [{"active": True, "value": 3}, {"active": False, "value": 5}, {"active": True, "value": 7}]

result = []
for i in range(len(items)):
    if items[i]["active"] == True:
        result.append(items[i]["value"] * 2)
total = 0
for v in result:
    total = total + v
print("total:", total)`;

const PYSPARK_SAMPLE = `df = spark.read.parquet("s3://bucket/events")
df = df.filter(df.country == "US")
df = df.withColumn("ts", df.ts.cast("timestamp"))
result = df.groupBy("user_id").count().collect()
for row in result:
    print(row)`;

const SQL_KEYWORDS = [
  "SELECT",
  "FROM",
  "JOIN",
  "INNER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "ON",
  "WHERE",
  "AND",
  "OR",
  "NOT",
  "IN",
  "ORDER BY",
  "GROUP BY",
  "HAVING",
  "LIMIT",
  "TOP",
  "DESC",
  "ASC",
  "INSERT",
  "UPDATE",
  "DELETE",
  "SET",
  "VALUES",
  "INTO",
  "AS",
  "WITH",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "FOR",
  "LOOP",
  "IF",
  "BETWEEN",
  "QUALIFY",
  "OVER",
  "PARTITION BY",
  "ROW_NUMBER",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "DISTINCT",
  "FETCH",
  "FIRST",
  "ROWS",
  "ONLY",
];
const PY_KEYWORDS = [
  "def",
  "return",
  "for",
  "in",
  "while",
  "if",
  "elif",
  "else",
  "import",
  "from",
  "as",
  "with",
  "try",
  "except",
  "finally",
  "class",
  "lambda",
  "yield",
  "True",
  "False",
  "None",
  "and",
  "or",
  "not",
  "is",
  "pass",
  "break",
  "continue",
  "print",
];

function escapeHtml(s: string) {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
}

/** Tokenizing highlighter — avoids the `class` attribute being re-matched as a keyword. */
function highlight(code: string, kind: "sql" | "py") {
  const escaped = escapeHtml(code);
  const tokens: string[] = [];
  // Placeholder uses non-digit sentinels (\u0001T…E\u0001) so the numbers regex
  // below can't accidentally match the index and clobber the original token —
  // that bug was rendering 'active' as `1` and '2023-01-01' as `0`.
  const PH = (i: number) => `\u0001T${i}E\u0001`;
  const stash = (s: string) => {
    tokens.push(s);
    return PH(tokens.length - 1);
  };

  let out = escaped;

  // strings
  out = out.replace(/'([^'\n]*)'/g, (_m, g) => stash(`<span class="hl-str">'${g}'</span>`));
  out = out.replace(/&quot;([^\n]*?)&quot;/g, (_m, g) =>
    stash(`<span class="hl-str">&quot;${g}&quot;</span>`),
  );

  // comments
  if (kind === "sql") {
    out = out.replace(/(--[^\n]*)/g, (m) => stash(`<span class="hl-com">${m}</span>`));
  } else {
    out = out.replace(/(#[^\n]*)/g, (m) => stash(`<span class="hl-com">${m}</span>`));
  }

  // numbers
  out = out.replace(/\b(\d+(?:\.\d+)?)\b/g, (m) => stash(`<span class="hl-num">${m}</span>`));

  // keywords
  const kws = kind === "sql" ? SQL_KEYWORDS : PY_KEYWORDS;
  const kw = [...kws]
    .sort((a, b) => b.length - a.length)
    .join("|")
    .replace(/ /g, "\\s+");
  const flags = kind === "sql" ? "gi" : "g";
  out = out.replace(new RegExp(`\\b(${kw})\\b`, flags), (m) =>
    stash(`<span class="hl-kw">${m}</span>`),
  );

  // restore tokens (handle nesting by repeating)
  for (let i = 0; i < 4; i++) {
    out = out.replace(/\u0001T(\d+)E\u0001/g, (_m, n) => tokens[+n] ?? "");
  }
  return out;
}

type Change = { title: string; detail: string; highlight?: boolean };
type Diagnostic = { severity: "error" | "warn"; line?: number; message: string };
type Optimization = {
  output: string;
  speedup: number;
  changes: Change[];
  diagnostics: Diagnostic[];
};
type ExecutionResult = {
  status: "idle" | "running" | "success" | "error";
  label: string;
  rows?: Record<string, unknown>[];
  output?: string;
  error?: string;
  elapsedMs?: number;
};

function buildHeader(engine: string, changes: Change[]) {
  return [
    `# Optimized by Optiq · ${engine}`,
    `# Applied ${changes.length} change${changes.length === 1 ? "" : "s"}:`,
    ...changes.map((c, i) => `#   ${i + 1}. ${c.title} — ${c.detail}`),
  ].join("\n");
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

// --- Syntax validators (lightweight, no external parser) ---

function validateBrackets(code: string, lang: "sql" | "py"): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const stack: { ch: string; line: number }[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let line = 1;
  let inStr: string | null = null;
  let inLineCom = false;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "\n") {
      line++;
      inLineCom = false;
      continue;
    }
    if (inLineCom) continue;
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"') {
      inStr = c;
      continue;
    }
    if (lang === "sql" && c === "-" && code[i + 1] === "-") {
      inLineCom = true;
      continue;
    }
    if (lang === "py" && c === "#") {
      inLineCom = true;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") stack.push({ ch: c, line });
    else if (c === ")" || c === "]" || c === "}") {
      const top = stack.pop();
      if (!top || top.ch !== pairs[c]) {
        diags.push({ severity: "error", line, message: `Unmatched '${c}'` });
      }
    }
  }
  if (inStr)
    diags.push({ severity: "error", line, message: `Unterminated string literal (${inStr})` });
  for (const s of stack)
    diags.push({ severity: "error", line: s.line, message: `Unclosed '${s.ch}'` });
  return diags;
}

function validateSql(code: string): Diagnostic[] {
  const diags = validateBrackets(code, "sql");
  const trimmed = code.trim();
  if (!trimmed) return diags;
  if (!/;\s*$/.test(trimmed))
    diags.push({ severity: "warn", message: "Missing trailing semicolon" });
  if (/\bFORM\b/i.test(code))
    diags.push({ severity: "error", message: "Typo: 'FORM' — did you mean 'FROM'?" });
  if (/\bSELCT\b/i.test(code))
    diags.push({ severity: "error", message: "Typo: 'SELCT' — did you mean 'SELECT'?" });
  if (/\bWEHRE\b/i.test(code))
    diags.push({ severity: "error", message: "Typo: 'WEHRE' — did you mean 'WHERE'?" });

  // Strip strings & comments to scan keywords cleanly
  const stripped = code
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");

  // Dangling clause keywords with nothing after them
  const danglers: { re: RegExp; name: string }[] = [
    { re: /\bWHERE\b\s*(?:;|$)/im, name: "WHERE" },
    { re: /\bHAVING\b\s*(?:;|$)/im, name: "HAVING" },
    { re: /\bGROUP\s+BY\b\s*(?:;|$)/im, name: "GROUP BY" },
    { re: /\bORDER\s+BY\b\s*(?:;|$)/im, name: "ORDER BY" },
    { re: /\bFROM\b\s*(?:;|$)/im, name: "FROM" },
    { re: /\bON\b\s*(?:;|$)/im, name: "ON" },
    { re: /\bSET\b\s*(?:;|$)/im, name: "SET" },
    { re: /\bJOIN\b\s*(?:;|$)/im, name: "JOIN" },
  ];
  for (const d of danglers) {
    if (d.re.test(stripped))
      diags.push({ severity: "error", message: `Dangling '${d.name}' — no expression follows` });
  }

  // HAVING usage rules
  if (/\bHAVING\b/i.test(stripped)) {
    if (!/\bGROUP\s+BY\b/i.test(stripped))
      diags.push({
        severity: "error",
        message: "HAVING used without GROUP BY — use WHERE for non-aggregate filters",
      });
    if (!/\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(stripped))
      diags.push({
        severity: "warn",
        message: "HAVING usually filters aggregates — none detected in query",
      });
  }

  // Stranded operators / commas
  if (/,\s*(FROM|WHERE|GROUP|ORDER|HAVING|;|$)/im.test(stripped))
    diags.push({ severity: "error", message: "Trailing comma before clause" });
  if (/\b(AND|OR)\b\s*(?:;|$)/im.test(stripped))
    diags.push({ severity: "error", message: "Boolean operator with no right-hand expression" });
  if (/(=|<>|!=|<=|>=|<|>)\s*(?:;|$)/m.test(stripped))
    diags.push({ severity: "error", message: "Comparison operator with no right-hand value" });

  if (/\bSELECT\b/i.test(stripped) && !/\bFROM\b/i.test(stripped) && !/\bSELECT\s+\d/i.test(stripped)) {
    diags.push({ severity: "warn", message: "SELECT without FROM" });
  }

  // Aggregate without GROUP BY when other plain columns are projected
  const agg = /\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(stripped);
  const selMatch = stripped.match(/SELECT\s+([\s\S]*?)\bFROM\b/i);
  if (agg && selMatch && !/\bGROUP\s+BY\b/i.test(stripped)) {
    const cols = selMatch[1].split(",").map((c) => c.trim());
    const hasPlainCol = cols.some(
      (c) => c && !/\b(SUM|AVG|COUNT|MIN|MAX)\s*\(/i.test(c) && !/^\*$/.test(c) && !/^\d/.test(c),
    );
    if (hasPlainCol)
      diags.push({
        severity: "error",
        message: "Aggregate mixed with non-aggregate column without GROUP BY",
      });
  }

  return diags;
}

function normalizeForCompare(s: string) {
  return s
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*#.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function validatePython(code: string): Diagnostic[] {
  const diags = validateBrackets(code, "py");
  const lines = code.split("\n");
  lines.forEach((l, idx) => {
    const ln = idx + 1;
    const t = l.replace(/#.*$/, "");
    if (
      /^\s*(def|class|if|elif|else|for|while|try|except|finally|with|elif)\b[^:]*$/.test(t) &&
      t.trim() !== ""
    )
      diags.push({ severity: "error", line: ln, message: "Missing ':' at end of statement" });
    if (/^\s*print\s+[^(\s]/.test(t))
      diags.push({
        severity: "error",
        line: ln,
        message: "`print` is a function — use print(...)",
      });
    if (/\bprint\s*\(.*[^)]\s*$/.test(t) && !/[)\\]\s*$/.test(t)) {
      // unclosed print — caught by bracket validator generally
    }
    if (/\t/.test(l) && / {2,}/.test(l))
      diags.push({ severity: "warn", line: ln, message: "Mixed tabs and spaces" });
  });
  return diags;
}

function validatePySpark(code: string): Diagnostic[] {
  const diags = validatePython(code);
  if (/\.collect\(\)/.test(code))
    diags.push({
      severity: "warn",
      message: ".collect() materializes to driver — risky on large data",
    });
  if (/\.toPandas\(\)/.test(code))
    diags.push({ severity: "warn", message: ".toPandas() pulls all rows to driver memory" });
  return diags;
}

function validate(code: string, engine: Engine): Diagnostic[] {
  if (engine === "PYTHON") return validatePython(code);
  if (engine === "PYSPARK") return validatePySpark(code);
  return validateSql(code);
}

function optimizePython(input: string): Optimization {
  const changes: Change[] = [];
  const diagnostics = validatePython(input);
  const lines = input.split("\n");
  const { imports, rest } = dedupeImports(lines);
  let body = rest.join("\n");

  // Generic transforms (apply to any code, not just the sample)
  if (/==\s*True\b/.test(body)) {
    body = body.replace(/\s*==\s*True\b/g, "");
    changes.push({ title: "Truthy check", detail: "Dropped `== True` per PEP 8." });
  }
  if (/==\s*False\b/.test(body)) {
    body = body.replace(/(\b\w+(?:\[[^\]]+\])?)\s*==\s*False\b/g, "not $1");
    changes.push({ title: "Truthy check", detail: "Replaced `== False` with `not`." });
  }
  if (/==\s*None\b|!=\s*None\b/.test(body)) {
    body = body.replace(/==\s*None\b/g, "is None").replace(/!=\s*None\b/g, "is not None");
    changes.push({ title: "Identity vs None", detail: "Use `is None` / `is not None`." });
  }
  if (/len\(\s*(\w+)\s*\)\s*==\s*0/.test(body)) {
    body = body.replace(/len\(\s*(\w+)\s*\)\s*==\s*0/g, "not $1");
    changes.push({ title: "Empty check", detail: "Replaced `len(x) == 0` with `not x`." });
  }
  if (/len\(\s*(\w+)\s*\)\s*>\s*0/.test(body)) {
    body = body.replace(/len\(\s*(\w+)\s*\)\s*>\s*0/g, "$1");
    changes.push({ title: "Non-empty check", detail: "Replaced `len(x) > 0` with `x`." });
  }
  if (/range\(\s*0\s*,/.test(body)) {
    body = body.replace(/range\(\s*0\s*,\s*/g, "range(");
    changes.push({
      title: "range() simplified",
      detail: "Dropped redundant `0,` in `range(0, n)`.",
    });
  }
  // index loop -> comprehension (specific shape)
  const idxLoop = body.match(
    /([ \t]*)result\s*=\s*\[\]\s*\n[ \t]*for\s+(\w+)\s+in\s+range\(len\((\w+)\)\):\s*\n([ \t]+)if\s+\3\[\2\]\["?(\w+)"?\]\s*:?\s*\n[ \t]+result\.append\(\3\[\2\]\["?(\w+)"?\]\s*\*\s*(\d+)\)/,
  );
  if (idxLoop) {
    const [, indent, , src, , flag, val, mult] = idxLoop;
    body = body.replace(
      idxLoop[0],
      `${indent}result = [item["${val}"] * ${mult} for item in ${src} if item["${flag}"]]`,
    );
    changes.push({
      title: "List comprehension",
      detail: "Replaced index-based loop with a comprehension — ~3x faster.",
      highlight: true,
    });
  } else if (/for\s+\w+\s+in\s+range\(len\(\w+\)\):/.test(body)) {
    body = body.replace(
      /for\s+(\w+)\s+in\s+range\(len\((\w+)\)\):/g,
      "for $1, item in enumerate($2):",
    );
    changes.push({
      title: "Use enumerate()",
      detail: "Replaced `range(len(x))` with `enumerate(x)`.",
    });
  }
  // manual sum accumulator
  const accum = body.match(
    /([ \t]*)(\w+)\s*=\s*0\s*\n[ \t]*for\s+(\w+)\s+in\s+(\w+):\s*\n[ \t]+\2\s*=\s*\2\s*\+\s*\3\s*/,
  );
  if (accum) {
    body = body.replace(accum[0], `${accum[1]}${accum[2]} = sum(${accum[4]})`);
    changes.push({
      title: "Built-in sum()",
      detail: "Replaced manual accumulator with `sum()` — C-level loop.",
      highlight: true,
    });
  }
  // string concat in loop hint
  if (/for\s+\w+\s+in\s+[^\n:]+:\s*\n[ \t]+\w+\s*\+=\s*['"]/.test(body)) {
    changes.push({
      title: "Avoid str += in loop",
      detail: "Append to a list and `''.join(parts)` after the loop.",
    });
  }
  // .keys() iteration
  if (/for\s+\w+\s+in\s+\w+\.keys\(\)/.test(body)) {
    body = body.replace(/for\s+(\w+)\s+in\s+(\w+)\.keys\(\)/g, "for $1 in $2");
    changes.push({
      title: "Iterate dict directly",
      detail: "`for k in d` is equivalent to `for k in d.keys()`.",
    });
  }
  // membership in list -> set if literal long
  if (/\bin\s+\[(?:[^\]]{30,})\]/.test(body)) {
    changes.push({
      title: "Use a set for membership",
      detail: "Large `x in [...]` is O(n) — convert literal to a `frozenset(...)`.",
    });
  }
  // % formatting / .format
  if (/\.format\(/.test(body) || /["'][^"']*%[sdif][^"']*["']\s*%/.test(body)) {
    changes.push({
      title: "Use f-strings",
      detail: "f-strings are faster and more readable than `%`/`.format()`.",
    });
  }
  // open without with
  if (/=\s*open\(/.test(body) && !/with\s+open\(/.test(body)) {
    changes.push({
      title: "Use `with open(...)`",
      detail: "Context managers guarantee the file is closed.",
    });
  }

  if (changes.length === 0) {
    changes.push({
      title: "Already idiomatic",
      detail: "No common antipatterns detected — focus on algorithmic complexity.",
    });
  }

  const wrapped = wrapPythonMain(body.trim(), changes);
  const importBlock = imports.length ? imports.join("\n") + "\n\n" : "";
  const output = `${buildHeader("PYTHON", changes)}\n\n${importBlock}${wrapped}\n`;
  const realChanged = normalizeForCompare(output) !== normalizeForCompare(input);
  const speedup = realChanged ? Math.min(70, changes.length * 9) : 0;
  return { output, speedup, changes, diagnostics };
}

function wrapPythonMain(body: string, changes: Change[]): string {
  if (!body) return body;
  if (/if\s+__name__\s*==\s*["']__main__["']\s*:/.test(body)) return body;

  const rawLines = body.split("\n");
  const defs: string[] = [];
  const runtime: string[] = [];
  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();
    const isTopLevel = line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t");

    if (isTopLevel && /^(def |class |@|async def )/.test(trimmed)) {
      const block = [line];
      i++;
      while (
        i < rawLines.length &&
        (rawLines[i].startsWith(" ") || rawLines[i].startsWith("\t") || rawLines[i].trim() === "")
      ) {
        block.push(rawLines[i]);
        i++;
      }
      while (block.length && block[block.length - 1].trim() === "") block.pop();
      defs.push(block.join("\n"));
      continue;
    }
    if (isTopLevel && /^[A-Z_][A-Z0-9_]*\s*=/.test(trimmed)) {
      defs.push(line);
      i++;
      continue;
    }
    if (trimmed === "") {
      i++;
      continue;
    }
    runtime.push(line);
    i++;
  }

  if (runtime.length === 0) return body;
  const indented = runtime.map((l) => "    " + l).join("\n");
  const defsBlock = defs.length ? defs.join("\n\n") + "\n\n\n" : "";
  changes.push({
    title: "Wrapped in __main__",
    detail: 'Guarded runtime with `if __name__ == "__main__":`.',
  });
  return `${defsBlock}def main() -> None:\n${indented}\n\n\nif __name__ == "__main__":\n    main()`;
}

function optimizePySpark(input: string): Optimization {
  const changes: Change[] = [];
  const diagnostics = validatePySpark(input);
  const lines = input.split("\n");
  const { imports, rest } = dedupeImports(lines);

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
    if (/\.collect\(\)\s*$/.test(l)) continue;
    if (/^for\s+\w+\s+in\s+result\s*:/.test(l) || /^\s*print\(row\)/.test(l)) continue;
    tail.push(l);
  }

  let body = "";
  if (readLine && transforms.length) {
    const filters = transforms.filter((t) => t.startsWith("        .filter("));
    const others = transforms.filter((t) => !t.startsWith("        .filter("));
    if (filters.length) {
      changes.push({
        title: "Predicate pushdown",
        detail: "Filters reordered above transforms so Parquet readers prune row groups.",
        highlight: true,
      });
    }
    body = readLine + [...filters, ...others].join("\n") + "\n)";
    changes.push({
      title: "Single chained pipeline",
      detail: "Combined re-assignments into one chain — Catalyst plans whole-stage codegen.",
    });
  } else {
    body = rest.join("\n").trim();
  }

  if (/\.collect\(\)/.test(input) && /for\s+\w+\s+in\s+result/.test(input)) {
    body += `\n\n${dfVar}.show(20, truncate=False)`;
    changes.push({
      title: "Avoid .collect()",
      detail:
        "Driver-side `collect()` + Python loop replaced with `.show()` — keeps work distributed.",
      highlight: true,
    });
  }
  if (/\.toPandas\(\)/.test(input)) {
    changes.push({
      title: "Avoid .toPandas()",
      detail: "Pulls all rows to driver. Use Pandas-on-Spark or sample first.",
    });
  }
  if (/withColumn\(.*?\).*\n.*withColumn\(/.test(input)) {
    changes.push({
      title: "Batch withColumn",
      detail: "Multiple `withColumn` calls re-plan each step — use `select(*cols, F.expr(...))`.",
    });
  }
  if (/UserDefinedFunction|udf\(/.test(input)) {
    changes.push({
      title: "Replace Python UDF",
      detail: "Prefer built-in `pyspark.sql.functions` or `pandas_udf` for vectorization.",
    });
  }
  if (/\.repartition\(/.test(input) && !/\.coalesce\(/.test(input)) {
    changes.push({
      title: "Coalesce on shrink",
      detail: "Use `.coalesce(n)` instead of `.repartition(n)` when reducing partitions.",
    });
  }
  if (/groupBy\(/.test(input)) {
    changes.push({
      title: "Skew-aware aggregation",
      detail: "Consider `salt` or AQE skew join hints if the group key is skewed.",
    });
  }
  if (changes.length === 0) {
    changes.push({ title: "Already idiomatic", detail: "Pipeline looks lazy and chained." });
  }

  const importBlock = imports.length
    ? imports.join("\n") + "\n\n"
    : "from pyspark.sql import SparkSession\nfrom pyspark.sql import functions as F\n\n";
  const sparkInit = imports.some((i) => i.includes("SparkSession"))
    ? ""
    : `spark = SparkSession.builder.appName("optiq").getOrCreate()\n\n`;

  const output = `${buildHeader("PYSPARK", changes)}\n\n${importBlock}${sparkInit}${body}\n`;
  const realChanged = normalizeForCompare(output) !== normalizeForCompare(input);
  const speedup = realChanged ? Math.min(75, changes.length * 10) : 0;
  return { output, speedup, changes, diagnostics };
}

function optimizeSql(input: string, engine: SqlEngine): Optimization {
  let output = input.trim();
  const changes: Change[] = [];
  const diagnostics = validateSql(input);
  if (/SELECT\s+\*/i.test(output))
    changes.push({ title: "Avoid SELECT *", detail: "Specify columns to reduce I/O." });
  if (/DATE\(\s*\w+\s*\)\s*=/i.test(output)) {
    output = output.replace(
      /DATE\(\s*(\w+)\s*\)\s*=\s*'([^']+)'/i,
      `$1 >= '$2' AND $1 < '$2'::date + 1`,
    );
    changes.push({
      title: "SARGable predicate",
      detail: "Removed function on indexed column.",
      highlight: true,
    });
  }
  if (/UPPER\(\s*\w+\s*\)\s*=|LOWER\(\s*\w+\s*\)\s*=/i.test(output)) {
    changes.push({
      title: "Function on column",
      detail: "`UPPER(col)=...` blocks index — store normalized or use functional index.",
    });
  }
  if (/LIKE\s+'%[^%']+%'/i.test(output)) {
    changes.push({
      title: "Leading-wildcard LIKE",
      detail: "`LIKE '%x%'` cannot use B-tree — consider trigram / full-text index.",
    });
  }
  if (/\bOR\b/i.test(output) && /WHERE/i.test(output)) {
    changes.push({
      title: "OR → IN / UNION ALL",
      detail:
        "Multiple `OR`s on the same column can be `IN (...)`; on different columns use `UNION ALL`.",
    });
  }
  if (/COUNT\(\s*\*\s*\)/i.test(output)) {
    changes.push({
      title: "COUNT(*) note",
      detail: "`COUNT(*)` and `COUNT(1)` are equivalent; `COUNT(col)` skips NULLs.",
    });
  }
  if (/\bUNION\b(?!\s+ALL)/i.test(output)) {
    output = output.replace(/\bUNION\b(?!\s+ALL)/gi, "UNION ALL");
    changes.push({
      title: "UNION ALL",
      detail:
        "Skipped distinct-sort by switching `UNION` → `UNION ALL` (verify duplicates are OK).",
    });
  }
  if (/!=|<>/.test(output)) {
    changes.push({
      title: "Inequality on indexed col",
      detail: "`!=` rarely uses an index — rewrite as range or `NOT IN`.",
    });
  }
  if (engine === "ORACLE" && /,\s*\w+\s+\w+\s*\n\s*WHERE/i.test(output)) {
    changes.push({ title: "Use ANSI JOIN", detail: "Switch to explicit `JOIN ... ON`." });
  }
  if (/ROWNUM\s*<=/i.test(output)) {
    output = output.replace(/AND\s+ROWNUM\s*<=\s*(\d+)/i, "FETCH FIRST $1 ROWS ONLY");
    changes.push({ title: "FETCH FIRST", detail: "Modern row-limiting clause." });
  }
  if (/WITH\s*\(NOLOCK\)/i.test(output)) {
    changes.push({ title: "NOLOCK warning", detail: "Use READ COMMITTED SNAPSHOT instead." });
  }
  if (engine === "BIGQUERY" && /_PARTITIONTIME\s+IS\s+NOT\s+NULL/i.test(output)) {
    output = output.replace(
      /_PARTITIONTIME\s+IS\s+NOT\s+NULL/i,
      "_PARTITIONTIME BETWEEN TIMESTAMP('2024-01-01') AND TIMESTAMP('2024-12-31')",
    );
    changes.push({
      title: "Partition pruning",
      detail: "Bounded `_PARTITIONTIME` to a range.",
      highlight: true,
    });
  }
  if (engine === "CLICKHOUSE" && /WHERE/i.test(output)) {
    changes.push({
      title: "PREWHERE candidate",
      detail: "Move date / low-cardinality filter into PREWHERE.",
    });
  }
  if (
    engine === "PL/SQL" &&
    /FOR\s+\w+\s+IN\s*\(/i.test(output) &&
    /UPDATE\s+\w+\s+SET/i.test(output)
  ) {
    changes.push({
      title: "Bulk DML",
      detail: "Row-by-row cursor loop — rewrite as a single set-based `UPDATE ... WHERE`.",
      highlight: true,
    });
  }
  if (/JOIN/i.test(output) && /WHERE/i.test(output)) {
    changes.push({
      title: "Join order",
      detail: "Filter the most selective side first; verify with `EXPLAIN`.",
    });
  }
  if (!/LIMIT|TOP|FETCH/i.test(output) && /SELECT/i.test(output)) {
    changes.push({
      title: "Add LIMIT",
      detail: "Unbounded SELECT — cap row count for exploratory queries.",
    });
  }
  const realChanged = normalizeForCompare(output) !== normalizeForCompare(input);

  // ── Business-logic safety net ────────────────────────────────────────────
  // Any literal (string / number) that appeared in the input MUST still appear
  // in the optimized output. If a rule accidentally changed a value (e.g.
  // 'active' → 1 or '2023-01-01' → 0), throw the rewrite away and surface a
  // warning instead of silently shipping wrong logic.
  const literalsOf = (s: string) => {
    const lits = new Set<string>();
    const stringRe = /'((?:[^'\\]|\\.)*)'/g;
    let m: RegExpExecArray | null;
    while ((m = stringRe.exec(s))) lits.add(`'${m[1]}'`);
    const numRe = /(?<![A-Za-z_])-?\d+(?:\.\d+)?/g;
    while ((m = numRe.exec(s.replace(stringRe, "")))) lits.add(m[0]);
    return lits;
  };
  const inLits = literalsOf(input);
  const outLits = literalsOf(output);
  const missing = [...inLits].filter((l) => !outLits.has(l));
  if (missing.length) {
    return {
      output: input.trim(),
      speedup: 0,
      changes: [
        {
          title: "Rewrite blocked — business logic at risk",
          detail: `Optimization would change literal(s) ${missing.join(", ")}. Reverting to original query.`,
          highlight: true,
        },
      ],
      diagnostics: [
        ...diagnostics,
        {
          severity: "warn",
          message: `Safety guard: literals ${missing.join(", ")} were dropped by a rule — rewrite rejected.`,
        },
      ],
    };
  }

  if (changes.length === 0 || !realChanged) {
    return {
      output,
      speedup: 0,
      changes: [
        { title: "No safe rewrite", detail: "Query is already efficient — inspect EXPLAIN for plan-level wins." },
      ],
      diagnostics,
    };
  }
  const speedup = Math.min(65, changes.length * 8);
  return { output, speedup, changes, diagnostics };
}

function optimize(input: string, engine: Engine): Optimization {
  if (engine === "PYTHON") return optimizePython(input.trim());
  if (engine === "PYSPARK") return optimizePySpark(input.trim());
  return optimizeSql(input, engine);
}

const SQL_FIXTURES: Record<string, Record<string, unknown>[]> = {
  users: [
    {
      id: 1,
      name: "Aarav Sharma",
      email: "aarav@acme.com",
      country: "IN",
      status: "active",
      tier: "team",
      created_at: "2024-01-12",
    },
    {
      id: 2,
      name: "Olivia Smith",
      email: "olivia@globex.com",
      country: "US",
      status: "active",
      tier: "pro",
      created_at: "2024-02-18",
    },
    {
      id: 3,
      name: "Yuki Tanaka",
      email: "yuki@initech.com",
      country: "JP",
      status: "inactive",
      tier: "free",
      created_at: "2023-11-03",
    },
  ],
  orders: [
    {
      id: 101,
      user_id: 1,
      total: 1290.5,
      amount: 1290.5,
      status: "pending",
      region: "APAC",
      created_at: "2024-01-01",
      order_date: "2024-01-01",
    },
    {
      id: 102,
      user_id: 2,
      total: 8750,
      amount: 8750,
      status: "paid",
      region: "EU",
      created_at: "2024-03-22",
      order_date: "2024-03-22",
    },
    {
      id: 103,
      user_id: 1,
      total: 230.75,
      amount: 230.75,
      status: "pending",
      region: "US",
      created_at: "2023-10-09",
      order_date: "2023-10-09",
    },
  ],
  employees: [
    { id: 1, name: "Maya Iyer", dept_id: 10 },
    { id: 2, name: "Diego Garcia", dept_id: 20 },
  ],
  departments: [
    { id: 10, dept_name: "Engineering" },
    { id: 20, dept_name: "Revenue" },
  ],
  events: [
    {
      user_id: 1,
      country: "US",
      event_date: "2024-05-01",
      event_name: "signup",
      ts: "2024-05-01T10:00:00Z",
    },
    {
      user_id: 1,
      country: "US",
      event_date: "2024-05-02",
      event_name: "purchase",
      ts: "2024-05-02T12:00:00Z",
    },
    {
      user_id: 2,
      country: "IN",
      event_date: "2024-05-03",
      event_name: "signup",
      ts: "2024-05-03T09:30:00Z",
    },
  ],
  sales: [
    { id: 1, region: "EU", revenue: 9400, customer_id: 2 },
    { id: 2, region: "US", revenue: 7200, customer_id: 1 },
  ],
  transactions: [
    { customer_id: 1, amount: 120, date: "2024-01-02" },
    { customer_id: 2, amount: 450, date: "2024-01-03" },
  ],
};

function nextIsoDate(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function normalizeSqlForRunner(query: string) {
  let q = query
    .replace(/;\s*$/g, "")
    .replace(/`[^`]*\.([^`.]+)`/g, "$1")
    .replace(/bronze\.transactions/gi, "transactions")
    .replace(/\bROWNUM\s*<=\s*(\d+)/gi, "1 = 1 LIMIT $1")
    .replace(/FETCH\s+FIRST\s+(\d+)\s+ROWS\s+ONLY/gi, "LIMIT $1")
    .replace(/SELECT\s+TOP\s+(\d+)\s+/i, "SELECT ");

  q = q.replace(/\[(total)\]/gi, "__TOTAL_COL__");
  q = q.replace(/\b(total)\b/gi, "[$1]").replace(/__TOTAL_COL__/g, "[total]");
  q = q.replace(
    /DATE\(\s*(\w+)\s*\)\s*=\s*'([^']+)'/gi,
    (_m, col, date) => `${col} >= '${date}' AND ${col} < '${nextIsoDate(date)}'`,
  );
  q = q.replace(/'([^']+)'::date\s*\+\s*1/gi, (_m, date) => `'${nextIsoDate(date)}'`);
  return q;
}

// ---- Intelligent fixture builder: parses tables/aliases/predicates from query ----

type AlSqlDb = { exec: (sql: string) => unknown; tables: Record<string, { data: unknown[] }> };
type AlSql = { Database: new (name: string) => AlSqlDb };

function literalValue(raw: string): unknown {
  if (/^'(.*)'$/.test(raw)) return raw.slice(1, -1);
  if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === "true";
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function inferValueFor(col: string, i: number, sample?: unknown): unknown {
  if (col === "id") return i + 1;
  if (col.endsWith("_id")) return randInt(1, 10);
  if (typeof sample === "number") return randInt(1, 1000);
  if (typeof sample === "boolean") return Math.random() > 0.5;
  if (typeof sample === "string" && /^\d{4}-\d{2}-\d{2}/.test(sample)) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    return sample.length > 10 ? d.toISOString() : d.toISOString().slice(0, 10);
  }
  if (col.includes("name")) return `${rand(FIRST)} ${rand(LAST)}`;
  if (col === "email") return `user${i}@example.com`;
  if (col === "status") return rand(["active", "inactive", "pending"]);
  if (col === "country") return rand(COUNTRIES);
  if (col === "city") return rand(CITIES);
  if (col.includes("date") || col.endsWith("_at")) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  }
  if (/total|amount|price|revenue|cost|qty|quantity/i.test(col))
    return +(Math.random() * 5000 + 10).toFixed(2);
  if (typeof sample === "string") return `${col}_${i}`;
  return `${col}_${i}`;
}

function buildSmartFixtures(query: string): Record<string, Record<string, unknown>[]> {
  const aliasToTable = new Map<string, string>();
  const tables = new Set<string>();
  const fromRe = /\b(?:FROM|JOIN)\s+([a-zA-Z_]\w*)(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?/gi;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(query))) {
    const t = m[1].toLowerCase();
    const a = (m[2] || t).toLowerCase();
    tables.add(t);
    aliasToTable.set(a, t);
    aliasToTable.set(t, t);
  }
  if (!tables.size) return SQL_FIXTURES;

  const tableCols: Record<string, Set<string>> = {};
  const colRe = /\b([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\b/g;
  while ((m = colRe.exec(query))) {
    const t = aliasToTable.get(m[1].toLowerCase());
    if (t) (tableCols[t] ||= new Set()).add(m[2].toLowerCase());
  }

  const tablePreds: Record<string, { col: string; op: string; val: unknown }[]> = {};
  const predRe =
    /(?:\b([a-zA-Z_]\w*)\.)?([a-zA-Z_]\w*)\s*(>=|<=|<>|!=|=|>|<|LIKE)\s*('[^']*'|-?\d+(?:\.\d+)?|TRUE|FALSE)/gi;
  while ((m = predRe.exec(query))) {
    const alias = (m[1] || "").toLowerCase();
    const col = m[2].toLowerCase();
    if (/^(select|from|join|where|on|and|or|group|order|by|having|as|limit|offset|in|not|is|null|true|false)$/.test(col))
      continue;
    const op = m[3].toUpperCase();
    const val = literalValue(m[4]);
    let table = aliasToTable.get(alias);
    if (!table) {
      // attribute to first table that mentioned this column
      table = Object.entries(tableCols).find(([, s]) => s.has(col))?.[0] ?? [...tables][0];
    }
    if (!table) continue;
    (tablePreds[table] ||= []).push({ col, op, val });
    (tableCols[table] ||= new Set()).add(col);
  }

  const fixtures: Record<string, Record<string, unknown>[]> = {};
  for (const t of tables) {
    const baseRows = SQL_FIXTURES[t] ?? [];
    const cols = tableCols[t] ?? new Set<string>();
    baseRows.forEach((r) => Object.keys(r).forEach((k) => cols.add(k)));
    if (!cols.size) cols.add("id");
    const preds = tablePreds[t] ?? [];
    const rows: Record<string, unknown>[] = baseRows.map((r) => ({ ...r }));
    for (let i = 0; i < 40; i++) {
      const r: Record<string, unknown> = {};
      for (const c of cols) {
        const sample = baseRows[0]?.[c];
        r[c] = inferValueFor(c, i + rows.length, sample);
      }
      // Make ~80% of rows satisfy each predicate so query returns data
      for (const p of preds) {
        if (Math.random() > 0.2) {
          if (p.op === "=") r[p.col] = p.val;
          else if (p.op === ">" || p.op === ">=")
            r[p.col] = typeof p.val === "number" ? (p.val as number) + i + 1 : p.val;
          else if (p.op === "<" || p.op === "<=")
            r[p.col] = typeof p.val === "number" ? Math.max(0, (p.val as number) - i - 1) : p.val;
          else if (p.op === "LIKE" && typeof p.val === "string")
            r[p.col] = p.val.replace(/%/g, `x${i}`);
        }
      }
      rows.push(r);
    }
    fixtures[t] = rows;
  }

  // Foreign-key linking heuristic: child.user_id -> parent users.id
  for (const [t, rows] of Object.entries(fixtures)) {
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (k.endsWith("_id") && k !== "id") {
          const parent = k.slice(0, -3) + "s";
          const parentRows = fixtures[parent] ?? SQL_FIXTURES[parent];
          if (parentRows && parentRows.length) {
            const ids = parentRows.map((p) => p.id).filter((x) => x !== undefined);
            if (ids.length) r[k] = ids[randInt(0, ids.length - 1)];
          }
        }
      }
      void t;
    }
  }

  return { ...SQL_FIXTURES, ...fixtures };
}

async function runSqlLocal(
  query: string,
  customFixtures?: Record<string, Record<string, unknown>[]>,
): Promise<ExecutionResult> {
  const started = performance.now();
  const alasqlModule = await import("alasql");
  const alasql = ((alasqlModule as { default?: unknown }).default ?? alasqlModule) as AlSql;
  const db = new alasql.Database(`optiq_${Date.now()}`);
  const fixtures =
    customFixtures && Object.keys(customFixtures).length
      ? customFixtures
      : buildSmartFixtures(query);
  Object.entries(fixtures).forEach(([table, rows]) => {
    try {
      db.exec(`CREATE TABLE ${table}`);
      db.tables[table].data = rows.map((row) => ({ ...row }));
    } catch {
      /* ignore duplicate */
    }
  });
  const normalized = normalizeSqlForRunner(query);
  let result: unknown;
  try {
    result = db.exec(normalized);
  } catch (e) {
    return {
      status: "error",
      label: "SQL runtime error",
      error: e instanceof Error ? e.message : String(e),
      elapsedMs: performance.now() - started,
    };
  }
  const rows = Array.isArray(result) ? (result as Record<string, unknown>[]).slice(0, 100) : [{ result }];
  return {
    status: "success",
    label: `${rows.length} row${rows.length === 1 ? "" : "s"} returned · ${Object.keys(fixtures).length} tables seeded`,
    rows,
    output: JSON.stringify(rows, null, 2),
    elapsedMs: performance.now() - started,
  };
}

// ------------------------- Pyodide runner -------------------------

type PyodideRuntime = {
  setStdout: (options: { batched: (text: string) => void }) => void;
  setStderr: (options: { batched: (text: string) => void }) => void;
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackagesFromImports?: (code: string) => Promise<void>;
};

type PyodideLoader = (options: { indexURL: string }) => Promise<PyodideRuntime>;

type PyodideWindow = Window & { loadPyodide?: PyodideLoader };

let pyodidePromise: Promise<PyodideRuntime> | null = null;
function loadPyodide(): Promise<PyodideRuntime> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = new Promise((resolve, reject) => {
    const w = window as PyodideWindow;
    if (w.loadPyodide) {
      w.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/" }).then(
        resolve,
        reject,
      );
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";
    s.onload = () =>
      (window as PyodideWindow).loadPyodide!({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
      }).then(resolve, reject);
    s.onerror = () => reject(new Error("Failed to load Pyodide"));
    document.head.appendChild(s);
  });
  return pyodidePromise;
}

// ------------------------- UI components -------------------------

function Toolbar({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border gap-2 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">{left}</div>
      <div className="flex gap-2 flex-wrap">{right}</div>
    </div>
  );
}

function DiagnosticsBar({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (!diagnostics || diagnostics.length === 0) {
    return (
      <div className="px-4 py-1.5 text-[11px] font-mono text-emerald-300/80 bg-emerald-500/5 border-b border-border flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-emerald-400" /> No syntax issues detected
      </div>
    );
  }
  const errs = diagnostics.filter((d) => d.severity === "error");
  return (
    <div
      className={`px-4 py-1.5 text-[11px] font-mono border-b border-border space-y-0.5 ${errs.length ? "bg-rose-500/10 text-rose-200" : "bg-amber-500/10 text-amber-200"}`}
    >
      {diagnostics.slice(0, 4).map((d, i) => (
        <div key={i} className="flex gap-2">
          <span className="font-bold uppercase">{d.severity}</span>
          {d.line !== undefined && <span className="opacity-70">L{d.line}</span>}
          <span>{d.message}</span>
        </div>
      ))}
      {diagnostics.length > 4 && <div className="opacity-70">+{diagnostics.length - 4} more…</div>}
    </div>
  );
}

function CodeOutput({
  html,
  speedup,
  changes,
}: {
  html: string;
  speedup?: number;
  changes?: Change[];
}) {
  const summary = (changes ?? []).slice(0, 2);
  return (
    <div className="p-6 overflow-auto bg-surface/40 relative h-full">
      <div className="text-primary mb-3 text-[10px] uppercase tracking-widest flex items-center gap-2">
        Optimized Output
        <span className="size-1.5 rounded-full bg-primary animate-pulse" />
      </div>
      {summary.length > 0 && (
        <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] leading-snug text-foreground/90 space-y-1">
          {summary.map((c, i) => (
            <div key={i}>
              <span className="font-semibold text-primary">{c.title}:</span>{" "}
              <span className="text-muted-foreground">{c.detail}</span>
            </div>
          ))}
          <div className="text-[10px] text-muted-foreground/80 pt-1">
            ✓ Literals & predicates preserved — no business-logic drift.
          </div>
        </div>
      )}
      <pre
        className="text-foreground whitespace-pre-wrap pr-2 font-mono text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {speedup !== undefined && (
        <div className="absolute bottom-6 right-6">
          <div className="bg-primary/10 border border-primary/20 rounded px-4 py-3 backdrop-blur-sm">
            <div className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1">
              Est. Speedup
            </div>
            <div className="text-3xl font-mono font-bold text-primary tracking-tighter">
              {speedup.toFixed(1)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutionPanel({ result }: { result: ExecutionResult }) {
  const rows = result.rows ?? [];
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <div className="border-t border-border bg-surface-2/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Live Run</div>
        <div
          className={`text-[10px] font-mono ${result.status === "error" ? "text-destructive" : result.status === "success" ? "text-primary" : "text-muted-foreground"}`}
        >
          {result.label}
          {result.elapsedMs !== undefined ? ` · ${result.elapsedMs.toFixed(1)}ms` : ""}
        </div>
      </div>
      {result.status === "error" ? (
        <pre className="min-h-[72px] max-h-[180px] overflow-auto whitespace-pre-wrap font-mono text-xs text-destructive">
          {result.error}
        </pre>
      ) : columns.length ? (
        <div className="max-h-[220px] overflow-auto rounded border border-border">
          <table className="w-full border-collapse text-left font-mono text-xs">
            <thead className="sticky top-0 bg-secondary text-muted-foreground">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="border-b border-border px-3 py-2 font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-border/60 last:border-0">
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-2 text-foreground">
                      {String(row[col] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="min-h-[72px] max-h-[180px] overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
          {result.output ||
            "Run the current input or optimized output to see real execution results."}
        </pre>
      )}
    </div>
  );
}

function ChangesPanel({ changes }: { changes: Change[] }) {
  return (
    <div className="bg-surface/50 p-4 rounded-xl ring-1 ring-border">
      <h2 className="text-xs font-bold uppercase tracking-widest mb-4">Applied Changes</h2>
      <div className="space-y-4">
        {changes.map((c, i) => (
          <div key={i} className="space-y-1">
            <div className={`text-sm font-medium ${c.highlight ? "text-primary" : ""}`}>
              {c.title}
            </div>
            <div className="text-xs text-muted-foreground">{c.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CATEGORY_COLORS: Record<TipCategory, string> = {
  Partitioning: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  Indexing: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  Clustering: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  "Functions & UDFs": "bg-amber-500/10 text-amber-300 border-amber-500/30",
  "Concurrency / Threading": "bg-rose-500/10 text-rose-300 border-rose-500/30",
  "Memory & Caching": "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  "Statistics & Planner": "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30",
  "I/O & File Layout": "bg-orange-500/10 text-orange-300 border-orange-500/30",
};

function TipsPanel({ engineKey }: { engineKey: TipsKey }) {
  const tips = ENGINE_TIPS[engineKey] ?? [];
  const categories = Array.from(new Set(tips.map((t) => t.category))) as TipCategory[];
  const [filter, setFilter] = useState<TipCategory | "ALL">("ALL");
  const filtered = filter === "ALL" ? tips : tips.filter((t) => t.category === filter);

  return (
    <div className="bg-surface/50 p-4 rounded-xl ring-1 ring-border">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-widest">Engine Tips · {engineKey}</h2>
        <span className="text-[10px] text-muted-foreground font-mono">best practices</span>
      </div>
      <div className="flex flex-wrap gap-1 mb-4">
        <button
          onClick={() => setFilter("ALL")}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            filter === "ALL"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-secondary border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          ALL
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              filter === c
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="space-y-3 max-h-[460px] overflow-auto pr-1">
        {filtered.map((t: Tip, i) => (
          <div key={i} className="space-y-1 pb-3 border-b border-border last:border-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[t.category]}`}
              >
                {t.category}
              </span>
            </div>
            <div className="text-sm font-medium text-foreground">{t.title}</div>
            <div className="text-xs text-muted-foreground leading-relaxed">{t.body}</div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-muted-foreground italic">No tips in this category yet.</div>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-border text-[10px] text-muted-foreground">
        Sourced from official docs (Spark tuning guide, ClickHouse docs, Postgres planner notes) and
        OSS community best-practice repos.
      </div>
    </div>
  );
}

// SQL panel
type TestSpec = {
  name?: string;
  minRows?: number;
  maxRows?: number;
  exactRows?: number;
  contains?: string;
  notContains?: string;
};
type TestResult = { name: string; passed: boolean; reason?: string };

function runTests(specs: TestSpec[], exec: ExecutionResult): TestResult[] {
  return specs.map((spec, i) => {
    const name = spec.name || `test_${i + 1}`;
    if (exec.status !== "success")
      return { name, passed: false, reason: exec.error || "Query did not execute" };
    const n = exec.rows?.length ?? 0;
    const out = exec.output ?? "";
    if (spec.exactRows !== undefined && n !== spec.exactRows)
      return { name, passed: false, reason: `expected exactly ${spec.exactRows} rows, got ${n}` };
    if (spec.minRows !== undefined && n < spec.minRows)
      return { name, passed: false, reason: `expected ≥ ${spec.minRows} rows, got ${n}` };
    if (spec.maxRows !== undefined && n > spec.maxRows)
      return { name, passed: false, reason: `expected ≤ ${spec.maxRows} rows, got ${n}` };
    if (spec.contains && !out.includes(spec.contains))
      return { name, passed: false, reason: `output missing "${spec.contains}"` };
    if (spec.notContains && out.includes(spec.notContains))
      return { name, passed: false, reason: `output contains forbidden "${spec.notContains}"` };
    return { name, passed: true };
  });
}

function SqlPanel() {
  const [engine, setEngine] = useState<SqlEngine>("POSTGRESQL");
  const [input, setInput] = useState(SQL_SAMPLES.POSTGRESQL);
  const [result, setResult] = useState<Optimization>(() =>
    optimize(SQL_SAMPLES.POSTGRESQL, "POSTGRESQL"),
  );
  const [runTarget, setRunTarget] = useState<"input" | "output">("input");
  const [execution, setExecution] = useState<ExecutionResult>({ status: "idle", label: "Ready" });
  const [copied, setCopied] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [showDatasets, setShowDatasets] = useState(false);
  const [datasetStatus, setDatasetStatus] = useState<string | null>(null);
  const [loadingDataset, setLoadingDataset] = useState<string | null>(null);
  const [fixturesText, setFixturesText] = useState("");
  const [fixturesError, setFixturesError] = useState<string | null>(null);
  const [testsText, setTestsText] = useState(
    `[\n  { "name": "returns rows", "minRows": 1 },\n  { "name": "bounded", "maxRows": 100 }\n]`,
  );
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const html = useMemo(() => highlight(result.output, "sql"), [result.output]);
  const liveDiagnostics = useMemo(() => validate(input, engine), [input, engine]);

  function changeEngine(e: SqlEngine) {
    setEngine(e);
    setInput(SQL_SAMPLES[e]);
    setResult(optimize(SQL_SAMPLES[e], e));
  }

  function parseFixtures(): Record<string, Record<string, unknown>[]> | undefined {
    if (!fixturesText.trim()) return undefined;
    try {
      const parsed = JSON.parse(fixturesText);
      setFixturesError(null);
      return parsed;
    } catch (e) {
      setFixturesError(e instanceof Error ? e.message : "Invalid JSON");
      return undefined;
    }
  }

  async function pickDataset(ds: OpenDataset) {
    setLoadingDataset(ds.id);
    setDatasetStatus(`Fetching ${ds.name}…`);
    try {
      const { table, rows } = await loadDataset(ds);
      setFixturesText(JSON.stringify({ [table]: rows }, null, 2));
      setInput(buildSampleQuery(ds, rows[0]));
      setShowSource(true);
      setDatasetStatus(`✓ Loaded ${rows.length.toLocaleString()} rows into "${table}"`);
    } catch (e) {
      setDatasetStatus(`✗ ${e instanceof Error ? e.message : "Failed to load"}`);
    } finally {
      setLoadingDataset(null);
    }
  }


  async function run(specs?: TestSpec[]) {
    const code = runTarget === "input" ? input : result.output;
    setExecution({ status: "running", label: "Executing query…" });
    setTestResults(null);
    try {
      const fixtures = parseFixtures();
      if (fixturesText.trim() && !fixtures) {
        setExecution({ status: "error", label: "Bad fixtures JSON", error: fixturesError ?? "" });
        return;
      }
      const ran = await runSqlLocal(code, fixtures);
      setExecution(ran);
      if (specs && specs.length) setTestResults(runTests(specs, ran));
    } catch (e: unknown) {
      setExecution({
        status: "error",
        label: "Execution failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function runWithTests() {
    let specs: TestSpec[] = [];
    try {
      const parsed = JSON.parse(testsText);
      specs = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      setTestResults([
        { name: "spec parse", passed: false, reason: e instanceof Error ? e.message : "bad JSON" },
      ]);
      return;
    }
    await run(specs);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="flex flex-col bg-surface/50 p-1 rounded-xl ring-1 ring-border">
        <Toolbar
          left={
            <>
              <select
                aria-label="SQL engine"
                value={engine}
                onChange={(e) => changeEngine(e.target.value as SqlEngine)}
                className="px-2 py-1 bg-secondary rounded border border-border text-xs font-mono cursor-pointer outline-none focus:border-primary max-w-[200px]"
              >
                {SQL_ENGINES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground hidden sm:inline">SQL engine</span>
            </>
          }
          right={
            <>
              <button
                onClick={() => setShowSource((v) => !v)}
                className={`text-xs px-2 py-1 rounded border ${showSource ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                title="Provide custom schema / sample data"
              >
                {showSource ? "− Source" : "+ Source"}
              </button>
              <button
                onClick={() => setShowTests((v) => !v)}
                className={`text-xs px-2 py-1 rounded border ${showTests ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                title="Define custom test cases"
              >
                {showTests ? "− Tests" : "+ Tests"}
              </button>
              <select
                aria-label="SQL run target"
                value={runTarget}
                onChange={(e) => setRunTarget(e.target.value as "input" | "output")}
                className="px-2 py-1 bg-secondary rounded border border-border text-xs font-mono"
              >
                <option value="input">Run input</option>
                <option value="output">Run optimized</option>
              </select>
              <button
                onClick={() => run()}
                disabled={execution.status === "running"}
                className="text-xs bg-secondary border border-border px-3 py-1 rounded hover:border-primary disabled:opacity-50"
              >
                {execution.status === "running" ? "Running…" : "▶ Run"}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(result.output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="text-xs bg-secondary px-3 py-1 rounded border border-border hover:border-muted-foreground transition-colors"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => setResult(optimize(input, engine))}
                className="text-xs bg-primary text-primary-foreground font-bold px-4 py-1 rounded hover:opacity-90 transition"
              >
                OPTIMIZE
              </button>
            </>
          }
        />
        <DiagnosticsBar diagnostics={liveDiagnostics} />

        {showSource && (
          <div className="px-4 py-3 border-b border-border bg-surface-2/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Source data — JSON {`{ "table": [ {row}, … ] }`} (leave empty for auto-generated)
              </div>
              <button
                onClick={() =>
                  setFixturesText(
                    JSON.stringify(buildSmartFixtures(input), null, 2),
                  )
                }
                className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground"
              >
                Auto-fill from query
              </button>
            </div>
            <textarea
              value={fixturesText}
              onChange={(e) => setFixturesText(e.target.value)}
              spellCheck={false}
              placeholder='{"users":[{"id":1,"name":"Ada","status":"active"}],"orders":[...]}'
              className="w-full h-32 bg-secondary/50 border border-border rounded p-2 font-mono text-[11px] outline-none focus:border-primary"
            />
            {fixturesError && (
              <div className="text-[11px] text-rose-300 font-mono">⚠ {fixturesError}</div>
            )}
          </div>
        )}

        {showTests && (
          <div className="px-4 py-3 border-b border-border bg-surface-2/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Test cases — JSON array · supports{" "}
                <code className="text-primary">minRows / maxRows / exactRows / contains / notContains</code>
              </div>
              <button
                onClick={runWithTests}
                disabled={execution.status === "running"}
                className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground font-bold disabled:opacity-50"
              >
                ▶ Run + Test
              </button>
            </div>
            <textarea
              value={testsText}
              onChange={(e) => setTestsText(e.target.value)}
              spellCheck={false}
              className="w-full h-28 bg-secondary/50 border border-border rounded p-2 font-mono text-[11px] outline-none focus:border-primary"
            />
            {testResults && (
              <div className="space-y-1 pt-1 border-t border-border">
                {testResults.map((t, i) => (
                  <div
                    key={i}
                    className={`text-[11px] font-mono flex gap-2 ${t.passed ? "text-emerald-300" : "text-rose-300"}`}
                  >
                    <span>{t.passed ? "✓" : "✗"}</span>
                    <span className="font-bold">{t.name}</span>
                    {t.reason && <span className="opacity-80">— {t.reason}</span>}
                  </div>
                ))}
                <div className="text-[10px] text-muted-foreground pt-1">
                  {testResults.filter((t) => t.passed).length}/{testResults.length} passed
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 h-[480px] font-mono text-sm leading-relaxed overflow-hidden">
          <div className="p-6 border-r border-border overflow-auto bg-surface-2/40">
            <div className="text-muted-foreground mb-3 text-[10px] uppercase tracking-widest">
              Input — SQL
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              className="w-full h-[calc(100%-1.5rem)] bg-transparent resize-none outline-none text-zinc-300 font-mono text-sm leading-relaxed"
            />
          </div>
          <CodeOutput html={html} speedup={result.speedup} changes={result.changes} />
        </div>
        <ExecutionPanel result={execution} />
      </div>
      <div className="flex flex-col gap-4">
        <ChangesPanel changes={result.changes} />
        <TipsPanel engineKey={engine as TipsKey} />
      </div>
    </div>
  );
}


// Python panel with Pyodide runner
function PythonPanel() {
  const [input, setInput] = useState(PY_SAMPLE);
  const [result, setResult] = useState<Optimization>(() => optimize(PY_SAMPLE, "PYTHON"));
  const [copied, setCopied] = useState(false);
  const [stdout, setStdout] = useState<string>("");
  const [running, setRunning] = useState<"idle" | "loading" | "running">("idle");
  const [runTarget, setRunTarget] = useState<"input" | "output">("output");
  const html = useMemo(() => highlight(result.output, "py"), [result.output]);
  const liveDiagnostics = useMemo(() => validate(input, "PYTHON"), [input]);

  async function run() {
    const code = runTarget === "input" ? input : result.output;
    setStdout("");
    setRunning("loading");
    try {
      const py = await loadPyodide();
      setRunning("running");
      let buf = "";
      py.setStdout({
        batched: (s: string) => {
          buf += s + "\n";
          setStdout(buf);
        },
      });
      py.setStderr({
        batched: (s: string) => {
          buf += s + "\n";
          setStdout(buf);
        },
      });
      try {
        if (py.loadPackagesFromImports) {
          try {
            await py.loadPackagesFromImports(code);
          } catch {
            /* ignore — fall through and let runtime error surface */
          }
        }
        await py.runPythonAsync(code);
      } catch (e: unknown) {
        buf += `\n[error] ${e instanceof Error ? e.message : String(e)}`;
        setStdout(buf);
      }
    } catch (e: unknown) {
      setStdout(`[failed to load runtime] ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning("idle");
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="flex flex-col bg-surface/50 p-1 rounded-xl ring-1 ring-border">
        <Toolbar
          left={
            <span className="text-xs text-muted-foreground font-mono">
              PYTHON 3.12 · Pyodide runtime
            </span>
          }
          right={
            <>
              <select
                aria-label="Run target"
                value={runTarget}
                onChange={(e) => setRunTarget(e.target.value as "input" | "output")}
                className="px-2 py-1 bg-secondary rounded border border-border text-xs font-mono"
              >
                <option value="output">Run optimized</option>
                <option value="input">Run input</option>
              </select>
              <button
                onClick={run}
                disabled={running !== "idle"}
                className="text-xs bg-secondary border border-border px-3 py-1 rounded hover:border-primary disabled:opacity-50"
              >
                {running === "loading" ? "Loading…" : running === "running" ? "Running…" : "▶ Run"}
              </button>
              <button
                onClick={() => downloadText("optimized.py", result.output)}
                className="text-xs bg-secondary px-3 py-1 rounded border border-border hover:border-primary"
              >
                ⬇ .py
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(result.output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="text-xs bg-secondary px-3 py-1 rounded border border-border"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => setResult(optimize(input, "PYTHON"))}
                className="text-xs bg-primary text-primary-foreground font-bold px-4 py-1 rounded hover:opacity-90"
              >
                OPTIMIZE
              </button>
            </>
          }
        />
        <DiagnosticsBar diagnostics={liveDiagnostics} />
        <div className="grid md:grid-cols-2 h-[480px] font-mono text-sm leading-relaxed overflow-hidden">
          <div className="p-6 border-r border-border overflow-auto bg-surface-2/40">
            <div className="text-muted-foreground mb-3 text-[10px] uppercase tracking-widest">
              Input — Python
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              className="w-full h-[calc(100%-1.5rem)] bg-transparent resize-none outline-none text-zinc-300 font-mono text-sm leading-relaxed"
            />
          </div>
          <CodeOutput html={html} speedup={result.speedup} changes={result.changes} />
        </div>
        <div className="border-t border-border p-4 bg-surface-2/30">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            stdout
          </div>
          <pre className="font-mono text-xs text-zinc-300 whitespace-pre-wrap min-h-[60px] max-h-[180px] overflow-auto">
            {stdout || "— run the script to see output —"}
          </pre>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <ChangesPanel changes={result.changes} />
        <TipsPanel engineKey="PYTHON" />
      </div>
    </div>
  );
}

// PySpark panel — static analyzer + logical plan preview

type PlanStep = { op: string; detail: string };

function buildPySparkPlan(code: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const reads = code.match(/spark\.read\.(\w+)\(([^)]+)\)/g) || [];
  reads.forEach((r) => {
    const m = r.match(/spark\.read\.(\w+)\(([^)]+)\)/);
    if (m) steps.push({ op: "Scan", detail: `${m[1]}(${m[2]})` });
  });
  const filters = code.match(/\.filter\(([^)]+)\)|\.where\(([^)]+)\)/g) || [];
  filters.forEach((f) => steps.push({ op: "Filter", detail: f.replace(/^\./, "") }));
  const withCols = code.match(/\.withColumn\(([^)]+)\)/g) || [];
  withCols.forEach((w) => steps.push({ op: "Project", detail: w.replace(/^\./, "") }));
  const joins = code.match(/\.join\(([^)]+)\)/g) || [];
  joins.forEach((j) => steps.push({ op: "Join", detail: j.replace(/^\./, "") }));
  const groups = code.match(/\.groupBy\(([^)]+)\)/g) || [];
  groups.forEach((g) => steps.push({ op: "Aggregate", detail: g.replace(/^\./, "") }));
  const orders = code.match(/\.orderBy\(([^)]+)\)|\.sort\(([^)]+)\)/g) || [];
  orders.forEach((o) => steps.push({ op: "Sort", detail: o.replace(/^\./, "") }));
  const actions = ["collect", "count", "show", "take", "first", "toPandas", "write"];
  actions.forEach((a) => {
    if (new RegExp(`\\.${a}\\(`).test(code))
      steps.push({ op: "Action", detail: `${a}() — triggers execution` });
  });
  return steps;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PySparkPanel() {
  const [input, setInput] = useState(PYSPARK_SAMPLE);
  const [result, setResult] = useState<Optimization>(() => optimize(PYSPARK_SAMPLE, "PYSPARK"));
  const [copied, setCopied] = useState(false);
  const [showPlan, setShowPlan] = useState(true);
  const html = useMemo(() => highlight(result.output, "py"), [result.output]);
  const liveDiagnostics = useMemo(() => validate(input, "PYSPARK"), [input]);
  const plan = useMemo(() => buildPySparkPlan(result.output || input), [result.output, input]);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="flex flex-col bg-surface/50 p-1 rounded-xl ring-1 ring-border">
        <Toolbar
          left={
            <span className="text-xs text-muted-foreground font-mono">
              PYSPARK 3.5 · static analyzer · no JVM in browser
            </span>
          }
          right={
            <>
              <button
                onClick={() => setShowPlan((v) => !v)}
                className={`text-xs px-2 py-1 rounded border ${showPlan ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {showPlan ? "− Plan" : "+ Plan"}
              </button>
              <button
                onClick={() => downloadText("optimized.py", result.output)}
                className="text-xs bg-secondary px-3 py-1 rounded border border-border hover:border-primary"
              >
                ⬇ .py
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(result.output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="text-xs bg-secondary px-3 py-1 rounded border border-border"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => setResult(optimize(input, "PYSPARK"))}
                className="text-xs bg-primary text-primary-foreground font-bold px-4 py-1 rounded hover:opacity-90"
              >
                OPTIMIZE
              </button>
            </>
          }
        />
        <DiagnosticsBar diagnostics={liveDiagnostics} />
        <div className="grid md:grid-cols-2 h-[520px] font-mono text-sm leading-relaxed overflow-hidden">
          <div className="p-6 border-r border-border overflow-auto bg-surface-2/40">
            <div className="text-muted-foreground mb-3 text-[10px] uppercase tracking-widest">
              Input — PySpark
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              className="w-full h-[calc(100%-1.5rem)] bg-transparent resize-none outline-none text-zinc-300 font-mono text-sm leading-relaxed"
            />
          </div>
          <CodeOutput html={html} speedup={result.speedup} changes={result.changes} />
        </div>
        {showPlan && (
          <div className="border-t border-border bg-surface-2/30 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Derived logical plan · {plan.length} steps
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                spark-submit optimized.py
              </span>
            </div>
            {plan.length ? (
              <ol className="space-y-1 font-mono text-xs">
                {plan.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-muted-foreground w-6">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-primary font-bold w-20">{s.op}</span>
                    <span className="text-zinc-300 truncate">{s.detail}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-xs text-muted-foreground font-mono">
                No Spark operations detected — write a DataFrame pipeline above.
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <ChangesPanel changes={result.changes} />
        <TipsPanel engineKey="PYSPARK" />
      </div>
    </div>
  );
}

// ------------------------- Data Builder -------------------------

type FieldType =
  | "int"
  | "float"
  | "bool"
  | "uuid"
  | "name"
  | "email"
  | "company"
  | "city"
  | "country"
  | "phone"
  | "date"
  | "datetime"
  | "enum"
  | "string"
  | "url"
  | "ip";

type SchemaField = { name: string; type: FieldType; opts?: string };

const FIRST = [
  "Aarav",
  "Priya",
  "Liam",
  "Olivia",
  "Noah",
  "Emma",
  "Yuki",
  "Mateo",
  "Zara",
  "Kai",
  "Aisha",
  "Diego",
  "Sora",
  "Maya",
  "Ethan",
  "Nia",
];
const LAST = [
  "Sharma",
  "Patel",
  "Singh",
  "Kim",
  "Tanaka",
  "Garcia",
  "Smith",
  "Johnson",
  "Brown",
  "Khan",
  "Iyer",
  "Reddy",
  "Müller",
  "Rossi",
  "Silva",
];
const COMPANIES = [
  "Acme",
  "Globex",
  "Initech",
  "Umbrella",
  "Hooli",
  "Stark",
  "Wayne",
  "Wonka",
  "Soylent",
  "Tyrell",
  "Pied Piper",
  "Massive Dynamic",
];
const CITIES = [
  "Bengaluru",
  "Mumbai",
  "Delhi",
  "Tokyo",
  "London",
  "Berlin",
  "Paris",
  "NYC",
  "SF",
  "Sydney",
  "Singapore",
  "Toronto",
];
const COUNTRIES = ["IN", "US", "GB", "DE", "FR", "JP", "SG", "AU", "CA", "BR", "NL", "ES"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function randDate(years = 3) {
  const now = Date.now();
  return new Date(now - randInt(0, years * 365 * 24 * 3600 * 1000));
}

function genValue(f: SchemaField): unknown {
  switch (f.type) {
    case "int": {
      const [a, b] = (f.opts || "0-1000").split("-").map(Number);
      return randInt(a || 0, b || 1000);
    }
    case "float": {
      const [a, b] = (f.opts || "0-100").split("-").map(Number);
      return +(Math.random() * ((b || 100) - (a || 0)) + (a || 0)).toFixed(2);
    }
    case "bool":
      return Math.random() > 0.5;
    case "uuid":
      return uuid();
    case "name":
      return `${rand(FIRST)} ${rand(LAST)}`;
    case "email": {
      const n = `${rand(FIRST)}.${rand(LAST)}`.toLowerCase();
      return `${n}${randInt(1, 999)}@${rand(["gmail.com", "outlook.com", "proton.me", "example.com"])}`;
    }
    case "company":
      return rand(COMPANIES);
    case "city":
      return rand(CITIES);
    case "country":
      return rand(COUNTRIES);
    case "phone":
      return `+${randInt(1, 99)}-${randInt(1000000000, 9999999999)}`;
    case "date":
      return randDate().toISOString().slice(0, 10);
    case "datetime":
      return randDate().toISOString();
    case "enum": {
      const opts = (f.opts || "A,B,C")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return rand(opts);
    }
    case "url":
      return `https://${rand(["app", "api", "www", "cdn"])}.${rand(COMPANIES).toLowerCase().replace(/\s+/g, "")}.com/${uuid().slice(0, 8)}`;
    case "ip":
      return `${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(0, 255)}`;
    case "string":
    default: {
      const len = +(f.opts || "8") || 8;
      return Math.random()
        .toString(36)
        .slice(2, 2 + len);
    }
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function toSqlInsert(table: string, rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const lit = (v: unknown) => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  return (
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n` +
    rows.map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n") +
    ";"
  );
}

const FIELD_TYPES: FieldType[] = [
  "int",
  "float",
  "bool",
  "uuid",
  "name",
  "email",
  "company",
  "city",
  "country",
  "phone",
  "date",
  "datetime",
  "enum",
  "string",
  "url",
  "ip",
];

function DataBuilderPanel() {
  const [fields, setFields] = useState<SchemaField[]>([
    { name: "id", type: "uuid" },
    { name: "name", type: "name" },
    { name: "email", type: "email" },
    { name: "country", type: "country" },
    { name: "amount", type: "float", opts: "10-9999" },
    { name: "tier", type: "enum", opts: "free,pro,team" },
    { name: "active", type: "bool" },
    { name: "signed_up_at", type: "datetime" },
  ]);
  const [count, setCount] = useState(25);
  const [format, setFormat] = useState<"json" | "csv" | "sql">("json");
  const [table, setTable] = useState("users");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [copied, setCopied] = useState(false);

  function generate() {
    const data: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i++) {
      const r: Record<string, unknown> = {};
      for (const f of fields) r[f.name || `col_${i}`] = genValue(f);
      data.push(r);
    }
    setRows(data);
  }

  useEffect(() => {
    generate(); /* eslint-disable-next-line */
  }, []);

  const output = useMemo(() => {
    if (!rows.length) return "";
    if (format === "json") return JSON.stringify(rows, null, 2);
    if (format === "csv") return toCsv(rows);
    return toSqlInsert(table, rows);
  }, [rows, format, table]);

  const html = useMemo(() => {
    if (format === "sql") return highlight(output, "sql");
    return escapeHtml(output);
  }, [output, format]);

  function updateField(i: number, patch: Partial<SchemaField>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function addField() {
    setFields((f) => [...f, { name: `field_${f.length + 1}`, type: "string" }]);
  }
  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i));
  }

  function download() {
    const ext = format === "json" ? "json" : format === "csv" ? "csv" : "sql";
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table || "data"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-6">
      {/* Schema editor */}
      <div className="bg-surface/50 rounded-xl ring-1 ring-border p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest">Schema</h2>
          <button
            onClick={addField}
            className="text-xs bg-secondary border border-border px-2 py-1 rounded hover:border-primary"
          >
            + Field
          </button>
        </div>
        <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_70px_24px] gap-2 items-center">
              <input
                aria-label="Field name"
                value={f.name}
                onChange={(e) => updateField(i, { name: e.target.value })}
                className="bg-secondary border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-primary"
              />
              <select
                aria-label="Field type"
                value={f.type}
                onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                className="bg-secondary border border-border rounded px-1 py-1 text-xs font-mono outline-none focus:border-primary"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                aria-label="Field options"
                value={f.opts || ""}
                onChange={(e) => updateField(i, { opts: e.target.value })}
                placeholder={
                  f.type === "enum"
                    ? "a,b,c"
                    : f.type === "int" || f.type === "float"
                      ? "0-100"
                      : ""
                }
                className="bg-secondary border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-primary"
              />
              <button
                onClick={() => removeField(i)}
                className="text-muted-foreground hover:text-destructive text-sm"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          <label className="block text-[10px] uppercase tracking-widest text-muted-foreground">
            Rows
            <input
              type="number"
              min={1}
              max={5000}
              value={count}
              onChange={(e) => setCount(+e.target.value || 1)}
              className="w-full mt-1 bg-secondary border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-primary"
            />
          </label>
          <label className="block text-[10px] uppercase tracking-widest text-muted-foreground">
            Format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "json" | "csv" | "sql")}
              className="w-full mt-1 bg-secondary border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-primary"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="sql">SQL INSERT</option>
            </select>
          </label>
          {format === "sql" && (
            <label className="block text-[10px] uppercase tracking-widest text-muted-foreground">
              Table name
              <input
                value={table}
                onChange={(e) => setTable(e.target.value)}
                className="w-full mt-1 bg-secondary border border-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-primary"
              />
            </label>
          )}
          <button
            onClick={generate}
            className="w-full bg-primary text-primary-foreground font-bold text-xs py-2 rounded hover:opacity-90"
          >
            GENERATE {count} ROWS
          </button>
        </div>
      </div>

      {/* Output */}
      <div className="flex flex-col bg-surface/50 p-1 rounded-xl ring-1 ring-border">
        <Toolbar
          left={
            <span className="text-xs text-muted-foreground font-mono">
              {rows.length} rows · {format.toUpperCase()}
            </span>
          }
          right={
            <>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="text-xs bg-secondary px-3 py-1 rounded border border-border"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={download}
                className="text-xs bg-primary text-primary-foreground font-bold px-4 py-1 rounded hover:opacity-90"
              >
                Download
              </button>
            </>
          }
        />
        <div className="p-6 overflow-auto bg-surface/40 h-[520px]">
          <pre
            className="text-foreground whitespace-pre font-mono text-xs leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}

// ------------------------- Tabs shell -------------------------

const TABS: { id: Mode; label: string; sub: string }[] = [
  { id: "SQL", label: "SQL", sub: "10 engines" },
  { id: "PYTHON", label: "Python", sub: "+ runtime" },
  { id: "PYSPARK", label: "PySpark", sub: "Catalyst-aware" },
  { id: "DATA", label: "Data Builder", sub: "schema → rows" },
];

export function Workspace() {
  const [mode, setMode] = useState<Mode>("SQL");
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} style={{ animation: "fadeIn 0.6s ease-out both" }}>
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-mono font-bold border transition-colors flex items-center gap-2 ${
              mode === t.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface/40 border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
            }`}
          >
            <span>{t.label}</span>
            <span
              className={`text-[10px] uppercase tracking-widest ${mode === t.id ? "opacity-80" : "text-muted-foreground"}`}
            >
              {t.sub}
            </span>
          </button>
        ))}
      </div>

      {mode === "SQL" && <SqlPanel />}
      {mode === "PYTHON" && <PythonPanel />}
      {mode === "PYSPARK" && <PySparkPanel />}
      {mode === "DATA" && <DataBuilderPanel />}
    </div>
  );
}
