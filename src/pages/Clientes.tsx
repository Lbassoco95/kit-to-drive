import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

export default function Clientes() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { supabase.from("clientes").select("*").order("codigo_erp").then(({ data }) => setRows(data ?? [])); }, []);
  return (
    <div className="space-y-4">
      <h1>Clientes</h1>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="data-table">
        <thead><tr><th>Código ERP</th><th>Nombre comercial</th><th>Teléfono</th><th>Activo</th></tr></thead>
        <tbody>
          {rows.map(c => <tr key={c.id}>
            <td className="font-semibold">{c.codigo_erp}</td>
            <td>{c.nombre_comercial || <em className="text-muted-foreground">Pendiente</em>}</td>
            <td>{c.telefono || "—"}</td>
            <td>{c.activo ? "Sí" : "No"}</td>
          </tr>)}
        </tbody>
      </table></div></Card>
    </div>
  );
}
