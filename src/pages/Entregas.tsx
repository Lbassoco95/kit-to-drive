import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtDate, normColor } from "@/lib/dazon";
import { EstatusBadge } from "@/components/EstatusBadge";
import { Bike, Truck, Calendar, CheckCircle } from "lucide-react";
import { toast } from "sonner";

type Filter = "PENDIENTES" | "PROGRAMADAS_HOY" | "ENTREGADAS_HOY";

export default function Entregas() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>("PENDIENTES");
  const [scheduling, setScheduling] = useState<any | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));

  const load = async () => {
    const { data } = await supabase
      .from("motocarros")
      .select("*, remisiones(folio_remision, clientes(codigo_erp), profiles:vendedor_id(nombre_completo))")
      .in("estatus_armado", ["ARMADO", "LISTO"])
      .not("chasis_asignado", "is", null)
      .order("orden_armado");
    setRows((data ?? []).map((r: any) => ({ ...r, color: normColor(r.color) })));
  };
  useEffect(() => { load(); }, []);

  const update = async (id: string, patch: any) => {
    const { error } = await supabase.from("motocarros").update(patch).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("✓ Actualizado"); load(); }
  };

  const today = new Date().toISOString().slice(0,10);
  const counts = useMemo(() => ({
    PENDIENTES: rows.filter(r => r.estatus_entrega === "NO_APLICA").length,
    PROGRAMADAS_HOY: rows.filter(r => r.estatus_entrega === "PROGRAMADA" && r.fecha_estimada_entrega === today).length,
    ENTREGADAS_HOY: rows.filter(r => r.estatus_entrega === "ENTREGADA" && r.fecha_real_entrega === today).length,
  }), [rows, today]);

  const filtered = useMemo(() => rows.filter(r => {
    if (filter === "PENDIENTES") return r.estatus_entrega === "NO_APLICA" || r.estatus_entrega === "PROGRAMADA";
    if (filter === "PROGRAMADAS_HOY") return r.estatus_entrega === "PROGRAMADA" && r.fecha_estimada_entrega === today;
    return r.estatus_entrega === "ENTREGADA" && r.fecha_real_entrega === today;
  }), [rows, filter, today]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "PENDIENTES", label: "Pendientes de programar" },
    { key: "PROGRAMADAS_HOY", label: "Programadas hoy" },
    { key: "ENTREGADAS_HOY", label: "Entregadas hoy" },
  ];

  return (
    <div className="space-y-5">
      <div><h1>Entregas</h1><p className="text-muted-foreground text-base mt-1">Gestión de entregas a clientes</p></div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`min-h-[48px] px-5 rounded-full font-semibold text-base border-2 transition-all ${active ? "bg-[#1F3864] text-white border-[#1F3864]" : "bg-white text-[#1F3864] border-[#2E75B6]/30 hover:border-[#2E75B6]"}`}>
              {f.label} <span className={`ml-2 px-2 py-0.5 rounded-full text-sm ${active ? "bg-white/20" : "bg-[#2E75B6]/10"}`}>{(counts as any)[f.key]}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(r => {
          const colorBike = r.color === "AZUL" ? "#2E75B6" : "#94A3B8";
          const colorBg = r.color === "AZUL" ? "#DBEAFE" : "#F1F5F9";
          return (
            <Card key={r.id} className="overflow-hidden flex flex-col">
              <div className="p-4 flex items-center gap-3" style={{ background: colorBg }}>
                <div className="p-2.5 rounded-lg bg-white/70"><Bike size={36} color={colorBike} strokeWidth={2}/></div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Chasis</div>
                  <div className="text-xl font-bold text-[#1F3864] truncate">{r.chasis_asignado || `#${r.orden_armado}`}</div>
                </div>
                <EstatusBadge estatus={r.estatus_entrega} size="sm" />
              </div>
              <div className="p-4 space-y-2 flex-1">
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground">Número de serie del chasis</div>
                  <div className="font-mono text-sm">{r.ns_chasis || "—"}</div>
                </div>
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground">Número de serie del motor</div>
                  <div className="font-mono text-sm">{r.ns_motor || "—"}</div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">👤 {r.remisiones?.clientes?.codigo_erp || "—"}</span>
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">📄 {r.remisiones?.folio_remision || "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground pt-1">Vendedor: <strong className="text-foreground">{r.remisiones?.profiles?.nombre_completo || "—"}</strong></div>
                {r.fecha_estimada_entrega && <div className="text-xs">Programada: <strong>{fmtDate(r.fecha_estimada_entrega)}</strong></div>}
                {r.fecha_real_entrega && <div className="text-xs">Entregada: <strong>{fmtDate(r.fecha_real_entrega)}</strong></div>}
              </div>
              <div className="border-t p-3">
                {r.estatus_entrega === "NO_APLICA" && (
                  <Button onClick={() => { setScheduling(r); setDate(new Date().toISOString().slice(0,10)); }} className="w-full h-12 text-base bg-[#1F3864] hover:bg-[#162a4d]">
                    <Calendar className="h-5 w-5 mr-2"/> Programar entrega
                  </Button>
                )}
                {r.estatus_entrega === "PROGRAMADA" && (
                  <Button onClick={() => update(r.id, { estatus_entrega: "ENTREGADA", fecha_real_entrega: today })} className="w-full h-12 text-base bg-[#5B21B6] hover:bg-[#4c1d95]">
                    <Truck className="h-5 w-5 mr-2"/> Confirmar entrega
                  </Button>
                )}
                {r.estatus_entrega === "ENTREGADA" && (
                  <div className="w-full h-12 flex items-center justify-center text-[#5B21B6] font-semibold bg-[#EDE9FE] rounded-md">
                    <CheckCircle className="h-5 w-5 mr-2"/> Entregado
                  </div>
                )}
              </div>
            </Card>
          );
        })}
        {!filtered.length && <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin resultados en esta vista</div>}
      </div>

      <Dialog open={!!scheduling} onOpenChange={o => { if (!o) setScheduling(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Programar entrega — Chasis {scheduling?.chasis_asignado}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Fecha estimada de entrega</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-12 text-base" />
          </div>
          <DialogFooter>
            <Button onClick={async () => { await update(scheduling.id, { estatus_entrega: "PROGRAMADA", fecha_estimada_entrega: date }); setScheduling(null); }} className="h-12 px-5 text-base">Programar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
