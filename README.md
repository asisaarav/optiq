# OPTIQ

Live optimizer for SQL, Python and PySpark. Rewrites are engine-aware, explained,
and verified against a business-logic guard before they are ever shown.

Production: https://code-optimizer.instaluxe.in

## Repository layout

```
apps/web          Next.js 16 (App Router, React 19, Tailwind v4) - UI and BFF
services/api      Go 1.25 HTTP service - rule engine, validators, safety guard
.github/workflows CI per stack, Dependabot, CodeQL
```

The browser never calls the Go service directly. Next.js Server Actions proxy
every request, so the API stays private, CORS stays closed, and secrets remain
server-side.

## Architecture

```
Browser ──▶ Next.js (SSR + Server Actions) ──▶ Go API ──▶ optimizer rule engine
                     │                              │
                     └─ Pyodide / alasql            └─ stateless, horizontally scalable
                        (client-side execution)
```

Heavy execution stays in the browser (WebAssembly Python, in-memory SQL) so user
code never reaches a server. The Go service is pure CPU work with no database, no
session state and no user data - it can be scaled or restarted freely.

## Quick start

```sh
# backend
cd services/api && make run          # :8080

# frontend (separate shell)
cd apps/web && cp .env.example .env.local && npm install && npm run dev   # :3000
```

## API

| Method | Path            | Purpose                                     |
| ------ | --------------- | ------------------------------------------- |
| GET    | `/healthz`      | liveness                                    |
| GET    | `/readyz`       | readiness plus version and commit           |
| GET    | `/v1/engines`   | supported engines (the UI renders from this) |
| POST   | `/v1/optimize`  | rewrite plus changes, diagnostics, speedup  |
| POST   | `/v1/validate`  | diagnostics only                            |

```sh
curl -X POST localhost:8080/v1/optimize \
  -H 'content-type: application/json' \
  -d '{"engine":"mysql","code":"SELECT * FROM orders WHERE DATE(created_at) = '"'"'2024-01-01'"'"';"}'
```

Every response carries `X-Request-Id`; errors use one envelope
(`{"error":{"code","message","request_id"}}`) so failures are traceable end to end.

## Engineering standards

- **Tests gate merges.** Go: unit plus fuzz, race detector, 75% coverage floor.
  Web: typecheck, lint, format, build, `npm audit`.
- **Supply chain.** `govulncheck` on every backend change, Dependabot on Go, npm,
  Docker and Actions, CodeQL on the repo.
- **Runtime hardening.** Rate limiting, body caps, panic recovery, security
  headers, strict CORS allow-list, graceful shutdown, structured JSON logs with
  correlation IDs.
- **Containers.** Distroless non-root image, static binary, no shell.
- **Branch protection.** PR plus review plus green CI; linear history; no force pushes.

## License

Proprietary. All rights reserved (c) Ashish Kumar.
