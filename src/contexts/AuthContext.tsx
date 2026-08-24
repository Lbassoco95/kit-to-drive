import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { toast } from "sonner";

export type AppRole = "admin" | "fabrica" | "logistica" | "ventas" | "coordinador" | "director_ventas" | "coordinador_ventas" | "auxiliar_ventas" | "finanzas" | "admin_financiero";

// Cada cuánto se vuelve a preguntar el rol mientras la pestaña está visible.
// El rol no viaja en el token: `has_role()` lo consulta en cada query, así que
// la base ya responde con los permisos nuevos al instante. Esto es sólo para
// que el menú y los botones de la app se enteren sin pedirle a nadie que
// recargue a mano.
const ROLE_POLL_MS = 2 * 60 * 1000;
// Piso entre consultas: foco y visibilitychange suelen dispararse juntos.
const ROLE_MIN_GAP_MS = 10 * 1000;

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

  // Refs para poder comparar sin arrastrar closures viejos dentro de los
  // listeners de foco/visibilidad, que se registran una sola vez.
  const uidRef      = useRef<string | null>(null);
  const roleRef     = useRef<AppRole | null>(null);
  const lastCheckRef = useRef(0);

  const loadRole = async (uid: string, { notificar = false } = {}) => {
    const { data: r, error } = await supabase.from("user_roles").select("role").eq("user_id", uid).limit(1).maybeSingle();
    // Un error de red no debe borrar el rol que ya teníamos: dejarlo como está
    // y reintentar en el siguiente ciclo es mejor que degradar los permisos.
    if (error) return;

    const nuevo = (r?.role as AppRole) ?? null;
    const cambio = nuevo !== roleRef.current;
    roleRef.current = nuevo;
    setRole(nuevo);

    const { data: p } = await supabase.from("profiles").select("nombre_completo").eq("id", uid).maybeSingle();
    setProfileName(p?.nombre_completo ?? "");

    // Sólo se avisa en las revisiones automáticas, no en el arranque de sesión.
    if (cambio && notificar) {
      toast.info("Tus permisos cambiaron", {
        description: "Un administrador actualizó tu nivel de acceso. El menú ya está al día.",
        duration: 8000,
      });
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      uidRef.current = s?.user?.id ?? null;
      if (s?.user) setTimeout(() => loadRole(s.user.id), 0);
      else { setRole(null); roleRef.current = null; setProfileName(""); }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      uidRef.current = s?.user?.id ?? null;
      if (s?.user) loadRole(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Revisión automática: al volver a la pestaña, al recuperar el foco y cada
  // ROLE_POLL_MS mientras esté visible. Va toda dentro del efecto para que los
  // listeners se registren una sola vez y no arrastren closures viejos: el
  // estado que necesitan vive en refs.
  useEffect(() => {
    const alVolver = () => {
      const uid = uidRef.current;
      if (!uid || document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (ahora - lastCheckRef.current < ROLE_MIN_GAP_MS) return;
      lastCheckRef.current = ahora;
      void loadRole(uid, { notificar: true });
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    const timer = window.setInterval(alVolver, ROLE_POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.clearInterval(timer);
    };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };
  const refreshRole = async () => { if (uidRef.current) await loadRole(uidRef.current); };

  return <Ctx.Provider value={{ user, session, role, profileName, loading, signOut, refreshRole }}>{children}</Ctx.Provider>;
};

export const useAuth = () => useContext(Ctx);
