import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Inbox, RefreshCw, AlertCircle } from "lucide-react";
import { fmtDate } from "@/lib/dazon";
import { toast } from "sonner";

type Pendiente = {
  id: string;
  folio_remision: string;
  total_unidades_solicitadas: number;
  color_solicitado: string | null;
  fecha_remision: string | null;
  estatus: string;
  asignados: number;
  vendedor: string;
  cliente: string;
};

export function BandejaRemisiones({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<Pendiente[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("remisiones")
      .select("id, folio_remision, total_unidades_solicitadas, color_solicitado, fecha_remision, estatus, profiles:vendedor_id(nombre_completo), clientes(codigo_erp, nombre_comercial), motocarros(id)")
      .in("estatus", ["NUEVA", "PARCIAL"])
      .order("created_at", { ascending: false });
    const mapped: Pendiente[] = (data ?? []).map((r: any) => ({
      id: r.id,
      folio_remision: r.folio_remision,
      total_unidades_solicitadas: r.total_unidades_solicitadas,
      color_solicitado: r.color_solicitado,
      fecha_remision: r.fecha_remision,
      estatus: r.estatus,
      asignados: (r.motocarros ?? []).length,
      vendedor: r.profiles?.nombre_completo ?? "—",
      cliente: r.clientes?.codigo_erp ? `${r.clientes.codigo_erp} ${r.clientes.nombre_comercial ?? ""}` : "—",
    }));
    setItems(mapped);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const reintentar = async (id: string) => {
    setBusy(id);
    const { data, error } = await supabase.rpc("reintentar_asignar_remision", { _remision_id: id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    if ((data ?? 0) > 0) toast.success(`✓ ${data} motocarro(s) asignado(s)`);
    else toast.info("No hay motocarros disponibles que coincidan");
    await load();
    onChange?.();
  };

  if (!items.length && !loading) return null;

  return (
    <Card className="p-5 border-2 border-[#E8A30D]/40 bg-gradient-to-br from-[#FFF8E7] to-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-[#E8A30D]/15 flex items-center justify-center">
          <Inbox className="h-7 w-7 text-[#A36B00]" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-[#1F3864]">Remisiones por asignar</h2>
          <p className="text-sm text-muted-foreground">{items.length} remisión(es) esperan motocarros disponibles</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="h-10"><RefreshCw className="h-4 w-4 mr-2" />Actualizar</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map(it => {
          const faltan = it.total_unidades_solicitadas - it.asignados;
          const sinNada = it.asignados === 0;
          return (
            <div key={it.id} className="bg-white rounded-lg border-2 border-[#E8A30D]/20 p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono font-bold text-base text-[#1F3864]">{it.folio_remision}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(it.fecha_remision)}</div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded ${sinNada ? "bg-[#C0392B]/10 text-[#C0392B]" : "bg-[#E8A30D]/15 text-[#A36B00]"}`}>
                  {sinNada ? "SIN ASIGNAR" : "PARCIAL"}
                </span>
              </div>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Vendedor:</span> <span className="font-medium">{it.vendedor}</span></div>
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{it.cliente}</span></div>
                <div className="flex gap-3 pt-1">
                  <span className="text-muted-foreground">Solicita: <strong className="text-foreground">{it.total_unidades_solicitadas}</strong></span>
                  <span className="text-muted-foreground">Asignados: <strong className="text-foreground">{it.asignados}</strong></span>
                  <span className="text-[#C0392B] font-bold">Faltan: {faltan}</span>
                </div>
                {it.color_solicitado && (
                  <div className="text-xs"><span className="text-muted-foreground">Color:</span> <strong>{it.color_solicitado}</strong></div>
                )}
              </div>
              <Button
                onClick={() => reintentar(it.id)}
                disabled={busy === it.id}
                className="h-12 w-full bg-[#1F3864] hover:bg-[#2E75B6] text-white font-semibold"
              >
                {busy === it.id ? "Asignando…" : <><AlertCircle className="h-4 w-4 mr-2" />Asignar siguientes {faltan} disponibles</>}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
