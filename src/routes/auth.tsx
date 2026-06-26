import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Optiq" },
      { name: "description", content: "Sign in to Optiq with Google to access the live code optimizer." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status === "signed-in") {
      navigate({ to: "/", replace: true });
    }
  }, [auth.status, navigate]);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError(result.error.message || "Sign-in failed. Please try again.");
        setLoading(false);
        return;
      }
      if (result.redirected) return; // browser is navigating
      // Tokens set — go home
      router.invalidate();
      navigate({ to: "/", replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-xl ring-1 ring-border bg-surface/40 p-8 shadow-xl">
        <div className="flex items-center gap-2 mb-8">
          <span className="size-3 bg-primary rounded-sm" />
          <span className="font-mono font-bold tracking-tighter text-lg">OPTIQ</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">Sign in to continue</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Use your Google account. We only store your email to recognize you next time.
        </p>

        <button
          onClick={handleGoogle}
          disabled={loading || auth.status === "loading"}
          className="w-full flex items-center justify-center gap-3 bg-foreground text-background font-semibold text-sm px-4 py-2.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
            />
          </svg>
          {loading ? "Opening Google…" : "Continue with Google"}
        </button>

        {error && (
          <div className="mt-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded p-3">
            {error}
          </div>
        )}

        <p className="mt-8 text-[11px] text-muted-foreground leading-relaxed">
          By continuing you agree that Optiq stores your Google email to keep you signed in for 24
          hours. No password is required.
        </p>
      </div>
    </div>
  );
}
