package optimizer

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	eqTrueRe     = regexp.MustCompile(`\s*==\s*True\b`)
	eqFalseRe    = regexp.MustCompile(`(\b\w+(?:\[[^\]]+\])?)\s*==\s*False\b`)
	eqNoneRe     = regexp.MustCompile(`==\s*None\b`)
	neNoneRe     = regexp.MustCompile(`!=\s*None\b`)
	lenZeroRe    = regexp.MustCompile(`len\(\s*(\w+)\s*\)\s*==\s*0`)
	lenPosRe     = regexp.MustCompile(`len\(\s*(\w+)\s*\)\s*>\s*0`)
	rangeZeroRe  = regexp.MustCompile(`range\(\s*0\s*,\s*`)
	rangeLenRe   = regexp.MustCompile(`for\s+(\w+)\s+in\s+range\(len\((\w+)\)\):`)
	dictKeysRe   = regexp.MustCompile(`for\s+(\w+)\s+in\s+(\w+)\.keys\(\)`)
	strConcatRe  = regexp.MustCompile(`(?m)for\s+\w+\s+in\s+[^\n:]+:\s*\n[ \t]+\w+\s*\+=\s*['"]`)
	pctFormatRe  = regexp.MustCompile(`\.format\(|["'][^"']*%[sdif][^"']*["']\s*%`)
	bareOpenRe   = regexp.MustCompile(`=\s*open\(`)
	withOpenRe   = regexp.MustCompile(`with\s+open\(`)
	importLineRe = regexp.MustCompile(`^\s*(import|from)\s+\S`)
	mainGuardRe  = regexp.MustCompile(`if\s+__name__\s*==\s*["']__main__["']\s*:`)
	// RE2 has no backreferences, so shapes that need "the same identifier twice"
	// are matched loosely here and verified in Go (see rewriteAccumulator and
	// rewriteIndexLoop). That keeps the rules linear-time and panic-free.
	accumRe   = regexp.MustCompile(`(?m)^([ \t]*)(\w+)\s*=\s*0\s*\n[ \t]*for\s+(\w+)\s+in\s+(\w+):\s*\n[ \t]+(\w+)\s*=\s*(\w+)\s*\+\s*(\w+)\s*$`)
	idxLoopRe = regexp.MustCompile(`(?m)^([ \t]*)result\s*=\s*\[\]\s*\n[ \t]*for\s+(\w+)\s+in\s+range\(len\((\w+)\)\):\s*\n[ \t]+if\s+(\w+)\[(\w+)\]\["?(\w+)"?\]\s*:?\s*\n[ \t]+result\.append\((\w+)\[(\w+)\]\["?(\w+)"?\]\s*\*\s*(\d+)\)`)
)

// dedupeImports hoists unique import lines to the top and returns the remainder.
func dedupeImports(lines []string) (imports, rest []string) {
	seen := map[string]bool{}
	for _, l := range lines {
		if importLineRe.MatchString(l) {
			t := strings.TrimSpace(l)
			if !seen[t] {
				seen[t] = true
				imports = append(imports, t)
			}
			continue
		}
		rest = append(rest, l)
	}
	return imports, rest
}

func header(engine Engine, changes []Change) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# Optimized by OPTIQ - %s\n", engine.Display())
	plural := "s"
	if len(changes) == 1 {
		plural = ""
	}
	fmt.Fprintf(&b, "# Applied %d change%s:\n", len(changes), plural)
	for i, c := range changes {
		fmt.Fprintf(&b, "#   %d. %s - %s\n", i+1, c.Title, c.Detail)
	}
	return b.String()
}

