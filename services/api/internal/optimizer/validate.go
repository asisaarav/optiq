package optimizer

import (
	"fmt"
	"regexp"
	"strings"
)

// validateBrackets walks the source character by character, tracking string and
// comment state so brackets inside literals never produce false positives.
func validateBrackets(code string, sqlComments bool) []Diagnostic {
	var diags []Diagnostic
	type frame struct {
		ch   byte
		line int
	}
	var stack []frame
	pairs := map[byte]byte{')': '(', ']': '[', '}': '{'}

	line := 1
	var inStr byte
	inComment := false

	for i := 0; i < len(code); i++ {
		c := code[i]
		switch {
		case c == '\n':
			line++
			inComment = false
			continue
		case inComment:
			continue
		case inStr != 0:
			if c == '\\' {
				i++
				continue
			}
			if c == inStr {
				inStr = 0
			}
			continue
		case c == '\'' || c == '"':
			inStr = c
			continue
		case sqlComments && c == '-' && i+1 < len(code) && code[i+1] == '-':
			inComment = true
			continue
		case !sqlComments && c == '#':
			inComment = true
			continue
		case c == '(' || c == '[' || c == '{':
			stack = append(stack, frame{c, line})
		case c == ')' || c == ']' || c == '}':
			if len(stack) == 0 || stack[len(stack)-1].ch != pairs[c] {
				diags = append(diags, Diagnostic{SeverityError, line, fmt.Sprintf("Unmatched %q", string(c))})
				continue
			}
			stack = stack[:len(stack)-1]
		}
	}

	if inStr != 0 {
		diags = append(diags, Diagnostic{SeverityError, line, fmt.Sprintf("Unterminated string literal (%s)", string(inStr))})
	}
	for _, f := range stack {
		diags = append(diags, Diagnostic{SeverityError, f.line, fmt.Sprintf("Unclosed %q", string(f.ch))})
	}
	return diags
}

var (
	sqlLineCommentRe  = regexp.MustCompile(`(?m)--.*$`)
	sqlBlockCommentRe = regexp.MustCompile(`(?s)/\*.*?\*/`)

	sqlTypos = []struct {
		re      *regexp.Regexp
		message string
	}{
		{regexp.MustCompile(`(?i)\bFORM\b`), "Typo: 'FORM' - did you mean 'FROM'?"},
		{regexp.MustCompile(`(?i)\bSELCT\b`), "Typo: 'SELCT' - did you mean 'SELECT'?"},
		{regexp.MustCompile(`(?i)\bWEHRE\b`), "Typo: 'WEHRE' - did you mean 'WHERE'?"},
		{regexp.MustCompile(`(?i)\bGORUP\s+BY\b`), "Typo: 'GORUP BY' - did you mean 'GROUP BY'?"},
	}

	danglingClauses = []struct {
		re   *regexp.Regexp
		name string
	}{
		{regexp.MustCompile(`(?im)\bWHERE\b\s*(?:;|$)`), "WHERE"},
		{regexp.MustCompile(`(?im)\bHAVING\b\s*(?:;|$)`), "HAVING"},
		{regexp.MustCompile(`(?im)\bGROUP\s+BY\b\s*(?:;|$)`), "GROUP BY"},
		{regexp.MustCompile(`(?im)\bORDER\s+BY\b\s*(?:;|$)`), "ORDER BY"},
		{regexp.MustCompile(`(?im)\bFROM\b\s*(?:;|$)`), "FROM"},
		{regexp.MustCompile(`(?im)\bON\b\s*(?:;|$)`), "ON"},
		{regexp.MustCompile(`(?im)\bSET\b\s*(?:;|$)`), "SET"},
		{regexp.MustCompile(`(?im)\bJOIN\b\s*(?:;|$)`), "JOIN"},
	}

	havingRe        = regexp.MustCompile(`(?i)\bHAVING\b`)
	groupByRe       = regexp.MustCompile(`(?i)\bGROUP\s+BY\b`)
	aggregateRe     = regexp.MustCompile(`(?i)\b(SUM|AVG|COUNT|MIN|MAX)\s*\(`)
	selectRe        = regexp.MustCompile(`(?i)\bSELECT\b`)
	fromRe          = regexp.MustCompile(`(?i)\bFROM\b`)
	selectLiteralRe = regexp.MustCompile(`(?i)\bSELECT\s+\d`)
	selectListRe    = regexp.MustCompile(`(?is)SELECT\s+(.*?)\bFROM\b`)
	trailingCommaRe = regexp.MustCompile(`(?i),\s*(?:FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION|INTERSECT|EXCEPT)\b`)
	danglingBoolRe  = regexp.MustCompile(`(?im)\b(AND|OR)\b\s*(?:;|$)`)
	danglingCompRe  = regexp.MustCompile(`(?m)(=|<>|!=|<=|>=|<|>)\s*(?:;|$)`)
	semicolonRe     = regexp.MustCompile(`;\s*$`)
)

// stripSQL removes comments and string bodies so keyword scans are not confused
// by user data.
func stripSQL(code string) string {
	s := sqlLineCommentRe.ReplaceAllString(code, "")
	s = sqlBlockCommentRe.ReplaceAllString(s, "")
	return stringLiteralRe.ReplaceAllString(s, "''")
}

