import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { Workspace } from "@/components/Workspace";

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

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <Nav />

      <main>
      {/* Hero + Workspace */}
      <section id="workspace" className="max-w-7xl mx-auto px-6 pt-20 pb-32 scroll-mt-16">
        <div className="max-w-3xl mb-16" style={{ animation: "fadeIn 0.6s ease-out" }}>
          <h1 className="text-5xl font-bold tracking-tight mb-6 text-balance">
            Your code, but <span className="text-primary">10x faster</span>. SQL, Python, PySpark.
          </h1>
          <p className="text-lg text-muted-foreground text-pretty max-w-[60ch]">
            Paste a slow query or script. Optiq rewrites it with index hints, join reordering,
            predicate pushdowns, vectorization, and idiomatic refactors — across 12 engines and runtimes.
          </p>
        </div>
        <Workspace />
      </section>

      {/* Engines */}
      <section id="engines" className="border-y border-border py-12 bg-surface-2">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap justify-center items-center gap-x-8 gap-y-4 opacity-60">
          {["POSTGRESQL","MYSQL","ORACLE","PL/SQL","SQL SERVER","SNOWFLAKE","BIGQUERY","REDSHIFT","DATABRICKS","CLICKHOUSE","PYTHON","PYSPARK"].map((d) => (
            <span key={d} className="font-mono font-bold text-sm tracking-tight">{d}</span>
          ))}
        </div>
      </section>

      {/* API */}
      <section id="api" className="max-w-7xl mx-auto px-6 py-32 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-4">Drop it into your CI</h2>
          <p className="text-muted-foreground text-pretty max-w-[48ch] mb-6">
            Catch performance regressions before they ship. One HTTP call returns the optimized
            query and an explanation list — pipe it into your code review bot.
          </p>
          <a href="#pricing" className="text-primary text-sm font-semibold hover:underline">
            View API pricing →
          </a>
        </div>
        <div className="bg-surface rounded-xl ring-1 ring-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="size-3 rounded-full bg-secondary" />
            <span className="size-3 rounded-full bg-secondary" />
            <span className="size-3 rounded-full bg-secondary" />
            <span className="ml-3 text-xs font-mono text-muted-foreground">bash</span>
          </div>
          <pre className="font-mono text-sm text-zinc-300 leading-relaxed overflow-x-auto">
{`curl https://code-optimizer.instaluxe.in/api/v1/optimize \\
  -H "Authorization: Bearer $OPTIQ_KEY" \\
  -d '{
    "engine": "postgres",
    "code": "SELECT * FROM orders WHERE ..."
  }'`}
          </pre>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 py-32 border-t border-border">
        <div className="mb-16">
          <h2 className="text-3xl font-bold tracking-tight mb-2">Scale with your data</h2>
          <p className="text-muted-foreground">Choose a plan that fits your engineering team.</p>
        </div>
        <div className="grid md:grid-cols-4 gap-6">
          {[
            { name: "Free", price: "$0", items: ["100 optimizations / mo", "All 12 engines", "Manual paste only"], cta: "Get Started" },
            { name: "Pro", price: "$29", suffix: "/mo", items: ["Unlimited queries", "CLI tool access", "Priority support"], cta: "Try Pro", popular: true },
            { name: "Team", price: "$99", suffix: "/mo", items: ["Shared workspaces", "SSO / auth", "Audit logs"], cta: "Contact Sales" },
            { name: "API", price: "$0.01", suffix: "/call", items: ["Pay-as-you-go", "99.9% uptime SLA", "Bulk processing"], cta: "Get API Key" },
          ].map((p) => (
            <div
              key={p.name}
              className={`p-6 rounded-xl ${p.popular ? "ring-2 ring-primary bg-surface/40" : "ring-1 ring-border bg-surface/20"} relative`}
            >
              {p.popular && (
                <div className="absolute -top-3 left-6 px-2 py-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded">
                  POPULAR
                </div>
              )}
              <div className={`text-xs font-bold uppercase mb-4 ${p.popular ? "text-primary" : "text-muted-foreground"}`}>{p.name}</div>
              <div className="text-3xl font-bold mb-4">
                {p.price}
                {p.suffix && <span className="text-sm font-normal text-muted-foreground">{p.suffix}</span>}
              </div>
              <ul className="text-sm space-y-3 text-muted-foreground mb-8">
                {p.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
              <button
                className={`w-full py-2 rounded text-sm font-bold transition-colors ${
                  p.popular
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "border border-border hover:bg-secondary"
                }`}
              >
                {p.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      </main>

      <footer className="border-t border-border py-12 bg-surface-2 text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap gap-4 justify-between">
          <div>© 2026 Optiq · code-optimizer.instaluxe.in</div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground">Status</a>
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
