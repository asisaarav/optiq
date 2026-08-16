import { createServerFn } from "@tanstack/react-start";
import { SYSTEM, safetyCheck, AiInput, resolveAiConfig } from "./aiOptimize.server";

type Change = { title: string; detail: string; highlight?: boolean };
type AiResult = {
  output: string;
  changes: Change[];
  speedup: number;
  safetyWarning?: string;
  notes?: string;
  model: string;
};

export const aiOptimize = createServerFn({ method: "POST" })
  .validator((d: unknown) => AiInput.parse(d))
  .handler(async ({ data }): Promise<AiResult> => {
    const cfg = resolveAiConfig();
    if (!cfg) {
      throw new Error("The AI optimizer is not configured. Contact your administrator.");
    }
    const { apiKey, baseUrl, model } = cfg;
    const userMsg = `Engine: ${data.engine}\n\nCode to optimize:\n\`\`\`\n${data.code}\n\`\`\``;

    // OpenAI-compatible chat completions. Works with OpenAI, Gemini's OpenAI endpoint,
    // OpenRouter, Groq, Together, or a self-hosted gateway - controlled purely by env.
    const callProvider = async (): Promise<string> => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) throw new Error("RETRYABLE:rate-limited");
        if (res.status === 401 || res.status === 403)
          throw new Error("AI provider rejected the API key. Check server configuration.");
        if (res.status === 402) throw new Error("AI provider credits exhausted.");
        if (res.status >= 500) throw new Error(`RETRYABLE:provider-${res.status}`);
        throw new Error(`AI provider error (${res.status}): ${text.slice(0, 200)}`);
      }

      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content ?? "{}";
    };

    type Parsed = { output?: string; changes?: Change[]; speedup?: number; notes?: string };

    // Up to 3 attempts with backoff: transient rate limits, 5xx, timeouts, and
    // malformed JSON responses are all recoverable.
    let parsed: Parsed | null = null;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * attempt));
      try {
        const raw = await callProvider();
        const cleaned = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
        const candidate = JSON.parse(cleaned) as Parsed;
        if (!(candidate.output ?? "").trim()) throw new Error("RETRYABLE:empty-output");
        parsed = candidate;
        break;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        const retryable =
          err.message.startsWith("RETRYABLE:") ||
          err instanceof SyntaxError ||
          err.name === "TimeoutError" ||
          err.name === "AbortError";
        lastError = err;
        if (!retryable) throw err;
      }
    }

    if (!parsed) {
      const reason = lastError?.message.replace("RETRYABLE:", "") ?? "unknown";
      throw new Error(`AI optimizer unavailable after 3 attempts (${reason}) — original kept.`);
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

    const unchanged = output === data.code.trim();
    return {
      output,
      changes: Array.isArray(parsed.changes) ? parsed.changes.slice(0, 8) : [],
      speedup: unchanged
        ? 0
        : typeof parsed.speedup === "number"
          ? Math.max(0, Math.min(90, parsed.speedup))
          : 0,
      notes: parsed.notes,
      model,
    };
  });
