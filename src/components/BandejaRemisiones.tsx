import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Inbox, RefreshCw, FileDown, Package } from "lucide-react";
import { fmtDate } from "@/lib/dazon";
import { toast } from "sonner";

const tipoIcon: Record<string, string> = {
  motocarro: "🏍️", cabina: "🛖", instalacion_cabina: "🔧", activacion: "⚡", flete: "🚛",
};
const tipoLabel: Record<string, string> = {
  motocarro: "Motocarro", cabina: "Cabina", instalacion_cabina: "Instalación cabina",
  activacion: "Activación", flete: "Flete",
};
const tipoBadge: Record<string, string> = {
  motocarro: "bg-[#1F3864]/10 text-[#1F3864] border-[#1F3864]/20",
  cabina: "bg-violet-50 text-violet-700 border-violet-200",
  instalacion_cabina: "bg-purple-50 text-purple-700 border-purple-200",
  activacion: "bg-amber-50 text-amber-700 border-amber-200",
  flete: "bg-blue-50 text-blue-700 border-blue-200",
};

type RemisionCard = {
  id: string;
  folio_remision: string;
  fecha_remision: string | null;
  estatus: string;
  notas: string | null;
  documento_url: string | null;
  vendedor: string;
  nombre_vendedor: string | null;
  cliente: string;
  total_unidades: number;
  asignados: number;
  items: any[];
};

