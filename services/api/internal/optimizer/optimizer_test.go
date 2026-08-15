package optimizer

import (
	"regexp"
	"strings"
	"testing"
)

var samples = map[Engine]string{
	PostgreSQL: "SELECT u.name, o.total\nFROM users u\nJOIN orders o ON u.id = o.user_id\nWHERE o.created_at > '2023-01-01'\nAND u.status = 'active'\nORDER BY o.total DESC\nLIMIT 10;",
	MySQL:      "SELECT * FROM orders\nWHERE DATE(created_at) = '2024-01-01'\nAND status = 'pending';",
	Oracle:     "SELECT e.name, d.dept_name\nFROM employees e, departments d\nWHERE e.dept_id = d.id\nAND ROWNUM <= 100;",
	PLSQL:      "BEGIN\n  FOR r IN (SELECT id FROM orders WHERE status='new') LOOP\n    UPDATE orders SET status='processed' WHERE id = r.id;\n  END LOOP;\n  COMMIT;\nEND;",
	SQLServer:  "SELECT TOP 10 *\nFROM dbo.Orders WITH (NOLOCK)\nWHERE CreatedAt > '2024-01-01';",
	Snowflake:  "SELECT * FROM events\nWHERE event_date BETWEEN '2024-01-01' AND '2024-12-31'\nQUALIFY ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY ts DESC) = 1;",
	BigQuery:   "SELECT user_id, COUNT(*) c\nFROM `proj.ds.events`\nWHERE _PARTITIONTIME IS NOT NULL\nGROUP BY user_id;",
	Redshift:   "SELECT * FROM sales\nWHERE region = 'EU'\nORDER BY revenue DESC;",
	Databricks: "SELECT customer_id, sum(amount)\nFROM bronze.transactions\nWHERE date >= '2024-01-01'\nGROUP BY customer_id;",
	ClickHouse: "SELECT user_id, count()\nFROM events\nWHERE event_date >= today() - 30\nGROUP BY user_id\nORDER BY count() DESC;",
}

const pySample = `items = [{"active": True, "value": 3}, {"active": False, "value": 5}]

result = []
for i in range(len(items)):
    if items[i]["active"] == True:
        result.append(items[i]["value"] * 2)
total = 0
for v in result:
    total = total + v
print("total:", total)`

const sparkSample = `df = spark.read.parquet("s3://bucket/events")
df = df.filter(df.country == "US")
df = df.withColumn("ts", df.ts.cast("timestamp"))
result = df.groupBy("user_id").count().collect()
for row in result:
    print(row)`

func hasChange(changes []Change, title string) bool {
	for _, c := range changes {
		if c.Title == title {
			return true
		}
	}
	return false
}

func codeBody(out string) string {
	var lines []string
	for _, l := range strings.Split(out, "\n") {
		if !strings.HasPrefix(l, "#") {
			lines = append(lines, l)
		}
	}
	return strings.Join(lines, "\n")
}

func TestEveryEngineProducesSafeOutput(t *testing.T) {
	for engine, src := range samples {
		engine, src := engine, src
		t.Run(string(engine), func(t *testing.T) {
			got := Optimize(src, engine)
			if strings.TrimSpace(got.Output) == "" {
				t.Fatal("output is empty")
			}
			if len(got.Changes) == 0 {
				t.Fatal("expected at least one change or advisory")
			}
			if got.Speedup < 0 || got.Speedup > 90 {
				t.Fatalf("speedup %d out of range", got.Speedup)
			}
			for _, lit := range regexp.MustCompile(`'[^']*'`).FindAllString(src, -1) {
				if !strings.Contains(got.Output, lit) {
					t.Fatalf("literal %s was dropped from the rewrite", lit)
				}
			}
			if got.Rejected != "" {
				t.Fatalf("safety guard rejected its own sample: %s", got.Rejected)
			}
		})
	}
}

