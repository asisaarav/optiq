"use server";

import { z } from "zod";
import { ApiError, optimize, type OptimizeResult } from "@/lib/api";

const InputSchema = z.object({
  engine: z.string().min(1).max(40),
  code: z.string().min(1).max(50_000),
});

export type OptimizeState =
  | { status: "idle" }
  | { status: "ok"; result: OptimizeResult }
  | { status: "error"; message: string; requestId?: string };

/**
 * Server Action: the browser never talks to the Go API directly, so the API URL
 * and any future service credentials stay server-side and CORS stays closed.
 */
export async function optimizeAction(
  _prev: OptimizeState,
  formData: FormData,
): Promise<OptimizeState> {
  const parsed = InputSchema.safeParse({
    engine: formData.get("engine"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter some code and pick an engine (50 KB limit).",
    };
  }

  try {
    const result = await optimize(parsed.data.engine, parsed.data.code);
    return { status: "ok", result };
  } catch (err) {
    if (err instanceof ApiError) {
      return {
        status: "error",
        message: err.message,
        requestId: err.requestId,
      };
    }
    return {
      status: "error",
      message: "The optimizer is temporarily unavailable.",
    };
  }
}
