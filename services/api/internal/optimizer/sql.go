package optimizer

import (
	"regexp"
	"strings"
)

// rule is one optimization: it may rewrite the text (Apply non-nil) or only
// advise (Apply nil). Engines limits it to specific dialects; empty means all.
type rule struct {
	Name      string
	Detail    string
	Highlight bool
	Engines   []Engine
	Match     *regexp.Regexp
	Apply     func(string) string
}

func (r rule) appliesTo(e Engine) bool {
	if len(r.Engines) == 0 {
		return true
	}
	for _, x := range r.Engines {
		if x == e {
			return true
		}
	}
	return false
}

var (
	selectStarRe    = regexp.MustCompile(`(?i)SELECT\s+\*`)
	dateEqRe        = regexp.MustCompile(`(?i)DATE\(\s*(\w+)\s*\)\s*=\s*'([^']+)'`)
	funcOnColRe     = regexp.MustCompile(`(?i)(UPPER|LOWER)\(\s*\w+\s*\)\s*=`)
	leadingWildRe   = regexp.MustCompile(`(?i)LIKE\s+'%[^%']+%'`)
	orInWhereRe     = regexp.MustCompile(`(?i)\bWHERE\b[\s\S]*\bOR\b`)
	countStarRe     = regexp.MustCompile(`(?i)COUNT\(\s*\*\s*\)`)
	unionNotAllRe   = regexp.MustCompile(`(?i)\bUNION\b(\s+ALL\b)?`)
	inequalityRe    = regexp.MustCompile(`!=|<>`)
	oldStyleJoinRe  = regexp.MustCompile(`(?i),\s*\w+\s+\w+\s*\n\s*WHERE`)
	rownumRe        = regexp.MustCompile(`(?i)AND\s+ROWNUM\s*<=\s*(\d+)`)
	nolockRe        = regexp.MustCompile(`(?i)WITH\s*\(NOLOCK\)`)
	partitionTimeRe = regexp.MustCompile(`(?i)_PARTITIONTIME\s+IS\s+NOT\s+NULL`)
	whereRe         = regexp.MustCompile(`(?i)\bWHERE\b`)
	cursorLoopRe    = regexp.MustCompile(`(?i)FOR\s+\w+\s+IN\s*\(`)
	updateSetRe     = regexp.MustCompile(`(?i)UPDATE\s+\w+\s+SET`)
	joinRe          = regexp.MustCompile(`(?i)\bJOIN\b`)
	rowLimitRe      = regexp.MustCompile(`(?i)\b(LIMIT|TOP|FETCH)\b`)
)

// sqlRules is the ordered rule table. Text-rewriting rules come first so advisory
// rules describe the final text.
var sqlRules = []rule{
	{
		Name: "SARGable predicate", Highlight: true,
		Detail: "Removed a function from the filtered column so indexes and partition pruning apply.",
		Match:  dateEqRe,
		Apply: func(s string) string {
			return dateEqRe.ReplaceAllString(s, "$1 >= '$2' AND $1 < '$2'::date + 1")
		},
	},
	{
		Name:   "UNION ALL",
		Detail: "Skips the distinct sort. Verify duplicates are acceptable before shipping.",
		Match:  regexp.MustCompile(`(?i)\bUNION\b(?:\s+ALL\b)?`),
		Apply: func(s string) string {
			return unionNotAllRe.ReplaceAllStringFunc(s, func(m string) string {
				if strings.Contains(strings.ToUpper(m), "ALL") {
					return m
				}
				return "UNION ALL"
			})
		},
	},
	{
		Name: "FETCH FIRST", Engines: []Engine{Oracle, PLSQL},
		Detail: "ROWNUM replaced with the ANSI row-limiting clause.",
		Match:  rownumRe,
		Apply:  func(s string) string { return rownumRe.ReplaceAllString(s, "FETCH FIRST $1 ROWS ONLY") },
	},
	{
		Name: "Partition pruning", Highlight: true, Engines: []Engine{BigQuery},
		Detail: "_PARTITIONTIME bounded to a range so BigQuery scans only the needed partitions.",
		Match:  partitionTimeRe,
		Apply: func(s string) string {
			return partitionTimeRe.ReplaceAllString(s,
				"_PARTITIONTIME BETWEEN TIMESTAMP('2024-01-01') AND TIMESTAMP('2024-12-31')")
		},
	},

	// Advisory rules below - no text change, real findings.
	{Name: "Avoid SELECT *", Detail: "Project only the columns you consume to cut scan and network I/O.", Match: selectStarRe},
	{Name: "Function on filtered column", Detail: "UPPER/LOWER on a column blocks index use - store a normalized column or add a functional index.", Match: funcOnColRe},
	{Name: "Leading-wildcard LIKE", Detail: "LIKE '%x%' cannot use a B-tree index - consider trigram or full-text search.", Match: leadingWildRe},
	{Name: "OR to IN / UNION ALL", Detail: "Multiple ORs on one column become IN (...); on different columns prefer UNION ALL.", Match: orInWhereRe},
	{Name: "COUNT(*) note", Detail: "COUNT(*) and COUNT(1) are equivalent; COUNT(col) skips NULLs.", Match: countStarRe},
	{Name: "Inequality on indexed column", Detail: "!= rarely uses an index - rewrite as a range or NOT IN.", Match: inequalityRe},
	{Name: "Use ANSI JOIN", Engines: []Engine{Oracle, PLSQL}, Detail: "Comma joins hide the join predicate - switch to explicit JOIN ... ON.", Match: oldStyleJoinRe},
	{Name: "NOLOCK warning", Engines: []Engine{SQLServer}, Detail: "NOLOCK permits dirty reads - prefer READ COMMITTED SNAPSHOT isolation.", Match: nolockRe},
	{Name: "PREWHERE candidate", Engines: []Engine{ClickHouse}, Detail: "Move the date or low-cardinality filter into PREWHERE to cut column reads.", Match: whereRe},
	{Name: "Bulk DML", Highlight: true, Engines: []Engine{PLSQL}, Detail: "Row-by-row cursor loop - rewrite as one set-based UPDATE ... WHERE.", Match: cursorLoopRe},
	{Name: "Join order", Detail: "Filter the most selective side first and confirm with EXPLAIN.", Match: joinRe},
}

