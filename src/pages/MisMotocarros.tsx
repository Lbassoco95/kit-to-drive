import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate, normColor, effEstatusArmado } from "@/lib/dazon";
import { EstatusBadge } from "@/components/EstatusBadge";
import { Copy, ChevronDown, Bike, Users } from "lucide-react";
import { toast } from "sonner";

export default function MisMotocarros() {
  const [rows, setRows] = useState<any[]>([]);
  const [openClient, setOpenClient] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("motocarros")
        .select("*, remisiones!inner(folio_remision, clientes(id, codigo_erp, nombre_comercial))")
        .order("orden_armado");
      setRows((data ?? []).map((r: any) => ({ ...r, color: normColor(r.color) })));
    })();
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, { cliente: any; items: any[] }>();
    rows.forEach(r => {
      const c = r.remisiones?.clientes;
      const key = c?.id || "sin";
      if (!map.has(key)) map.set(key, { cliente: c || { codigo_erp: "Sin cliente" }, items: [] });
      map.get(key)!.items.push(r);
    });
    return Array.from(map.values());
  }, [rows]);

  const copyFactura = (r: any) => {
    const txt = `NS Chasis: ${r.ns_chasis || ""}\nNS Motor: ${r.ns_motor || ""}\nModelo: ${r.modelo}\nColor: ${r.color}`;
    navigator.clipboard.writeText(txt);
    toast.success("✓ Datos copiados al portapapeles");
  };

  return (
    <div className="space-y-5">
      <div><h1>Mis Motocarros</h1><p className="text-muted-foreground text-base mt-1">{rows.length} unidades agrupadas en {groups.length} clientes</p></div>

      <div className="space-y-3">
        {groups.map(({ cliente, items }) => {
          const total = items.length;
          const entregados = items.filter(i => i.estatus_entrega === "ENTREGADA").length;
          const armados = items.filter(i => ["ARMADO","LISTO"].includes(i.estatus_armado)).length;
          const pct = total ? Math.round((armados / total) * 100) : 0;
          const open = !!openClient[cliente.id || cliente.codigo_erp];
          const key = cliente.id || cliente.codigo_erp;

          return (
            <Card key={key} className="overflow-hidden">
              <Collapsible open={open} onOpenChange={(o) => setOpenClient(s => ({ ...s, [key]: o }))}>
                <CollapsibleTrigger className="w-full text-left">
                  <div className="p-5 flex items-center gap-4 hover:bg-slate-50">
                    <div className="p-3 rounded-lg bg-[#DBEAFE]"><Users size={32} color="#1F3864"/></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-2xl font-bold text-[#1F3864]">{cliente.codigo_erp}</div>
                      {cliente.nombre_comercial && <div className="text-sm text-muted-foreground truncate">{cliente.nombre_comercial}</div>}
                    </div>
                    <div className="hidden md:flex flex-col items-end gap-1">
                      <div className="text-sm font-medium">{total} motocarros · {entregados} entregados</div>
                      <div className="w-48 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-[#065F46]" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground">{pct}% armados</div>
                    </div>
                    <ChevronDown className={`h-6 w-6 transition-transform ${open ? "rotate-180" : ""}`} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {items.map(r => (
                      <div key={r.id} className="rounded-lg border p-3 bg-white flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-md" style={{ background: r.color === "AZUL" ? "#DBEAFE" : "#F1F5F9" }}>
                            <Bike size={24} color={r.color === "AZUL" ? "#2E75B6" : "#94A3B8"} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-[#1F3864]">#{r.orden_armado} · {r.color}</div>
                            <div className="text-xs text-muted-foreground truncate">{r.modelo}</div>
                          </div>
                        </div>
                        <div className="text-xs font-mono text-muted-foreground truncate">{r.ns_chasis || r.chasis_asignado || "Sin NS"}</div>
                        <div className="flex items-center justify-between gap-2">
                          <EstatusBadge estatus={r.estatus_entrega === "ENTREGADA" ? "ENTREGADA" : effEstatusArmado(r)} size="sm" />
                          <Button size="sm" variant="outline" onClick={() => setDetail(r)} className="h-9">Ver detalle</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
        {!groups.length && <div className="text-center py-12 text-muted-foreground bg-card rounded-lg border">Aún no tienes motocarros asignados</div>}
      </div>

      <Dialog open={!!detail} onOpenChange={o => { if (!o) setDetail(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Motocarro #{detail?.orden_armado}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <Row k="Modelo" v={detail.modelo}/>
              <Row k="Color" v={detail.color}/>
              <Row k="Chasis asignado" v={detail.chasis_asignado || "—"}/>
              <Row k="Número de serie del chasis" v={detail.ns_chasis || "—"}/>
              <Row k="Número de serie del motor" v={detail.ns_motor || "—"}/>
              <Row k="Remisión" v={detail.remisiones?.folio_remision}/>
              <Row k="Fecha estimada de armado" v={fmtDate(detail.fecha_estimada_armado)}/>
              <Row k="Fecha real de armado" v={fmtDate(detail.fecha_real_armado)}/>
              <Row k="Fecha estimada de entrega" v={fmtDate(detail.fecha_estimada_entrega)}/>
              <Row k="Fecha real de entrega" v={fmtDate(detail.fecha_real_entrega)}/>
              <div className="flex gap-2 pt-2">
                <EstatusBadge estatus={effEstatusArmado(detail)} />
                <EstatusBadge estatus={detail.estatus_entrega} />
              </div>
              {detail.ns_chasis && (
                <Button onClick={() => copyFactura(detail)} className="w-full h-12 text-base mt-3">
                  <Copy className="h-5 w-5 mr-2"/> Copiar datos para factura
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return <div className="flex justify-between gap-4 border-b pb-1.5"><span className="text-muted-foreground">{k}</span><strong className="text-right">{v}</strong></div>;
}
