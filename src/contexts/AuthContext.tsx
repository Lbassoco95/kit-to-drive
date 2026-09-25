import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { dictActual } from "@/contexts/LangContext";
import {
  Area, Nivel, Permisos, permisosDe, desdeRolLegacy, PERMISOS_VACIOS,
} from "@/lib/permissions";
import ForcePasswordChange from "@/components/ForcePasswordChange";

/** Rol legacy de la base de datos. Se mantiene solo por compatibilidad. */
export type AppRole = "admin" | "fabrica" | "logistica" | "ventas" | "coordinador" | "director_ventas" | "coordinador_ventas" | "auxiliar_ventas" | "finanzas" | "admin_financiero" | "compras";

// Cada cuánto se vuelve a preguntar el nivel/área mientras la pestaña está
// visible. Los permisos no viajan en el token: las políticas los consultan en
// cada query, así que la base ya responde con los nuevos al instante. Esto es
// sólo para que el menú y los botones se enteren sin pedirle a nadie que
// recargue a mano.
const PERMS_POLL_MS = 2 * 60 * 1000;
// Piso entre consultas: foco y visibilitychange suelen dispararse juntos.
const PERMS_MIN_GAP_MS = 10 * 1000;
const RECOVERY_FLAG_KEY = "kti_password_recovery";

