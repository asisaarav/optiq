# OPTIQ

**Live optimizer for SQL, Python and PySpark.** Paste a slow query or script, get a
production-safe rewrite with the reasoning behind every change, run it against an
in-browser runtime, and generate test data on the fly.

Live: https://code-optimizer.instaluxe.in

---

## What it does

| Workspace        | Capability                                                                                                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQL**          | 10 engines (PostgreSQL, MySQL, Oracle, PL/SQL, SQL Server, Snowflake, BigQuery, Redshift, Databricks SQL, ClickHouse). Rule-based rewrites + AI pass, live diagnostics, in-browser execution with auto-generated or user-supplied fixtures, assertion-style test cases, engine-specific tuning tips. |
| **Python**       | Idiom and anti-pattern rewrites (comprehensions, `sum()`, `enumerate`, truthiness, `__main__` guard). Sandboxed Pyodide runtime in a Web Worker with a hard timeout.                                                                                                                                 |
| **PySpark**      | Catalyst-aware static analysis: predicate pushdown, chained pipelines, `.collect()` / `.toPandas()` / UDF warnings, derived logical plan preview.                                                                                                                                                    |
| **Data Builder** | Schema-driven synthetic data (16 field types) exported as JSON, CSV or SQL `INSERT`. Row count is hard-capped.                                                                                                                                                                                       |
| **JSON**         | Beautify, minify, sort keys, validate with precise error location.                                                                                                                                                                                                                                   |
| **Public API**   | `POST /api/public/v1/optimize` - schema-validated, size-capped, rate-limited.                                                                                                                                                                                                                        |

### Safety guarantees

Every rewrite (rule-based or AI) passes a **business-logic guard** before it is shown:
literals must survive, join types cannot drift, `DISTINCT` cannot be introduced, and no
column may be newly wrapped in a function. If a rewrite fails the guard the original is
returned with the reason surfaced to the user. Nothing the user pastes is ever evaluated
on the server or rendered as raw HTML.

---

## Architecture

```
Browser                                   Cloudflare Worker (TanStack Start SSR)
-------------------------------------     -----------------------------------------
React 19 + TanStack Router                src/server.ts        security headers / CSP
  Workspace (SQL/Py/PySpark/Data/JSON)    server functions     aiOptimize (server-only key)
  Rule engine (pure TS)                   /api/public/v1/*     public optimize API
  alasql (in-memory SQL)                  Supabase             auth (Google OAuth) + RLS
  Pyodide in Web Worker (15s cap)         AI provider          any OpenAI-compatible endpoint
```

- **Framework:** TanStack Start (React 19, SSR, server functions), Vite 7, Tailwind v4.
- **Runtime target:** Cloudflare Workers via Nitro (`cloudflare-module` preset).
- **Auth/DB:** Supabase (publishable key in the browser, service role only on the server).
- **AI:** provider-agnostic. Set `AI_API_KEY`, optionally `AI_BASE_URL` / `AI_MODEL`.

---

## Local development

```sh
git clone https://github.com/asisaarav/optiq.git
cd optiq
cp .env.example .env        # fill in Supabase + AI provider values
npm install
npm run dev                 # http://localhost:8080
```

Useful scripts:

| Script           | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `npm run check`  | typecheck + lint + tests + production build (what CI runs) |
| `npm test`       | vitest unit tests                                          |
| `npm run build`  | production build to `dist/`                                |
| `npm run deploy` | build and `wrangler deploy` to Cloudflare Workers          |

---

## Deployment (Cloudflare Workers)

1. `wrangler login` (or set `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as repo secrets).
2. Add Worker secrets: `wrangler secret put AI_API_KEY`, `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (and `AI_BASE_URL` / `AI_MODEL` if not default).
3. `npm run deploy`, or set the repo variable `DEPLOY_ENABLED=true` to let the `Deploy`
   workflow ship every merge to `main`.
4. Point your custom domain at the Worker (Cloudflare dashboard -> Workers -> Custom domains).

Google sign-in requires the Google provider enabled in the Supabase project
(Authentication -> Providers -> Google) with `https://<your-domain>` as an allowed redirect URL.

---

## Security

See [SECURITY.md](./SECURITY.md) for the reporting policy and full posture. Highlights:

- CSP, HSTS, COOP, frame and referrer policies on every HTML response.
- All user input size-capped; Python and SQL run inside a sandboxed worker with a hard timeout.
- Secrets live only in Worker environment variables; nothing sensitive is in the client bundle.
- CI gates: typecheck, lint, format, unit tests, production build, `npm audit`, CodeQL.
- Dependabot for npm and GitHub Actions.

---

## License

Proprietary. All rights reserved (c) Ashish Kumar.
