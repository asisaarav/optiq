// Dependency-free beautifiers / formatters for SQL, Python, PySpark and JSON.
// Pure string transforms — they never change semantics, only whitespace/casing
// of reserved keywords outside string literals.

type Mask = { text: string; restore: (s: string) => string };

/** Replace string literals & comments with opaque tokens so regex work is safe. */
function maskStrings(src: string, comment: "sql" | "py"): Mask {
  const store: string[] = [];
  const push = (m: string) => {
    store.push(m);
    return `\u0000${store.length - 1}\u0000`;
  };
  let text = src.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, push);
  text =
    comment === "sql"
      ? text.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, push)
      : text.replace(/#[^\n]*/g, push);
  return {
    text,
    restore: (s) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => store[Number(i)] ?? ""),
  };
}

const SQL_MAJOR = [
  "WITH",
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP BY",
  "HAVING",
  "QUALIFY",
  "WINDOW",
  "ORDER BY",
  "LIMIT",
  "OFFSET",
  "UNION ALL",
  "UNION",
  "INTERSECT",
  "EXCEPT",
  "INSERT INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "DELETE FROM",
];

const SQL_JOINS = [
  "LEFT OUTER JOIN",
  "RIGHT OUTER JOIN",
  "FULL OUTER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "FULL JOIN",
  "INNER JOIN",
  "CROSS JOIN",
  "JOIN",
];

const SQL_KEYWORDS = [
  ...SQL_MAJOR,
  ...SQL_JOINS,
  "ON",
  "AND",
  "OR",
  "NOT",
  "IN",
  "IS",
  "NULL",
  "LIKE",
  "ILIKE",
  "BETWEEN",
  "AS",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "DISTINCT",
  "OVER",
  "PARTITION BY",
  "ASC",
  "DESC",
  "EXISTS",
  "CAST",
  "INTERVAL",
];

/** Beautify a SQL statement: uppercase keywords, one major clause per line. */
export function formatSql(src: string, indentSize = 2): string {
  if (!src.trim()) return src;
  const mask = maskStrings(src, "sql");
  let s = mask.text.replace(/\s+/g, " ").trim();

  // Normalize keyword casing (longest first so multi-word wins).
  for (const kw of [...SQL_KEYWORDS].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${kw.replace(/ /g, "\\s+")}\\b`, "gi");
    s = s.replace(re, kw);
  }

  // Tidy punctuation spacing.
  s = s
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)/g, ")")
    .replace(/\s*(<=|>=|<>|!=|=|<|>)\s*/g, " $1 ")
    .replace(/\s*;\s*/g, ";\n");

  // Break before major clauses / joins.
  for (const kw of [...SQL_MAJOR, ...SQL_JOINS].sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(`\\s+${kw}\\b`, "g"), `\n${kw}`);
  }
  s = s.replace(/\s+(AND|OR|ON)\b/g, "\n$1");

  const pad = " ".repeat(indentSize);
  const lines: string[] = [];
  let depth = 0;
  for (const raw of s.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const opens = (line.match(/\(/g) || []).length;
    const closes = (line.match(/\)/g) || []).length;
    if (/^\)/.test(line)) depth = Math.max(0, depth - 1);
    const isMajor = SQL_MAJOR.some((k) => line.toUpperCase().startsWith(k));
    const isCont = /^(AND|OR|ON)\b/.test(line);
    const extra = isMajor ? 0 : isCont ? 1 : 1;
    lines.push(pad.repeat(depth + (depth > 0 || !isMajor ? extra : 0)) + line);
    depth = Math.max(0, depth + opens - closes);
  }

  // Comma-separated select lists get one item per line when long.
  const out = lines
    .map((line) =>
      line.length > 90 && line.includes(", ")
        ? line.replace(/, /g, `,\n${" ".repeat(line.length - line.trimStart().length + indentSize)}`)
        : line,
    )
    .join("\n");

  return mask.restore(out).trim() + "\n";
}

const PY_OPEN = /^(def|class|if|elif|else|for|while|try|except|finally|with|match|case)\b/;
const PY_DEDENT = /^(elif|else|except|finally|case)\b/;

/** Normalize Python / PySpark indentation, blank lines and comma spacing. */
export function formatPython(src: string, indentSize = 4): string {
  if (!src.trim()) return src;
  const pad = " ".repeat(indentSize);
  const out: string[] = [];
  let depth = 0;
  let contDepth = 0; // open brackets carried across lines

  for (const raw of src.replace(/\t/g, pad).split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }

    const mask = maskStrings(trimmed, "py");
    const code = mask.text.replace(/#.*$/, "");
    const opens = (code.match(/[([{]/g) || []).length;
    const closes = (code.match(/[)\]}]/g) || []).length;

    let body = mask.text
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s*(==|!=|<=|>=|\+=|-=|\*=|\/=|->)\s*/g, " $1 ")
      .replace(/([^\s=!<>+\-*/])=([^=\s])/g, "$1 = $2")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .trim();
    body = mask.restore(body);

    if (contDepth > 0) {
      out.push(pad.repeat(depth + 1) + body);
    } else {
      if (PY_DEDENT.test(body)) depth = Math.max(0, depth - 1);
      if (/^(def|class)\b/.test(body) && out.length && out[out.length - 1] !== "") out.push("");
      out.push(pad.repeat(depth) + body);
      if (PY_OPEN.test(body) && /:$/.test(code.trim())) depth += 1;
      else if (/^(return|pass|break|continue|raise)\b/.test(body)) depth = Math.max(0, depth);
    }

    contDepth = Math.max(0, contDepth + opens - closes);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Beautify PySpark chains: one .transform() per line, then Python indenting. */
export function formatPySpark(src: string, indentSize = 4): string {
  if (!src.trim()) return src;
  const mask = maskStrings(src, "py");
  const chained = mask.text.replace(
    /^([^\n#]*?)\s*((?:\.\s*\w+\([^\n]*\)\s*){3,})$/gm,
    (line) => line,
  );
  return formatPython(mask.restore(chained), indentSize);
}

export type JsonFormatResult = { ok: true; text: string } | { ok: false; error: string };

/** Beautify or minify JSON with a clear parse error when invalid. */
export function formatJson(src: string, mode: "pretty" | "minify" = "pretty", indent = 2): JsonFormatResult {
  if (!src.trim()) return { ok: false, error: "Nothing to format — paste some JSON first." };
  try {
    const parsed = JSON.parse(src);
    return {
      ok: true,
      text: mode === "minify" ? JSON.stringify(parsed) : JSON.stringify(parsed, null, indent),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

/** Sort object keys recursively (handy for diffing configs). */
export function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortJsonKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
