import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ESTATUS_ARMADO_COLOR, ESTATUS_ENTREGA_COLOR, fmtDate } from "@/lib/dazon";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export default function MisMotocarros() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("motocarros")
        .select("*, remisiones!inner(folio_remision, clientes(codigo_erp))")
        .order("orden_armado");
      setRows(data ?? []);
    })();
  }, []);

  const copyFactura = (r: any) => {
    const txt = `NS Chasis: ${r.ns_chasis || ""}\nNS Motor: ${r.ns_motor || ""}\nModelo: ${r.modelo}\nColor: ${r.color}\nAño: ${r.modelo.match(/\d{4}/)?.[0] || ""}`;
    navigator.clipboard.writeText(txt);
    toast.success("Datos copiados al portapapeles");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1>Mis Motocarros</h1>
        <p className="text-muted-foreground text-sm">{rows.length} unidades asignadas a tus remisiones</p>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              <th>Orden</th><th>Chasis</th><th>NS Chasis</th><th>NS Motor</th>
              <th>Modelo</th><th>Color</th><th>Cliente</th><th>Remisión</th>
              <th>Estatus armado</th><th>F.Est.Entrega</th><th>F.Real.Entrega</th><th>Entrega</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.orden_armado}</td>
                  <td>{r.chasis_asignado || "—"}</td>
                  <td className="font-mono text-[11px]">{r.ns_chasis || "—"}</td>
                  <td className="font-mono text-[11px]">{r.ns_motor || "—"}</td>
                  <td>{r.modelo}</td>
                  <td>{r.color}</td>
                  <td>{r.remisiones?.clientes?.codigo_erp || "—"}</td>
                  <td>{r.remisiones?.folio_remision}</td>
                  <td><EstatusArmadoBadge estatus={r.estatus_armado} /></td>
                  <td>{fmtDate(r.fecha_estimada_entrega)}</td>
                  <td>{fmtDate(r.fecha_real_entrega)}</td>
                  <td><span className={`px-2 py-0.5 rounded text-xs ${ESTATUS_ENTREGA_COLOR[r.estatus_entrega]}`}>{r.estatus_entrega}</span></td>
                  <td>
                    {r.ns_chasis && (
                      <Button size="sm" variant="ghost" onClick={() => copyFactura(r)}>
                        <Copy className="h-3 w-3 mr-1" /> Factura
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={13} className="text-center py-6 text-muted-foreground">Aún no tienes motocarros asignados</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
