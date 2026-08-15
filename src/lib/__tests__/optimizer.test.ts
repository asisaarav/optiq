import { describe, expect, it } from "vitest";
import {
  SQL_ENGINES,
  SQL_SAMPLES,
  PY_SAMPLE,
  PYSPARK_SAMPLE,
  optimize,
  validate,
  validateSql,
  validatePython,
  highlight,
  escapeHtml,
} from "../optimizer";

/** Every string literal in the input must survive in the output (business-logic guard). */
function literals(s: string): string[] {
  const out: string[] = [];
  const re = /'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[0]);
  return out;
}

describe("SQL optimizer - all engines", () => {
  for (const engine of SQL_ENGINES) {
    it(`${engine}: produces a safe, non-empty rewrite for its sample`, () => {
      const r = optimize(SQL_SAMPLES[engine], engine);
      expect(r.output.trim().length).toBeGreaterThan(0);
      expect(r.changes.length).toBeGreaterThan(0);
      expect(r.speedup).toBeGreaterThanOrEqual(0);
      expect(r.speedup).toBeLessThanOrEqual(90);
      for (const lit of literals(SQL_SAMPLES[engine])) {
        expect(r.output).toContain(lit);
      }
    });
  }

  it("makes DATE(col) = 'x' SARGable (MySQL sample)", () => {
    const r = optimize(SQL_SAMPLES.MYSQL, "MYSQL");
    expect(r.output).toMatch(/created_at >= '2024-01-01' AND created_at < '2024-01-01'::date \+ 1/);
    expect(r.changes.some((c) => c.title === "SARGable predicate")).toBe(true);
  });

  it("rewrites ROWNUM to FETCH FIRST (Oracle)", () => {
    const r = optimize(SQL_SAMPLES.ORACLE, "ORACLE");
    expect(r.output).toMatch(/FETCH FIRST 100 ROWS ONLY/);
  });

  it("bounds _PARTITIONTIME (BigQuery)", () => {
    const r = optimize(SQL_SAMPLES.BIGQUERY, "BIGQUERY");
    expect(r.output).toMatch(/_PARTITIONTIME BETWEEN/);
  });

  it("switches UNION to UNION ALL", () => {
    const r = optimize("SELECT a FROM t1 UNION SELECT a FROM t2;", "POSTGRESQL");
    expect(r.output).toMatch(/UNION ALL/);
  });

  it("returns advisory-only with 0% when nothing can be safely rewritten", () => {
    const r = optimize(SQL_SAMPLES.POSTGRESQL, "POSTGRESQL");
    expect(r.speedup).toBe(0);
    expect(r.changes[0].title).toMatch(/Advisory only|No safe rewrite/);
  });

  it("never throws on garbage input", () => {
    for (const bad of ["", "   ", "SELECT", "((((", "'unterminated", "\u0000\u0001"]) {
      expect(() => optimize(bad, "POSTGRESQL")).not.toThrow();
    }
  });
});

describe("SQL validator", () => {
  it("flags common typos and dangling clauses", () => {
    const d = validateSql("SELCT id FORM users WEHRE;");
    const msgs = d.map((x) => x.message).join(" | ");
    expect(msgs).toMatch(/SELCT/);
    expect(msgs).toMatch(/FORM/);
    expect(msgs).toMatch(/WEHRE/);
  });
  it("flags unbalanced brackets and HAVING without GROUP BY", () => {
    const d = validateSql("SELECT count(*) FROM t WHERE (a = 1 HAVING x > 1;");
    const msgs = d.map((x) => x.message).join(" | ");
    expect(msgs).toMatch(/Unclosed '\('/);
    expect(msgs).toMatch(/HAVING used without GROUP BY/);
  });
  it("is clean on a well-formed query", () => {
    const d = validateSql("SELECT id, name FROM users WHERE status = 'active' LIMIT 10;");
    expect(d.filter((x) => x.severity === "error")).toHaveLength(0);
  });
});

describe("Python optimizer", () => {
  it("applies comprehension, sum() and __main__ guard on the sample", () => {
    const r = optimize(PY_SAMPLE, "PYTHON");
    const titles = r.changes.map((c) => c.title);
    expect(titles).toContain("List comprehension");
    expect(titles).toContain("Built-in sum()");
    expect(titles).toContain("Wrapped in __main__");
    expect(r.output).toMatch(/if __name__ == "__main__":/);
    expect(r.output).toMatch(/total = sum\(result\)/);
    expect(r.speedup).toBeGreaterThan(0);
  });
  it("rewrites identity/None and empty checks", () => {
    const r = optimize("if x == None:\n    pass\nif len(a) == 0:\n    pass\n", "PYTHON");
    expect(r.output).toMatch(/x is None/);
    expect(r.output).toMatch(/if not a:/);
  });
  it("validator catches missing colon and print statement", () => {
    const d = validatePython("if x\n    print 'hi'\n");
    const msgs = d.map((x) => x.message).join(" | ");
    expect(msgs).toMatch(/Missing ':'/);
    expect(msgs).toMatch(/print/);
  });
});

describe("PySpark optimizer", () => {
  it("chains the pipeline, pushes filters up and removes collect()", () => {
    const r = optimize(PYSPARK_SAMPLE, "PYSPARK");
    const titles = r.changes.map((c) => c.title);
    expect(titles).toContain("Predicate pushdown");
    expect(titles).toContain("Single chained pipeline");
    expect(titles).toContain("Avoid .collect()");
    const body = r.output
      .split("\n")
      .filter((l) => !l.startsWith("#"))
      .join("\n");
    expect(body).not.toMatch(/\.collect\(\)/);
    expect(r.output).toMatch(/\.show\(20, truncate=False\)/);
  });
  it("warns on toPandas and UDFs", () => {
    const d = validate("df.toPandas()", "PYSPARK");
    expect(d.some((x) => /toPandas/.test(x.message))).toBe(true);
    const r = optimize("from pyspark.sql.functions import udf\nf = udf(lambda x: x)\n", "PYSPARK");
    expect(r.changes.some((c) => c.title === "Replace Python UDF")).toBe(true);
  });
});

describe("highlighter (XSS-safe)", () => {
  it("escapes HTML before highlighting", () => {
    const html = highlight("SELECT '<script>alert(1)</script>' FROM t", "sql");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("wraps keywords, strings, numbers and comments", () => {
    const html = highlight("SELECT 1 -- c\nFROM t WHERE a = 'x'", "sql");
    expect(html).toMatch(/hl-kw/);
    expect(html).toMatch(/hl-num/);
    expect(html).toMatch(/hl-str/);
    expect(html).toMatch(/hl-com/);
  });
  it("does not clobber tokens with numeric placeholders (regression)", () => {
    const html = highlight("WHERE u.status = 'active' AND o.created_at > '2023-01-01'", "sql");
    expect(html).toContain("'active'");
    expect(html).toContain("'2023-01-01'");
  });
  it("escapeHtml handles all three specials", () => {
    expect(escapeHtml("<a & b>")).toBe("&lt;a &amp; b&gt;");
  });
});
