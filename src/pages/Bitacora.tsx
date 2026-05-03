import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Bitacora() {
  const [rows, setRows] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("bitacora_eventos").select("*").order("created_at", { ascending: false }).limit(200);
      setRows(data ?? []);
      const ids = Array.from(new Set((data ?? []).map(r => r.usuario_id).filter(Boolean)));
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("id, nombre_completo").in("id", ids);
        const m: Record<string, string> = {};
        p?.forEach(x => { m[x.id] = x.nombre_completo; });
        setProfiles(m);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div><h1>Bitácora</h1><p className="text-sm text-muted-foreground">Últimos {rows.length} eventos del sistema</p></div>
      <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="data-table">
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Cambios</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString("es-MX")}</td>
              <td>{r.usuario_id ? (profiles[r.usuario_id] || "—") : "Sistema"}</td>
              <td><Badge variant="outline">{r.modulo}</Badge></td>
              <td>{r.accion}</td>
              <td className="font-mono text-[10px] max-w-md truncate">{r.datos_despues ? JSON.stringify(r.datos_despues) : ""}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Sin eventos</td></tr>}
        </tbody>
      </table></div></Card>
    </div>
  );
}
