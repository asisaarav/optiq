import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthState = {
  status: "loading" | "signed-in" | "signed-out";
  session: Session | null;
  email: string | null;
};

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    session: null,
    email: null,
  });

  useEffect(() => {
    // Register listener FIRST to catch any auth events during initial load
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        status: session ? "signed-in" : "signed-out",
        session,
        email: session?.user?.email ?? null,
      });
    });

    supabase.auth.getSession().then(({ data }) => {
      setState({
        status: data.session ? "signed-in" : "signed-out",
        session: data.session,
        email: data.session?.user?.email ?? null,
      });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return state;
}

export async function signOut() {
  await supabase.auth.signOut();
}
