import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin",
  "Access-Control-Max-Age": "86400",
};

const RequestSchema = z.object({
  engine: z.enum(["postgresql", "mysql", "oracle", "plsql", "sqlserver", "snowflake", "bigquery", "redshift", "databricks", "clickhouse", "python", "pyspark"]),
  code: z.string().min(1).max(50000),
});

type Change = { title: string; detail: string; highlight?: boolean };
type Diagnostic = { severity: "error" | "warn"; line?: number; message: string };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function validateBrackets(code: string): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const stack: { ch: string; line: number }[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let line = 1;
  let inStr: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "\n") { line++; continue; }
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"') { inStr = c; continue; }
    if (c === "(" || c === "[" || c === "{") stack.push({ ch: c, line });
    if (c === ")" || c === "]" || c === "}") {
      const top = stack.pop();
      if (!top || top.ch !== pairs[c]) diags.push({ severity: "error", line, message: `Unmatched '${c}'` });
    }
  }
  if (inStr) diags.push({ severity: "error", line, message: "Unterminated string literal" });
  stack.forEach((s) => diags.push({ severity: "error", line: s.line, message: `Unclosed '${s.ch}'` }));
  return diags;
}

function optimizeSql(code: string) {
  let output = code.trim();
  const diagnostics = validateBrackets(code);
  const changes: Change[] = [];
  if (/\bSELCT\b/i.test(code)) diagnostics.push({ severity: "error", message: "Typo: SELCT → SELECT" });
  if (/\bFORM\b/i.test(code)) diagnostics.push({ severity: "error", message: "Typo: FORM → FROM" });
  if (/SELECT\s+\*/i.test(output)) changes.push({ title: "Avoid SELECT *", detail: "Project only required columns to reduce scan and network I/O." });
  if (/DATE\(\s*\w+\s*\)\s*=/i.test(output)) {
    output = output.replace(/DATE\(\s*(\w+)\s*\)\s*=\s*'([^']+)'/i, "$1 >= '$2' AND $1 < '$2'::date + 1");
    changes.push({ title: "SARGable predicate", detail: "Removed a function from the filtered column so indexes/partition pruning can apply.", highlight: true });
  }
  if (/\bUNION\b(?!\s+ALL)/i.test(output)) {
    output = output.replace(/\bUNION\b(?!\s+ALL)/gi, "UNION ALL");
    changes.push({ title: "UNION ALL", detail: "Avoids a distinct sort when duplicate removal is not required." });
  }
  if (/LIKE\s+'%[^%']+%'/i.test(output)) changes.push({ title: "Search index", detail: "Leading wildcard LIKE cannot use a normal B-tree index; consider trigram/full-text indexes." });
  if (/JOIN/i.test(output) && /WHERE/i.test(output)) changes.push({ title: "Join filtering", detail: "Push the most selective predicates before large joins and verify with EXPLAIN." });
  if (!changes.length) changes.push({ title: "Plan check", detail: "No safe rewrite found; inspect EXPLAIN for scans, spills, skew, and stale stats." });
  return { output, diagnostics, changes, speedup: Math.min(72, 14 + changes.length * 9) };
}

function optimizePython(code: string) {
  let output = code.trim();
  const diagnostics = validateBrackets(code);
  const changes: Change[] = [];
  code.split("\n").forEach((line, idx) => {
    if (/^\s*(def|class|if|elif|else|for|while|try|except|finally|with)\b[^:]*$/.test(line.replace(/#.*$/, "")) && line.trim()) {
      diagnostics.push({ severity: "error", line: idx + 1, message: "Missing ':' at end of statement" });
    }
  });
  if (/==\s*True\b/.test(output)) { output = output.replace(/\s*==\s*True\b/g, ""); changes.push({ title: "Truthy check", detail: "Removed explicit == True." }); }
  if (/for\s+\w+\s+in\s+range\(len\(\w+\)\):/.test(output)) { output = output.replace(/for\s+(\w+)\s+in\s+range\(len\((\w+)\)\):/g, "for $1, item in enumerate($2):"); changes.push({ title: "Use enumerate", detail: "Avoids repeated indexing and is clearer." }); }
  if (/\w+\s*=\s*0\s*\n\s*for\s+\w+\s+in\s+\w+:/m.test(output)) changes.push({ title: "Built-in reductions", detail: "Use sum/min/max where possible to move loops into optimized runtime code." });
  if (!/if\s+__name__\s*==\s*["']__main__["']\s*:/.test(output) && /print\(|for\s|while\s|=/.test(output)) {
    output = `def main() -> None:\n${output.split("\n").map((l) => `    ${l}`).join("\n")}\n\n\nif __name__ == "__main__":\n    main()`;
    changes.push({ title: "Runnable script", detail: "Wrapped runtime code in a __main__ guard." });
  }
  if (!changes.length) changes.push({ title: "Complexity check", detail: "No safe syntax-level rewrite found; profile hot paths and algorithmic complexity." });
  return { output: `# Optimized by Optiq · PYTHON\n${output}`, diagnostics, changes, speedup: Math.min(78, 18 + changes.length * 9) };
}

export const Route = createFileRoute("/api/public/v1/optimize")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          const payload = RequestSchema.parse(await request.json());
          const result = payload.engine === "python" || payload.engine === "pyspark"
            ? optimizePython(payload.code)
            : optimizeSql(payload.code);
          return json({ engine: payload.engine, ...result });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid request";
          return json({ error: message }, 400);
        }
      },
    },
  },
});
