# OPTIQ

Optimize, beautify and compare SQL, Python and PySpark — in the browser, for free.
Rewrites are engine-aware, explained, and verified against a business-logic guard
before they are ever shown.

Production: https://code-optimizer.instaluxe.in

## What it does

- **Optimize** — engine-aware rewrites for 10 SQL dialects, Python and PySpark,
  each with an itemised change list, a safety guard and an honest speed-up estimate.
- **Beautify** — SQL, JSON, JavaScript, TypeScript, HTML, CSS, YAML, XML and
  Markdown, with automatic language detection.
- **Compare** — two editors that auto-detect and beautify on demand, then produce
  a line-level diff on one click.

Everything runs client-side. Your code never leaves the page.

## Repository layout

```
apps/web          Next.js 16 (App Router, React 19, Tailwind v4) - the product
services/api      Go 1.22+ HTTP service - the same rule engine, for API use
.github/workflows CI per stack, deploy, CodeQL, Dependabot
```

### Why two implementations of the engine

The optimizer runs in the browser (instant, private, free to host). The Go
service in `services/api` exposes the same rules over HTTP for programmatic use
and future server-side workloads (customer DB `EXPLAIN` pulls, API-key billing).
The web app does not depend on it, so the site deploys and scales as a static
Worker with no backend to run.

## Local development

```sh
cd apps/web
cp .env.example .env.local   # optional
npm install
npm run dev                  # http://localhost:3000
```

Go service (optional, for the HTTP API):

```sh
cd services/api && make run  # http://localhost:8080
```

## Deployment

The web app deploys to **Cloudflare Workers** via the OpenNext adapter — free
tier, global edge, no server to manage. CI builds and deploys on push to `main`
when the repo variable `DEPLOY_ENABLED=true` and the Cloudflare secrets are set.

```sh
cd apps/web
npm run cf:build      # OpenNext build
npm run cf:preview    # run the Worker locally
npm run cf:deploy     # deploy (needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
```

## Engineering standards

- **Tests gate merges.** Web: typecheck, lint, format, unit tests, build, npm
  audit. Go: unit plus fuzz, race detector, 75% coverage floor, govulncheck.
- **Supply chain.** Dependabot on npm, Go, Docker and Actions; CodeQL on both
  languages; zero-vulnerability dependency tree.
- **Hardening.** CSP and security headers at the edge; the Go service adds rate
  limiting, body caps, panic recovery, strict CORS and structured logs.
- **Branch protection.** PR plus green CI, linear history, no force pushes.

## License

Proprietary. All rights reserved (c) Ashish Kumar.
