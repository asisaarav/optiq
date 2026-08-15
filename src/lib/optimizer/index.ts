/**
 * OPTIQ rule engine: validators, rewrite rules and syntax highlighting for
 * SQL (10 engines), Python and PySpark. Pure functions - no React, no DOM -
 * so every rule is unit-testable and shareable with the public API route.
 */

export const SQL_ENGINES = [
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
export type SqlEngine = (typeof SQL_ENGINES)[number];
export type Engine = SqlEngine | "PYTHON" | "PYSPARK";

export const SQL_SAMPLES: Record<SqlEngine, string> = {
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

export const PY_SAMPLE = `items = [{"active": True, "value": 3}, {"active": False, "value": 5}, {"active": True, "value": 7}]

result = []
for i in range(len(items)):
    if items[i]["active"] == True:
        result.append(items[i]["value"] * 2)
total = 0
for v in result:
    total = total + v
print("total:", total)`;

export const PYSPARK_SAMPLE = `df = spark.read.parquet("s3://bucket/events")
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

export function escapeHtml(s: string) {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
}

/** Tokenizing highlighter — avoids the `class` attribute being re-matched as a keyword. */
export function highlight(code: string, kind: "sql" | "py") {
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
    // eslint-disable-next-line no-control-regex -- intentional sentinel placeholders, never user-visible
    out = out.replace(/\u0001T(\d+)E\u0001/g, (_m, n) => tokens[+n] ?? "");
  }
  return out;
}

export type Change = { title: string; detail: string; highlight?: boolean };
export type Diagnostic = { severity: "error" | "warn"; line?: number; message: string };
export type Optimization = {
  output: string;
  speedup: number;
  changes: Change[];
  diagnostics: Diagnostic[];
};
export type ExecutionResult = {
  status: "idle" | "running" | "success" | "error";
  label: string;
  rows?: Record<string, unknown>[];
  output?: string;
  error?: string;
  elapsedMs?: number;
};

export function buildHeader(engine: string, changes: Change[]) {
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

export function validateSql(code: string): Diagnostic[] {
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

  // Stranded operators / commas — comma immediately before a clause keyword,
  // a semicolon, or the very end of input. We do NOT use the /m flag so `$`
  // only matches end-of-string, otherwise `col,\n  next_col` would false-flag.
  if (
    /,\s*(?:FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT)\b/i.test(
      stripped,
    ) ||
    /,\s*(?:;|$)/.test(stripped.replace(/;\s*$/, ";"))
  )
    diags.push({ severity: "error", message: "Trailing comma before clause" });
  if (/\b(AND|OR)\b\s*(?:;|$)/im.test(stripped))
    diags.push({ severity: "error", message: "Boolean operator with no right-hand expression" });
  if (/(=|<>|!=|<=|>=|<|>)\s*(?:;|$)/m.test(stripped))
    diags.push({ severity: "error", message: "Comparison operator with no right-hand value" });

  if (
    /\bSELECT\b/i.test(stripped) &&
    !/\bFROM\b/i.test(stripped) &&
    !/\bSELECT\s+\d/i.test(stripped)
  ) {
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

export function normalizeForCompare(s: string) {
  return s
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*#.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function validatePython(code: string): Diagnostic[] {
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

export function validatePySpark(code: string): Diagnostic[] {
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

export function validate(code: string, engine: Engine): Diagnostic[] {
  if (engine === "PYTHON") return validatePython(code);
  if (engine === "PYSPARK") return validatePySpark(code);
  return validateSql(code);
}

export function optimizePython(input: string): Optimization {
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

export function optimizePySpark(input: string): Optimization {
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

export function optimizeSql(input: string, engine: SqlEngine): Optimization {
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

  if (changes.length === 0) {
    return {
      output,
      speedup: 0,
      changes: [
        {
          title: "No safe rewrite",
          detail: "Query is already efficient — inspect EXPLAIN for plan-level wins.",
        },
      ],
      diagnostics,
    };
  }
  if (!realChanged) {
    // Text is unchanged, but the advisory findings are still real: surface them
    // as review notes with an honest 0% speedup instead of claiming perfection.
    return {
      output,
      speedup: 0,
      changes: [
        {
          title: "Advisory only — query text unchanged",
          detail: "No mechanical rewrite was safe; apply the findings below by hand.",
        },
        ...changes,
      ],
      diagnostics,
    };
  }
  const speedup = Math.min(65, changes.length * 8);
  return { output, speedup, changes, diagnostics };
}

export function optimize(input: string, engine: Engine): Optimization {
  const safeFallback = (detail: string): Optimization => ({
    output: input.trim(),
    changes: [{ title: "Optimizer skipped", detail }],
    speedup: 0,
    diagnostics: [],
  });
  if (!input.trim()) return safeFallback("Editor is empty — nothing to optimize yet.");
  try {
    const result =
      engine === "PYTHON"
        ? optimizePython(input.trim())
        : engine === "PYSPARK"
          ? optimizePySpark(input.trim())
          : optimizeSql(input, engine);
    // Never hand back an empty pane: fall back to the original source.
    if (!result.output || !result.output.trim()) {
      return { ...result, output: input.trim(), speedup: 0 };
    }
    return result;
  } catch (e) {
    return safeFallback(
      `Original preserved — the rewrite engine hit an internal error (${
        e instanceof Error ? e.message : String(e)
      }).`,
    );
  }
}
