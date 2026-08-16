import { Workspace } from "@/components/workspace";

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <span className="flex items-center gap-2 font-mono text-lg font-bold tracking-tighter">
            <span className="size-3 rounded-sm bg-primary" /> OPTIQ
          </span>
          <a
            href="https://github.com/asisaarav/optiq"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            GitHub
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-12 max-w-3xl">
          <p className="eyebrow mb-4">
            10 SQL engines · Python · PySpark · beautify · compare
          </p>
          <h1 className="mb-5 text-4xl font-bold tracking-tight md:text-6xl">
            Ship faster queries.{" "}
            <span className="text-primary">Keep the same answers.</span>
          </h1>
          <p className="max-w-[58ch] text-muted md:text-lg">
            Optimize, beautify and compare SQL, Python and PySpark. Every
            rewrite is checked against a business-logic guard so results never
            drift — and everything runs in your browser, so your code never
            leaves the page.
          </p>
        </div>

        <Workspace />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-6 py-8 text-xs text-subtle">
          <span>
            &copy; {new Date().getFullYear()} OPTIQ. All rights reserved.
          </span>
          <span className="font-mono">code-optimizer.instaluxe.in</span>
        </div>
      </footer>
    </div>
  );
}
