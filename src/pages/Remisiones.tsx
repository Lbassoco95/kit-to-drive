import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ESTATUS_REMISION_COLOR, fmtDate } from "@/lib/dazon";
import { useAuth } from "@/contexts/AuthContext";

export default function Remisiones() {
  const { role } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("remisiones")
        .select("*, clientes(codigo_erp), profiles:vendedor_id(nombre_completo), motocarros(id, estatus_armado)")
        .order("fecha_remision", { ascending: false, nullsFirst: false });
      setRows(data ?? []);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1>Remisiones</h1>
        <p className="text-muted-foreground text-sm">{rows.length} remisiones {role === "ventas" ? "(solo las tuyas)" : ""}</p>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              <th>Folio</th><th>Vendedor</th><th>Cliente</th><th>Fecha</th>
              <th>Solicitadas</th><th>Asignadas</th><th>% Avance</th><th>Estatus</th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const asignadas = r.motocarros?.length ?? 0;
                const pct = r.total_unidades_solicitadas ? Math.round((asignadas / r.total_unidades_solicitadas) * 100) : 0;
                return (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.folio_remision}</td>
                    <td>{r.profiles?.nombre_completo || (r.notas?.replace("Vendedor original: ", "")) || "—"}</td>
                    <td>{r.clientes?.codigo_erp || "—"}</td>
                    <td>{fmtDate(r.fecha_remision)}</td>
                    <td>{r.total_unidades_solicitadas}</td>
                    <td>{asignadas}</td>
                    <td>
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div className="h-2 rounded-full bg-secondary" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </td>
                    <td><span className={`px-2 py-0.5 rounded text-xs ${ESTATUS_REMISION_COLOR[r.estatus]}`}>{r.estatus}</span></td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">Sin remisiones</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
