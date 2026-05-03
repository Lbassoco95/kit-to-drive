import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/dazon";

export default function Usuarios() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase.from("profiles").select("*");
      const { data: roles } = await supabase.from("user_roles").select("*");
      const merged = profiles?.map(p => ({ ...p, role: roles?.find(r => r.user_id === p.id)?.role })) ?? [];
      setRows(merged);
    })();
  }, []);
  return (
    <div className="space-y-4">
      <h1>Usuarios</h1>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="data-table">
        <thead><tr><th>Nombre</th><th>Código vendedor</th><th>Rol</th><th>Activo</th></tr></thead>
        <tbody>
          {rows.map(u => <tr key={u.id}>
            <td>{u.nombre_completo}</td>
            <td>{u.codigo_vendedor || "—"}</td>
            <td>{u.role ? ROLE_LABELS[u.role] : "—"}</td>
            <td>{u.activo ? "Sí" : "No"}</td>
          </tr>)}
        </tbody>
      </table></div></Card>
    </div>
  );
}
