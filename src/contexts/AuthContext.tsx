import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import {
  Area, Nivel, Permisos, permisosDe, desdeRolLegacy, PERMISOS_VACIOS,
} from "@/lib/permissions";

/** Rol legacy de la base de datos. Se mantiene solo por compatibilidad. */
export type AppRole = "admin" | "fabrica" | "logistica" | "ventas" | "coordinador" | "director_ventas" | "coordinador_ventas" | "auxiliar_ventas" | "finanzas" | "admin_financiero";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  /** Tipo de usuario: operador | supervisor | admin */
  nivel: Nivel | null;
  /** Área: comercial | fabrica | almacen_logistica | administracion | direccion */
  area: Area | null;
  /** Permisos efectivos derivados de (área, nivel) */
  perms: Permisos;
  /** @deprecated usar `perms`. Rol legacy derivado de (área, nivel). */
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
  const [nivel, setNivel] = useState<Nivel | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(true);

  const loadRole = async (uid: string) => {
    const { data: r } = await supabase
      .from("user_roles")
      .select("role, nivel, area")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();

    const legacy = (r?.role as AppRole) ?? null;
    setRole(legacy);

    // Si la fila aún no tiene nivel/área (usuario sin migrar), se deducen del rol.
    const fallback = desdeRolLegacy(legacy);
    setNivel((r?.nivel as Nivel) ?? (legacy ? fallback.nivel : null));
    setArea((r?.area as Area) ?? (legacy ? fallback.area : null));

    const { data: p } = await supabase.from("profiles").select("nombre_completo").eq("id", uid).maybeSingle();
    setProfileName(p?.nombre_completo ?? "");
  };

  const clear = () => { setRole(null); setNivel(null); setArea(null); setProfileName(""); };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) setTimeout(() => loadRole(s.user.id), 0);
      else clear();
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadRole(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const perms = useMemo(
    () => (area && nivel ? permisosDe(area, nivel) : PERMISOS_VACIOS),
    [area, nivel],
  );

  const signOut = async () => { await supabase.auth.signOut(); };
  const refreshRole = async () => { if (user) await loadRole(user.id); };

  return (
    <Ctx.Provider value={{ user, session, nivel, area, perms, role, profileName, loading, signOut, refreshRole }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