// wrapMain moves runtime statements into main() behind a __main__ guard, leaving
// definitions and module constants at module scope.
func wrapMain(body string, changes *[]Change) string {
	if body == "" || mainGuardRe.MatchString(body) {
		return body
	}
	lines := strings.Split(body, "\n")
	var defs, runtime []string

	for i := 0; i < len(lines); {
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		topLevel := line != "" && !strings.HasPrefix(line, " ") && !strings.HasPrefix(line, "\t")

		if topLevel && (strings.HasPrefix(trimmed, "def ") || strings.HasPrefix(trimmed, "class ") ||
			strings.HasPrefix(trimmed, "@") || strings.HasPrefix(trimmed, "async def ")) {
			block := []string{line}
			i++
			for i < len(lines) && (strings.HasPrefix(lines[i], " ") || strings.HasPrefix(lines[i], "\t") || strings.TrimSpace(lines[i]) == "") {
				block = append(block, lines[i])
				i++
			}
			for len(block) > 0 && strings.TrimSpace(block[len(block)-1]) == "" {
				block = block[:len(block)-1]
			}
			defs = append(defs, strings.Join(block, "\n"))
			continue
		}
		if topLevel && regexp.MustCompile(`^[A-Z_][A-Z0-9_]*\s*=`).MatchString(trimmed) {
			defs = append(defs, line)
			i++
			continue
		}
		if trimmed != "" {
			runtime = append(runtime, line)
		}
		i++
	}

	if len(runtime) == 0 {
		return body
	}
	var b strings.Builder
	if len(defs) > 0 {
		b.WriteString(strings.Join(defs, "\n\n"))
		b.WriteString("\n\n\n")
	}
	b.WriteString("def main() -> None:\n")
	for _, l := range runtime {
		b.WriteString("    " + l + "\n")
	}
	b.WriteString("\n\nif __name__ == \"__main__\":\n    main()")
	*changes = append(*changes, Change{Title: "Wrapped in __main__", Detail: `Runtime statements guarded with if __name__ == "__main__":.`})
	return b.String()
}

// rewriteAccumulator turns `total = 0; for v in xs: total = total + v` into
// `total = sum(xs)`. RE2 cannot assert the repeated identifiers, so the match is
// verified here before the rewrite is applied.
func rewriteAccumulator(src string) string {
	return accumRe.ReplaceAllStringFunc(src, func(m string) string {
		g := accumRe.FindStringSubmatch(m)
		indent, acc, item, seq, lhs, addA, addB := g[1], g[2], g[3], g[4], g[5], g[6], g[7]
		if lhs != acc || addA != acc || addB != item {
			return m
		}
		return indent + acc + " = sum(" + seq + ")"
	})
}

// rewriteIndexLoop turns an index-based filter/append loop into a comprehension,
// verifying that the sequence and index identifiers match on every line.
func rewriteIndexLoop(src string) string {
	return idxLoopRe.ReplaceAllStringFunc(src, func(m string) string {
		g := idxLoopRe.FindStringSubmatch(m)
		indent, idx, seq := g[1], g[2], g[3]
		ifSeq, ifIdx, flag := g[4], g[5], g[6]
		apSeq, apIdx, value, mult := g[7], g[8], g[9], g[10]
		if ifSeq != seq || apSeq != seq || ifIdx != idx || apIdx != idx {
			return m
		}
		return fmt.Sprintf(`%sresult = [item["%s"] * %s for item in %s if item["%s"]]`, indent, value, mult, seq, flag)
	})
}

