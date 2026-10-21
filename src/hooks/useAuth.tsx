import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

/**
 * The Supabase client (~90 kB gzipped) is imported lazily so it stays out of the
 * shared entry bundle. Marketing pages use this hook for the header's
 * sign-in/workspace state, and they should not have to download the whole auth
 * SDK before first paint. It loads on demand, right after hydration.
 */
async function getSupabase() {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase;
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;

    void getSupabase().then((supabase) => {
      if (cancelled) return;
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);
      });
      subscription = data.subscription;

      void supabase.auth.getSession().then(({ data: { session: current } }) => {
        if (cancelled) return;
        setSession(current);
        setUser(current?.user ?? null);
        setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  return {
    session,
    user,
    loading,
    signOut: async () => {
      const supabase = await getSupabase();
      await supabase.auth.signOut();
      // Never leak the previous tenant's cached queries to the next account.
      queryClient.clear();
    },
  };
}
