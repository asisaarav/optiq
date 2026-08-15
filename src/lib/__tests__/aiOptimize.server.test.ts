import { afterEach, describe, expect, it } from "vitest";
import { AiInput, resolveAiConfig, safetyCheck } from "../aiOptimize.server";

describe("AiInput schema", () => {
  it("accepts a valid payload", () => {
    expect(AiInput.safeParse({ engine: "POSTGRESQL", code: "SELECT 1;" }).success).toBe(true);
  });
  it("rejects empty code and oversized code", () => {
    expect(AiInput.safeParse({ engine: "POSTGRESQL", code: "" }).success).toBe(false);
    expect(AiInput.safeParse({ engine: "POSTGRESQL", code: "x".repeat(20_001) }).success).toBe(
      false,
    );
  });
});

describe("safetyCheck - business logic guard", () => {
  it("passes when literals and structure are preserved", () => {
    const input = "SELECT * FROM t WHERE status = 'active' AND id > 10";
    const output = "SELECT id, status FROM t WHERE status = 'active' AND id > 10";
    expect(safetyCheck(input, output)).toBeUndefined();
  });
  it("rejects when a literal is dropped", () => {
    const input = "SELECT * FROM t WHERE status = 'active'";
    const output = "SELECT * FROM t";
    expect(safetyCheck(input, output)).toMatch(/literal/i);
  });
  it("rejects INNER->LEFT join drift", () => {
    const input = "SELECT * FROM a JOIN b ON a.id = b.a_id";
    const output = "SELECT * FROM a LEFT JOIN b ON a.id = b.a_id";
    expect(safetyCheck(input, output)).toMatch(/JOIN type/);
  });
  it("rejects added DISTINCT", () => {
    const input = "SELECT name FROM t";
    const output = "SELECT DISTINCT name FROM t";
    expect(safetyCheck(input, output)).toMatch(/DISTINCT/);
  });
  it("rejects wrapping a column in a function", () => {
    const input = "SELECT * FROM t WHERE email = 'a@b.c'";
    const output = "SELECT * FROM t WHERE LOWER(email) = 'a@b.c'";
    expect(safetyCheck(input, output)).toMatch(/LOWER/);
  });
});

describe("resolveAiConfig", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it("returns null when AI_API_KEY is missing", () => {
    delete process.env.AI_API_KEY;
    expect(resolveAiConfig()).toBeNull();
  });
  it("applies defaults and trims trailing slashes", () => {
    process.env.AI_API_KEY = "k";
    process.env.AI_BASE_URL = "https://example.com/v1///";
    delete process.env.AI_MODEL;
    expect(resolveAiConfig()).toEqual({
      apiKey: "k",
      baseUrl: "https://example.com/v1",
      model: "gpt-4o-mini",
    });
  });
});
