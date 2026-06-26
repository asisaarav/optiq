import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  engine: z.string().min(1).max(40),
  code: z.string().min(1).max(20000),
});

type Change = { title: string; detail: string; highlight?: boolean };
type AiResult = {
  output: string;
  changes: Change[];
  speedup: number;
  safetyWarning?: string;
  notes?: string;
  model: string;
};

const SYSTEM = `You are Optiq, a senior database & data-engineering expert.
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

function safetyCheck(input: string, output: string): string | undefined {
  const inLits = extractLiterals(input);
  const outStr = output;
  const missing = inLits.filter((l) => l.length > 0 && !outStr.includes(l));
  if (missing.length > 0) {
    return `Rejected: literal(s) missing in optimized output: ${missing.slice(0, 3).join(", ")}`;
  }
  return undefined;
}

export const aiOptimize = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<AiResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      throw new Error("AI Gateway not configured (LOVABLE_API_KEY missing).");
    }

    const model = "google/gemini-3-flash-preview";
    const userMsg = `Engine: ${data.engine}\n\nCode to optimize:\n\`\`\`\n${data.code}\n\`\`\``;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "custom-fetch",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("AI rate limit — please wait a moment and retry.");
      if (res.status === 402) throw new Error("AI credits exhausted — top up workspace credits.");
      throw new Error(`AI Gateway error (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";

    let parsed: {
      output?: string;
      changes?: Change[];
      speedup?: number;
      notes?: string;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("AI returned malformed JSON; try again.");
    }

    const output = (parsed.output ?? "").trim();
    if (!output) throw new Error("AI returned an empty optimization.");

    const warning = safetyCheck(data.code, output);
    if (warning) {
      // Reject the AI rewrite, return the original with the warning surfaced.
      return {
        output: data.code.trim(),
        changes: [
          {
            title: "AI rewrite rejected",
            detail: "Business-logic safety guard caught a literal drift; original preserved.",
          },
        ],
        speedup: 0,
        safetyWarning: warning,
        notes: parsed.notes,
        model,
      };
    }

    return {
      output,
      changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 8) : [],
      speedup:
        typeof parsed.speedup === "number" ? Math.max(0, Math.min(90, parsed.speedup)) : 0,
      notes: parsed.notes,
      model,
    };
  });
