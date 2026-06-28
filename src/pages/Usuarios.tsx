import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useLang } from "@/contexts/LangContext";

export default function Usuarios() {
  const [rows, setRows] = useState<any[]>([]);
  const { t } = useLang();

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
      <h1>{t.usuarios.title}</h1>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="data-table">
        <thead><tr>
          <th>{t.usuarios.nombre}</th>
          <th>{t.usuarios.codigoVendedor}</th>
          <th>{t.usuarios.rol}</th>
          <th>{t.usuarios.activo}</th>
        </tr></thead>
        <tbody>
          {rows.map(u => <tr key={u.id}>
            <td>{u.nombre_completo}</td>
            <td>{u.codigo_vendedor || "—"}</td>
            <td>{u.role ? t.roles[u.role as keyof typeof t.roles] : "—"}</td>
            <td>{u.activo ? t.usuarios.si : t.usuarios.no}</td>
          </tr>)}
        </tbody>
      </table></div></Card>
    </div>
  );
}
