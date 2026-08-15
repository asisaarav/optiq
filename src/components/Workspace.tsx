import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Gauge,
  Loader2,
  Play,
  Rocket,
  Sparkles,
  Target,
  X as XIcon,
  Zap,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  SQL_ENGINES,
  SQL_SAMPLES,
  PY_SAMPLE,
  PYSPARK_SAMPLE,
  escapeHtml,
  highlight,
  validate,
  optimize,
  type SqlEngine,
  type Change,
  type Diagnostic,
  type Optimization,
  type ExecutionResult,
} from "@/lib/optimizer";
import { ENGINE_TIPS, type Tip, type TipCategory, type TipsKey } from "@/lib/engineTips";
import { OPEN_DATASETS, loadDataset, buildSampleQuery, type OpenDataset } from "@/lib/openDatasets";
import { aiOptimize } from "@/lib/aiOptimize.functions";
import { formatSql, formatPython, formatPySpark, formatJson, sortJsonKeys } from "@/lib/formatters";
import { PanelBoundary } from "@/components/PanelBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import { DiffView } from "@/components/DiffView";
import { runPythonSandboxed } from "@/lib/pyRunner";
import {
  MAX_EDITOR_CHARS,
  MAX_FIXTURE_CHARS,
  MAX_JSON_CHARS,
  capMessage,
  capText,
  clampRows,
} from "@/lib/limits";

