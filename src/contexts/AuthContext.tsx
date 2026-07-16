import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "fabrica" | "logistica" | "ventas" | "coordinador" | "director_ventas" | "coordinador_ventas" | "auxiliar_ventas";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profileName: string;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(true);

  const loadRole = async (uid: string) => {
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", uid).limit(1).maybeSingle();
    setRole((r?.role as AppRole) ?? null);
    const { data: p } = await supabase.from("profiles").select("nombre_completo").eq("id", uid).maybeSingle();
    setProfileName(p?.nombre_completo ?? "");
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) setTimeout(() => loadRole(s.user.id), 0);
      else { setRole(null); setProfileName(""); }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadRole(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };
  const refreshRole = async () => { if (user) await loadRole(user.id); };

  return <Ctx.Provider value={{ user, session, role, profileName, loading, signOut, refreshRole }}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);