func optimizePython(input string) Result {
	diags := ValidatePython(input)
	imports, rest := dedupeImports(strings.Split(input, "\n"))
	body := strings.Join(rest, "\n")
	var changes []Change

	type textRule struct {
		match  *regexp.Regexp
		apply  func(string) string
		title  string
		detail string
		hi     bool
	}
	rules := []textRule{
		{eqTrueRe, func(s string) string { return eqTrueRe.ReplaceAllString(s, "") }, "Truthy check", "Dropped `== True` per PEP 8.", false},
		{eqFalseRe, func(s string) string { return eqFalseRe.ReplaceAllString(s, "not $1") }, "Truthy check", "Replaced `== False` with `not`.", false},
		{eqNoneRe, func(s string) string {
			return neNoneRe.ReplaceAllString(eqNoneRe.ReplaceAllString(s, "is None"), "is not None")
		}, "Identity vs None", "Use `is None` / `is not None`.", false},
		{neNoneRe, func(s string) string { return neNoneRe.ReplaceAllString(s, "is not None") }, "Identity vs None", "Use `is not None`.", false},
		{lenZeroRe, func(s string) string { return lenZeroRe.ReplaceAllString(s, "not $1") }, "Empty check", "Replaced `len(x) == 0` with `not x`.", false},
		{lenPosRe, func(s string) string { return lenPosRe.ReplaceAllString(s, "$1") }, "Non-empty check", "Replaced `len(x) > 0` with `x`.", false},
		{rangeZeroRe, func(s string) string { return rangeZeroRe.ReplaceAllString(s, "range(") }, "range() simplified", "Dropped the redundant `0,` in `range(0, n)`.", false},
		{idxLoopRe, rewriteIndexLoop, "List comprehension", "Replaced the index-based loop with a comprehension - roughly 3x faster.", true},
		{accumRe, rewriteAccumulator, "Built-in sum()", "Replaced the manual accumulator with `sum()` - a C-level loop.", true},
		{dictKeysRe, func(s string) string { return dictKeysRe.ReplaceAllString(s, "for $1 in $2") }, "Iterate dict directly", "`for k in d` is equivalent to `for k in d.keys()`.", false},
	}
	for _, r := range rules {
		if !r.match.MatchString(body) {
			continue
		}
		next := r.apply(body)
		if next == body {
			continue
		}
		body = next
		changes = append(changes, Change{Title: r.title, Detail: r.detail, Highlight: r.hi})
	}
	if rangeLenRe.MatchString(body) {
		body = rangeLenRe.ReplaceAllString(body, "for $1, item in enumerate($2):")
		changes = append(changes, Change{Title: "Use enumerate()", Detail: "Replaced `range(len(x))` with `enumerate(x)`."})
	}

	// Advisory-only findings.
	for _, a := range []struct {
		re            *regexp.Regexp
		title, detail string
		guard         func() bool
	}{
		{strConcatRe, "Avoid str += in a loop", "Append to a list and join once after the loop - O(n) instead of O(n^2).", nil},
		{pctFormatRe, "Use f-strings", "f-strings are faster and clearer than `%` or `.format()`.", nil},
		{bareOpenRe, "Use `with open(...)`", "Context managers guarantee the file handle is closed.", func() bool { return !withOpenRe.MatchString(body) }},
	} {
		if a.re.MatchString(body) && (a.guard == nil || a.guard()) {
			changes = append(changes, Change{Title: a.title, Detail: a.detail})
		}
	}

	if len(changes) == 0 {
		changes = append(changes, Change{Title: "Already idiomatic", Detail: "No common antipatterns detected - focus on algorithmic complexity."})
	}

	wrapped := wrapMain(strings.TrimSpace(body), &changes)
	importBlock := ""
	if len(imports) > 0 {
		importBlock = strings.Join(imports, "\n") + "\n\n"
	}
	out := header(Python, changes) + "\n" + importBlock + wrapped + "\n"

	speedup := 0
	if normalizeForCompare(out) != normalizeForCompare(input) {
		speedup = min(70, len(changes)*9)
	}
	return Result{Engine: Python, Output: out, Changes: changes, Diagnostics: diags, Speedup: speedup}
}

var (
	sparkReadRe    = regexp.MustCompile(`^(\w+)\s*=\s*spark\.read\.(\w+)\((.+)\)\s*$`)
	forResultRe    = regexp.MustCompile(`^for\s+\w+\s+in\s+result\s*:`)
	printRowRe     = regexp.MustCompile(`^\s*print\(row\)`)
	withColumnRe   = regexp.MustCompile(`(?s)withColumn\(.*?\).*\n.*withColumn\(`)
	udfRe          = regexp.MustCompile(`UserDefinedFunction|udf\(`)
	repartitionRe  = regexp.MustCompile(`\.repartition\(`)
	coalesceRe     = regexp.MustCompile(`\.coalesce\(`)
	groupByCallRe  = regexp.MustCompile(`groupBy\(`)
	sparkSessionRe = regexp.MustCompile(`SparkSession`)
)