function readRecoveryFlag(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function writeRecoveryFlag(on: boolean) {
  try {
    if (on) sessionStorage.setItem(RECOVERY_FLAG_KEY, "1");
    else sessionStorage.removeItem(RECOVERY_FLAG_KEY);
  } catch {
    /* ignore */
  }
}

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
  /** `profiles.activo`. Un usuario dado de baja no entra a ningún módulo. */
  activo: boolean;
  profileName: string;
  loading: boolean;
  /** Si el usuario debe cambiar su contraseña antes de continuar. */
  requiresPasswordChange: boolean;
  /** Sesión iniciada vía enlace de recuperación de contraseña. */
  isPasswordRecovery: boolean;
  /** Allowlist del módulo Almacén de refacciones (independiente de área/nivel). */
  puedeVerRefacciones: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  clearPasswordRecovery: () => void;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [nivel, setNivel] = useState<Nivel | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  // Se arranca en `true`: mientras no sepamos lo contrario, nadie se queda
  // fuera por un perfil que todavía no ha cargado.
  const [activo, setActivo] = useState(true);
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => readRecoveryFlag());
  const [puedeVerRefacciones, setPuedeVerRefacciones] = useState(false);

  // Refs para poder comparar sin arrastrar closures viejos dentro de los
  // listeners de foco/visibilidad, que se registran una sola vez.
  const uidRef       = useRef<string | null>(null);
  const permsRef     = useRef<string | null>(null);   // "area|nivel" vigente
  const lastCheckRef = useRef(0);

  const loadRole = async (uid: string, { notificar = false } = {}) => {
    const [{ data: r, error }, refacc] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role, nivel, area")
        .eq("user_id", uid)
        .limit(1)
        .maybeSingle(),
      supabase.rpc("puede_ver_almacen_refacciones" as any, { _user_id: uid }),
    ]);

    // Un error de red no debe borrar los permisos que ya teníamos: dejarlos
    // como están y reintentar en el siguiente ciclo es mejor que degradarlos.
    if (error) return;

    const legacy = (r?.role as AppRole) ?? null;
    setRole(legacy);

    // Si la fila aún no tiene nivel/área (usuario sin migrar), se deducen del rol.
    const fallback   = desdeRolLegacy(legacy);
    const nuevoNivel = (r?.nivel as Nivel) ?? (legacy ? fallback.nivel : null);
    const nuevaArea  = (r?.area  as Area)  ?? (legacy ? fallback.area  : null);
    setNivel(nuevoNivel);
    setArea(nuevaArea);
    setPuedeVerRefacciones(!refacc.error && !!refacc.data);

    const firma  = `${nuevaArea ?? "—"}|${nuevoNivel ?? "—"}`;
    const cambio = permsRef.current !== null && permsRef.current !== firma;
    permsRef.current = firma;

    const { data: p } = await supabase
      .from("profiles")
      .select("nombre_completo, activo, debe_cambiar_password")
      .eq("id", uid)
      .maybeSingle();
    setProfileName(p?.nombre_completo ?? "");
    // Igual que en la base (`usuario_activo`): sólo cuenta como baja el FALSE
    // explícito. Un perfil ausente o nulo no deja a nadie fuera.
    setActivo(p?.activo !== false);
    // Flag de servidor (columna protegida + app_metadata). user_metadata ya no manda.
    if ((p as { debe_cambiar_password?: boolean | null } | null)?.debe_cambiar_password === true) {
      setRequiresPasswordChange(true);
    }

    // Sólo se avisa en las revisiones automáticas, no en el arranque de sesión.
    if (cambio && notificar) {
      // `dictActual()` y no `useLang()`: este provider envuelve al de idioma.
      const t = dictActual();
      toast.info(t.componentes.permisosCambiados.titulo, {
        description: t.componentes.permisosCambiados.detalle,
        duration: 8000,
      });
    }
  };

  const clear = () => {
    setRole(null); setNivel(null); setArea(null); setProfileName(""); setActivo(true);
    setRequiresPasswordChange(false);
    setIsPasswordRecovery(false);
    writeRecoveryFlag(false);
    setPuedeVerRefacciones(false);
    permsRef.current = null;
  };

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
    writeRecoveryFlag(false);
  };

  const markPasswordRecovery = () => {
    setIsPasswordRecovery(true);
    writeRecoveryFlag(true);
  };

  const changePassword = async (newPassword: string) => {
    // Única vía: Edge Function (Admin API) setea password + limpia flags.
    // El cliente no puede limpiar must_change_password sin enviar password nueva.
    const { data, error: invokeErr } = await supabase.functions.invoke("complete-password-change", {
      method: "POST",
      body: { password: newPassword },
    });
    if (invokeErr) {
      return { error: new Error(invokeErr.message || "No se pudo cambiar la contraseña") };
    }
    if (data?.error) {
      return { error: new Error(String(data.error)) };
    }

    setRequiresPasswordChange(false);
    await supabase.auth.refreshSession();
    return { error: null };
  };

  useEffect(() => {
    const checkMustChange = (u: User | null) => {
      // Solo app_metadata (Admin API). user_metadata.must_change_password se ignora.
      setRequiresPasswordChange(!!u?.app_metadata?.must_change_password);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      checkMustChange(s?.user ?? null);
      uidRef.current = s?.user?.id ?? null;
      if (event === "PASSWORD_RECOVERY") {
        markPasswordRecovery();
        // El hash/code de recovery puede aterrizar en / o /auth; llevar al formulario.
        navigate("/auth/reset-password", { replace: true });
      }
      if (event === "SIGNED_OUT") {
        clearPasswordRecovery();
      }
      if (s?.user) setTimeout(() => loadRole(s.user.id), 0);
      else clear();
    });

    // Fallback si el hash llega con type=recovery antes del evento (o tras refresh).
    try {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const queryParams = new URLSearchParams(window.location.search);
      if (hashParams.get("type") === "recovery" || queryParams.get("type") === "recovery") {
        markPasswordRecovery();
      }
    } catch {
      /* ignore */
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      checkMustChange(s?.user ?? null);
      uidRef.current = s?.user?.id ?? null;
      if (s?.user) loadRole(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // Revisión automática: al volver a la pestaña, al recuperar el foco y cada
  // PERMS_POLL_MS mientras esté visible. Va toda dentro del efecto para que los
  // listeners se registren una sola vez y no arrastren closures viejos: el
  // estado que necesitan vive en refs.
  useEffect(() => {
    const alVolver = () => {
      const uid = uidRef.current;
      if (!uid || document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (ahora - lastCheckRef.current < PERMS_MIN_GAP_MS) return;
      lastCheckRef.current = ahora;
      void loadRole(uid, { notificar: true });
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    const timer = window.setInterval(alVolver, PERMS_POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.clearInterval(timer);
    };
  }, []);

  const perms = useMemo(
    () => (area && nivel ? permisosDe(area, nivel) : PERMISOS_VACIOS),
    [area, nivel],
  );

  const signOut = async () => { await supabase.auth.signOut(); };
  const refreshRole = async () => { if (uidRef.current) await loadRole(uidRef.current); };

  return (
    <Ctx.Provider value={{
      user, session, nivel, area, perms, role, activo, profileName, loading,
      requiresPasswordChange, isPasswordRecovery, puedeVerRefacciones,
      signOut, refreshRole, changePassword, clearPasswordRecovery,
    }}>
      {children}
      {user && requiresPasswordChange && !isPasswordRecovery && (
        <ForcePasswordChange onChangePassword={changePassword} onSignOut={signOut} />
      )}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
