// Curated, engine-specific best practices.
// Sourced from official docs / open-source guides:
//  - Spark: spark.apache.org tuning guide, Databricks runtime notes
//  - ClickHouse: clickhouse.com/docs (MergeTree, PREWHERE, projections)
//  - PostgreSQL: postgresql.org/docs (indexing, planner)
//  - BigQuery / Snowflake / Redshift: vendor public best-practice guides
//  - Python: PEP 8, CPython perf tips
// These are general, engine-level tips — independent of the user's specific code.

export type TipCategory =
  | "Partitioning"
  | "Indexing"
  | "Clustering"
  | "Functions & UDFs"
  | "Concurrency / Threading"
  | "Memory & Caching"
  | "Statistics & Planner"
  | "I/O & File Layout";

export type Tip = { category: TipCategory; title: string; body: string };

export type TipsKey =
  | "POSTGRESQL" | "MYSQL" | "ORACLE" | "PL/SQL" | "SQL SERVER"
  | "SNOWFLAKE" | "BIGQUERY" | "REDSHIFT" | "DATABRICKS SQL" | "CLICKHOUSE"
  | "PYTHON" | "PYSPARK";

export const ENGINE_TIPS: Record<TipsKey, Tip[]> = {
  POSTGRESQL: [
    { category: "Partitioning", title: "Declarative range partitioning",
      body: "Partition large tables by RANGE on a date/id column; combine with partition-wise joins (enable_partitionwise_join=on) to prune at plan time." },
    { category: "Indexing", title: "BRIN for append-only time-series",
      body: "BRIN indexes are 1000× smaller than B-tree on monotonically-increasing columns (created_at, id) and pair perfectly with range partitioning." },
    { category: "Indexing", title: "Covering & partial indexes",
      body: "Use INCLUDE for index-only scans and WHERE-clauses for partial indexes (e.g. status='active') — slashes index size & write amplification." },
    { category: "Statistics & Planner", title: "Boost statistics on skewed columns",
      body: "ALTER TABLE … ALTER COLUMN … SET STATISTICS 1000 then ANALYZE — gives the planner better selectivity estimates on hot columns." },
    { category: "Functions & UDFs", title: "Mark functions IMMUTABLE / STABLE",
      body: "Volatility tags let the planner inline & cache results. Pure functions should be IMMUTABLE PARALLEL SAFE." },
    { category: "Concurrency / Threading", title: "Tune parallel workers",
      body: "Set max_parallel_workers_per_gather, parallel_setup_cost, and min_parallel_table_scan_size; large analytical scans benefit hugely." },
  ],

  MYSQL: [
    { category: "Indexing", title: "Composite index column order",
      body: "Place equality columns first, then range columns. InnoDB cannot use a column after the first range predicate in an index." },
    { category: "Indexing", title: "Covering indexes & InnoDB clustered PK",
      body: "Every secondary index implicitly stores the PK — keep PK narrow (BIGINT, not UUID v4) to shrink every secondary index." },
    { category: "Partitioning", title: "Avoid over-partitioning",
      body: "MySQL partition pruning is weaker than Postgres; >50 partitions often costs more than it saves. Prefer composite indexes." },
    { category: "Concurrency / Threading", title: "innodb_thread_concurrency",
      body: "Default 0 (unlimited) is usually fine, but cap at 2× cores for OLTP under heavy contention." },
    { category: "Functions & UDFs", title: "Avoid functions on indexed columns",
      body: "DATE(col), LOWER(col), or arithmetic in WHERE blocks index use — generate a virtual column (STORED) and index that." },
  ],

  ORACLE: [
    { category: "Indexing", title: "Function-based indexes",
      body: "If you must filter by UPPER(name) or TRUNC(dt), create a matching function-based index — Oracle will rewrite the predicate transparently." },
    { category: "Partitioning", title: "Interval partitioning",
      body: "PARTITION BY RANGE (dt) INTERVAL (NUMTOYMINTERVAL(1,'MONTH')) auto-creates partitions — no DDL maintenance jobs needed." },
    { category: "Functions & UDFs", title: "PRAGMA UDF for SQL-callable PL/SQL",
      body: "PRAGMA UDF reduces context-switch overhead by ~30% when calling PL/SQL from inside SQL." },
    { category: "Concurrency / Threading", title: "Parallel hints with care",
      body: "/*+ PARALLEL(t, 8) */ helps for full scans on large tables; on indexed lookups it usually hurts. Enable Auto DOP for self-tuning." },
    { category: "Statistics & Planner", title: "Histograms on skewed columns",
      body: "DBMS_STATS.GATHER_TABLE_STATS with METHOD_OPT='FOR COLUMNS SIZE AUTO' captures histograms for skewed predicates." },
  ],

  "PL/SQL": [
    { category: "Functions & UDFs", title: "BULK COLLECT + FORALL",
      body: "Replace row-by-row cursor loops with BULK COLLECT INTO + FORALL … LIMIT 1000 — typically 10–50× faster on DML." },
    { category: "Functions & UDFs", title: "Pipelined table functions",
      body: "Stream rows out of a function with PIPELINED so callers can consume lazily without materializing the full collection." },
    { category: "Concurrency / Threading", title: "DBMS_PARALLEL_EXECUTE",
      body: "Chunk huge UPDATE/DELETE jobs by rowid and run in parallel sessions — bypasses single-session redo bottleneck." },
    { category: "Memory & Caching", title: "RESULT_CACHE for read-heavy lookups",
      body: "Add RESULT_CACHE to deterministic functions over slowly-changing reference data — sub-microsecond cache hits." },
  ],

  "SQL SERVER": [
    { category: "Indexing", title: "Columnstore for analytics",
      body: "CREATE CLUSTERED COLUMNSTORE INDEX on fact tables — 10× compression and batch-mode execution. Use rowstore for OLTP." },
    { category: "Indexing", title: "Filtered indexes",
      body: "CREATE INDEX … WHERE status='active' — smaller, faster, and the optimizer uses them automatically when predicate matches." },
    { category: "Concurrency / Threading", title: "MAXDOP & Cost Threshold",
      body: "Set MAXDOP to physical cores per NUMA node; raise Cost Threshold for Parallelism from default 5 to 50 to avoid parallel OLTP queries." },
    { category: "Statistics & Planner", title: "Avoid NOLOCK",
      body: "READ COMMITTED SNAPSHOT ISOLATION (RCSI) gives non-blocking reads without dirty data. Enable once at the database level." },
  ],

  SNOWFLAKE: [
    { category: "Clustering", title: "Cluster keys ≠ indexes",
      body: "Define CLUSTER BY on the column most often used in selective filters/joins. Monitor SYSTEM$CLUSTERING_INFORMATION; reclustering is automatic but costs credits." },
    { category: "I/O & File Layout", title: "Micro-partition pruning",
      body: "Snowflake auto-prunes by min/max — write data sorted by your filter columns at load time to maximize pruning ratio." },
    { category: "Memory & Caching", title: "Result & warehouse caches",
      body: "Identical query within 24h hits the result cache (free). Warm warehouse keeps the local SSD cache hot — use multi-cluster for concurrency, not size." },
    { category: "Functions & UDFs", title: "Vectorized Python UDFs",
      body: "Use @vectorized(input=pandas.DataFrame) — processes batches of rows, ~100× faster than scalar UDFs for numeric work." },
    { category: "Concurrency / Threading", title: "Multi-cluster warehouses",
      body: "For concurrent BI users, scale OUT (multi-cluster) not UP. For long single queries, scale UP (XS→L)." },
  ],

  BIGQUERY: [
    { category: "Partitioning", title: "Partition + cluster combo",
      body: "PARTITION BY DATE(_PARTITIONTIME) + CLUSTER BY (user_id, country). Always include partition filter in WHERE — BigQuery charges by scanned bytes." },
    { category: "Clustering", title: "Up to 4 clustering columns",
      body: "Order clustering columns by selectivity, most-selective first. Re-clustering is automatic and free." },
    { category: "I/O & File Layout", title: "Avoid SELECT * on wide tables",
      body: "BigQuery is columnar — every selected column adds to scanned bytes & cost. Use EXCEPT() to drop a few columns from many." },
    { category: "Functions & UDFs", title: "Persistent UDFs over JS",
      body: "Prefer SQL UDFs (inlined by planner) over JS UDFs (run in a sandboxed VM, ~10× slower). Use TVFs for parameterized views." },
    { category: "Memory & Caching", title: "Materialized views & BI Engine",
      body: "Materialized views auto-refresh and are transparently substituted by the planner. BI Engine pins hot tables in RAM for sub-second dashboards." },
  ],

  REDSHIFT: [
    { category: "I/O & File Layout", title: "DISTKEY & SORTKEY",
      body: "DISTKEY on the join column avoids redistribution. Compound SORTKEY on (date, customer_id) enables zone-map pruning." },
    { category: "Statistics & Planner", title: "ANALYZE & VACUUM regularly",
      body: "Stale stats kill the optimizer. Set auto-analyze ON and run VACUUM SORT ONLY after large loads to maintain sort order." },
    { category: "Concurrency / Threading", title: "WLM queues + Concurrency Scaling",
      body: "Separate ETL and BI in WLM queues. Enable Concurrency Scaling to burst short queries to transient clusters automatically." },
    { category: "Memory & Caching", title: "Result cache & Materialized views",
      body: "Result cache is on by default. Use AUTO REFRESH materialized views for dashboard queries against fact tables." },
  ],

  "DATABRICKS SQL": [
    { category: "I/O & File Layout", title: "Liquid Clustering > ZORDER",
      body: "On Delta Lake, prefer Liquid Clustering (CLUSTER BY) — incremental, no full rewrite, adapts to query patterns." },
    { category: "I/O & File Layout", title: "OPTIMIZE + VACUUM cadence",
      body: "Run OPTIMIZE weekly (compacts small files into ~1GB) and VACUUM RETAIN 168 HOURS to reclaim storage from time-travel snapshots." },
    { category: "Statistics & Planner", title: "Photon engine & predictive I/O",
      body: "Photon is a vectorized C++ engine — automatic on SQL warehouses; ensure the cluster runtime is Photon-enabled for analytical workloads." },
    { category: "Concurrency / Threading", title: "Serverless SQL warehouses",
      body: "Serverless cuts cold-start to <10s and auto-scales clusters. Use Pro for BI dashboards with high concurrency." },
  ],

  CLICKHOUSE: [
    { category: "I/O & File Layout", title: "ORDER BY = primary key",
      body: "ORDER BY in MergeTree IS the sparse primary index. Put the most selective filter column first; granularity defaults to 8192 rows." },
    { category: "I/O & File Layout", title: "PREWHERE for column pruning",
      body: "PREWHERE evaluates a predicate on a small subset of columns BEFORE reading the rest — set optimize_move_to_prewhere=1 to let CH do it automatically." },
    { category: "Partitioning", title: "Coarse partition keys",
      body: "PARTITION BY toYYYYMM(date) — never per-day for years of data. Each partition is a directory; thousands of partitions = slow merges." },
    { category: "Indexing", title: "Skip indexes (minmax / set / bloom_filter)",
      body: "ALTER TABLE … ADD INDEX idx col TYPE bloom_filter(0.01) GRANULARITY 4 — skips granules where the value can't exist." },
    { category: "Clustering", title: "Projections for alternate sort orders",
      body: "Projections are materialized aggregates / re-sorts maintained automatically — like indexes but for analytical queries." },
    { category: "Concurrency / Threading", title: "max_threads per query",
      body: "Default = #CPU cores. Lower to 4–8 in high-concurrency BI clusters; raise for ad-hoc heavy scans." },
  ],

  PYTHON: [
    { category: "Concurrency / Threading", title: "GIL: threads vs processes",
      body: "Threads help for I/O-bound work (network, disk). For CPU-bound work use multiprocessing or release the GIL via NumPy/Numba/Cython." },
    { category: "Concurrency / Threading", title: "asyncio for fan-out I/O",
      body: "Use asyncio.gather() with httpx/aiohttp for thousands of concurrent requests — single thread, no GIL contention." },
    { category: "Memory & Caching", title: "functools.lru_cache / cache",
      body: "Decorate pure functions with @cache — free memoization for recursive or repeatedly-called helpers." },
    { category: "Memory & Caching", title: "__slots__ on hot classes",
      body: "Define __slots__ to skip per-instance __dict__ — 30–50% memory savings and faster attribute access on millions of objects." },
    { category: "Functions & UDFs", title: "Vectorize with NumPy / Polars",
      body: "Replace Python loops over numeric data with NumPy ufuncs or Polars expressions — orders of magnitude faster." },
    { category: "I/O & File Layout", title: "Use Polars or DuckDB for tabular data",
      body: "Polars (Rust + Arrow) and DuckDB (in-process OLAP) are 10–100× faster than pandas for filter/groupby on >1M rows." },
  ],

  PYSPARK: [
    { category: "Partitioning", title: "spark.sql.shuffle.partitions",
      body: "Default 200 is wrong for almost every workload. Aim for 100–200MB per partition; with AQE on, Spark coalesces automatically." },
    { category: "Partitioning", title: "Avoid tiny files / repartition before write",
      body: ".repartition(N, col) or .coalesce(N) before .write to land sensibly-sized output files (~128MB–1GB Parquet)." },
    { category: "Clustering", title: "Bucketing for repeated joins",
      body: "df.write.bucketBy(N, 'user_id').sortBy('user_id') eliminates shuffle on subsequent joins by the same key." },
    { category: "Memory & Caching", title: "cache() / persist(MEMORY_AND_DISK)",
      body: "Cache only when a DataFrame is reused ≥3 times. MEMORY_AND_DISK is safer than MEMORY_ONLY (won't recompute on spill)." },
    { category: "Statistics & Planner", title: "Adaptive Query Execution (AQE)",
      body: "spark.sql.adaptive.enabled=true: dynamic shuffle coalescing, skew join handling, and join strategy switching at runtime." },
    { category: "Functions & UDFs", title: "Avoid Python UDFs — use built-ins",
      body: "Built-in pyspark.sql.functions are JVM-native. If you must write Python, use @pandas_udf for vectorized batch processing (~100× faster than @udf)." },
    { category: "Concurrency / Threading", title: "Broadcast joins for small tables",
      body: "broadcast(small_df) when one side <10MB — eliminates shuffle entirely. spark.sql.autoBroadcastJoinThreshold controls auto-broadcast." },
    { category: "I/O & File Layout", title: "Parquet + predicate pushdown",
      body: "Always Parquet (or Delta/Iceberg). Filter columns pushed down at scan time; SELECT only the columns you need." },
  ],
};
