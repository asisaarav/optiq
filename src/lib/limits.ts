/** Shared input limits so a huge paste can never lock the UI or the runtimes. */
export const MAX_EDITOR_CHARS = 100_000;
export const MAX_JSON_CHARS = 400_000;
export const MAX_FIXTURE_CHARS = 200_000;
export const MAX_DATA_ROWS = 5_000;
export const MIN_DATA_ROWS = 1;
export const PY_TIMEOUT_MS = 15_000;

export type CapResult = { value: string; truncated: boolean; limit: number };

/** Hard-caps a pasted string, reporting whether anything was dropped. */
export function capText(next: string, limit = MAX_EDITOR_CHARS): CapResult {
  if (next.length <= limit) return { value: next, truncated: false, limit };
  return { value: next.slice(0, limit), truncated: true, limit };
}

export function capMessage(limit: number) {
  return `Input capped at ${limit.toLocaleString()} characters — the rest was trimmed to keep the editor responsive.`;
}

/** Clamps a row count to a safe, finite integer. */
export function clampRows(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return MIN_DATA_ROWS;
  return Math.min(MAX_DATA_ROWS, Math.max(MIN_DATA_ROWS, Math.trunc(n)));
}
