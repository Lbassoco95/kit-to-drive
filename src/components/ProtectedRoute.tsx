import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";
import { Modulo } from "@/lib/permissions";

export default function ProtectedRoute({ children, modulo }: { children: JSX.Element; modulo?: Modulo }) {
  const { user, area, nivel, perms, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;
  if (!user) return <Navigate to="/auth" state={{ from: loc }} replace />;
  // Sin área/nivel asignados todavía: solo se permite el dashboard.
  if (modulo && (!area || !nivel)) return <Navigate to="/" replace />;
  if (modulo && !perms.puedeVer(modulo)) return <Navigate to="/" replace />;
  return children;
}
