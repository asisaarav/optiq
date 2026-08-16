// Package optimizer holds OPTIQ's engine-aware rewrite rules, validators and the
// business-logic safety guard. It is pure: no I/O, no globals, no HTTP. Every
// rule is table-driven so adding an engine is data, not control flow.
package optimizer

import "strings"

// Engine identifies a target dialect or runtime.
type Engine string

// Supported engines.
const (
	PostgreSQL Engine = "postgresql"
	MySQL      Engine = "mysql"
	Oracle     Engine = "oracle"
	PLSQL      Engine = "plsql"
	SQLServer  Engine = "sqlserver"
	Snowflake  Engine = "snowflake"
	BigQuery   Engine = "bigquery"
	Redshift   Engine = "redshift"
	Databricks Engine = "databricks"
	ClickHouse Engine = "clickhouse"
	Python     Engine = "python"
	PySpark    Engine = "pyspark"
)

// Engines is the full set of supported targets, in presentation order.
var Engines = []Engine{
	PostgreSQL, MySQL, Oracle, PLSQL, SQLServer, Snowflake,
	BigQuery, Redshift, Databricks, ClickHouse, Python, PySpark,
}

// Valid reports whether e is a supported engine.
func (e Engine) Valid() bool {
	for _, k := range Engines {
		if k == e {
			return true
		}
	}
	return false
}

// IsSQL reports whether the engine is a SQL dialect rather than a runtime.
func (e Engine) IsSQL() bool { return e != Python && e != PySpark }

// Display returns the human label for the engine.
func (e Engine) Display() string {
	switch e {
	case PostgreSQL:
		return "PostgreSQL"
	case MySQL:
		return "MySQL"
	case Oracle:
		return "Oracle"
	case PLSQL:
		return "PL/SQL"
	case SQLServer:
		return "SQL Server"
	case Snowflake:
		return "Snowflake"
	case BigQuery:
		return "BigQuery"
	case Redshift:
		return "Redshift"
	case Databricks:
		return "Databricks SQL"
	case ClickHouse:
		return "ClickHouse"
	case Python:
		return "Python"
	case PySpark:
		return "PySpark"
	default:
		return strings.ToUpper(string(e))
	}
}

// Severity classifies a diagnostic.
type Severity string

// Diagnostic severities.
const (
	SeverityError Severity = "error"
	SeverityWarn  Severity = "warn"
)

// Diagnostic is a single syntax or semantic finding, optionally line-anchored.
type Diagnostic struct {
	Severity Severity `json:"severity"`
	Line     int      `json:"line,omitempty"`
	Message  string   `json:"message"`
}

// Change describes one applied or advised optimization.
type Change struct {
	Title     string `json:"title"`
	Detail    string `json:"detail"`
	Highlight bool   `json:"highlight,omitempty"`
}

// Result is the full outcome of an optimization pass.
type Result struct {
	Engine      Engine       `json:"engine"`
	Output      string       `json:"output"`
	Changes     []Change     `json:"changes"`
	Diagnostics []Diagnostic `json:"diagnostics"`
	// Speedup is a conservative estimate in percent (0-90). It stays 0 whenever the
	// query text is unchanged, so an advisory-only pass never overstates itself.
	Speedup int `json:"speedup"`
	// Rejected is set when the safety guard discarded a rewrite.
	Rejected string `json:"rejected,omitempty"`
}
