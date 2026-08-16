import { describe, expect, it } from "vitest";
import { beautify, detectLanguage, beautifyXml } from "../beautify";
import { diffLines } from "../diff";

describe("language detection", () => {
  const cases: Array<[string, string]> = [
    ['{"a":1,"b":[2,3]}', "json"],
    ["SELECT * FROM users WHERE id = 1;", "sql"],
    ["  with cte as (select 1) select * from cte", "sql"],
    ["def main():\n    print('hi')", "python"],
    ["interface User { name: string }", "typescript"],
    ["const x = () => 42;", "javascript"],
    [".btn { color: red; }", "css"],
    ["<!doctype html><html><body>hi</body></html>", "html"],
    ["<?xml version='1.0'?><root><a>1</a></root>", "xml"],
    ["name: test\nversion: 1\nitems:\n  - a\n  - b", "yaml"],
    ["# Title\n\n- one\n- two", "markdown"],
    ["", "unknown"],
  ];
  for (const [input, expected] of cases) {
    it(`detects ${expected}`, () => {
      expect(detectLanguage(input)).toBe(expected);
    });
  }
});

describe("beautify", () => {
  it("formats minified JSON with 2-space indent", async () => {
    const r = await beautify('{"a":1,"nested":{"b":2}}', "json");
    expect(r.ok).toBe(true);
    expect(r.output).toContain('  "a": 1');
    expect(r.output).toContain('  "nested": {');
  });

  it("uppercases SQL keywords and breaks clauses", async () => {
    const r = await beautify(
      "select id,name from users where status='active'",
      "sql",
      {
        sqlDialect: "postgresql",
      },
    );
    expect(r.ok).toBe(true);
    expect(r.output).toMatch(/SELECT/);
    expect(r.output).toMatch(/FROM/);
    expect(r.output).toMatch(/WHERE/);
  });

  it("formats CSS via prettier", async () => {
    const r = await beautify(".a{color:red;margin:0}", "css");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("color: red;");
  });

  it("formats TypeScript via prettier", async () => {
    const r = await beautify("const f=(x:number):number=>x*2", "typescript");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("const f = (x: number): number => x * 2;");
  });

  it("reindents YAML", async () => {
    const r = await beautify("a: 1\nb:\n- x\n- y", "yaml");
    expect(r.ok).toBe(true);
    expect(r.output).toContain("b:");
  });

  it("indents inline XML", () => {
    const out = beautifyXml("<root><a>1</a><b>2</b></root>");
    expect(out).toContain("<root>");
    expect(out.split("\n").length).toBeGreaterThan(3);
  });

  it("never throws on invalid JSON - returns ok:false with original preserved", async () => {
    const bad = '{"a":}';
    const r = await beautify(bad, "json");
    expect(r.ok).toBe(false);
    expect(r.output).toBe(bad);
    expect(r.error).toBeDefined();
  });

  it("returns empty input untouched", async () => {
    const r = await beautify("   ", "sql");
    expect(r.ok).toBe(true);
  });
});

describe("diff", () => {
  it("detects identical inputs", () => {
    const r = diffLines("a\nb\nc", "a\nb\nc");
    expect(r.identical).toBe(true);
    expect(r.stats).toEqual({ added: 0, removed: 0, unchanged: 3 });
  });

  it("reports added and removed lines", () => {
    const r = diffLines("a\nb\nc", "a\nx\nc\nd");
    expect(r.stats.removed).toBe(1);
    expect(r.stats.added).toBe(2);
    expect(r.stats.unchanged).toBe(2);
    expect(r.identical).toBe(false);
  });

  it("assigns line numbers per side", () => {
    const r = diffLines("a\nb", "a\nb\nc");
    const added = r.rows.find((row) => row.op === "added");
    expect(added?.rightLine).toBe(3);
    expect(added?.right).toBe("c");
  });

  it("ignores whitespace when asked", () => {
    const r = diffLines("select 1", "  select 1  ", { ignoreWhitespace: true });
    expect(r.identical).toBe(true);
  });

  it("ignores case when asked", () => {
    const r = diffLines("SELECT", "select", { ignoreCase: true });
    expect(r.identical).toBe(true);
  });

  it("handles one empty side", () => {
    const r = diffLines("", "a\nb");
    expect(r.stats.added).toBe(2);
    expect(r.stats.removed).toBe(0);
  });
});
