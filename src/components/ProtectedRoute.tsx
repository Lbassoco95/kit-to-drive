import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const { user, role, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8 text-center text-muted-foreground">Cargando…</div>;
  if (!user) return <Navigate to="/auth" state={{ from: loc }} replace />;
  if (roles && role && !roles.includes(role)) return <Navigate to="/" replace />;
  return children;
}
