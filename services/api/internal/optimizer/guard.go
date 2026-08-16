package optimizer

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	stringLiteralRe = regexp.MustCompile(`'(?:[^'\\]|\\.)*'`)
	numberLiteralRe = regexp.MustCompile(`(^|[^A-Za-z_0-9.])(-?\d+(?:\.\d+)?)`)
	leftJoinRe      = regexp.MustCompile(`\bLEFT JOIN\b`)
	anyJoinRe       = regexp.MustCompile(`\bJOIN\b`)
	distinctRe      = regexp.MustCompile(`\bSELECT DISTINCT\b`)

	// guardedFuncs must never be newly wrapped around a column: doing so changes
	// semantics and defeats index and partition pruning.
	guardedFuncs = []string{"LOWER", "UPPER", "TRIM", "YEAR", "MONTH", "DAY", "DATE", "CAST", "COALESCE"}
	guardedRes   = func() map[string]*regexp.Regexp {
		m := make(map[string]*regexp.Regexp, len(guardedFuncs))
		for _, fn := range guardedFuncs {
			m[fn] = regexp.MustCompile(`\b` + fn + `\s*\(`)
		}
		return m
	}()
)

// literals extracts every string and numeric literal from src. Each must survive
// a rewrite; if one disappears, the rewrite changed business logic.
func literals(src string) []string {
	out := stringLiteralRe.FindAllString(src, -1)
	stripped := stringLiteralRe.ReplaceAllString(src, "''")
	for _, m := range numberLiteralRe.FindAllStringSubmatch(stripped, -1) {
		out = append(out, m[2])
	}
	return out
}

func count(s string, re *regexp.Regexp) int { return len(re.FindAllString(s, -1)) }

func normalize(s string) string { return strings.ToUpper(strings.Join(strings.Fields(s), " ")) }

// Guard checks a candidate rewrite against the original and returns a non-empty
// reason when the rewrite must be rejected. The rules are deliberately strict: a
// slower correct query always beats a faster wrong one.
func Guard(input, output string) string {
	for _, lit := range literals(input) {
		if lit == "" {
			continue
		}
		if !strings.Contains(output, lit) {
			return fmt.Sprintf("literal %s disappeared from the rewrite", lit)
		}
	}

	in, out := normalize(input), normalize(output)

	if count(out, leftJoinRe) > count(in, leftJoinRe) && count(in, anyJoinRe) > 0 {
		return "JOIN type changed (INNER to LEFT) - row semantics would differ"
	}
	if count(out, distinctRe) > count(in, distinctRe) {
		return "DISTINCT was added - duplicate semantics would differ"
	}
	for _, fn := range guardedFuncs {
		re := guardedRes[fn]
		if count(out, re) > count(in, re) {
			return fmt.Sprintf("added %s(...) on a column - changes semantics and blocks index use", fn)
		}
	}
	return ""
}