/** Caps a pasted value and returns a user-facing notice when it was trimmed. */
function RunLabel({ label, busy = false }: { label: string; busy?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      {busy ? (
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      ) : (
        <Play className="size-3" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

function useCappedInput(limit = MAX_EDITOR_CHARS) {
  const [notice, setNotice] = useState<string | null>(null);
  function apply(next: string, set: (v: string) => void) {
    const capped = capText(next, limit);
    set(capped.value);
    setNotice(capped.truncated ? capMessage(capped.limit) : null);
  }
  return { notice, apply };
}

function LimitNotice({ notice }: { notice: string | null }) {
  if (!notice) return null;
  return (
    <div role="status" className="status-bar status-warn">
      <AlertTriangle className="inline-block size-3 mr-1 -mt-0.5" aria-hidden="true" />
      {notice}
    </div>
  );
}

function useAiOptimizer() {
  const fn = useServerFn(aiOptimize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  async function run(
    engine: string,
    code: string,
    apply: (r: Optimization) => void,
  ): Promise<void> {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const r = await fn({ data: { engine, code } });
      setWarning(r.safetyWarning ?? null);
      setModel(r.model);
      apply({
        output: r.output,
        speedup: r.speedup,
        changes: r.changes.length
          ? r.changes
          : [{ title: "AI: no rewrite", detail: r.notes || "Already efficient per AI review." }],
        diagnostics: [],
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "AI optimize failed");
    } finally {
      setLoading(false);
    }
  }
  return { loading, error, warning, model, run };
}

function AiBadge({
  loading,
  error,
  warning,
  model,
}: {
  loading: boolean;
  error: string | null;
  warning: string | null;
  model: string | null;
}) {
  if (!loading && !error && !warning && !model) return null;
  return (
    <div className="px-4 py-1.5 text-[10px] font-mono border-b border-border bg-surface-2/30 flex items-center gap-3">
      {loading && (
        <span className="text-primary animate-pulse inline-flex items-center gap-1">
          <Sparkles className="size-3" aria-hidden="true" /> AI optimizing…
        </span>
      )}
      {!loading && model && (
        <span className="text-muted-foreground inline-flex items-center gap-1">
          <Sparkles className="size-3" aria-hidden="true" /> {model.split("/").pop()}
        </span>
      )}
      {warning && (
        <span className="text-amber-400 inline-flex items-center gap-1">
          <AlertTriangle className="size-3" aria-hidden="true" /> {warning}
        </span>
      )}
      {error && (
        <span className="text-destructive inline-flex items-center gap-1">
          <XIcon className="size-3" aria-hidden="true" /> {error}
        </span>
      )}
    </div>
  );
}

type Mode = "SQL" | "PYTHON" | "PYSPARK" | "DATA" | "JSON";

function FormatButton({ onClick, label = "Beautify" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="btn btn-sm btn-secondary"
      title="Beautify / format the input code (whitespace only — logic untouched)"
    >
      {label}
    </button>
  );
}

const SQL_FIXTURES: Record<string, Record<string, unknown>[]> = {
  users: [
    {
      id: 1,
      name: "Aarav Sharma",
      email: "aarav@acme.com",
      country: "IN",
      status: "active",
      tier: "team",
      created_at: "2024-01-12",
    },
    {
      id: 2,
      name: "Olivia Smith",
      email: "olivia@globex.com",
      country: "US",
      status: "active",
      tier: "pro",
      created_at: "2024-02-18",
    },
    {
      id: 3,
      name: "Yuki Tanaka",
      email: "yuki@initech.com",
      country: "JP",
      status: "inactive",
      tier: "free",
      created_at: "2023-11-03",
    },
  ],
  orders: [
    {
      id: 101,
      user_id: 1,
      total: 1290.5,
      amount: 1290.5,
      status: "pending",
      region: "APAC",
      created_at: "2024-01-01",
      order_date: "2024-01-01",
    },
    {
      id: 102,
      user_id: 2,
      total: 8750,
      amount: 8750,
      status: "paid",
      region: "EU",
      created_at: "2024-03-22",
      order_date: "2024-03-22",
    },
    {
      id: 103,
      user_id: 1,
      total: 230.75,
      amount: 230.75,
      status: "pending",
      region: "US",
      created_at: "2023-10-09",
      order_date: "2023-10-09",
    },
  ],
  employees: [
    { id: 1, name: "Maya Iyer", dept_id: 10 },
    { id: 2, name: "Diego Garcia", dept_id: 20 },
  ],
  departments: [
    { id: 10, dept_name: "Engineering" },
    { id: 20, dept_name: "Revenue" },
  ],
  events: [
    {
      user_id: 1,
      country: "US",
      event_date: "2024-05-01",
      event_name: "signup",
      ts: "2024-05-01T10:00:00Z",
    },
    {
      user_id: 1,
      country: "US",
      event_date: "2024-05-02",
      event_name: "purchase",
      ts: "2024-05-02T12:00:00Z",
    },
    {
      user_id: 2,
      country: "IN",
      event_date: "2024-05-03",
      event_name: "signup",
      ts: "2024-05-03T09:30:00Z",
    },
  ],
  sales: [
    { id: 1, region: "EU", revenue: 9400, customer_id: 2 },
    { id: 2, region: "US", revenue: 7200, customer_id: 1 },
  ],
  transactions: [
    { customer_id: 1, amount: 120, date: "2024-01-02" },
    { customer_id: 2, amount: 450, date: "2024-01-03" },
  ],
};

function nextIsoDate(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function normalizeSqlForRunner(query: string) {
  let q = query
    .replace(/;\s*$/g, "")
    .replace(/`[^`]*\.([^`.]+)`/g, "$1")
    .replace(/bronze\.transactions/gi, "transactions")
    .replace(/\bROWNUM\s*<=\s*(\d+)/gi, "1 = 1 LIMIT $1")
    .replace(/FETCH\s+FIRST\s+(\d+)\s+ROWS\s+ONLY/gi, "LIMIT $1")
    .replace(/SELECT\s+TOP\s+(\d+)\s+/i, "SELECT ");

  q = q.replace(/\[(total)\]/gi, "__TOTAL_COL__");
  q = q.replace(/\b(total)\b/gi, "[$1]").replace(/__TOTAL_COL__/g, "[total]");
  q = q.replace(
    /DATE\(\s*(\w+)\s*\)\s*=\s*'([^']+)'/gi,
    (_m, col, date) => `${col} >= '${date}' AND ${col} < '${nextIsoDate(date)}'`,
  );
  q = q.replace(/'([^']+)'::date\s*\+\s*1/gi, (_m, date) => `'${nextIsoDate(date)}'`);
  return q;
}

// ---- Intelligent fixture builder: parses tables/aliases/predicates from query ----

type AlSqlDb = { exec: (sql: string) => unknown; tables: Record<string, { data: unknown[] }> };
type AlSql = {
  Database: new (name: string) => AlSqlDb;
  tables: Record<string, { data: unknown[] }>;
};

function literalValue(raw: string): unknown {
  if (/^'(.*)'$/.test(raw)) return raw.slice(1, -1);
  if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === "true";
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function inferValueFor(col: string, i: number, sample?: unknown): unknown {
  if (col === "id") return i + 1;
  if (col.endsWith("_id")) return randInt(1, 10);
  if (typeof sample === "number") return randInt(1, 1000);
  if (typeof sample === "boolean") return Math.random() > 0.5;
  if (typeof sample === "string" && /^\d{4}-\d{2}-\d{2}/.test(sample)) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    return sample.length > 10 ? d.toISOString() : d.toISOString().slice(0, 10);
  }
  if (col.includes("name")) return `${rand(FIRST)} ${rand(LAST)}`;
  if (col === "email") return `user${i}@example.com`;
  if (col === "status") return rand(["active", "inactive", "pending"]);
  if (col === "country") return rand(COUNTRIES);
  if (col === "city") return rand(CITIES);
  if (col.includes("date") || col.endsWith("_at")) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  }
  if (/total|amount|price|revenue|cost|qty|quantity/i.test(col))
    return +(Math.random() * 5000 + 10).toFixed(2);
  if (typeof sample === "string") return `${col}_${i}`;
  return `${col}_${i}`;
}

function buildSmartFixtures(query: string): Record<string, Record<string, unknown>[]> {
  const aliasToTable = new Map<string, string>();
  const tables = new Set<string>();
  const fromRe = /\b(?:FROM|JOIN)\s+([a-zA-Z_]\w*)(?:\s+(?:AS\s+)?([a-zA-Z_]\w*))?/gi;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(query))) {
    const t = m[1].toLowerCase();
    const a = (m[2] || t).toLowerCase();
    tables.add(t);
    aliasToTable.set(a, t);
    aliasToTable.set(t, t);
  }
  if (!tables.size) return SQL_FIXTURES;

  const tableCols: Record<string, Set<string>> = {};
  const colRe = /\b([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\b/g;
  while ((m = colRe.exec(query))) {
    const t = aliasToTable.get(m[1].toLowerCase());
    if (t) (tableCols[t] ||= new Set()).add(m[2].toLowerCase());
  }

  const tablePreds: Record<string, { col: string; op: string; val: unknown }[]> = {};
  const predRe =
    /(?:\b([a-zA-Z_]\w*)\.)?([a-zA-Z_]\w*)\s*(>=|<=|<>|!=|=|>|<|LIKE)\s*('[^']*'|-?\d+(?:\.\d+)?|TRUE|FALSE)/gi;
  while ((m = predRe.exec(query))) {
    const alias = (m[1] || "").toLowerCase();
    const col = m[2].toLowerCase();
    if (
      /^(select|from|join|where|on|and|or|group|order|by|having|as|limit|offset|in|not|is|null|true|false)$/.test(
        col,
      )
    )
      continue;
    const op = m[3].toUpperCase();
    const val = literalValue(m[4]);
    let table = aliasToTable.get(alias);
    if (!table) {
      table = Object.entries(tableCols).find(([, s]) => s.has(col))?.[0] ?? [...tables][0];
    }
    if (!table) continue;
    (tablePreds[table] ||= []).push({ col, op, val });
    (tableCols[table] ||= new Set()).add(col);
  }

  // Function-wrapped predicates: LOWER(TRIM(u.email))='x', YEAR(o.created_at)=2026,
  // DATE(col) >= '2024-01-01', UPPER(col)='ACTIVE', etc. Seed the underlying
  // column with a value that satisfies the predicate after the function applies.
  const fnPredRe =
    /\b(LOWER|UPPER|TRIM|LTRIM|RTRIM|YEAR|MONTH|DAY|DATE|CAST|COALESCE)\s*\(\s*([^()]*?(?:\([^()]*\)[^()]*?)*)\)\s*(>=|<=|<>|!=|=|>|<|LIKE)\s*('[^']*'|-?\d+(?:\.\d+)?)/gi;
  while ((m = fnPredRe.exec(query))) {
    const fn = m[1].toUpperCase();
    const inner = m[2];
    const op = m[3].toUpperCase();
    const raw = literalValue(m[4]);
    const colMatch =
      inner.match(/([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)/) || inner.match(/\b([a-zA-Z_]\w*)\b\s*\)?\s*$/);
    if (!colMatch) continue;
    const alias = (colMatch.length === 3 ? colMatch[1] : "").toLowerCase();
    const col = (colMatch.length === 3 ? colMatch[2] : colMatch[1]).toLowerCase();
    let table = aliasToTable.get(alias);
    if (!table) {
      table = Object.entries(tableCols).find(([, s]) => s.has(col))?.[0] ?? [...tables][0];
    }
    if (!table) continue;
    let val: unknown = raw;
    if (fn === "YEAR" && typeof raw === "number")
      val = `${raw}-0${1 + Math.floor(Math.random() * 9)}-15`;
    else if (fn === "MONTH" && typeof raw === "number")
      val = `2024-${String(raw).padStart(2, "0")}-15`;
    else if (fn === "DAY" && typeof raw === "number")
      val = `2024-06-${String(raw).padStart(2, "0")}`;
    (tablePreds[table] ||= []).push({ col, op: op === "LIKE" ? "=" : op, val });
    (tableCols[table] ||= new Set()).add(col);
  }

  const fixtures: Record<string, Record<string, unknown>[]> = {};
  for (const t of tables) {
    const baseRows = SQL_FIXTURES[t] ?? [];
    const cols = tableCols[t] ?? new Set<string>();
    baseRows.forEach((r) => Object.keys(r).forEach((k) => cols.add(k)));
    if (!cols.size) cols.add("id");
    const preds = tablePreds[t] ?? [];
    const rows: Record<string, unknown>[] = baseRows.map((r) => ({ ...r }));
    for (let i = 0; i < 40; i++) {
      const r: Record<string, unknown> = {};
      for (const c of cols) {
        const sample = baseRows[0]?.[c];
        r[c] = inferValueFor(c, i + rows.length, sample);
      }
      // Make ~80% of rows satisfy each predicate so query returns data
      for (const p of preds) {
        if (Math.random() > 0.2) {
          const isDateStr = typeof p.val === "string" && /^\d{4}-\d{2}-\d{2}/.test(p.val as string);
          if (p.op === "=") r[p.col] = p.val;
          else if (p.op === ">" || p.op === ">=") {
            if (typeof p.val === "number") r[p.col] = (p.val as number) + i + 1;
            else if (isDateStr) {
              const base = new Date(p.val as string).getTime();
              r[p.col] = new Date(base + (i + 1) * 86400000 * 3).toISOString().slice(0, 10);
            } else r[p.col] = p.val;
          } else if (p.op === "<" || p.op === "<=") {
            if (typeof p.val === "number") r[p.col] = Math.max(0, (p.val as number) - i - 1);
            else if (isDateStr) {
              const base = new Date(p.val as string).getTime();
              r[p.col] = new Date(base - (i + 1) * 86400000 * 3).toISOString().slice(0, 10);
            } else r[p.col] = p.val;
          } else if (p.op === "LIKE" && typeof p.val === "string")
            r[p.col] = p.val.replace(/%/g, `x${i}`);
        }
      }
      rows.push(r);
    }
    fixtures[t] = rows;
  }

  // Foreign-key linking heuristic: child.user_id -> parent users.id
  for (const [t, rows] of Object.entries(fixtures)) {
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (k.endsWith("_id") && k !== "id") {
          const parent = k.slice(0, -3) + "s";
          const parentRows = fixtures[parent] ?? SQL_FIXTURES[parent];
          if (parentRows && parentRows.length) {
            const ids = parentRows.map((p) => p.id).filter((x) => x !== undefined);
            if (ids.length) r[k] = ids[randInt(0, ids.length - 1)];
          }
        }
      }
      void t;
    }
  }

  return { ...SQL_FIXTURES, ...fixtures };
}

// Cache generated fixtures across runs, keyed by sorted table names.
const FIXTURE_CACHE = new Map<string, Record<string, Record<string, unknown>[]>>();

export type RunPhase = { phase: string; pct: number; detail?: string };

function extractTableNames(query: string): string[] {
  const set = new Set<string>();
  const re = /\b(?:FROM|JOIN)\s+([a-zA-Z_]\w*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) set.add(m[1].toLowerCase());
  return [...set].sort();
}

function friendlySqlError(msg: string): string {
  if (/Table does not exist|Cannot read propert|undefined/i.test(msg))
    return `${msg} — a referenced table could not be created from the sample data. Provide a schema/fixtures via "Source" to run it exactly.`;
  if (/Parse error|SyntaxError/i.test(msg))
    return `${msg} — the local runner supports standard SELECT syntax; dialect-specific constructs may need simplifying.`;
  return msg;
}

async function runSqlLocal(
  query: string,
  customFixtures?: Record<string, Record<string, unknown>[]>,
  onProgress?: (p: RunPhase) => void,
): Promise<ExecutionResult> {
  const started = performance.now();
  const tick = (phase: string, pct: number, detail?: string) => {
    onProgress?.({ phase, pct, detail });
  };
  // Yield to let the UI paint between phases.
  const yieldUI = () => new Promise<void>((r) => setTimeout(r, 16));

  tick("Parsing query", 10);
  await yieldUI();

  if (!query.trim()) {
    return {
      status: "error",
      label: "Nothing to run",
      error: "The editor is empty — write or paste a query first.",
      elapsedMs: 0,
    };
  }

  const tables = extractTableNames(query);
  const cacheKey = tables.join("|");

  tick("Loading SQL engine", 25);
  let alasql: AlSql & ((sql: string) => unknown);
  try {
    const alasqlModule = await import("alasql");
    alasql = ((alasqlModule as { default?: unknown }).default ?? alasqlModule) as AlSql &
      ((sql: string) => unknown);
  } catch (e) {
    return {
      status: "error",
      label: "Engine unavailable",
      error: `Could not load the in-browser SQL engine: ${
        e instanceof Error ? e.message : String(e)
      }`,
      elapsedMs: performance.now() - started,
    };
  }
  const run = alasql as unknown as (sql: string) => unknown;

  // Always make sure every table the query touches has rows, even when custom
  // fixtures only cover part of the query.
  const ensureAllTables = (base: Record<string, Record<string, unknown>[]>) => {
    const missing = tables.filter((t) => !base[t] || !base[t].length);
    if (!missing.length) return base;
    const generated = buildSmartFixtures(query);
    const merged = { ...base };
    for (const t of missing) if (generated[t]?.length) merged[t] = generated[t];
    return merged;
  };

  const attempt = async (
    fixtures: Record<string, Record<string, unknown>[]>,
    sourceLabel: string,
  ): Promise<ExecutionResult & { rowCount: number }> => {
    tick("Seeding in-memory DB", 75, `${Object.keys(fixtures).length} tables`);
    const seedErrors: string[] = [];
    for (const [table, rows] of Object.entries(fixtures)) {
      try {
        run(`DROP TABLE IF EXISTS ${table}`);
      } catch {
        /* noop */
      }
      try {
        run(`CREATE TABLE ${table}`);
        alasql.tables[table].data = rows.map((row) => ({ ...row }));
      } catch (e) {
        seedErrors.push(`${table}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const unseeded = tables.filter((t) => !alasql.tables[t]?.data?.length);
    if (unseeded.length === tables.length && tables.length > 0) {
      return {
        status: "error",
        label: "No test data available",
        error: `Could not build sample rows for: ${unseeded.join(", ")}${
          seedErrors.length ? ` (${seedErrors[0]})` : ""
        }. Add a schema or sample rows under "Source" and re-run.`,
        elapsedMs: performance.now() - started,
        rowCount: 0,
      };
    }
    await yieldUI();

    tick("Executing query", 90);
    let result: unknown;
    try {
      result = run(normalizeSqlForRunner(query));
    } catch (e) {
      return {
        status: "error",
        label: "SQL runtime error",
        error: friendlySqlError(e instanceof Error ? e.message : String(e)),
        elapsedMs: performance.now() - started,
        rowCount: 0,
      };
    }
    const rows = Array.isArray(result)
      ? (result as Record<string, unknown>[]).slice(0, 100)
      : [{ result }];
    const partial = unseeded.length ? ` · ${unseeded.length} table(s) empty` : "";
    return {
      status: "success",
      label: rows.length
        ? `${rows.length} row${rows.length === 1 ? "" : "s"} · ${
            Object.keys(fixtures).length
          } tables ${sourceLabel}${partial}`
        : `0 rows · predicates matched no sample data ${sourceLabel}${partial}`,
      rows,
      output: JSON.stringify(rows, null, 2),
      elapsedMs: performance.now() - started,
      rowCount: rows.length,
    };
  };

  let fixtures: Record<string, Record<string, unknown>[]>;
  let sourceLabel: string;
  let regenerable = false;
  if (customFixtures && Object.keys(customFixtures).length) {
    fixtures = ensureAllTables(customFixtures);
    sourceLabel = "(provided)";
    tick("Using provided fixtures", 55, `${Object.keys(fixtures).length} tables`);
  } else if (cacheKey && FIXTURE_CACHE.has(cacheKey)) {
    fixtures = ensureAllTables(FIXTURE_CACHE.get(cacheKey)!);
    sourceLabel = "(cached)";
    regenerable = true;
    tick("Reusing cached data", 55, tables.join(", ") || "—");
  } else {
    tick("Generating sample data", 45, tables.length ? tables.join(", ") : "auto");
    await yieldUI();
    fixtures = buildSmartFixtures(query);
    if (cacheKey) FIXTURE_CACHE.set(cacheKey, fixtures);
    sourceLabel = "(generated)";
    regenerable = true;
    tick("Sample data ready", 65, `${Object.keys(fixtures).length} tables`);
  }
  await yieldUI();

  let outcome = await attempt(fixtures, sourceLabel);

  // Self-heal: an empty/failed first pass on generated data gets one retry with
  // freshly generated rows so users never stare at an unexplained empty grid.
  if (regenerable && (outcome.status === "error" || outcome.rowCount === 0)) {
    tick("Rebuilding sample data", 80, "retrying with fresh rows");
    await yieldUI();
    const fresh = buildSmartFixtures(query);
    if (cacheKey) FIXTURE_CACHE.set(cacheKey, fresh);
    const retried = await attempt(fresh, "(regenerated)");
    if (retried.status === "success" && retried.rowCount > 0) outcome = retried;
    else if (outcome.status === "error" && retried.status === "success") outcome = retried;
  }

  tick(outcome.status === "error" ? "Failed" : "Done", 100);
  const { rowCount: _rowCount, ...rest } = outcome;
  void _rowCount;
  return rest;
}

// Python execution runs in a sandboxed Web Worker — see src/lib/pyRunner.ts.

// ------------------------- UI components -------------------------

function Toolbar({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b border-border bg-surface-2/60">
      <div className="flex items-center gap-3 min-w-0">{left}</div>
      <div className="flex gap-2 flex-wrap">{right}</div>
    </div>
  );
}

function DiagnosticsBar({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (!diagnostics || diagnostics.length === 0) {
    return (
      <div className="status-bar status-ok">
        <span className="size-1.5 rounded-full bg-emerald-400" /> No syntax issues detected
      </div>
    );
  }
  const errs = diagnostics.filter((d) => d.severity === "error");
  return (
    <div
      className={`status-bar flex-col items-start gap-0.5 ${errs.length ? "status-error" : "status-warn"}`}
    >
      {diagnostics.slice(0, 4).map((d, i) => (
        <div key={i} className="flex gap-2">
          <span className="font-bold uppercase">{d.severity}</span>
          {d.line !== undefined && <span className="opacity-70">L{d.line}</span>}
          <span>{d.message}</span>
        </div>
      ))}
      {diagnostics.length > 4 && <div className="opacity-70">+{diagnostics.length - 4} more…</div>}
    </div>
  );
}

function CodeOutput({
  html,
  speedup,
  changes,
  headerRight,
  original,
  optimized,
}: {
  html: string;
  speedup?: number;
  changes?: Change[];
  headerRight?: React.ReactNode;
  original?: string;
  optimized?: string;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const all = changes ?? [];

  const emote =
    speedup === undefined
      ? null
      : speedup >= 50
        ? { Icon: Rocket, mood: "Big win", tone: "text-primary" }
        : speedup >= 20
          ? { Icon: Zap, mood: "Nice lift", tone: "text-primary" }
          : speedup > 0
            ? { Icon: Target, mood: "Tightened", tone: "text-primary" }
            : { Icon: Gauge, mood: "Already lean", tone: "text-muted-foreground" };
  return (
    <div className="p-4 md:p-6 overflow-auto bg-surface/40 relative min-h-[360px] md:min-h-0 md:h-full">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="eyebrow text-primary flex items-center gap-2">
          Optimized Output
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          {speedup !== undefined && emote && (
            <div
              className="group flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 transition-all hover:bg-primary/10 hover:scale-[1.02]"
              title={`${emote.mood} — estimated speedup vs. input`}
            >
              <emote.Icon
                className={`size-3.5 shrink-0 transition-transform group-hover:scale-110 ${emote.tone}`}
                aria-hidden="true"
              />
              <div className="flex items-baseline gap-1">
                <span className={`font-mono font-bold text-sm ${emote.tone}`}>
                  {speedup.toFixed(0)}%
                </span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  est. speedup
                </span>
              </div>
            </div>
          )}
          {headerRight}
        </div>
      </div>
      {all.length > 0 && (
        <div className="mb-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] leading-snug text-foreground/90 space-y-1.5">
          <div className="text-[9px] uppercase tracking-widest text-primary/80 font-bold">
            Applied changes · {all.length}
          </div>
          {all.map((c, i) => (
            <div key={i} className="flex gap-2">
              <span
                className="mt-1.5 size-1 shrink-0 rounded-full bg-primary/70"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <span className="font-semibold text-primary">{c.title}:</span>{" "}
                <span className="text-muted-foreground">{c.detail}</span>
              </div>
            </div>
          ))}
          <div className="text-[10px] text-muted-foreground/80 pt-1 border-t border-primary/10 mt-1.5">
            <Check className="inline-block size-3 mr-1 -mt-0.5" aria-hidden="true" />
            Literals &amp; predicates preserved — no business-logic drift.
          </div>
        </div>
      )}
      {original !== undefined && optimized !== undefined && (
        <div className="mb-3">
          <button
            onClick={() => setShowDiff((v) => !v)}
            aria-pressed={showDiff}
            className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {showDiff ? "Hide diff" : "Show diff"}
          </button>
        </div>
      )}
      {showDiff && original !== undefined && optimized !== undefined ? (
        <DiffView original={original} optimized={optimized} />
      ) : (
        <pre
          className="text-foreground whitespace-pre-wrap pr-2 font-mono text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function ExecutionPanel({ result }: { result: ExecutionResult }) {
  const rows = result.rows ?? [];
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return (
    <div className="border-t border-border bg-surface-2/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="eyebrow">Live Run</div>
        <div
          className={`text-[10px] font-mono ${result.status === "error" ? "text-destructive" : result.status === "success" ? "text-primary" : "text-muted-foreground"}`}
        >
          {result.label}
          {result.elapsedMs !== undefined ? ` · ${result.elapsedMs.toFixed(1)}ms` : ""}
        </div>
      </div>
      {result.status === "running" ? (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-4 w-full" style={{ opacity: 1 - i * 0.2 }} />
          ))}
        </div>
      ) : result.status === "error" ? (
        <pre className="min-h-[72px] max-h-[180px] overflow-auto whitespace-pre-wrap font-mono text-xs text-destructive">
          {result.error}
        </pre>
      ) : columns.length ? (
        <div className="max-h-[220px] overflow-auto rounded border border-border">
          <table className="table-grid w-full border-collapse">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-border/60 last:border-0">
                  {columns.map((col) => (
                    <td key={col}>{String(row[col] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <pre className="min-h-[72px] max-h-[180px] overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
          {result.output ||
            "Run the current input or optimized output to see real execution results."}
        </pre>
      )}
    </div>
  );
}

const CATEGORY_COLORS: Record<TipCategory, string> = {
  Partitioning: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  Indexing: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  Clustering: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  "Functions & UDFs": "bg-amber-500/10 text-amber-300 border-amber-500/30",
  "Concurrency / Threading": "bg-rose-500/10 text-rose-300 border-rose-500/30",
  "Memory & Caching": "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
  "Statistics & Planner": "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/30",
  "I/O & File Layout": "bg-orange-500/10 text-orange-300 border-orange-500/30",
};

function TipsPanel({ engineKey }: { engineKey: TipsKey }) {
  const tips = ENGINE_TIPS[engineKey] ?? [];
  const categories = Array.from(new Set(tips.map((t) => t.category))) as TipCategory[];
  const [filter, setFilter] = useState<TipCategory | "ALL">("ALL");
  const filtered = filter === "ALL" ? tips : tips.filter((t) => t.category === filter);

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="eyebrow">Engine Tips · {engineKey}</h2>
        <span className="text-[10px] text-muted-foreground font-mono">best practices</span>
      </div>
      <div className="flex flex-wrap gap-1 mb-4">
        <button
          onClick={() => setFilter("ALL")}
          aria-pressed={filter === "ALL"}
          className="btn btn-sm btn-outline"
        >
          ALL
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            aria-pressed={filter === c}
            className="btn btn-sm btn-outline"
          >
            {c}
          </button>
        ))}
      </div>
      <div className="space-y-3 max-h-[460px] overflow-auto pr-1">
        {filtered.map((t: Tip, i) => (
          <div key={i} className="space-y-1 pb-3 border-b border-border last:border-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[t.category]}`}
              >
                {t.category}
              </span>
            </div>
            <div className="text-sm font-medium text-foreground">{t.title}</div>
            <div className="text-xs text-muted-foreground leading-relaxed">{t.body}</div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-muted-foreground italic">No tips in this category yet.</div>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-border text-[10px] text-muted-foreground">
        Sourced from official docs (Spark tuning guide, ClickHouse docs, Postgres planner notes) and
        OSS community best-practice repos.
      </div>
    </div>
  );
}

// SQL panel
type TestSpec = {
  name?: string;
  minRows?: number;
  maxRows?: number;
  exactRows?: number;
  contains?: string;
  notContains?: string;
};
type TestResult = { name: string; passed: boolean; reason?: string };

function runTests(specs: TestSpec[], exec: ExecutionResult): TestResult[] {
  return specs.map((spec, i) => {
    const name = spec.name || `test_${i + 1}`;
    if (exec.status !== "success")
      return { name, passed: false, reason: exec.error || "Query did not execute" };
    const n = exec.rows?.length ?? 0;
    const out = exec.output ?? "";
    if (spec.exactRows !== undefined && n !== spec.exactRows)
      return { name, passed: false, reason: `expected exactly ${spec.exactRows} rows, got ${n}` };
    if (spec.minRows !== undefined && n < spec.minRows)
      return { name, passed: false, reason: `expected ≥ ${spec.minRows} rows, got ${n}` };
    if (spec.maxRows !== undefined && n > spec.maxRows)
      return { name, passed: false, reason: `expected ≤ ${spec.maxRows} rows, got ${n}` };
    if (spec.contains && !out.includes(spec.contains))
      return { name, passed: false, reason: `output missing "${spec.contains}"` };
    if (spec.notContains && out.includes(spec.notContains))
      return { name, passed: false, reason: `output contains forbidden "${spec.notContains}"` };
    return { name, passed: true };
  });
}

function SqlPanel() {
  const cap = useCappedInput();
  const [engine, setEngine] = useState<SqlEngine>("POSTGRESQL");
  const [input, setInput] = useState(SQL_SAMPLES.POSTGRESQL);
  const [result, setResult] = useState<Optimization>(() =>
    optimize(SQL_SAMPLES.POSTGRESQL, "POSTGRESQL"),
  );
  const [runTarget, setRunTarget] = useState<"input" | "output">("input");
  const [execution, setExecution] = useState<ExecutionResult>({ status: "idle", label: "Ready" });
  const [progress, setProgress] = useState<RunPhase | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [showDatasets, setShowDatasets] = useState(false);
  const [datasetStatus, setDatasetStatus] = useState<string | null>(null);
  const [loadingDataset, setLoadingDataset] = useState<string | null>(null);
  const [fixturesText, setFixturesText] = useState("");
  const [fixturesError, setFixturesError] = useState<string | null>(null);
  const [testsText, setTestsText] = useState(
    `[\n  { "name": "returns rows", "minRows": 1 },\n  { "name": "bounded", "maxRows": 100 }\n]`,
  );
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const html = useMemo(() => highlight(result.output, "sql"), [result.output]);
  const liveDiagnostics = useMemo(() => validate(input, engine), [input, engine]);
  const ai = useAiOptimizer();

  // Keep optimized output in sync with the current input so the right pane
  // never shows a stale rewrite from a previous query/engine.
  useEffect(() => {
    const id = setTimeout(() => setResult(optimize(input, engine)), 200);
    return () => clearTimeout(id);
  }, [input, engine]);

  function changeEngine(e: SqlEngine) {
    setEngine(e);
    setInput(SQL_SAMPLES[e]);
    setResult(optimize(SQL_SAMPLES[e], e));
  }

  function parseFixtures(): Record<string, Record<string, unknown>[]> | undefined {
    if (!fixturesText.trim()) return undefined;
    try {
      const parsed = JSON.parse(fixturesText);
      setFixturesError(null);
      return parsed;
    } catch (e) {
      setFixturesError(e instanceof Error ? e.message : "Invalid JSON");
      return undefined;
    }
  }

  async function pickDataset(ds: OpenDataset) {
    setLoadingDataset(ds.id);
    setDatasetStatus(`Fetching ${ds.name}…`);
    try {
      const { table, rows } = await loadDataset(ds);
      setFixturesText(JSON.stringify({ [table]: rows }, null, 2));
      setInput(buildSampleQuery(ds, rows[0]));
      setShowSource(true);
      setDatasetStatus(`Loaded ${rows.length.toLocaleString()} rows into "${table}"`);
    } catch (e) {
      setDatasetStatus(`Failed: ${e instanceof Error ? e.message : "unable to load dataset"}`);
    } finally {
      setLoadingDataset(null);
    }
  }

  async function run(specs?: TestSpec[], target: "input" | "output" = runTarget) {
    setRunTarget(target);
    const code = target === "input" ? input : result.output;
    setExecution({ status: "running", label: `Executing ${target}…` });
    setProgress({ phase: "Starting", pct: 5 });
    setTestResults(null);
    try {
      const fixtures = parseFixtures();
      if (fixturesText.trim() && !fixtures) {
        setExecution({ status: "error", label: "Bad fixtures JSON", error: fixturesError ?? "" });
        setProgress(null);
        return;
      }
      const ran = await runSqlLocal(code, fixtures, (p) => setProgress(p));
      setExecution(ran);
      if (specs && specs.length) setTestResults(runTests(specs, ran));
    } catch (e: unknown) {
      setExecution({
        status: "error",
        label: "Execution failed",
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      // brief delay so users can see the 100% tick
      setTimeout(() => setProgress(null), 400);
    }
  }

  async function runWithTests() {
    let specs: TestSpec[] = [];
    try {
      const parsed = JSON.parse(testsText);
      specs = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      setTestResults([
        { name: "spec parse", passed: false, reason: e instanceof Error ? e.message : "bad JSON" },
      ]);
      return;
    }
    await run(specs);
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="panel flex flex-col overflow-hidden">
        <Toolbar
          left={
            <>
              <select
                aria-label="SQL engine"
                value={engine}
                onChange={(e) => changeEngine(e.target.value as SqlEngine)}
                className="field w-auto max-w-[200px] cursor-pointer py-1"
              >
                {SQL_ENGINES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground hidden sm:inline">SQL engine</span>
            </>
          }
          right={
            <>
              <button
                onClick={() => setShowDatasets((v) => !v)}
                aria-pressed={showDatasets}
                className="btn btn-sm btn-outline"
                title="Load an open dataset (Titanic, Iris, Diamonds, etc.)"
              >
                {showDatasets ? "Hide datasets" : "Datasets"}
              </button>
              <button
                onClick={() => setShowSource((v) => !v)}
                aria-pressed={showSource}
                className="btn btn-sm btn-outline"
                title="Provide custom schema / sample data"
              >
                {showSource ? "Hide source" : "Source"}
              </button>
              <button
                onClick={() => setShowTests((v) => !v)}
                aria-pressed={showTests}
                className="btn btn-sm btn-outline"
                title="Define custom test cases"
              >
                {showTests ? "Hide tests" : "Tests"}
              </button>
              <FormatButton onClick={() => setInput((v) => formatSql(v))} />
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(result.output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="btn btn-sm btn-secondary"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => {
                  setResult(optimize(input, engine));
                  ai.run(engine, input, setResult);
                }}
                disabled={ai.loading}
                className="btn btn-sm btn-primary"
                title="Run rule-based + AI optimization"
              >
                <Sparkles className="inline-block size-3 mr-1.5 -mt-0.5" aria-hidden="true" />
                {ai.loading ? "OPTIMIZING…" : "OPTIMIZE"}
              </button>
            </>
          }
        />
        <AiBadge loading={ai.loading} error={ai.error} warning={ai.warning} model={ai.model} />
        <DiagnosticsBar diagnostics={liveDiagnostics} />
        <LimitNotice notice={cap.notice} />

        {showDatasets && (
          <div className="px-4 py-3 border-b border-border bg-surface-2/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="eyebrow">
                Open datasets · cached in browser · CORS-friendly public CDNs
              </div>
              {datasetStatus && (
                <div className="text-[10px] font-mono text-muted-foreground">{datasetStatus}</div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              {OPEN_DATASETS.map((ds) => (
                <button
                  key={ds.id}
                  onClick={() => pickDataset(ds)}
                  disabled={loadingDataset !== null}
                  className="text-left p-2 rounded border border-border bg-secondary/40 hover:border-primary transition disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-foreground truncate">{ds.name}</div>
                    <div className="text-[9px] text-muted-foreground font-mono shrink-0">
                      {loadingDataset === ds.id ? "…" : `${ds.rows.toLocaleString()} rows`}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                    {ds.description}
                  </div>
                  <div className="text-[9px] mt-1 flex gap-2 text-muted-foreground/70 font-mono">
                    <span>{ds.domain}</span>
                    <span>·</span>
                    <span>table: {ds.table}</span>
                    <span>·</span>
                    <span>{ds.license}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {showSource && (
          <div className="px-4 py-3 border-b border-border bg-surface-2/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="eyebrow">
                Source data — JSON {`{ "table": [ {row}, … ] }`} (leave empty for auto-generated)
              </div>
              <button
                onClick={() => setFixturesText(JSON.stringify(buildSmartFixtures(input), null, 2))}
                className="btn btn-sm btn-ghost"
              >
                Auto-fill from query
              </button>
            </div>
            <textarea
              aria-label="Source data JSON"
              value={fixturesText}
              onChange={(e) => setFixturesText(capText(e.target.value, MAX_FIXTURE_CHARS).value)}
              maxLength={MAX_FIXTURE_CHARS}
              spellCheck={false}
              placeholder='{"users":[{"id":1,"name":"Ada","status":"active"}],"orders":[...]}'
              className="field h-32 resize-y text-[11px]"
            />
            {fixturesError && (
              <div className="text-[11px] text-rose-300 font-mono inline-flex items-center gap-1">
                <AlertTriangle className="size-3" aria-hidden="true" /> {fixturesError}
              </div>
            )}
          </div>
        )}

        {showTests && (
          <div className="px-4 py-3 border-b border-border bg-surface-2/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="eyebrow">
                Test cases — JSON array · supports{" "}
                <code className="text-primary">
                  minRows / maxRows / exactRows / contains / notContains
                </code>
              </div>
              <button
                onClick={runWithTests}
                disabled={execution.status === "running"}
                className="btn btn-sm btn-primary"
              >
                <RunLabel label="Run + Test" />
              </button>
            </div>
            <textarea
              aria-label="Test cases JSON"
              value={testsText}
              onChange={(e) => setTestsText(capText(e.target.value, MAX_FIXTURE_CHARS).value)}
              maxLength={MAX_FIXTURE_CHARS}
              spellCheck={false}
              className="field h-28 resize-y text-[11px]"
            />
            {testResults && (
              <div className="space-y-1 pt-1 border-t border-border">
                {testResults.map((t, i) => (
                  <div
                    key={i}
                    className={`text-[11px] font-mono flex gap-2 ${t.passed ? "text-emerald-300" : "text-rose-300"}`}
                  >
                    <span aria-hidden="true">
                      {t.passed ? <Check className="size-3" /> : <XIcon className="size-3" />}
                    </span>
                    <span className="font-bold">{t.name}</span>
                    {t.reason && <span className="opacity-80">— {t.reason}</span>}
                  </div>
                ))}
                <div className="text-[10px] text-muted-foreground pt-1">
                  {testResults.filter((t) => t.passed).length}/{testResults.length} passed
                </div>
              </div>
            )}
          </div>
        )}

        {progress && (
          <div className="border-t border-primary/30 bg-primary/5 px-4 py-2 flex items-center gap-3">
            <div className="text-[10px] uppercase tracking-widest text-primary font-bold whitespace-nowrap">
              {progress.phase}
            </div>
            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200 ease-out"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
              {progress.detail ? `${progress.detail} · ` : ""}
              {progress.pct}%
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 md:h-[480px] font-mono text-sm leading-relaxed overflow-hidden">
          <div className="p-4 md:p-6 border-b md:border-b-0 md:border-r border-border overflow-auto bg-surface-2/40 min-h-[360px] md:min-h-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="eyebrow">Input — SQL</div>
              <button
                onClick={() => run(undefined, "input")}
                disabled={execution.status === "running"}
                className="btn btn-sm btn-secondary font-mono"
                title="Run input query"
              >
                {execution.status === "running" && runTarget === "input" ? (
                  <RunLabel busy label="Running" />
                ) : (
                  <RunLabel label="Run" />
                )}
              </button>
            </div>
            <textarea
              value={input}
              aria-label="SQL input editor"
              maxLength={MAX_EDITOR_CHARS}
              onChange={(e) => cap.apply(e.target.value, setInput)}
              spellCheck={false}
              className="editor h-[300px] md:h-[calc(100%-1.75rem)]"
            />
          </div>
          <CodeOutput
            original={input}
            optimized={result.output}
            html={html}
            speedup={result.speedup}
            changes={result.changes}
            headerRight={
              <button
                onClick={() => run(undefined, "output")}
                disabled={execution.status === "running" || !result.output}
                className="btn btn-sm btn-outline is-active font-mono"
                title="Run optimized query"
              >
                {execution.status === "running" && runTarget === "output" ? (
                  <RunLabel busy label="Running" />
                ) : (
                  <RunLabel label="Run" />
                )}
              </button>
            }
          />
        </div>
        <ExecutionPanel result={execution} />
      </div>
      <div className="flex flex-col gap-4">
        <TipsPanel engineKey={engine as TipsKey} />
      </div>
    </div>
  );
}

// Python panel with Pyodide runner
function PythonPanel() {
  const cap = useCappedInput();
  const [input, setInput] = useState(PY_SAMPLE);
  const [result, setResult] = useState<Optimization>(() => optimize(PY_SAMPLE, "PYTHON"));
  const [copied, setCopied] = useState(false);
  const [stdout, setStdout] = useState<string>("");
  const [running, setRunning] = useState<"idle" | "loading" | "running">("idle");
  const [runTarget, setRunTarget] = useState<"input" | "output">("output");
  const html = useMemo(() => highlight(result.output, "py"), [result.output]);
  const liveDiagnostics = useMemo(() => validate(input, "PYTHON"), [input]);
  const ai = useAiOptimizer();
  useEffect(() => {
    const id = setTimeout(() => setResult(optimize(input, "PYTHON")), 200);
    return () => clearTimeout(id);
  }, [input]);

  async function run(target: "input" | "output" = runTarget) {
    setRunTarget(target);
    const code = target === "input" ? input : result.output;
    if (!code.trim()) {
      setStdout("[nothing to run] The script is empty.");
      return;
    }
    setStdout("");
    setRunning("loading");
    let buf = "";
    const append = (line: string) => {
      buf += line.endsWith("\n") ? line : `${line}\n`;
      setStdout(buf);
    };
    const outcome = await runPythonSandboxed(code, {
      onStdout: append,
      onPhase: (phase) => setRunning(phase === "loading" ? "loading" : "running"),
    });
    if (outcome.status === "error") append(`\n[error] ${outcome.message ?? "Unknown error"}`);
    if (outcome.status === "timeout") append(`\n[stopped] ${outcome.message ?? "Timed out"}`);
    if (outcome.status === "unavailable")
      append(`\n[runtime unavailable] ${outcome.message ?? "Could not start Python."}`);
    if (outcome.status === "success" && !buf.trim())
      append("[done] Script finished with no output — add print() calls to inspect values.");
    setRunning("idle");
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="panel flex flex-col overflow-hidden">
        <Toolbar
          left={
            <span className="text-xs text-muted-foreground font-mono">
              PYTHON 3.12 · Pyodide runtime
            </span>
          }
          right={
            <>
              <button
                onClick={() => downloadText("optimized.py", result.output)}
                className="btn btn-sm btn-secondary"
              >
                <Download className="inline-block size-3 mr-1 -mt-0.5" aria-hidden="true" />
                .py
              </button>
              <FormatButton onClick={() => setInput((v) => formatPython(v))} />
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(result.output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="btn btn-sm btn-secondary"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => {
                  setResult(optimize(input, "PYTHON"));
                  ai.run("PYTHON", input, setResult);
                }}
                disabled={ai.loading}
                className="btn btn-sm btn-primary"
                title="Run rule-based + AI optimization"
              >
                <Sparkles className="inline-block size-3 mr-1.5 -mt-0.5" aria-hidden="true" />
                {ai.loading ? "OPTIMIZING…" : "OPTIMIZE"}
              </button>
            </>
          }
        />
        <AiBadge loading={ai.loading} error={ai.error} warning={ai.warning} model={ai.model} />
        <DiagnosticsBar diagnostics={liveDiagnostics} />
        <LimitNotice notice={cap.notice} />
        <div className="grid md:grid-cols-2 md:h-[480px] font-mono text-sm leading-relaxed overflow-hidden">
          <div className="p-4 md:p-6 border-b md:border-b-0 md:border-r border-border overflow-auto bg-surface-2/40 min-h-[360px] md:min-h-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="eyebrow">Input — Python</div>
              <button
                onClick={() => run("input")}
                disabled={running !== "idle"}
                className="btn btn-sm btn-secondary font-mono"
                title="Run input script"
              >
                {running !== "idle" && runTarget === "input" ? (
                  <RunLabel busy label={running === "loading" ? "Loading" : "Running"} />
                ) : (
                  <RunLabel label="Run" />
                )}
              </button>
            </div>
            <textarea
              value={input}
              aria-label="Python input editor"
              maxLength={MAX_EDITOR_CHARS}
              onChange={(e) => cap.apply(e.target.value, setInput)}
              spellCheck={false}
              className="editor h-[300px] md:h-[calc(100%-1.75rem)]"
            />
          </div>
          <CodeOutput
            original={input}
            optimized={result.output}
            html={html}
            speedup={result.speedup}
            changes={result.changes}
            headerRight={
              <button
                onClick={() => run("output")}
                disabled={running !== "idle" || !result.output}
                className="btn btn-sm btn-outline is-active font-mono"
                title="Run optimized script"
              >
                {running !== "idle" && runTarget === "output" ? (
                  <RunLabel busy label={running === "loading" ? "Loading" : "Running"} />
                ) : (
                  <RunLabel label="Run" />
                )}
              </button>
            }
          />
        </div>
        <div className="border-t border-border p-4 bg-surface-2/30">
          <div className="eyebrow mb-2">stdout</div>
          <pre className="font-mono text-xs text-foreground/90 whitespace-pre-wrap min-h-[60px] max-h-[180px] overflow-auto">
            {stdout || "— run the script to see output —"}
          </pre>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <TipsPanel engineKey="PYTHON" />
      </div>
    </div>
  );
}

// PySpark panel — static analyzer + logical plan preview

type PlanStep = { op: string; detail: string };

function buildPySparkPlan(code: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const reads = code.match(/spark\.read\.(\w+)\(([^)]+)\)/g) || [];
  reads.forEach((r) => {
    const m = r.match(/spark\.read\.(\w+)\(([^)]+)\)/);
    if (m) steps.push({ op: "Scan", detail: `${m[1]}(${m[2]})` });
  });
  const filters = code.match(/\.filter\(([^)]+)\)|\.where\(([^)]+)\)/g) || [];
  filters.forEach((f) => steps.push({ op: "Filter", detail: f.replace(/^\./, "") }));
  const withCols = code.match(/\.withColumn\(([^)]+)\)/g) || [];
  withCols.forEach((w) => steps.push({ op: "Project", detail: w.replace(/^\./, "") }));
  const joins = code.match(/\.join\(([^)]+)\)/g) || [];
  joins.forEach((j) => steps.push({ op: "Join", detail: j.replace(/^\./, "") }));
  const groups = code.match(/\.groupBy\(([^)]+)\)/g) || [];
  groups.forEach((g) => steps.push({ op: "Aggregate", detail: g.replace(/^\./, "") }));
  const orders = code.match(/\.orderBy\(([^)]+)\)|\.sort\(([^)]+)\)/g) || [];
  orders.forEach((o) => steps.push({ op: "Sort", detail: o.replace(/^\./, "") }));
  const actions = ["collect", "count", "show", "take", "first", "toPandas", "write"];
  actions.forEach((a) => {
    if (new RegExp(`\\.${a}\\(`).test(code))
      steps.push({ op: "Action", detail: `${a}() — triggers execution` });
  });
  return steps;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PySparkPanel() {
  const cap = useCappedInput();
  const [input, setInput] = useState(PYSPARK_SAMPLE);
  const [result, setResult] = useState<Optimization>(() => optimize(PYSPARK_SAMPLE, "PYSPARK"));
  const [copied, setCopied] = useState(false);
  const [showPlan, setShowPlan] = useState(true);
  const html = useMemo(() => highlight(result.output, "py"), [result.output]);
  const liveDiagnostics = useMemo(() => validate(input, "PYSPARK"), [input]);
  const ai = useAiOptimizer();
  const plan = useMemo(() => buildPySparkPlan(result.output || input), [result.output, input]);
  useEffect(() => {
    const id = setTimeout(() => setResult(optimize(input, "PYSPARK")), 200);
    return () => clearTimeout(id);
  }, [input]);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div className="panel flex flex-col overflow-hidden">
        <Toolbar
          left={
            <span className="text-xs text-muted-foreground font-mono">
              PYSPARK 3.5 · static analyzer · no JVM in browser
            </span>
          }
          right={
            <>
              <button
                onClick={() => setShowPlan((v) => !v)}
                aria-pressed={showPlan}
                className="btn btn-sm btn-outline"
              >
                {showPlan ? "Hide plan" : "Plan"}
              </button>
              <button
                onClick={() => downloadText("optimized.py", result.output)}
                className="btn btn-sm btn-secondary"
              >
                <Download className="inline-block size-3 mr-1 -mt-0.5" aria-hidden="true" />
                .py
              </button>
              <FormatButton onClick={() => setInput((v) => formatPySpark(v))} />
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(result.output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="btn btn-sm btn-secondary"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => {
                  setResult(optimize(input, "PYSPARK"));
                  ai.run("PYSPARK", input, setResult);
                }}
                disabled={ai.loading}
                className="btn btn-sm btn-primary"
                title="Run rule-based + AI optimization"
              >
                <Sparkles className="inline-block size-3 mr-1.5 -mt-0.5" aria-hidden="true" />
                {ai.loading ? "OPTIMIZING…" : "OPTIMIZE"}
              </button>
            </>
          }
        />
        <AiBadge loading={ai.loading} error={ai.error} warning={ai.warning} model={ai.model} />
        <DiagnosticsBar diagnostics={liveDiagnostics} />
        <LimitNotice notice={cap.notice} />
        <div className="grid md:grid-cols-2 md:h-[520px] font-mono text-sm leading-relaxed overflow-hidden">
          <div className="p-4 md:p-6 border-b md:border-b-0 md:border-r border-border overflow-auto bg-surface-2/40 min-h-[360px] md:min-h-0">
            <div className="eyebrow mb-3">Input — PySpark</div>
            <textarea
              value={input}
              aria-label="PySpark input editor"
              maxLength={MAX_EDITOR_CHARS}
              onChange={(e) => cap.apply(e.target.value, setInput)}
              spellCheck={false}
              className="editor h-[300px] md:h-[calc(100%-1.5rem)]"
            />
          </div>
          <CodeOutput
            html={html}
            speedup={result.speedup}
            changes={result.changes}
            original={input}
            optimized={result.output}
          />
        </div>
        {showPlan && (
          <div className="border-t border-border bg-surface-2/30 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="eyebrow">Derived logical plan · {plan.length} steps</div>
              <span className="text-[10px] text-muted-foreground font-mono">
                spark-submit optimized.py
              </span>
            </div>
            {plan.length ? (
              <ol className="space-y-1 font-mono text-xs">
                {plan.map((s, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-muted-foreground w-6">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-primary font-bold w-20">{s.op}</span>
                    <span className="text-foreground/90 truncate">{s.detail}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="text-xs text-muted-foreground font-mono">
                No Spark operations detected — write a DataFrame pipeline above.
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <TipsPanel engineKey="PYSPARK" />
      </div>
    </div>
  );
}

// ------------------------- Data Builder -------------------------

type FieldType =
  | "int"
  | "float"
  | "bool"
  | "uuid"
  | "name"
  | "email"
  | "company"
  | "city"
  | "country"
  | "phone"
  | "date"
  | "datetime"
  | "enum"
  | "string"
  | "url"
  | "ip";

type SchemaField = { name: string; type: FieldType; opts?: string };

const FIRST = [
  "Aarav",
  "Priya",
  "Liam",
  "Olivia",
  "Noah",
  "Emma",
  "Yuki",
  "Mateo",
  "Zara",
  "Kai",
  "Aisha",
  "Diego",
  "Sora",
  "Maya",
  "Ethan",
  "Nia",
];
const LAST = [
  "Sharma",
  "Patel",
  "Singh",
  "Kim",
  "Tanaka",
  "Garcia",
  "Smith",
  "Johnson",
  "Brown",
  "Khan",
  "Iyer",
  "Reddy",
  "Müller",
  "Rossi",
  "Silva",
];
const COMPANIES = [
  "Acme",
  "Globex",
  "Initech",
  "Umbrella",
  "Hooli",
  "Stark",
  "Wayne",
  "Wonka",
  "Soylent",
  "Tyrell",
  "Pied Piper",
  "Massive Dynamic",
];
const CITIES = [
  "Bengaluru",
  "Mumbai",
  "Delhi",
  "Tokyo",
  "London",
  "Berlin",
  "Paris",
  "NYC",
  "SF",
  "Sydney",
  "Singapore",
  "Toronto",
];
const COUNTRIES = ["IN", "US", "GB", "DE", "FR", "JP", "SG", "AU", "CA", "BR", "NL", "ES"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function randDate(years = 3) {
  const now = Date.now();
  return new Date(now - randInt(0, years * 365 * 24 * 3600 * 1000));
}

function genValue(f: SchemaField): unknown {
  switch (f.type) {
    case "int": {
      const [a, b] = (f.opts || "0-1000").split("-").map(Number);
      return randInt(a || 0, b || 1000);
    }
    case "float": {
      const [a, b] = (f.opts || "0-100").split("-").map(Number);
      return +(Math.random() * ((b || 100) - (a || 0)) + (a || 0)).toFixed(2);
    }
    case "bool":
      return Math.random() > 0.5;
    case "uuid":
      return uuid();
    case "name":
      return `${rand(FIRST)} ${rand(LAST)}`;
    case "email": {
      const n = `${rand(FIRST)}.${rand(LAST)}`.toLowerCase();
      return `${n}${randInt(1, 999)}@${rand(["gmail.com", "outlook.com", "proton.me", "example.com"])}`;
    }
    case "company":
      return rand(COMPANIES);
    case "city":
      return rand(CITIES);
    case "country":
      return rand(COUNTRIES);
    case "phone":
      return `+${randInt(1, 99)}-${randInt(1000000000, 9999999999)}`;
    case "date":
      return randDate().toISOString().slice(0, 10);
    case "datetime":
      return randDate().toISOString();
    case "enum": {
      const opts = (f.opts || "A,B,C")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return rand(opts);
    }
    case "url":
      return `https://${rand(["app", "api", "www", "cdn"])}.${rand(COMPANIES).toLowerCase().replace(/\s+/g, "")}.com/${uuid().slice(0, 8)}`;
    case "ip":
      return `${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(0, 255)}`;
    case "string":
    default: {
      const len = +(f.opts || "8") || 8;
      return Math.random()
        .toString(36)
        .slice(2, 2 + len);
    }
  }
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function toSqlInsert(table: string, rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const lit = (v: unknown) => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  return (
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n` +
    rows.map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n") +
    ";"
  );
}

const FIELD_TYPES: FieldType[] = [
  "int",
  "float",
  "bool",
  "uuid",
  "name",
  "email",
  "company",
  "city",
  "country",
  "phone",
  "date",
  "datetime",
  "enum",
  "string",
  "url",
  "ip",
];

function DataBuilderPanel() {
  const [fields, setFields] = useState<SchemaField[]>([
    { name: "id", type: "uuid" },
    { name: "name", type: "name" },
    { name: "email", type: "email" },
    { name: "country", type: "country" },
    { name: "amount", type: "float", opts: "10-9999" },
    { name: "tier", type: "enum", opts: "free,pro,team" },
    { name: "active", type: "bool" },
    { name: "signed_up_at", type: "datetime" },
  ]);
  const [count, setCount] = useState(25);
  const [format, setFormat] = useState<"json" | "csv" | "sql">("json");
  const [table, setTable] = useState("users");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [copied, setCopied] = useState(false);

  function generate() {
    const data: Record<string, unknown>[] = [];
    const safeCount = clampRows(count);
    for (let i = 0; i < safeCount; i++) {
      const r: Record<string, unknown> = {};
      for (const f of fields) r[f.name || `col_${i}`] = genValue(f);
      data.push(r);
    }
    setRows(data);
  }

  useEffect(() => {
    generate(); /* eslint-disable-next-line */
  }, []);

  const output = useMemo(() => {
    if (!rows.length) return "";
    if (format === "json") return JSON.stringify(rows, null, 2);
    if (format === "csv") return toCsv(rows);
    return toSqlInsert(table, rows);
  }, [rows, format, table]);

  const html = useMemo(() => {
    if (format === "sql") return highlight(output, "sql");
    return escapeHtml(output);
  }, [output, format]);

  function updateField(i: number, patch: Partial<SchemaField>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function addField() {
    setFields((f) => [...f, { name: `field_${f.length + 1}`, type: "string" }]);
  }
  function removeField(i: number) {
    setFields((f) => f.filter((_, idx) => idx !== i));
  }

  function download() {
    const ext = format === "json" ? "json" : format === "csv" ? "csv" : "sql";
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table || "data"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid lg:grid-cols-[380px_1fr] gap-6">
      {/* Schema editor */}
      <div className="panel p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">Schema</h2>
          <button onClick={addField} className="btn btn-sm btn-secondary">
            Add field
          </button>
        </div>
        <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_70px_24px] gap-2 items-center">
              <input
                aria-label="Field name"
                value={f.name}
                onChange={(e) => updateField(i, { name: e.target.value })}
                className="field"
              />
              <select
                aria-label="Field type"
                value={f.type}
                onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                className="field px-1"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                aria-label="Field options"
                value={f.opts || ""}
                onChange={(e) => updateField(i, { opts: e.target.value })}
                placeholder={
                  f.type === "enum"
                    ? "a,b,c"
                    : f.type === "int" || f.type === "float"
                      ? "0-100"
                      : ""
                }
                className="field"
              />
              <button
                onClick={() => removeField(i)}
                aria-label="Remove field"
                className="btn btn-sm btn-ghost px-1"
              >
                <XIcon className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          <label className="eyebrow block">
            Rows
            <input
              type="number"
              min={1}
              max={5000}
              value={count}
              onChange={(e) => setCount(clampRows(e.target.value))}
              className="field mt-1"
            />
          </label>
          <label className="eyebrow block">
            Format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as "json" | "csv" | "sql")}
              className="field mt-1"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="sql">SQL INSERT</option>
            </select>
          </label>
          {format === "sql" && (
            <label className="eyebrow block">
              Table name
              <input
                value={table}
                onChange={(e) => setTable(e.target.value)}
                className="field mt-1"
              />
            </label>
          )}
          <button onClick={generate} className="btn btn-primary w-full">
            GENERATE {count} ROWS
          </button>
        </div>
      </div>

      {/* Output */}
      <div className="panel flex flex-col overflow-hidden">
        <Toolbar
          left={
            <span className="text-xs text-muted-foreground font-mono">
              {rows.length} rows · {format.toUpperCase()}
            </span>
          }
          right={
            <>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="btn btn-sm btn-secondary"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={download} className="btn btn-sm btn-primary">
                Download
              </button>
            </>
          }
        />
        <div className="p-6 overflow-auto bg-surface/40 h-[520px]">
          <pre
            className="text-foreground whitespace-pre font-mono text-xs leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}

// ------------------------- JSON beautifier -------------------------

const JSON_SAMPLE = `{"pipeline":"daily_orders","engine":"databricks","steps":[{"op":"read","path":"s3://lake/orders","format":"delta"},{"op":"filter","expr":"order_date >= '2024-01-01'"},{"op":"aggregate","by":["region"],"metrics":{"revenue":"sum(amount)"}}],"retries":3,"enabled":true}`;

function JsonPanel() {
  const cap = useCappedInput(MAX_JSON_CHARS);
  const [input, setInput] = useState(JSON_SAMPLE);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [indent, setIndent] = useState(2);
  const [copied, setCopied] = useState(false);

  function apply(mode: "pretty" | "minify", sortKeys = false) {
    const source = sortKeys
      ? (() => {
          const parsed = formatJson(input, "pretty", indent);
          if (!parsed.ok) return input;
          return JSON.stringify(sortJsonKeys(JSON.parse(input)));
        })()
      : input;
    const res = formatJson(source, mode, indent);
    if (res.ok) {
      setOutput(res.text);
      setError(null);
    } else {
      setOutput("");
      setError(res.error);
    }
  }

  const stats = useMemo(() => {
    const bytes = new TextEncoder().encode(output || input).length;
    return `${(output || input).split("\n").length} lines · ${bytes.toLocaleString()} B`;
  }, [output, input]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border bg-surface-2/50">
        <div className="eyebrow">JSON beautifier · formatter · validator</div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="eyebrow">
            Indent
            <select
              value={indent}
              onChange={(e) => setIndent(Number(e.target.value))}
              className="field ml-2 w-auto py-1"
            >
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={8}>8</option>
            </select>
          </label>
          <button
            onClick={() => apply("pretty", true)}
            className="btn btn-sm btn-secondary"
            title="Beautify and sort object keys alphabetically"
          >
            Sort keys
          </button>
          <button onClick={() => apply("minify")} className="btn btn-sm btn-secondary">
            Minify
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(output || input);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="btn btn-sm btn-secondary"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={() => apply("pretty")} className="btn btn-sm btn-primary">
            Beautify
          </button>
        </div>
      </div>

      {error ? (
        <div className="status-bar status-error">
          <XIcon className="inline-block size-3 mr-1 -mt-0.5" aria-hidden="true" />
          {error}
        </div>
      ) : output ? (
        <div className="status-bar status-ok">
          <Check className="inline-block size-3 mr-1 -mt-0.5" aria-hidden="true" />
          Valid JSON · {stats}
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 md:h-[480px] font-mono text-sm leading-relaxed overflow-hidden">
        <div className="p-4 md:p-6 border-b md:border-b-0 md:border-r border-border overflow-auto bg-surface-2/40 min-h-[300px] md:min-h-0">
          <div className="eyebrow mb-3">Input — JSON</div>
          {cap.notice && (
            <div role="status" className="mb-2 text-[11px] font-mono text-amber-200">
              <AlertTriangle className="inline-block size-3 mr-1 -mt-0.5" aria-hidden="true" />
              {cap.notice}
            </div>
          )}
          <textarea
            value={input}
            aria-label="JSON input editor"
            maxLength={MAX_JSON_CHARS}
            onChange={(e) => {
              cap.apply(e.target.value, setInput);
              setError(null);
            }}
            spellCheck={false}
            className="editor h-[260px] md:h-[calc(100%-1.5rem)]"
          />
        </div>
        <div className="p-4 md:p-6 overflow-auto min-h-[300px] md:min-h-0">
          <div className="eyebrow mb-3">Formatted output</div>
          <pre className="whitespace-pre text-primary/90 text-sm leading-relaxed">
            {output || "// Press BEAUTIFY to format and validate your JSON."}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ------------------------- Tabs shell -------------------------

const TABS: { id: Mode; label: string; sub: string }[] = [
  { id: "SQL", label: "SQL", sub: "10 engines" },
  { id: "PYTHON", label: "Python", sub: "+ runtime" },
  { id: "PYSPARK", label: "PySpark", sub: "Catalyst-aware" },
  { id: "DATA", label: "Data Builder", sub: "schema → rows" },
  { id: "JSON", label: "JSON", sub: "beautify · validate" },
];

export function Workspace() {
  const [mode, setMode] = useState<Mode>("SQL");
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} style={{ animation: "fadeIn 0.6s ease-out both" }}>
      <div
        role="tablist"
        aria-label="Optimizer modes"
        className="mb-4 inline-flex flex-wrap gap-1 rounded-lg border border-border bg-surface-2/80 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={mode === t.id}
            onClick={() => setMode(t.id)}
            className={`press relative flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors duration-200 ${
              mode === t.id
                ? "bg-surface text-foreground shadow-[0_1px_0_0_color-mix(in_oklab,white_6%,transparent)_inset,0_6px_18px_-12px_rgb(0_0_0/0.8)] ring-1 ring-border-strong"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{t.label}</span>
            <span
              className={`text-[10px] font-medium uppercase tracking-wider ${mode === t.id ? "text-primary" : "text-subtle-foreground"}`}
            >
              {t.sub}
            </span>
          </button>
        ))}
      </div>

      <PanelBoundary name={`${mode} panel`}>
        <div key={mode} style={{ animation: "fadeIn 0.35s cubic-bezier(0.22,1,0.36,1) both" }}>
          {mode === "SQL" && <SqlPanel />}
          {mode === "PYTHON" && <PythonPanel />}
          {mode === "PYSPARK" && <PySparkPanel />}
          {mode === "DATA" && <DataBuilderPanel />}
          {mode === "JSON" && <JsonPanel />}
        </div>
      </PanelBoundary>
    </div>
  );
}