export function BandejaRemisiones({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<RemisionCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);

    // ── Query mínimo garantizado ──────────────────────────────────────────────
    const { data: base } = await supabase
      .from("remisiones")
      .select("id,folio_remision,fecha_remision,estatus,notas, profiles:vendedor_id(nombre_completo), clientes(codigo_erp,nombre_comercial), motocarros(id)")
      .in("estatus", ["NUEVA", "PARCIAL"])
      .order("created_at", { ascending: false });

    if (!base?.length) { setItems([]); setLoading(false); return; }

    // Arrancar con lo básico
    const mapped: RemisionCard[] = base.map((r: any) => ({
      id: r.id,
      folio_remision: r.folio_remision,
      fecha_remision: r.fecha_remision,
      estatus: r.estatus,
      notas: r.notas,
      documento_url: null,
      vendedor: r.profiles?.nombre_completo ?? "—",
      nombre_vendedor: null,
      cliente: r.clientes?.codigo_erp
        ? `${r.clientes.codigo_erp}${r.clientes.nombre_comercial ? " · " + r.clientes.nombre_comercial : ""}`
        : "—",
      total_unidades: 1,
      asignados: (r.motocarros ?? []).length,
      items: [],
    }));
    setItems(mapped);

    const ids = base.map((r: any) => r.id);

    // ── Columnas extendidas (pueden no estar en cache) ────────────────────────
    try {
      const { data: ext } = await supabase
        .from("remisiones")
        .select("id,total_unidades_solicitadas,nombre_vendedor,documento_url")
        .in("id", ids);
      if (ext?.length) {
        const extMap = Object.fromEntries(ext.map((r: any) => [r.id, r]));
        setItems(prev => prev.map(r => ({
          ...r,
          total_unidades: extMap[r.id]?.total_unidades_solicitadas ?? (r.asignados || 1),
          nombre_vendedor: extMap[r.id]?.nombre_vendedor ?? null,
          documento_url: extMap[r.id]?.documento_url ?? null,
        })));
      }
    } catch (_) {}

    // ── remision_items (tabla nueva) ──────────────────────────────────────────
    try {
      const { data: remItems } = await supabase
        .from("remision_items")
        .select("id,remision_id,tipo_servicio,modelo,color,cantidad,con_caja")
        .in("remision_id", ids)
        .order("tipo_servicio");
      if (remItems?.length) {
        const itemsMap: Record<string, any[]> = {};
        for (const it of remItems) {
          if (!itemsMap[it.remision_id]) itemsMap[it.remision_id] = [];
          itemsMap[it.remision_id].push(it);
        }
        setItems(prev => prev.map(r => ({ ...r, items: itemsMap[r.id] ?? [] })));
      }
    } catch (_) {}

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const asignar = async (id: string, faltan: number) => {
    setBusy(id);
    const { data, error } = await supabase.rpc("reintentar_asignar_remision", { _remision_id: id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    if ((data ?? 0) > 0) toast.success(`✓ ${data} motocarro(s) asignado(s)`);
    else toast.info("No hay motocarros disponibles con esas características");
    await load(); onChange?.();
  };

  const verDoc = async (path: string) => {
    const { data } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (!items.length && !loading) return null;

  return (
    <Card className="p-5 border-2 border-[#E8A30D]/40 bg-gradient-to-br from-[#FFF8E7] to-white">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-[#E8A30D]/15 flex items-center justify-center shrink-0">
          <Inbox className="h-6 w-6 text-[#A36B00]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-[#1F3864]">Remisiones pendientes de asignar</h2>
          <p className="text-sm text-muted-foreground">{items.length} remisión(es) activas</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 shrink-0">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map(rem => {
          const faltan = rem.total_unidades - rem.asignados;
          const sinAsignar = rem.asignados === 0;
          const vendedorDisplay = rem.nombre_vendedor || rem.vendedor;

          return (
            <div key={rem.id} className="bg-white rounded-xl border border-[#E8A30D]/25 flex flex-col overflow-hidden shadow-sm">
              {/* Header */}
              <div className="flex items-start justify-between px-4 pt-3 pb-2 border-b bg-[#FFFBF0]">
                <div>
                  <div className="font-mono font-bold text-base text-[#1F3864]">{rem.folio_remision}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(rem.fecha_remision)}</div>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${sinAsignar ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {sinAsignar ? "SIN ASIGNAR" : "PARCIAL"}
                </span>
              </div>

              {/* Info */}
              <div className="px-4 py-3 space-y-1.5 text-sm">
                <div className="flex gap-4">
                  <span className="text-muted-foreground">Vendedor: <strong className="text-foreground">{vendedorDisplay}</strong></span>
                </div>
                <div className="text-muted-foreground">Cliente: <strong className="text-foreground">{rem.cliente}</strong></div>
                <div className="flex gap-3 pt-0.5 text-sm">
                  <span className="text-muted-foreground">Solicita: <strong className="text-foreground">{rem.total_unidades}</strong></span>
                  <span className="text-muted-foreground">Asignados: <strong className="text-foreground">{rem.asignados}</strong></span>
                  <span className="text-red-600 font-bold">Faltan: {faltan}</span>
                </div>
              </div>

              {/* Configuración del pedido — siempre visible para fábrica */}
              <div className="px-4 py-2.5 border-t bg-slate-50/80">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Configuración del pedido
                </div>
                {rem.items.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {rem.items.map((it: any) => (
                      <span
                        key={it.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tipoBadge[it.tipo_servicio] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}
                      >
                        {tipoIcon[it.tipo_servicio]}{" "}
                        {tipoLabel[it.tipo_servicio]}
                        {it.modelo && <span className="font-normal opacity-80">{it.modelo}</span>}
                        {it.color && <span className="font-semibold">{it.color}</span>}
                        {it.cantidad > 1 && <span className="font-normal">×{it.cantidad}</span>}
                        {it.con_caja && <Package size={9} className="ml-0.5 opacity-70" />}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Sin detalle — corre <code className="bg-slate-100 px-1 rounded text-[10px]">NOTIFY pgrst, 'reload schema'</code> en Supabase para cargar configuraciones
                  </p>
                )}
              </div>

              {/* Notas */}
              {rem.notas && (
                <div className="px-4 py-2 bg-blue-50/50 border-t text-xs text-[#1E40AF]">
                  <span className="font-semibold">Nota:</span> {rem.notas}
                </div>
              )}

              {/* Acciones */}
              <div className="px-4 py-3 mt-auto border-t flex gap-2">
                <Button
                  onClick={() => asignar(rem.id, faltan)}
                  disabled={busy === rem.id || faltan <= 0}
                  className="flex-1 h-11 bg-[#1F3864] hover:bg-[#2E75B6] text-white font-semibold text-sm"
                >
                  {busy === rem.id ? "Asignando…" : `Asignar ${faltan} disponibles`}
                </Button>
                {rem.documento_url && (
                  <Button
                    variant="outline"
                    onClick={() => verDoc(rem.documento_url!)}
                    className="h-11 w-11 p-0 shrink-0"
                    title="Ver documento"
                  >
                    <FileDown className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
