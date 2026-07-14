"use client";

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface AuthValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  loading: true,
  configured: false,
  signOut: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const failSafe = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 4000);

    void supabase.auth
      .getUser()
      .then(({ data }: { data: { user: User | null } }) => {
        if (cancelled) return;
        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      })
      .finally(() => window.clearTimeout(failSafe));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (cancelled) return;
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
      window.clearTimeout(failSafe);
      subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      configured: Boolean(supabase),
      signOut: async () => {
        await supabase?.auth.signOut();
      },
    }),
    [user, loading, supabase]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
