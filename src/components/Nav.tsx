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
            <a href="#workspace" className="story-link hover:text-foreground transition-colors">
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
          {auth.status === "signed-in" ? (
            <button
              onClick={handleSignOut}
              className="press border border-border px-3 py-1.5 rounded text-xs font-semibold hover:border-primary hover:text-primary transition-colors"
            >
              Sign out
            </button>
          ) : (
            <a
              href="/auth"
              className="press sheen bg-foreground text-background px-4 py-1.5 rounded text-sm font-semibold transition-colors hover:bg-primary"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