func TestSQLRewrites(t *testing.T) {
	t.Run("mysql date predicate becomes sargable", func(t *testing.T) {
		got := Optimize(samples[MySQL], MySQL)
		if !strings.Contains(got.Output, "created_at >= '2024-01-01' AND created_at < '2024-01-01'::date + 1") {
			t.Fatalf("no SARGable rewrite:\n%s", got.Output)
		}
		if !hasChange(got.Changes, "SARGable predicate") {
			t.Fatal("missing SARGable change entry")
		}
		if got.Speedup == 0 {
			t.Fatal("a real rewrite should report a non-zero speedup")
		}
	})

	t.Run("oracle rownum becomes fetch first", func(t *testing.T) {
		got := Optimize(samples[Oracle], Oracle)
		if !strings.Contains(got.Output, "FETCH FIRST 100 ROWS ONLY") {
			t.Fatalf("no FETCH FIRST rewrite:\n%s", got.Output)
		}
	})

	t.Run("bigquery partition time is bounded", func(t *testing.T) {
		got := Optimize(samples[BigQuery], BigQuery)
		if !strings.Contains(got.Output, "_PARTITIONTIME BETWEEN") {
			t.Fatalf("partition not pruned:\n%s", got.Output)
		}
	})

	t.Run("union becomes union all exactly once", func(t *testing.T) {
		got := Optimize("SELECT a FROM t1 UNION SELECT a FROM t2;", PostgreSQL)
		if strings.Count(got.Output, "UNION ALL") != 1 {
			t.Fatalf("expected one UNION ALL, got:\n%s", got.Output)
		}
	})

	t.Run("existing union all is left alone", func(t *testing.T) {
		src := "SELECT a FROM t1 UNION ALL SELECT a FROM t2;"
		got := Optimize(src, PostgreSQL)
		if strings.Contains(got.Output, "UNION ALL ALL") {
			t.Fatalf("double-applied rule:\n%s", got.Output)
		}
	})

	t.Run("advisory only keeps speedup honest", func(t *testing.T) {
		got := Optimize(samples[PostgreSQL], PostgreSQL)
		if got.Speedup != 0 {
			t.Fatalf("unchanged text must report 0%%, got %d", got.Speedup)
		}
		if !strings.HasPrefix(got.Changes[0].Title, "Advisory only") && got.Changes[0].Title != "No safe rewrite" {
			t.Fatalf("unexpected leading change %q", got.Changes[0].Title)
		}
	})

	t.Run("clickhouse gets a prewhere hint", func(t *testing.T) {
		got := Optimize(samples[ClickHouse], ClickHouse)
		if !hasChange(got.Changes, "PREWHERE candidate") {
			t.Fatal("expected PREWHERE advice for ClickHouse")
		}
	})

	t.Run("engine scoping keeps rules off other dialects", func(t *testing.T) {
		got := Optimize(samples[ClickHouse], PostgreSQL)
		if hasChange(got.Changes, "PREWHERE candidate") {
			t.Fatal("ClickHouse-only rule leaked into PostgreSQL")
		}
	})
}

func TestOptimizeNeverPanics(t *testing.T) {
	for _, bad := range []string{"", "   ", "SELECT", "((((", "'unterminated", "\x00\x01", strings.Repeat("SELECT ", 500)} {
		for _, e := range Engines {
			if got := Optimize(bad, e); got.Output == "" && strings.TrimSpace(bad) != "" {
				t.Fatalf("engine %s dropped input %q", e, bad)
			}
		}
	}
}

func TestSQLValidator(t *testing.T) {
	msgs := func(ds []Diagnostic) string {
		var b []string
		for _, d := range ds {
			b = append(b, d.Message)
		}
		return strings.Join(b, " | ")
	}

	got := msgs(ValidateSQL("SELCT id FORM users WEHRE;"))
	for _, want := range []string{"SELCT", "FORM", "WEHRE"} {
		if !strings.Contains(got, want) {
			t.Fatalf("typo %s not reported in %q", want, got)
		}
	}

	got = msgs(ValidateSQL("SELECT count(*) FROM t WHERE (a = 1 HAVING x > 1;"))
	if !strings.Contains(got, `Unclosed "("`) {
		t.Fatalf("unbalanced bracket not reported: %s", got)
	}
	if !strings.Contains(got, "HAVING used without GROUP BY") {
		t.Fatalf("HAVING rule not reported: %s", got)
	}

	clean := ValidateSQL("SELECT id, name FROM users WHERE status = 'active' LIMIT 10;")
	for _, d := range clean {
		if d.Severity == SeverityError {
			t.Fatalf("false positive on a valid query: %s", d.Message)
		}
	}

	if len(ValidateSQL("SELECT id FROM t WHERE note = 'a (b';")) > 0 {
		t.Fatal("bracket inside a string literal must not be flagged")
	}
}

