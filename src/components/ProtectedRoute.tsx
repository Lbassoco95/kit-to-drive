import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Navigate, useLocation } from "react-router-dom";
import { Modulo } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldOff, UserCog } from "lucide-react";

/**
 * Pantalla de corte. Se muestra en vez de mandar a la persona a un tablero
 * vacío sin explicación: si no puede pasar, que sepa por qué y a quién pedirle.
 */
function SinAcceso({ icono, titulo, detalle }: { icono: JSX.Element; titulo: string; detalle: string }) {
  const { signOut, profileName } = useAuth();
  const { t } = useLang();
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-card border rounded-lg p-8 text-center space-y-4">
        <div className="flex justify-center text-[#1F3864]">{icono}</div>
        <h1 className="text-xl font-bold text-[#1F3864]">{titulo}</h1>
        {profileName && <p className="text-sm font-medium text-slate-600">{profileName}</p>}
        <p className="text-muted-foreground text-sm leading-relaxed">{detalle}</p>
        <Button onClick={signOut} variant="outline" className="w-full h-11">
          <LogOut className="h-4 w-4 mr-2" /> {t.layout.signOut}
        </Button>
      </div>
    </div>
  );
}

export default function ProtectedRoute({
  children,
  modulo,
  requireRefacciones,
}: {
  children: JSX.Element;
  modulo?: Modulo;
  /** Allowlist del módulo Almacén / remisiones de refacciones. */
  requireRefacciones?: boolean;
}) {
  const { user, area, nivel, perms, activo, loading, puedeVerRefacciones, isPasswordRecovery } = useAuth();
  const { t } = useLang();
  const loc = useLocation();

  if (loading) return <div className="p-8 text-center text-muted-foreground">{t.componentes.acceso.cargando}</div>;
  if (!user) return <Navigate to="/auth" state={{ from: loc }} replace />;
  if (isPasswordRecovery) return <Navigate to="/auth/reset-password" replace />;

  // Dado de baja: no entra a ningún lado. El RLS ya lo corta del lado de la
  // base (`usuario_activo`); esto es para que vea el motivo en vez de una app
  // vacía que parece descompuesta.
  if (!activo) {
    return (
      <SinAcceso
        icono={<ShieldOff className="h-10 w-10" />}
        titulo={t.componentes.acceso.desactivadaTitulo}
        detalle={t.componentes.acceso.desactivadaDetalle}
      />
    );
  }

  // Sin área ni tipo de usuario asignados todavía: tampoco tiene sentido
  // dejarlo navegar, porque no hay un solo módulo que le corresponda.
  if (!area || !nivel) {
    return (
      <SinAcceso
        icono={<UserCog className="h-10 w-10" />}
        titulo={t.componentes.acceso.sinPermisosTitulo}
        detalle={t.componentes.acceso.sinPermisosDetalle}
      />
    );
  }

  if (requireRefacciones && !puedeVerRefacciones) {
    return <Navigate to="/" replace />;
  }

  if (modulo && !perms.puedeVer(modulo)) return <Navigate to="/" replace />;
  return children;
}
