import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Inbox, RefreshCw, FileDown, Package, Settings2, TriangleAlert, Wrench, UserPlus, X } from "lucide-react";
import { fmtDate, COLORES, claveStock } from "@/lib/dazon";
import { cargarModelosMotocarro, MODELOS_RESPALDO } from "@/lib/catalogoModelos";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";



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

type StockColor = {
  piezas_disponibles: number;
  unidades_libres: number;
  unidades_sin_serial: number;
  unidades_detenidas: number;
  demanda_pendiente: number;
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

const defaultConfigForm = () => ({
  modelo: "200cc 2026",
  color: "BLANCO",
  cantidad: 1,
  con_caja: false,
  con_cabina: false,
  con_instalacion: false,
  con_activacion: false,
  con_flete: false,
});

type MotocarroDisponible = {
  id: string;
  orden_armado: number | null;
  modelo: string | null;
  color: string | null;
  ns_chasis: string | null;
  ns_motor: string | null;
  estatus_armado: string | null;
};

export function BandejaRemisiones({ onChange }: { onChange?: () => void }) {
  const { area, perms } = useAuth();
  const puedeAsignarManual = area === "fabrica" || area === "direccion" || area === "administracion" || perms.esAdminGlobal;

  const [items, setItems] = useState<RemisionCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [configDialog, setConfigDialog] = useState<RemisionCard | null>(null);
  const [configForm, setConfigForm] = useState(defaultConfigForm());
  const [savingConfig, setSavingConfig] = useState(false);
  const [stock, setStock] = useState<Map<string, StockColor>>(new Map());
  const [modelos, setModelos] = useState<string[]>(MODELOS_RESPALDO);

  // Asignación manual
  const [manualDialog, setManualDialog] = useState<RemisionCard | null>(null);
  const [disponibles, setDisponibles] = useState<MotocarroDisponible[]>([]);
  const [asignadosManual, setAsignadosManual] = useState<MotocarroDisponible[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualBusy, setManualBusy] = useState<string | null>(null);
  const [manualQ, setManualQ] = useState("");

  const load = async () => {
    setLoading(true);
    cargarModelosMotocarro().then(setModelos);

    // Lo que de verdad hay por modelo comercial y color — para que la bandeja
    // no ofrezca "asignar 5" cuando de ese color sólo hay 1.
    const { data: stockData } = await supabase
      .from("v_stock_modelo_color")
      .select("modelo_comercial, color, piezas_disponibles, unidades_libres, unidades_sin_serial, unidades_detenidas, demanda_pendiente");
    setStock(new Map((stockData ?? []).map((s: any) => [
      claveStock(s.modelo_comercial, s.color),
      {
        piezas_disponibles: s.piezas_disponibles ?? 0,
        unidades_libres: s.unidades_libres ?? 0,
        unidades_sin_serial: s.unidades_sin_serial ?? 0,
        unidades_detenidas: s.unidades_detenidas ?? 0,
        demanda_pendiente: s.demanda_pendiente ?? 0,
      },
    ])));

    // ── Query mínimo garantizado ──────────────────────────────────────────────
    const { data: base } = await supabase
      .from("remisiones")
      .select("id,folio_remision,fecha_remision,estatus,notas, profiles:vendedor_id(nombre_completo), clientes(codigo_erp,nombre_comercial), motocarros(id)")
      .in("estatus", ["NUEVA", "PARCIAL"])
      .order("created_at", { ascending: false });

    if (!base?.length) { setItems([]); setLoading(false); return; }

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

    // ── Columnas extendidas ───────────────────────────────────────────────────
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

    // ── remision_items ────────────────────────────────────────────────────────
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
    // asignar_remision_items respeta la configuración del pedido (modelo
    // comercial + color de cada línea) y sólo toma unidades que ya tienen
    // NS chasis y NS motor y cuyo chasis no está detenido por una incidencia.
    const { data, error } = await supabase.rpc("asignar_remision_items", { _remision_id: id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }

    const r = data as { asignadas?: number; pedido_capturado?: boolean; detalle?: any[] } | null;
    const asignadas = r?.asignadas ?? 0;

    if (asignadas > 0) toast.success(`✓ ${asignadas} motocarro(s) asignado(s)`);

    // Explicar el faltante línea por línea: de qué color, cuántas faltan y si
    // el problema es que no hay piezas o que fábrica no las ha configurado.
    (r?.detalle ?? []).filter((d: any) => (d?.faltan ?? 0) > 0).forEach((d: any) => {
      const que = [d.modelo, d.color].filter(Boolean).join(" ") || "sin modelo/color";
      const detalle = d.piezas_por_configurar > 0
        ? `hay ${d.piezas_por_configurar} chasis por configurar en Producción`
        : d.unidades_sin_serial > 0
        ? `hay ${d.unidades_sin_serial} unidad(es) sin NS chasis/NS motor — fábrica tiene que capturarlos`
        : d.unidades_detenidas > 0
        ? `hay ${d.unidades_detenidas} unidad(es) detenidas por una incidencia de chasis`
        : "no hay inventario de ese color";
      toast.warning(`Faltan ${d.faltan} de ${que}: ${detalle}`);
    });

    if (!asignadas && !(r?.detalle ?? []).length) toast.info("Nada por asignar en esta remisión");
    if (r?.pedido_capturado === false) {
      toast.info("Esta remisión no tiene configuración del pedido — captúrala para asignar por modelo y color");
    }

    await load(); onChange?.();
  };

  const verDoc = async (path: string) => {
    const { data } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const abrirConfig = (rem: RemisionCard) => {
    // Pre-llenar con datos existentes si los hay
    const motoItem = rem.items.find((it: any) => it.tipo_servicio === "motocarro");
    if (motoItem) {
      setConfigForm({
        modelo: motoItem.modelo ?? "200cc 2026",
        color: motoItem.color ?? "BLANCO",
        cantidad: motoItem.cantidad ?? 1,
        con_caja: motoItem.con_caja ?? false,
        con_cabina: rem.items.some((it: any) => it.tipo_servicio === "cabina"),
        con_instalacion: rem.items.some((it: any) => it.tipo_servicio === "instalacion_cabina"),
        con_activacion: rem.items.some((it: any) => it.tipo_servicio === "activacion"),
        con_flete: rem.items.some((it: any) => it.tipo_servicio === "flete"),
      });
    } else {
      setConfigForm(defaultConfigForm());
    }
    setConfigDialog(rem);
  };

  const guardarConfig = async () => {
    if (!configDialog) return;
    setSavingConfig(true);

    // Borrar items anteriores
    try {
      await supabase.from("remision_items").delete().eq("remision_id", configDialog.id);
    } catch (_) {}

    // Construir nuevos items
    const newItems: any[] = [
      {
        remision_id: configDialog.id,
        tipo_servicio: "motocarro",
        modelo: configForm.modelo,
        color: configForm.color,
        cantidad: configForm.cantidad,
        con_caja: configForm.con_instalacion ? true : configForm.con_caja,
      },
    ];
    if (configForm.con_cabina)
      newItems.push({ remision_id: configDialog.id, tipo_servicio: "cabina", modelo: configForm.modelo, color: null, cantidad: configForm.cantidad, con_caja: false });
    if (configForm.con_instalacion)
      newItems.push({ remision_id: configDialog.id, tipo_servicio: "instalacion_cabina", modelo: null, color: null, cantidad: configForm.cantidad, con_caja: false });
    if (configForm.con_activacion)
      newItems.push({ remision_id: configDialog.id, tipo_servicio: "activacion", modelo: null, color: null, cantidad: configForm.cantidad, con_caja: false });
    if (configForm.con_flete)
      newItems.push({ remision_id: configDialog.id, tipo_servicio: "flete", modelo: null, color: null, cantidad: 1, con_caja: false });

    const { error } = await supabase.from("remision_items").insert(newItems);

    // Actualizar total_unidades_solicitadas en remision
    try {
      await supabase.from("remisiones")
        .update({ total_unidades_solicitadas: configForm.cantidad })
        .eq("id", configDialog.id);
    } catch (_) {}

    setSavingConfig(false);
    if (error) { toast.error(error.message); return; }
    toast.success("✓ Configuración guardada");
    setConfigDialog(null);
    await load(); onChange?.();
  };

  // ── Asignación manual ─────────────────────────────────────────────────────
  const abrirManual = async (rem: RemisionCard) => {
    setManualDialog(rem);
    setManualLoading(true);
    setManualQ("");

    // Motocarros ya asignados a esta remisión
    const { data: asig } = await supabase
      .from("motocarros")
      .select("id, orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado")
      .eq("remision_id", rem.id)
      .order("orden_armado");
    setAsignadosManual((asig ?? []) as MotocarroDisponible[]);

    // Motocarros disponibles (sin remisión, con serial)
    const { data: disp } = await supabase
      .from("motocarros")
      .select("id, orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado")
      .is("remision_id", null)
      .not("ns_chasis", "is", null)
      .not("ns_motor", "is", null)
      .in("estatus_armado", ["PENDIENTE", "EN_PROCESO", "ARMADO", "LISTO"])
      .order("orden_armado");
    setDisponibles((disp ?? []) as MotocarroDisponible[]);
    setManualLoading(false);
  };

  const asignarManual = async (motocarroId: string) => {
    if (!manualDialog) return;
    setManualBusy(motocarroId);
    const { error } = await supabase.rpc("asignar_motocarro_a_remision", {
      _motocarro_id: motocarroId,
      _remision_id: manualDialog.id,
    });
    setManualBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("✓ Unidad asignada");
    await abrirManual(manualDialog);
    await load(); onChange?.();
  };

  const desasignarManual = async (motocarroId: string) => {
    setManualBusy(motocarroId);
    const { error } = await supabase.rpc("desasignar_motocarro_de_remision", {
      _motocarro_id: motocarroId,
    });
    setManualBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("✓ Unidad liberada de la remisión");
    if (manualDialog) await abrirManual(manualDialog);
    await load(); onChange?.();
  };

  const disponiblesFiltrados = disponibles.filter(m => {
    if (!manualQ) return true;
    const q = manualQ.toLowerCase();
    return (
      (m.ns_chasis?.toLowerCase().includes(q)) ||
      (m.ns_motor?.toLowerCase().includes(q)) ||
      (m.color?.toLowerCase().includes(q)) ||
      (m.modelo?.toLowerCase().includes(q)) ||
      String(m.orden_armado).includes(q)
    );
  });

  if (!items.length && !loading) return null;

  return (
    <>
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
            const tieneConfig = rem.items.length > 0;

            // Cobertura real de lo que pide el pedido: cuántas unidades con
            // serial hay de ese modelo comercial y ese color, y cuántas piezas
            // quedan por configurar. Es lo que hacía falta para saber si el
            // "Asignar" va a lograr algo.
            const lineas = rem.items.filter((it: any) => it.tipo_servicio === "motocarro");
            const cobertura = lineas.map((it: any) => {
              const st = stock.get(claveStock(it.modelo, it.color));
              return {
                id: it.id,
                etiqueta: [it.modelo, it.color].filter(Boolean).join(" ") || "sin modelo/color",
                pedidas: it.cantidad ?? 1,
                libres: st?.unidades_libres ?? 0,
                porConfigurar: st?.piezas_disponibles ?? 0,
                sinSerial: st?.unidades_sin_serial ?? 0,
                detenidas: st?.unidades_detenidas ?? 0,
              };
            });
            const libresTotales = cobertura.reduce((acc, c) => acc + c.libres, 0);
            const asignables = cobertura.length ? Math.min(faltan, libresTotales) : faltan;

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
                  <div className="text-muted-foreground">Vendedor: <strong className="text-foreground">{vendedorDisplay}</strong></div>
                  <div className="text-muted-foreground">Cliente: <strong className="text-foreground">{rem.cliente}</strong></div>
                  <div className="flex gap-3 pt-0.5">
                    <span className="text-muted-foreground">Solicita: <strong className="text-foreground">{rem.total_unidades}</strong></span>
                    <span className="text-muted-foreground">Asignados: <strong className="text-foreground">{rem.asignados}</strong></span>
                    <span className="text-red-600 font-bold">Faltan: {faltan}</span>
                  </div>
                </div>

                {/* Configuración del pedido */}
                <div className="px-4 py-2.5 border-t bg-slate-50/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Configuración del pedido
                    </span>
                    <button
                      onClick={() => abrirConfig(rem)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2E75B6] hover:text-[#1F3864] hover:underline"
                    >
                      <Settings2 size={11} />
                      {tieneConfig ? "Editar" : "Configurar"}
                    </button>
                  </div>
                  {tieneConfig ? (
                    <div className="flex flex-wrap gap-1.5">
                      {rem.items.map((it: any) => (
                        <span
                          key={it.id}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tipoBadge[it.tipo_servicio] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}
                        >
                          {tipoIcon[it.tipo_servicio]}{" "}
                          {tipoLabel[it.tipo_servicio]}
                          {it.modelo && <span className="font-normal opacity-80"> {it.modelo}</span>}
                          {it.color && <span className="font-semibold"> {it.color}</span>}
                          {it.cantidad > 1 && <span className="font-normal"> ×{it.cantidad}</span>}
                          {it.con_caja && <Package size={9} className="ml-0.5 opacity-70" />}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => abrirConfig(rem)}
                      className="w-full py-2 rounded-lg border-2 border-dashed border-[#E8A30D]/50 text-xs text-[#A36B00] font-medium hover:bg-[#FFF8E7] transition-colors"
                    >
                      + Capturar configuración del pedido
                    </button>
                  )}
                </div>

                {/* Disponibilidad real de lo que pide el pedido */}
                {cobertura.length > 0 && (
                  <div className="px-4 py-2 border-t bg-white space-y-1">
                    {cobertura.map(c => {
                      const alcanza = c.libres >= c.pedidas;
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-medium text-slate-700">{c.etiqueta}</span>
                          <span className="flex items-center gap-2">
                            <span className={alcanza ? "text-[#065F46] font-semibold" : "text-[#991B1B] font-semibold"}>
                              {c.libres} con serial
                            </span>
                            {c.porConfigurar > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[#92400E]" title="Chasis sanos que fábrica todavía puede configurar">
                                <Wrench size={9} /> {c.porConfigurar} por configurar
                              </span>
                            )}
                            {c.sinSerial > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[#92400E]" title="Unidades sin NS chasis / NS motor: no se pueden asignar">
                                <TriangleAlert size={9} /> {c.sinSerial} sin NS
                              </span>
                            )}
                            {c.detenidas > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[#991B1B]" title="Unidades detenidas por una incidencia de chasis">
                                <TriangleAlert size={9} /> {c.detenidas} detenidas
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

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
                    disabled={busy === rem.id || faltan <= 0 || (cobertura.length > 0 && asignables <= 0)}
                    className="flex-1 h-11 bg-[#1F3864] hover:bg-[#2E75B6] text-white font-semibold text-sm"
                    title={cobertura.length > 0 && asignables <= 0
                      ? "No hay unidades con serial de ese modelo y color — configura chasis + motor en Producción"
                      : undefined}
                  >
                    {busy === rem.id
                      ? "Asignando…"
                      : cobertura.length > 0 && asignables <= 0
                      ? "Sin unidades de ese modelo/color"
                      : cobertura.length > 0 && asignables < faltan
                      ? `Asignar ${asignables} de ${faltan}`
                      : `Asignar ${faltan} disponibles`}
                  </Button>
                  {puedeAsignarManual && (
                    <Button
                      variant="outline"
                      onClick={() => abrirManual(rem)}
                      className="h-11 px-3 shrink-0 border-[#1F3864]/30 text-[#1F3864] hover:bg-[#1F3864]/5"
                      title="Asignar manualmente eligiendo chasis y motor"
                    >
                      <UserPlus className="h-4 w-4 mr-1.5" /> Manual
                    </Button>
                  )}
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

      {/* Dialog de configuración */}
      <Dialog open={!!configDialog} onOpenChange={o => { if (!o) setConfigDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-[#1F3864]" />
              Configurar pedido — {configDialog?.folio_remision}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Modelo y color */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Modelo</Label>
                <Select value={configForm.modelo} onValueChange={v => setConfigForm(f => ({ ...f, modelo: v }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{modelos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Color</Label>
                <Select value={configForm.color} onValueChange={v => setConfigForm(f => ({ ...f, color: v }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{COLORES.map(c => <SelectItem key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Cantidad */}
            <div>
              <Label className="text-sm">Cantidad de motocarros</Label>
              <Input
                type="number" min={1}
                value={configForm.cantidad}
                onChange={e => setConfigForm(f => ({ ...f, cantidad: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="h-11 text-base font-bold"
              />
            </div>

            {/* Checkboxes servicios */}
            <div className="rounded-xl border divide-y">
              <div className="px-4 py-2 bg-slate-50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Servicios adicionales
              </div>
              {[
                { key: "con_caja",        icon: "📦", label: "Con caja montada",      disabled: configForm.con_instalacion },
                { key: "con_cabina",      icon: "🛖", label: "Cabina",               disabled: false },
                { key: "con_instalacion", icon: "🔧", label: "Instalación de cabina", disabled: false },
                { key: "con_activacion",  icon: "⚡", label: "Activación",            disabled: false },
                { key: "con_flete",       icon: "🚛", label: "Flete (toda la orden)", disabled: false },
              ].map(({ key, icon, label, disabled }) => (
                <label key={key} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50/80 ${disabled ? "opacity-60" : ""}`}>
                  <input
                    type="checkbox"
                    checked={(configForm as any)[key]}
                    disabled={disabled}
                    onChange={e => {
                      const val = e.target.checked;
                      setConfigForm(f => {
                        const next = { ...f, [key]: val };
                        if (key === "con_instalacion" && val) next.con_caja = true;
                        if (key === "con_instalacion" && !val) next.con_caja = false;
                        return next;
                      });
                    }}
                    className="w-4 h-4 accent-[#1F3864]"
                  />
                  <span className="text-sm">{icon} {label}</span>
                  {key === "con_caja" && configForm.con_instalacion && (
                    <span className="ml-auto text-[10px] text-muted-foreground italic">auto</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialog(null)}>Cancelar</Button>
            <Button
              onClick={guardarConfig}
              disabled={savingConfig}
              className="bg-[#1F3864] hover:bg-[#162a4d]"
            >
              {savingConfig ? "Guardando…" : "Guardar configuración"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de asignación manual */}
      <Dialog open={!!manualDialog} onOpenChange={o => { if (!o) setManualDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[#1F3864]" />
              Asignación manual — {manualDialog?.folio_remision}
            </DialogTitle>
          </DialogHeader>

          {manualLoading ? (
            <div className="py-8 text-center text-muted-foreground">Cargando unidades…</div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Unidades ya asignadas */}
              {asignadosManual.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-[#065F46] mb-2">
                    Asignadas a esta remisión ({asignadosManual.length})
                  </h4>
                  <div className="space-y-1.5">
                    {asignadosManual.map(m => (
                      <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                        <div className="text-sm">
                          <span className="font-bold text-[#1F3864]">#{m.orden_armado}</span>
                          {" · "}
                          <span className="font-medium">{m.color}</span>
                          {" · "}
                          <span className="text-xs text-muted-foreground">Chasis: {m.ns_chasis ?? "—"}</span>
                          {" · "}
                          <span className="text-xs text-muted-foreground">Motor: {m.ns_motor ?? "—"}</span>
                          {m.estatus_armado && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {m.estatus_armado}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => desasignarManual(m.id)}
                          disabled={manualBusy === m.id}
                          className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title="Quitar de esta remisión"
                        >
                          <X size={14} className="mr-1" />
                          {manualBusy === m.id ? "…" : "Quitar"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Buscador */}
              <div>
                <h4 className="text-sm font-semibold text-[#1F3864] mb-2">
                  Unidades disponibles ({disponiblesFiltrados.length})
                </h4>
                <Input
                  placeholder="Buscar por chasis, motor, color, orden…"
                  value={manualQ}
                  onChange={e => setManualQ(e.target.value)}
                  className="mb-2"
                />
              </div>

              {/* Lista de disponibles */}
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {disponiblesFiltrados.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No hay unidades disponibles{manualQ ? " con ese filtro" : ""}
                  </p>
                )}
                {disponiblesFiltrados.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border hover:bg-slate-50">
                    <div className="text-sm">
                      <span className="font-bold text-[#1F3864]">#{m.orden_armado}</span>
                      {" · "}
                      <span className="font-medium">{m.color}</span>
                      {" · "}
                      <span className="text-xs text-muted-foreground">Chasis: {m.ns_chasis}</span>
                      {" · "}
                      <span className="text-xs text-muted-foreground">Motor: {m.ns_motor}</span>
                      {m.estatus_armado && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {m.estatus_armado}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => asignarManual(m.id)}
                      disabled={manualBusy === m.id}
                      className="h-8 px-3 bg-[#1F3864] hover:bg-[#2E75B6] text-white text-xs"
                    >
                      {manualBusy === m.id ? "…" : "Asignar"}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialog(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