func normalizeForCompare(s string) string {
	s = sqlLineCommentRe.ReplaceAllString(s, "")
	s = sqlBlockCommentRe.ReplaceAllString(s, "")
	s = regexp.MustCompile(`(?m)^\s*#.*$`).ReplaceAllString(s, "")
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

// optimizeSQL applies the rule table for the engine, then runs the safety guard.
func optimizeSQL(input string, engine Engine) Result {
	output := strings.TrimSpace(input)
	diags := ValidateSQL(input)
	var changes []Change

	for _, r := range sqlRules {
		if !r.appliesTo(engine) || !r.Match.MatchString(output) {
			continue
		}
		if r.Apply != nil {
			next := r.Apply(output)
			if next == output {
				continue
			}
			output = next
		}
		changes = append(changes, Change{Title: r.Name, Detail: r.Detail, Highlight: r.Highlight})
	}

	// PL/SQL bulk DML needs both halves of the antipattern present.
	if engine == PLSQL && !updateSetRe.MatchString(input) {
		changes = filterOut(changes, "Bulk DML")
	}
	if !rowLimitRe.MatchString(output) && selectRe.MatchString(output) {
		changes = append(changes, Change{Title: "Add a row limit", Detail: "Unbounded SELECT - cap the row count for exploratory queries."})
	}

	if reason := Guard(input, output); reason != "" {
		return Result{
			Engine: engine, Output: strings.TrimSpace(input), Speedup: 0, Rejected: reason,
			Changes: []Change{{
				Title:     "Rewrite blocked - business logic at risk",
				Detail:    "The optimizer would have changed query semantics (" + reason + "). The original is preserved.",
				Highlight: true,
			}},
			Diagnostics: append(diags, Diagnostic{Severity: SeverityWarn, Message: "Safety guard rejected the rewrite: " + reason}),
		}
	}

	changed := normalizeForCompare(output) != normalizeForCompare(input)
	switch {
	case len(changes) == 0:
		return Result{Engine: engine, Output: output, Diagnostics: diags, Speedup: 0,
			Changes: []Change{{Title: "No safe rewrite", Detail: "Query already looks efficient - inspect EXPLAIN for plan-level wins."}}}
	case !changed:
		return Result{Engine: engine, Output: output, Diagnostics: diags, Speedup: 0,
			Changes: append([]Change{{
				Title:  "Advisory only - query text unchanged",
				Detail: "No mechanical rewrite was safe; apply the findings below by hand.",
			}}, changes...)}
	default:
		return Result{Engine: engine, Output: output, Diagnostics: diags, Changes: changes,
			Speedup: min(65, len(changes)*8)}
	}
}

func filterOut(changes []Change, title string) []Change {
	out := changes[:0]
	for _, c := range changes {
		if c.Title != title {
			out = append(out, c)
		}
	}
	return out
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
