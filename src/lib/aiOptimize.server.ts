import { z } from "zod";

export const AiInput = z.object({
  engine: z.string().min(1).max(40),
  code: z.string().min(1).max(20000),
});

export const SYSTEM = `You are Optiq, a senior database & data-engineering expert.
You optimize SQL / Python / PySpark code for a specific engine.

HARD RULES (must follow — violating any voids the rewrite):
1. NEVER change business logic. Preserve every literal value, predicate, column, table, alias, and join semantics.
2. DO NOT add, remove, weaken, or strengthen any WHERE/ON/HAVING predicate. The set of rows returned must be identical.
3. DO NOT change JOIN types (INNER↔LEFT/RIGHT/FULL). DO NOT add DISTINCT, GROUP BY, or LIMIT that weren't in the input.
4. DO NOT wrap a bare column in a function (LOWER/UPPER/TRIM/YEAR/DATE/CAST/COALESCE) that wasn't already wrapped — that changes semantics AND blocks indexes.
5. DO NOT rewrite a date range like \`col >= 'YYYY-01-01' AND col < 'YYYY+1-01-01'\` into \`YEAR(col)=YYYY\` (the range form is SARGable and faster).
6. Safe rewrites you MAY apply: predicate pushdown (move existing predicates earlier without changing them), projection pruning (replace SELECT * with the columns actually consumed), UNION→UNION ALL when duplicates aren't required, CTE/subquery flattening that preserves output, vectorization, broadcast hints, partition/cluster hints, removing antipatterns (range(len()), manual sums, etc.).
7. If the input is already efficient OR you cannot find a rewrite that obeys rules 1–6, return the input UNCHANGED with an empty changes array and notes="already efficient".
8. Output MUST be valid JSON matching the schema. No prose outside JSON. No markdown fences.
9. Keep "output" runnable / executable. No placeholder comments like "// ... rest of code".

Return JSON:
{
  "output": "<full optimized code>",
  "changes": [{"title": "short label", "detail": "1-line rationale"}],
  "speedup": <integer 0-90>,
  "notes": "<optional 1-line caveat or empty string>"
}`;

function extractLiterals(s: string): string[] {
  const out: string[] = [];
  const re = /'([^']*)'|"([^"]*)"|\b\d+(?:\.\d+)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[0]);
  return out;
}

export function safetyCheck(input: string, output: string): string | undefined {
  const inLits = extractLiterals(input);
  const missing = inLits.filter((l) => l.length > 0 && !output.includes(l));
  if (missing.length > 0) {
    return `Rejected: literal(s) missing in optimized output: ${missing.slice(0, 3).join(", ")}`;
  }
  // Structural drift checks — semantics-changing edits the literal check can't catch.
  const norm = (s: string) => s.replace(/\s+/g, " ").toUpperCase();
  const I = norm(input);
  const O = norm(output);
  const count = (s: string, re: RegExp) => (s.match(re) || []).length;
  if (count(O, /\bLEFT JOIN\b/g) > count(I, /\bLEFT JOIN\b/g) && /\bINNER JOIN\b|\bJOIN\b/.test(I)) {
    return "Rejected: JOIN type changed (INNER→LEFT) — would change row semantics.";
  }
  if (/\bSELECT DISTINCT\b/.test(O) && !/\bSELECT DISTINCT\b/.test(I)) {
    return "Rejected: DISTINCT was added — would change duplicate semantics.";
  }
  const fns = ["LOWER", "UPPER", "TRIM", "YEAR", "MONTH", "DAY", "DATE", "CAST", "COALESCE"];
  for (const fn of fns) {
    const re = new RegExp(`\\b${fn}\\s*\\(`, "g");
    if (count(O, re) > count(I, re)) {
      return `Rejected: added ${fn}(...) on a column — changes semantics and blocks indexes.`;
    }
  }
  return undefined;
}
