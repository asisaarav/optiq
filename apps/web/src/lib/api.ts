import { z } from "zod";

/**
 * Typed client for the OPTIQ Go API. Every response is parsed with zod, so a
 * backend contract change surfaces as a clear error instead of an undefined
 * field rendering as "undefined" in the UI.
 */

export const DiagnosticSchema = z.object({
  severity: z.enum(["error", "warn"]),
  line: z.number().int().optional(),
  message: z.string(),
});

export const ChangeSchema = z.object({
  title: z.string(),
  detail: z.string(),
  highlight: z.boolean().optional(),
});

export const ResultSchema = z.object({
  engine: z.string(),
  output: z.string(),
  changes: z.array(ChangeSchema),
  diagnostics: z.array(DiagnosticSchema),
  speedup: z.number().int().min(0).max(90),
  rejected: z.string().optional(),
});

export const EngineSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["sql", "runtime"]),
  sql: z.boolean(),
});

export const EnginesResponseSchema = z.object({
  engines: z.array(EngineSchema),
});

export type Diagnostic = z.infer<typeof DiagnosticSchema>;
export type Change = z.infer<typeof ChangeSchema>;
export type OptimizeResult = z.infer<typeof ResultSchema>;
export type EngineInfo = z.infer<typeof EngineSchema>;

/** Error shape returned by every API endpoint. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const ErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string().optional(),
  }),
});

function baseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL;
  if (!url) throw new Error("NEXT_PUBLIC_API_URL is not configured");
  return url.replace(/\/+$/, "");
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    throw new ApiError(
      0,
      "network_error",
      "Could not reach the optimizer service.",
      undefined,
    );
  }

  const text = await res.text();
  if (!res.ok) {
    const parsed = ErrorSchema.safeParse(safeJson(text));
    if (parsed.success) {
      const { code, message, request_id } = parsed.data.error;
      throw new ApiError(res.status, code, message, request_id);
    }
    throw new ApiError(
      res.status,
      "unexpected_error",
      `Request failed with status ${res.status}.`,
    );
  }

  const parsed = schema.safeParse(safeJson(text));
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      "invalid_response",
      "The optimizer returned an unexpected shape.",
    );
  }
  return parsed.data;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Optimize a query or script for the given engine. */
export function optimize(
  engine: string,
  code: string,
): Promise<OptimizeResult> {
  return request("/v1/optimize", ResultSchema, {
    method: "POST",
    body: JSON.stringify({ engine, code }),
  });
}

/** Validate without rewriting. */
export function validate(engine: string, code: string) {
  return request(
    "/v1/validate",
    z.object({ engine: z.string(), diagnostics: z.array(DiagnosticSchema) }),
    { method: "POST", body: JSON.stringify({ engine, code }) },
  );
}

/** List supported engines. Cached on the server for a minute. */
export function listEngines(): Promise<{ engines: EngineInfo[] }> {
  return request("/v1/engines", EnginesResponseSchema, {
    method: "GET",
    next: { revalidate: 60 },
  } as RequestInit);
}