// ValidateSQL returns syntax and semantic findings for a SQL statement.
func ValidateSQL(code string) []Diagnostic {
	diags := validateBrackets(code, true)
	trimmed := strings.TrimSpace(code)
	if trimmed == "" {
		return diags
	}
	if !semicolonRe.MatchString(trimmed) {
		diags = append(diags, Diagnostic{Severity: SeverityWarn, Message: "Missing trailing semicolon"})
	}
	for _, t := range sqlTypos {
		if t.re.MatchString(code) {
			diags = append(diags, Diagnostic{Severity: SeverityError, Message: t.message})
		}
	}

	stripped := stripSQL(code)

	for _, d := range danglingClauses {
		if d.re.MatchString(stripped) {
			diags = append(diags, Diagnostic{Severity: SeverityError, Message: fmt.Sprintf("Dangling '%s' - no expression follows", d.name)})
		}
	}

	if havingRe.MatchString(stripped) {
		if !groupByRe.MatchString(stripped) {
			diags = append(diags, Diagnostic{Severity: SeverityError, Message: "HAVING used without GROUP BY - use WHERE for non-aggregate filters"})
		}
		if !aggregateRe.MatchString(stripped) {
			diags = append(diags, Diagnostic{Severity: SeverityWarn, Message: "HAVING usually filters aggregates - none detected in query"})
		}
	}

	if trailingCommaRe.MatchString(stripped) {
		diags = append(diags, Diagnostic{Severity: SeverityError, Message: "Trailing comma before clause"})
	}
	if danglingBoolRe.MatchString(stripped) {
		diags = append(diags, Diagnostic{Severity: SeverityError, Message: "Boolean operator with no right-hand expression"})
	}
	if danglingCompRe.MatchString(stripped) {
		diags = append(diags, Diagnostic{Severity: SeverityError, Message: "Comparison operator with no right-hand value"})
	}
	if selectRe.MatchString(stripped) && !fromRe.MatchString(stripped) && !selectLiteralRe.MatchString(stripped) {
		diags = append(diags, Diagnostic{Severity: SeverityWarn, Message: "SELECT without FROM"})
	}

	// An aggregate projected alongside a plain column requires GROUP BY.
	if aggregateRe.MatchString(stripped) && !groupByRe.MatchString(stripped) {
		if m := selectListRe.FindStringSubmatch(stripped); m != nil {
			for _, col := range strings.Split(m[1], ",") {
				col = strings.TrimSpace(col)
				if col == "" || col == "*" || aggregateRe.MatchString(col) {
					continue
				}
				if col[0] >= '0' && col[0] <= '9' {
					continue
				}
				diags = append(diags, Diagnostic{Severity: SeverityError, Message: "Aggregate mixed with non-aggregate column without GROUP BY"})
				break
			}
		}
	}
	return diags
}

var (
	pyBlockNoColonRe = regexp.MustCompile(`^\s*(def|class|if|elif|else|for|while|try|except|finally|with)\b[^:]*$`)
	pyPrintStmtRe    = regexp.MustCompile(`^\s*print\s+[^(\s]`)
	pyCommentRe      = regexp.MustCompile(`#.*$`)
	pyMixedIndentRe  = regexp.MustCompile(` {2,}`)
	collectRe        = regexp.MustCompile(`\.collect\(\)`)
	toPandasRe       = regexp.MustCompile(`\.toPandas\(\)`)
)

// ValidatePython returns syntax findings for a Python script.
func ValidatePython(code string) []Diagnostic {
	diags := validateBrackets(code, false)
	for i, raw := range strings.Split(code, "\n") {
		line := i + 1
		stmt := pyCommentRe.ReplaceAllString(raw, "")
		if strings.TrimSpace(stmt) != "" && pyBlockNoColonRe.MatchString(stmt) {
			diags = append(diags, Diagnostic{SeverityError, line, "Missing ':' at end of statement"})
		}
		if pyPrintStmtRe.MatchString(stmt) {
			diags = append(diags, Diagnostic{SeverityError, line, "`print` is a function - use print(...)"})
		}
		if strings.Contains(raw, "\t") && pyMixedIndentRe.MatchString(raw) {
			diags = append(diags, Diagnostic{SeverityWarn, line, "Mixed tabs and spaces"})
		}
	}
	return diags
}

// ValidatePySpark layers Spark-specific warnings on top of Python validation.
func ValidatePySpark(code string) []Diagnostic {
	diags := ValidatePython(code)
	if collectRe.MatchString(code) {
		diags = append(diags, Diagnostic{Severity: SeverityWarn, Message: ".collect() materializes to the driver - risky on large data"})
	}
	if toPandasRe.MatchString(code) {
		diags = append(diags, Diagnostic{Severity: SeverityWarn, Message: ".toPandas() pulls all rows into driver memory"})
	}
	return diags
}

// Validate dispatches to the validator for the given engine.
func Validate(code string, engine Engine) []Diagnostic {
	switch engine {
	case Python:
		return ValidatePython(code)
	case PySpark:
		return ValidatePySpark(code)
	default:
		return ValidateSQL(code)
	}
}
