import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { Workspace } from "@/components/Workspace";
import { Reveal } from "@/components/Reveal";
import { ArrowRight, Check, Cpu, Layers, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Optiq — Live SQL, Python & PySpark code optimizer" },
      {
        name: "description",
        content:
          "Optimize and run SQL, Python, and PySpark in the browser. 10 SQL engines, live diagnostics, sample-data generation, and engine-specific tuning tips.",
      },
      { property: "og:title", content: "Optiq — Live SQL, Python & PySpark code optimizer" },
      {
        property: "og:description",
        content:
          "Optimize and run SQL, Python, and PySpark in the browser with live diagnostics and engine-specific tuning tips.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://code-optimizer.instaluxe.in/" },
      { property: "og:image", content: "https://code-optimizer.instaluxe.in/og-optiq.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Optiq — query and script optimizer for SQL, Python and PySpark",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Optiq — Live SQL, Python & PySpark code optimizer" },
      {
        name: "twitter:description",
        content:
          "Optimize and run SQL, Python, and PySpark in the browser with live diagnostics and engine-specific tuning tips.",
      },
      { name: "twitter:image", content: "https://code-optimizer.instaluxe.in/og-optiq.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://code-optimizer.instaluxe.in/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Optiq",
          description: "Code optimizer for SQL, Python, and PySpark",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          url: "https://code-optimizer.instaluxe.in",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  component: Index,
});

const ENGINES = [
  "PostgreSQL",
  "MySQL",
  "Oracle",
  "PL/SQL",
  "SQL Server",
  "Snowflake",
  "BigQuery",
  "Redshift",
  "Databricks SQL",
  "ClickHouse",
  "Python",
  "PySpark",
] as const;

const PILLARS = [
  {
    title: "Rewrites you can trust",
    body: "Every rewrite - rule-based or AI - passes a business-logic guard: literals must survive, join types cannot drift, DISTINCT cannot appear, and no column is silently wrapped in a function. If a rewrite fails the guard, you see the original and the reason.",
    icon: ShieldCheck,
  },
  {
    title: "Runs in your browser",
    body: "SQL executes against an in-memory engine seeded with fixtures inferred from your query. Python runs on a sandboxed WebAssembly runtime inside a Web Worker with a hard timeout. Nothing you paste ever leaves the page unless you press Optimize with AI.",
    icon: Cpu,
  },
  {
    title: "Engine-aware advice",
    body: "PREWHERE for ClickHouse, partition pruning for BigQuery, FETCH FIRST for Oracle, QUALIFY for Snowflake, Catalyst-friendly chaining for PySpark. Tips and rules are per engine, sourced from vendor docs and planner behaviour, not generic linting.",
    icon: Layers,
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Paste",
    body: "Drop in a query, script or DataFrame pipeline. Diagnostics run as you type.",
  },
  {
    n: "02",
    title: "Optimize",
    body: "Get a rewrite with an itemised change list, an honest speed-up estimate and a diff view.",
  },
  {
    n: "03",
    title: "Verify",
    body: "Run input and output side by side on generated or custom data, then assert with test cases.",
  },
] as const;

const PLANS = [
  {
    name: "Free",
    price: "$0",
    tagline: "For individual engineers",
    items: [
      "All 10 SQL engines, Python and PySpark",
      "In-browser SQL and Python runtimes",
      "Data Builder and JSON tools",
      "Rule-based optimizer",
    ],
    cta: "Open the optimizer",
    href: "#workspace",
  },
  {
    name: "Pro",
    price: "$29",
    suffix: "/mo",
    tagline: "For daily production work",
    items: [
      "Everything in Free",
      "AI optimization pass",
      "Saved runs and history",
      "Priority queue",
    ],
    cta: "Start Pro",
    href: "#workspace",
    popular: true,
  },
  {
    name: "Team",
    price: "$99",
    suffix: "/mo",
    tagline: "For data platform teams",
    items: ["Everything in Pro", "Shared workspaces", "Audit exports", "SSO (roadmap)"],
    cta: "Contact sales",
    href: "mailto:sales@instaluxe.in",
  },
] as const;

function Index() {
  return (
    <div className="min-h-dvh bg-background text-foreground selection:bg-primary/30">
      <Nav />

      <main>
        {/* Hero */}
        <section
          id="workspace"
          className="hero-ambient relative mx-auto max-w-7xl scroll-mt-16 px-6 pt-16 pb-24 md:pt-24"
        >
          <div className="grid-veil" aria-hidden="true" />
          <div className="mb-12 max-w-3xl" style={{ animation: "fadeIn 0.7s ease-out both" }}>
            <div className="chip mb-6 gap-2 px-3 py-1 font-mono text-[11px] uppercase tracking-widest backdrop-blur">
              <span className="size-1.5 rounded-full bg-primary glow-pulse" />
              10 SQL engines · Python · PySpark · in-browser runtime
            </div>
            <h1 className="mb-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
              Ship faster queries.{" "}
              <span className="text-gradient-brand">Keep the same answers.</span>
            </h1>
            <p className="max-w-[58ch] text-pretty text-base text-muted-foreground md:text-lg">
              OPTIQ rewrites SQL, Python and PySpark for the engine you run, explains every change,
              proves nothing drifted, and lets you execute both versions right here before you touch
              production.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#workspace-panel" className="btn btn-primary h-10 px-5 text-sm">
                Open the optimizer
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
              <a href="#api" className="btn btn-secondary h-10 px-5 text-sm">
                Read the API
              </a>
              <span className="ml-1 hidden text-xs text-subtle-foreground sm:inline">
                No sign-up needed for the free tier
              </span>
            </div>
          </div>
          <div id="workspace-panel" style={{ animation: "fadeIn 0.9s ease-out 0.15s both" }}>
            <Workspace />
          </div>
        </section>

        {/* Engines strip */}
        <section id="engines" className="border-y border-border bg-surface-2/60 py-10">
          <div className="mx-auto max-w-7xl px-6">
            <div className="eyebrow mb-5 text-center">
              Built for the engines data teams actually run
            </div>
            <div className="marquee">
              <div className="marquee-track gap-10 opacity-80">
                {[...ENGINES, ...ENGINES].map((d, i) => (
                  <span
                    key={`${d}-${i}`}
                    aria-hidden={i >= ENGINES.length}
                    className="whitespace-nowrap font-mono text-sm font-semibold tracking-tight text-muted-foreground transition-colors hover:text-primary"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="mx-auto max-w-7xl px-6 py-24">
          <Reveal className="mb-14 max-w-2xl">
            <div className="eyebrow mb-3">Why OPTIQ</div>
            <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
              Optimization without the trust problem
            </h2>
            <p className="text-pretty text-muted-foreground">
              Most optimizers hand you a faster query and hope. OPTIQ hands you a faster query, the
              proof it returns the same rows, and the environment to check it yourself.
            </p>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-3">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={i * 90} className="panel lift p-6">
                <div className="mb-5 inline-flex size-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                  <p.icon className="size-5" aria-hidden="true" />
                </div>
                <h3 className="mb-2 text-lg font-semibold tracking-tight">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border bg-surface-2/40">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <Reveal className="mb-12">
              <div className="eyebrow mb-3">How it works</div>
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                Three steps, one screen
              </h2>
            </Reveal>
            <div className="grid gap-5 md:grid-cols-3">
              {STEPS.map((st, i) => (
                <Reveal key={st.n} delay={i * 90} className="relative panel p-6">
                  <div className="mb-4 font-mono text-xs font-semibold text-primary">{st.n}</div>
                  <h3 className="mb-2 text-lg font-semibold tracking-tight">{st.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{st.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* API */}
        <section
          id="api"
          className="mx-auto grid max-w-7xl items-center gap-14 px-6 py-24 md:grid-cols-2"
        >
          <Reveal>
            <div className="eyebrow mb-3">Public API</div>
            <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">
              The same optimizer, in your CI
            </h2>
            <p className="mb-6 max-w-[48ch] text-pretty text-muted-foreground">
              One JSON endpoint. Send an engine and code, get diagnostics, the rewrite, an itemised
              change list and a speed-up estimate. Schema-validated, size-capped and rate-limited by
              default; CORS enabled for browser tools.
            </p>
            <ul className="mb-8 space-y-2 text-sm text-muted-foreground">
              {[
                "POST /api/public/v1/optimize",
                "12 engines, 50 KB payload cap",
                "30 requests / minute / IP",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 text-primary" aria-hidden="true" />
                  <span className="font-mono text-xs">{t}</span>
                </li>
              ))}
            </ul>
            <a href="#workspace-panel" className="btn btn-secondary">
              Try it in the optimizer
            </a>
          </Reveal>
          <Reveal delay={120} className="panel lift overflow-hidden">
            <div className="panel-head bg-surface-2/60">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
                <span className="size-2.5 rounded-full bg-border-strong" />
              </div>
              <span className="font-mono text-[11px] text-subtle-foreground">bash</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6 text-foreground/90">
              {`curl https://code-optimizer.instaluxe.in/api/public/v1/optimize \\
  -H "Content-Type: application/json" \\
  -d '{
    "engine": "postgresql",
    "code": "SELECT * FROM orders WHERE DATE(created_at) = '"'"'2024-01-01'"'"'"
  }'`}
            </pre>
          </Reveal>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-border">
          <div className="mx-auto max-w-7xl px-6 py-24">
            <Reveal className="mb-12 max-w-2xl">
              <div className="eyebrow mb-3">Pricing</div>
              <h2 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
                Start free. Pay when it pays for itself.
              </h2>
              <p className="text-muted-foreground">
                The optimizer, runtimes and data tools are free. Pro adds the AI pass and history.
              </p>
            </Reveal>
            <div className="grid gap-5 md:grid-cols-3">
              {PLANS.map((p, idx) => (
                <Reveal
                  key={p.name}
                  delay={idx * 90}
                  className={`panel lift relative flex flex-col p-6 ${"popular" in p && p.popular ? "ring-1 ring-primary/60" : ""}`}
                >
                  {"popular" in p && p.popular && (
                    <div className="chip chip-primary absolute -top-2.5 left-6">Most popular</div>
                  )}
                  <div className="mb-1 text-sm font-semibold">{p.name}</div>
                  <div className="mb-4 text-xs text-subtle-foreground">{p.tagline}</div>
                  <div className="mb-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">{p.price}</span>
                    {"suffix" in p && p.suffix && (
                      <span className="text-sm text-muted-foreground">{p.suffix}</span>
                    )}
                  </div>
                  <ul className="mb-8 flex-1 space-y-2.5 text-sm text-muted-foreground">
                    {p.items.map((i) => (
                      <li key={i} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{i}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={p.href}
                    className={`btn w-full ${"popular" in p && p.popular ? "btn-primary" : "btn-secondary"}`}
                  >
                    {p.cta}
                  </a>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface-2/60">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-4">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-lg font-bold tracking-tighter">
              <span className="size-3 rounded-sm bg-primary" /> OPTIQ
            </div>
            <p className="max-w-[28ch] text-xs leading-relaxed text-muted-foreground">
              Live optimizer for SQL, Python and PySpark. Faster code, same answers.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              ["Optimizer", "#workspace-panel"],
              ["Engines", "#engines"],
              ["API", "#api"],
              ["Pricing", "#pricing"],
            ]}
          />
          <FooterCol
            title="Resources"
            links={[
              ["Security policy", "https://github.com/asisaarav/optiq/blob/main/SECURITY.md"],
              ["Source", "https://github.com/asisaarav/optiq"],
              ["Sitemap", "/sitemap.xml"],
            ]}
          />
          <FooterCol
            title="Contact"
            links={[
              ["sales@instaluxe.in", "mailto:sales@instaluxe.in"],
              [
                "Report a vulnerability",
                "https://github.com/asisaarav/optiq/security/advisories/new",
              ],
            ]}
          />
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-subtle-foreground">
            <span>&copy; {new Date().getFullYear()} OPTIQ. All rights reserved.</span>
            <span className="font-mono">code-optimizer.instaluxe.in</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="eyebrow mb-3">{title}</div>
      <ul className="space-y-2 text-sm">
        {links.map(([label, href]) => (
          <li key={label}>
            <a
              href={href}
              className="text-muted-foreground transition-colors hover:text-foreground"
              {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
