import { useEffect, useState } from "react";
import { useAuth, signOut } from "@/lib/useAuth";
import { useNavigate } from "@tanstack/react-router";

export function Nav() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <nav
      className={`sticky top-0 z-50 border-b bg-background/70 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-500 ${
        scrolled
          ? "border-border bg-background/90 shadow-[0_10px_30px_-24px_var(--primary)]"
          : "border-transparent"
      }`}
    >
      <div
        className={`max-w-7xl mx-auto px-6 flex items-center justify-between transition-[height] duration-500 ${
          scrolled ? "h-12" : "h-16"
        }`}
      >
        <div className="flex items-center gap-8">
          <span className="font-mono font-bold tracking-tighter text-lg flex items-center gap-2">
            <span className="size-3 bg-primary rounded-sm glow-pulse" /> OPTIQ
          </span>
          <div className="hidden md:flex gap-6 text-sm font-medium text-muted-foreground">
            <a
              href="#workspace-panel"
              className="story-link hover:text-foreground transition-colors"
            >
              Optimizer
            </a>
            <a href="#engines" className="story-link hover:text-foreground transition-colors">
              Engines
            </a>
            <a href="#api" className="story-link hover:text-foreground transition-colors">
              API
            </a>
            <a href="#pricing" className="story-link hover:text-foreground transition-colors">
              Pricing
            </a>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {auth.email && (
            <span className="hidden sm:inline text-xs font-mono text-muted-foreground max-w-[160px] truncate">
              {auth.email}
            </span>
          )}
          <a
            href="https://github.com/asisaarav/optiq"
            target="_blank"
            rel="noreferrer"
            aria-label="OPTIQ on GitHub"
            className="btn btn-sm btn-ghost hidden sm:inline-flex"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.1c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
            </svg>
          </a>
          {auth.status === "signed-in" ? (
            <button onClick={handleSignOut} className="btn btn-sm btn-secondary">
              Sign out
            </button>
          ) : (
            <a href="/auth" className="btn btn-sm btn-primary">
              Sign in
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