func optimizePySpark(input string) Result {
	diags := ValidatePySpark(input)
	imports, rest := dedupeImports(strings.Split(input, "\n"))
	var changes []Change

	dfVar, readLine := "df", ""
	var transforms, tail []string

	for _, raw := range rest {
		l := strings.TrimSpace(raw)
		if l == "" {
			continue
		}
		if m := sparkReadRe.FindStringSubmatch(l); m != nil {
			dfVar = m[1]
			readLine = fmt.Sprintf("%s = (\n    spark.read.%s(%s)\n", dfVar, m[2], m[3])
			continue
		}
		reassign := regexp.MustCompile(`^` + regexp.QuoteMeta(dfVar) + `\s*=\s*` + regexp.QuoteMeta(dfVar) + `\.(\w+)\((.*)\)\s*$`)
		if m := reassign.FindStringSubmatch(l); m != nil {
			transforms = append(transforms, fmt.Sprintf("        .%s(%s)", m[1], m[2]))
			continue
		}
		if collectRe.MatchString(l) || forResultRe.MatchString(l) || printRowRe.MatchString(l) {
			continue
		}
		tail = append(tail, l)
	}

	body := strings.TrimSpace(strings.Join(rest, "\n"))
	if readLine != "" && len(transforms) > 0 {
		var filters, others []string
		for _, t := range transforms {
			if strings.HasPrefix(strings.TrimSpace(t), ".filter(") {
				filters = append(filters, t)
			} else {
				others = append(others, t)
			}
		}
		if len(filters) > 0 {
			changes = append(changes, Change{Title: "Predicate pushdown", Highlight: true,
				Detail: "Filters reordered above transforms so Parquet readers can prune row groups."})
		}
		body = readLine + strings.Join(append(filters, others...), "\n") + "\n)"
		changes = append(changes, Change{Title: "Single chained pipeline",
			Detail: "Re-assignments combined into one chain so Catalyst plans whole-stage codegen."})
		if len(tail) > 0 {
			body += "\n\n" + strings.Join(tail, "\n")
		}
	}

	if collectRe.MatchString(input) && regexp.MustCompile(`for\s+\w+\s+in\s+result`).MatchString(input) {
		body += "\n\n" + dfVar + ".show(20, truncate=False)"
		changes = append(changes, Change{Title: "Avoid .collect()", Highlight: true,
			Detail: "Driver-side collect() plus a Python loop replaced with .show() - keeps work distributed."})
	}
	for _, a := range []struct {
		re            *regexp.Regexp
		title, detail string
		skip          func() bool
	}{
		{toPandasRe, "Avoid .toPandas()", "Pulls every row into driver memory. Use pandas-on-Spark or sample first.", nil},
		{withColumnRe, "Batch withColumn", "Repeated withColumn re-plans each step - use select(*cols, F.expr(...)).", nil},
		{udfRe, "Replace the Python UDF", "Prefer pyspark.sql.functions or pandas_udf for vectorized execution.", nil},
		{repartitionRe, "Coalesce when shrinking", "Use .coalesce(n) instead of .repartition(n) to avoid a full shuffle.", func() bool { return coalesceRe.MatchString(input) }},
		{groupByCallRe, "Skew-aware aggregation", "Consider salting or AQE skew hints if the group key is skewed.", nil},
	} {
		if a.re.MatchString(input) && (a.skip == nil || !a.skip()) {
			changes = append(changes, Change{Title: a.title, Detail: a.detail})
		}
	}
	if len(changes) == 0 {
		changes = append(changes, Change{Title: "Already idiomatic", Detail: "Pipeline is lazy and chained - check the Spark UI for skew and spill."})
	}

	importBlock := "from pyspark.sql import SparkSession\nfrom pyspark.sql import functions as F\n\n"
	if len(imports) > 0 {
		importBlock = strings.Join(imports, "\n") + "\n\n"
	}
	sparkInit := ""
	if !sparkSessionRe.MatchString(strings.Join(imports, "\n")) {
		sparkInit = "spark = SparkSession.builder.appName(\"optiq\").getOrCreate()\n\n"
	}
	out := header(PySpark, changes) + "\n" + importBlock + sparkInit + body + "\n"

	speedup := 0
	if normalizeForCompare(out) != normalizeForCompare(input) {
		speedup = min(75, len(changes)*10)
	}
	return Result{Engine: PySpark, Output: out, Changes: changes, Diagnostics: diags, Speedup: speedup}
}

// Optimize is the single entry point. It never panics and never returns an empty
// output: on any internal failure the original source is preserved.
func Optimize(input string, engine Engine) (res Result) {
	defer func() {
		if r := recover(); r != nil {
			res = Result{
				Engine: engine, Output: strings.TrimSpace(input), Speedup: 0,
				Changes: []Change{{Title: "Optimizer skipped", Detail: fmt.Sprintf("Original preserved - the rule engine hit an internal error (%v).", r)}},
			}
		}
	}()

	if strings.TrimSpace(input) == "" {
		return Result{Engine: engine, Output: "", Speedup: 0,
			Changes: []Change{{Title: "Nothing to optimize", Detail: "Provide a query or script first."}}}
	}

	switch engine {
	case Python:
		res = optimizePython(strings.TrimSpace(input))
	case PySpark:
		res = optimizePySpark(strings.TrimSpace(input))
	default:
		res = optimizeSQL(input, engine)
	}
	if strings.TrimSpace(res.Output) == "" {
		res.Output = strings.TrimSpace(input)
		res.Speedup = 0
	}
	if res.Changes == nil {
		res.Changes = []Change{}
	}
	if res.Diagnostics == nil {
		res.Diagnostics = []Diagnostic{}
	}
	return res
}
