import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { Workspace } from "@/components/Workspace";
import { Reveal } from "@/components/Reveal";

export const Route = createFileRoute("/")({
  head: () => ({
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

const ENGINE_MARQUEE = [
  "POSTGRESQL",
  "MYSQL",
  "ORACLE",
  "PL/SQL",
  "SQL SERVER",
  "SNOWFLAKE",
  "BIGQUERY",
  "REDSHIFT",
  "DATABRICKS",
  "CLICKHOUSE",
  "PYTHON",
  "PYSPARK",
] as const;

function Index() {
  // Auth gate is intentionally off until Google OAuth credentials are configured.
  // Re-enable by gating on useAuth() from "@/lib/useAuth".

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <Nav />

      <main>
        {/* Hero + Workspace */}
        <section
          id="workspace"
          className="hero-ambient max-w-7xl mx-auto px-6 pt-20 pb-32 scroll-mt-16"
        >
          <div className="grid-veil" aria-hidden="true" />
          <div className="max-w-3xl mb-14" style={{ animation: "fadeIn 0.7s ease-out both" }}>
            <div className="inline-flex items-center gap-2 mb-6 rounded-full border border-border bg-surface/60 px-3 py-1 text-[11px] font-mono uppercase tracking-widest text-muted-foreground backdrop-blur">
              <span className="size-1.5 rounded-full bg-primary glow-pulse" />
              10 SQL engines · Python · PySpark · live in-browser runtime
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 text-balance leading-[1.05]">
              Live optimizer for{" "}
              <span className="text-gradient-brand">queries, scripts, and data jobs</span>.
              <span className="caret align-middle" />
            </h1>
            <p className="text-lg text-muted-foreground text-pretty max-w-[60ch]">
              Paste SQL or Python, run it against an in-browser runtime, catch syntax/runtime
              errors, generate test data, and ship optimized code through the API.
            </p>
          </div>
          <div style={{ animation: "fadeIn 0.9s ease-out 0.15s both" }}>
            <Workspace />
          </div>
        </section>

        {/* Engines */}
        <section id="engines" className="border-y border-border py-12 bg-surface-2">
          <div className="marquee max-w-7xl mx-auto px-6">
            <div className="marquee-track gap-10 opacity-70">
              {[...ENGINE_MARQUEE, ...ENGINE_MARQUEE].map((d, i) => (
                <span
                  key={`${d}-${i}`}
                  aria-hidden={i >= ENGINE_MARQUEE.length}
                  className="font-mono font-bold text-sm tracking-tight whitespace-nowrap transition-colors hover:text-primary"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* API */}
        <section
          id="api"
          className="max-w-7xl mx-auto px-6 py-32 grid md:grid-cols-2 gap-16 items-center"
        >
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight mb-4">
              Production API, not a placeholder
            </h2>
            <p className="text-muted-foreground text-pretty max-w-[48ch] mb-6">
              The endpoint is live for external tools, CI checks, and workflow automations. It
              validates input, returns diagnostics, rewrites, speed estimates, and CORS-ready JSON
              responses.
            </p>
            <a href="#workspace" className="text-primary text-sm font-semibold hover:underline">
              Test it in the optimizer →
            </a>
          </Reveal>
          <Reveal delay={120} className="bg-surface rounded-xl ring-1 ring-border p-6 lift sheen">
            <div className="flex items-center gap-2 mb-4">
              <span className="size-3 rounded-full bg-secondary" />
              <span className="size-3 rounded-full bg-secondary" />
              <span className="size-3 rounded-full bg-secondary" />
              <span className="ml-3 text-xs font-mono text-muted-foreground">bash</span>
            </div>
            <pre className="font-mono text-sm text-foreground leading-relaxed overflow-x-auto">
              {`curl https://code-optimizer.instaluxe.in/api/public/v1/optimize \\
  -H "Content-Type: application/json" \\
  -d '{
    "engine": "postgresql",
    "code": "SELECT * FROM orders WHERE created_at >= 2024-01-01"
  }'`}
            </pre>
          </Reveal>
        </section>

        {/* Pricing */}
        <section id="pricing" className="max-w-7xl mx-auto px-6 py-32 border-t border-border">
          <Reveal className="mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-2">Scale with your data</h2>
            <p className="text-muted-foreground">Choose a plan that fits your engineering team.</p>
          </Reveal>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                name: "Free",
                price: "$0",
                items: ["Live SQL/Python run", "All optimizer engines", "Data Builder"],
                cta: "Open Optimizer",
                href: "#workspace",
              },
              {
                name: "Pro",
                price: "$29",
                suffix: "/mo",
                items: ["Saved runs", "Bulk optimization", "Priority queues"],
                cta: "Start Pro",
                href: "#workspace",
                popular: true,
              },
              {
                name: "Team",
                price: "$99",
                suffix: "/mo",
                items: ["Shared workspaces", "SSO-ready roadmap", "Audit exports"],
                cta: "Contact Sales",
                href: "mailto:sales@instaluxe.in",
              },
              {
                name: "API",
                price: "$0.01",
                suffix: "/call",
                items: ["Public HTTP endpoint", "CORS-ready JSON", "CI integration"],
                cta: "View API",
                href: "#api",
              },
            ].map((p, idx) => (
              <Reveal
                key={p.name}
                delay={idx * 90}
                className={`p-6 rounded-xl lift sheen ${p.popular ? "ring-2 ring-primary bg-surface/40" : "ring-1 ring-border bg-surface/20"} relative`}
              >
                {p.popular && (
                  <div className="absolute -top-3 left-6 px-2 py-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded">
                    POPULAR
                  </div>
                )}
                <div
                  className={`text-xs font-bold uppercase mb-4 ${p.popular ? "text-primary" : "text-muted-foreground"}`}
                >
                  {p.name}
                </div>
                <div className="text-3xl font-bold mb-4">
                  {p.price}
                  {p.suffix && (
                    <span className="text-sm font-normal text-muted-foreground">{p.suffix}</span>
                  )}
                </div>
                <ul className="text-sm space-y-3 text-muted-foreground mb-8">
                  {p.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                <a
                  href={p.href}
                  className={`w-full py-2 rounded text-sm font-bold transition-colors ${
                    p.popular
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "border border-border hover:bg-secondary"
                  } block text-center press`}
                >
                  {p.cta}
                </a>
              </Reveal>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-12 bg-surface-2 text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap gap-4 justify-between">
          <div>© 2026 Optiq · code-optimizer.instaluxe.in</div>
          <div className="font-mono">Live optimizer · API · Data Builder</div>
        </div>
      </footer>
    </div>
  );
}
