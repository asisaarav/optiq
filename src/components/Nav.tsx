import { useAuth, signOut } from "@/lib/useAuth";
import { useNavigate } from "@tanstack/react-router";

export function Nav() {
  const auth = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="font-mono font-bold tracking-tighter text-lg flex items-center gap-2">
            <span className="size-3 bg-primary rounded-sm" /> OPTIQ
          </span>
          <div className="hidden md:flex gap-6 text-sm font-medium text-muted-foreground">
            <a href="#workspace" className="hover:text-foreground transition-colors">Optimizer</a>
            <a href="#engines" className="hover:text-foreground transition-colors">Engines</a>
            <a href="#api" className="hover:text-foreground transition-colors">API</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
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
              className="border border-border px-3 py-1.5 rounded text-xs font-semibold hover:border-primary hover:text-primary transition-colors"
            >
              Sign out
            </button>
          ) : (
            <a href="/auth" className="bg-foreground text-background px-4 py-1.5 rounded text-sm font-semibold hover:bg-primary transition-colors">
              Sign in
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
