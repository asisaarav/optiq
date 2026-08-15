import { describe, expect, it } from "vitest";
import { MAX_DATA_ROWS, MAX_EDITOR_CHARS, capText, clampRows } from "../limits";

describe("input limits", () => {
  it("caps oversized editor text and flags truncation", () => {
    const r = capText("a".repeat(MAX_EDITOR_CHARS + 50), MAX_EDITOR_CHARS);
    expect(r.truncated).toBe(true);
    expect(r.value.length).toBe(MAX_EDITOR_CHARS);
  });
  it("leaves small text untouched", () => {
    const r = capText("hello", MAX_EDITOR_CHARS);
    expect(r.truncated).toBe(false);
    expect(r.value).toBe("hello");
  });
  it("clamps data-builder row counts into range", () => {
    expect(clampRows(999_999)).toBe(MAX_DATA_ROWS);
    expect(clampRows(-5)).toBeGreaterThanOrEqual(1);
    expect(clampRows("abc")).toBeGreaterThanOrEqual(1);
  });
});