func TestPythonOptimizer(t *testing.T) {
	got := Optimize(pySample, Python)
	for _, want := range []string{"List comprehension", "Built-in sum()", "Wrapped in __main__"} {
		if !hasChange(got.Changes, want) {
			t.Fatalf("missing change %q in %+v", want, got.Changes)
		}
	}
	if !strings.Contains(got.Output, `if __name__ == "__main__":`) {
		t.Fatalf("no main guard:\n%s", got.Output)
	}
	if !strings.Contains(got.Output, "total = sum(result)") {
		t.Fatalf("accumulator not rewritten:\n%s", got.Output)
	}
	if got.Speedup == 0 {
		t.Fatal("real Python rewrite should report a speedup")
	}

	got = Optimize("if x == None:\n    pass\nif len(a) == 0:\n    pass\n", Python)
	if !strings.Contains(got.Output, "x is None") || !strings.Contains(got.Output, "not a") {
		t.Fatalf("identity/empty rewrites missing:\n%s", got.Output)
	}
}

func TestPythonValidator(t *testing.T) {
	var msgs []string
	for _, d := range ValidatePython("if x\n    print 'hi'\n") {
		msgs = append(msgs, d.Message)
	}
	joined := strings.Join(msgs, " | ")
	if !strings.Contains(joined, "Missing ':'") || !strings.Contains(joined, "print") {
		t.Fatalf("python validator missed findings: %s", joined)
	}
}

func TestPySparkOptimizer(t *testing.T) {
	got := Optimize(sparkSample, PySpark)
	for _, want := range []string{"Predicate pushdown", "Single chained pipeline", "Avoid .collect()"} {
		if !hasChange(got.Changes, want) {
			t.Fatalf("missing change %q", want)
		}
	}
	if collectRe.MatchString(codeBody(got.Output)) {
		t.Fatalf("collect() survived in the code body:\n%s", got.Output)
	}
	if !strings.Contains(got.Output, ".show(20, truncate=False)") {
		t.Fatalf("no distributed replacement for collect():\n%s", got.Output)
	}

	got = Optimize("from pyspark.sql.functions import udf\nf = udf(lambda x: x)\n", PySpark)
	if !hasChange(got.Changes, "Replace the Python UDF") {
		t.Fatal("UDF advice missing")
	}
}

func TestGuard(t *testing.T) {
	cases := []struct {
		name, in, out, want string
	}{
		{"preserved", "SELECT * FROM t WHERE status = 'active' AND id > 10", "SELECT id, status FROM t WHERE status = 'active' AND id > 10", ""},
		{"dropped literal", "SELECT * FROM t WHERE status = 'active'", "SELECT * FROM t", "literal"},
		{"join drift", "SELECT * FROM a JOIN b ON a.id = b.a_id", "SELECT * FROM a LEFT JOIN b ON a.id = b.a_id", "JOIN type"},
		{"added distinct", "SELECT name FROM t", "SELECT DISTINCT name FROM t", "DISTINCT"},
		{"wrapped column", "SELECT * FROM t WHERE email = 'a@b.c'", "SELECT * FROM t WHERE LOWER(email) = 'a@b.c'", "LOWER"},
		{"dropped number", "SELECT * FROM t LIMIT 10", "SELECT * FROM t", "literal 10"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := Guard(c.in, c.out)
			if c.want == "" && got != "" {
				t.Fatalf("expected pass, got %q", got)
			}
			if c.want != "" && !strings.Contains(got, c.want) {
				t.Fatalf("expected rejection containing %q, got %q", c.want, got)
			}
		})
	}
}

func TestEngineMetadata(t *testing.T) {
	if Engine("mongodb").Valid() {
		t.Fatal("unknown engine reported valid")
	}
	if !PostgreSQL.IsSQL() || Python.IsSQL() {
		t.Fatal("IsSQL classification is wrong")
	}
	if PLSQL.Display() != "PL/SQL" || Databricks.Display() != "Databricks SQL" {
		t.Fatal("display names are wrong")
	}
}

func FuzzOptimize(f *testing.F) {
	f.Add("SELECT * FROM t;")
	f.Add("for i in range(len(x)):\n    pass")
	f.Fuzz(func(t *testing.T, src string) {
		for _, e := range Engines {
			_ = Optimize(src, e) // must never panic
		}
	})
}
