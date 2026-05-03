import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ESTATUS_ENTREGA_COLOR, fmtDate } from "@/lib/dazon";
import { toast } from "sonner";

export default function Entregas() {
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("motocarros")
      .select("*, remisiones(folio_remision, clientes(codigo_erp), profiles:vendedor_id(nombre_completo))")
      .in("estatus_armado", ["ARMADO", "LISTO"])
      .not("chasis_asignado", "is", null)
      .order("orden_armado");
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const update = async (id: string, patch: any) => {
    const { error } = await supabase.from("motocarros").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Actualizado"); load(); }
  };

  return (
    <div className="space-y-4">
      <h1>Entregas</h1>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              <th>Orden</th><th>Chasis</th><th>NS Chasis</th><th>Modelo</th><th>Color</th>
              <th>Vendedor</th><th>Cliente</th><th>Remisión</th><th>F.Est.Entrega</th>
              <th>F.Real.Entrega</th><th>Estatus</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.orden_armado}</td>
                  <td>{r.chasis_asignado}</td>
                  <td className="font-mono text-[11px]">{r.ns_chasis || "—"}</td>
                  <td>{r.modelo}</td>
                  <td>{r.color}</td>
                  <td>{r.remisiones?.profiles?.nombre_completo || "—"}</td>
                  <td>{r.remisiones?.clientes?.codigo_erp || "—"}</td>
                  <td>{r.remisiones?.folio_remision || "—"}</td>
                  <td>{fmtDate(r.fecha_estimada_entrega)}</td>
                  <td>{fmtDate(r.fecha_real_entrega)}</td>
                  <td><span className={`px-2 py-0.5 rounded text-xs ${ESTATUS_ENTREGA_COLOR[r.estatus_entrega]}`}>{r.estatus_entrega}</span></td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {r.estatus_entrega === "NO_APLICA" && (
                        <Button size="sm" variant="outline" onClick={() => {
                          const f = prompt("Fecha estimada entrega (YYYY-MM-DD)", new Date().toISOString().slice(0,10));
                          if (f) update(r.id, { estatus_entrega: "PROGRAMADA", fecha_estimada_entrega: f });
                        }}>Programar</Button>
                      )}
                      {r.estatus_entrega === "PROGRAMADA" && (
                        <Button size="sm" variant="outline" onClick={() => update(r.id, { estatus_entrega: "EN_RUTA" })}>En ruta</Button>
                      )}
                      {r.estatus_entrega === "EN_RUTA" && (
                        <Button size="sm" onClick={() => update(r.id, { estatus_entrega: "ENTREGADA", fecha_real_entrega: new Date().toISOString().slice(0,10) })}>Entregar</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={12} className="text-center py-6 text-muted-foreground">No hay motocarros listos para entrega</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
