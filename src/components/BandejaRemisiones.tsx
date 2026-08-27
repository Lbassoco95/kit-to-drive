import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Inbox, RefreshCw, Eye, Download, FileText, Package, Settings2, TriangleAlert, Wrench, UserPlus, X } from "lucide-react";
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
  tipo_pago: string | null;
  pagado: boolean | null;
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
  estatus_entrega?: string | null;
  fecha_estimada_armado?: string | null;
  fecha_real_armado?: string | null;
  fecha_estimada_entrega?: string | null;
  fecha_real_entrega?: string | null;
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
  const [detalleDialog, setDetalleDialog] = useState<RemisionCard | null>(null);
  const [detalleUnidades, setDetalleUnidades] = useState<MotocarroDisponible[]>([]);
  const [detalleLoading, setDetalleLoading] = useState(false);

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
      tipo_pago: null,
      pagado: null,
      vendedor: r.profiles?.nombre_completo ?? "—",
      nombre_vendedor: null,
      cliente: (r.clientes?.codigo_erp || r.clientes?.folio_interno)
        ? `${r.clientes.codigo_erp || r.clientes.folio_interno}${r.clientes.nombre_comercial ? " · " + r.clientes.nombre_comercial : ""}`
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
        .select("id,total_unidades_solicitadas,nombre_vendedor,documento_url,tipo_pago,pagado")
        .in("id", ids);
      if (ext?.length) {
        const extMap = Object.fromEntries(ext.map((r: any) => [r.id, r]));
        setItems(prev => prev.map(r => ({
          ...r,
          total_unidades: extMap[r.id]?.total_unidades_solicitadas ?? (r.asignados || 1),
          nombre_vendedor: extMap[r.id]?.nombre_vendedor ?? null,
          documento_url: extMap[r.id]?.documento_url ?? null,
          tipo_pago: extMap[r.id]?.tipo_pago ?? null,
          pagado: extMap[r.id]?.pagado ?? null,
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
    const { data, error } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { toast.error("No se pudo abrir el documento"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const descargarDoc = async (path: string) => {
    const nombre = path.split("/").pop() || "remision.pdf";
    const { data, error } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60, { download: nombre });
    if (error || !data?.signedUrl) { toast.error("No se pudo descargar el documento"); return; }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = nombre;
    link.click();
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

  const abrirDetalle = async (rem: RemisionCard) => {
    setDetalleDialog(rem);
    setDetalleLoading(true);
    const { data, error } = await supabase
      .from("motocarros")
      .select("id, orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado, estatus_entrega, fecha_estimada_armado, fecha_real_armado, fecha_estimada_entrega, fecha_real_entrega")
      .eq("remision_id", rem.id)
      .order("orden_armado");
    setDetalleLoading(false);
    if (error) { toast.error("No se pudieron cargar las unidades de la remisión"); setDetalleUnidades([]); return; }
    setDetalleUnidades((data ?? []) as MotocarroDisponible[]);
  };

  // ── Asignación manual ─────────────────────────────────────────────────────
  const [manualNuevoChasis, setManualNuevoChasis] = useState("");
  const [manualNuevoMotor, setManualNuevoMotor] = useState("");
  const [manualCapturando, setManualCapturando] = useState(false);

  const abrirManual = async (rem: RemisionCard) => {
    setManualDialog(rem);
    setManualLoading(true);
    setManualQ("");
    setManualNuevoChasis("");
    setManualNuevoMotor("");

    const { data: asig } = await supabase
      .from("motocarros")
      .select("id, orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado")
      .eq("remision_id", rem.id)
      .order("orden_armado");
    setAsignadosManual((asig ?? []) as MotocarroDisponible[]);

    // Mostrar TODOS los motocarros sin remisión (con o sin serial)
    const { data: disp } = await supabase
      .from("motocarros")
      .select("id, orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado")
      .is("remision_id", null)
      .in("estatus_armado", ["PENDIENTE", "EN_PROCESO", "ARMADO", "LISTO"])
      .order("orden_armado");
    setDisponibles((disp ?? []) as MotocarroDisponible[]);
    setManualLoading(false);
  };

  const asignarManual = async (motocarroId: string) => {
    if (!manualDialog) return;
    setManualBusy(motocarroId);

    // Si el motocarro no tiene seriales, primero intentamos capturarlos si el usuario los escribió
    const moto = disponibles.find(m => m.id === motocarroId);
    if (moto && (!moto.ns_chasis || !moto.ns_motor)) {
      // La RPC permite asignar sin serial, el check está en estatus_armado
    }

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

  // Capturar seriales y asignar en un solo paso
  const capturarYAsignar = async (motocarroId: string, nsChasis: string, nsMotor: string) => {
    if (!manualDialog) return;
    setManualBusy(motocarroId);

    // 1. Capturar seriales
    if (nsChasis || nsMotor) {
      const { error: capErr } = await supabase.rpc("capturar_seriales_unidad", {
        _motocarro_id: motocarroId,
        ...(nsChasis ? { _ns_chasis: nsChasis.toUpperCase().replace(/\s/g, "") } : {}),
        ...(nsMotor ? { _ns_motor: nsMotor.toUpperCase().replace(/\s/g, "") } : {}),
      });
      if (capErr) { setManualBusy(null); toast.error(capErr.message); return; }
    }

    // 2. Asignar a remisión
    const { error } = await supabase.rpc("asignar_motocarro_a_remision", {
      _motocarro_id: motocarroId,
      _remision_id: manualDialog.id,
    });
    setManualBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("✓ Seriales capturados y unidad asignada");
    setManualNuevoChasis("");
    setManualNuevoMotor("");
    setManualCapturando(false);
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
      <Card className="p-3 sm:p-5 border-2 border-[#E8A30D]/40 bg-gradient-to-br from-[#FFF8E7] to-white min-w-0">
        <div className="flex flex-wrap items-center gap-3 mb-4">
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

        <div className="responsive-card-grid gap-3">
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
              <div key={rem.id} className="bg-white rounded-xl border border-[#E8A30D]/25 flex flex-col min-w-0 overflow-hidden shadow-sm">
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
                  <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
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
                        <div key={c.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px]">
                          <span className="font-medium text-slate-700 break-words">{c.etiqueta}</span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
                <div className="px-4 py-3 mt-auto border-t flex flex-wrap gap-2">
                  <Button
                    onClick={() => asignar(rem.id, faltan)}
                    disabled={busy === rem.id || faltan <= 0 || (cobertura.length > 0 && asignables <= 0)}
                    className="basis-full grow h-auto min-h-11 whitespace-normal bg-[#1F3864] hover:bg-[#2E75B6] text-white font-semibold text-sm"
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
                  <Button
                    variant="outline"
                    onClick={() => abrirDetalle(rem)}
                    className="basis-full h-11 px-3 border-[#1F3864]/30 text-[#1F3864] hover:bg-[#1F3864]/5"
                  >
                    <FileText className="h-4 w-4 mr-1.5" /> Ver remisión completa
                  </Button>
                  {puedeAsignarManual && (
                    <Button
                      variant="outline"
                      onClick={() => abrirManual(rem)}
                      className="flex-1 min-w-24 h-11 px-3 border-[#1F3864]/30 text-[#1F3864] hover:bg-[#1F3864]/5"
                      title="Asignar manualmente eligiendo chasis y motor"
                    >
                      <UserPlus className="h-4 w-4 mr-1.5" /> Manual
                    </Button>
                  )}
                  {rem.documento_url && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => verDoc(rem.documento_url!)}
                        className="flex-1 min-w-24 h-11 px-3"
                        title="Visualizar PDF"
                      >
                        <Eye className="h-4 w-4 mr-1.5" /> Ver PDF
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => descargarDoc(rem.documento_url!)}
                        className="flex-1 min-w-24 h-11 px-3"
                        title="Descargar PDF"
                      >
                        <Download className="h-4 w-4 mr-1.5" /> Descargar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Dialog open={!!detalleDialog} onOpenChange={o => { if (!o) { setDetalleDialog(null); setDetalleUnidades([]); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-[#1F3864]">
              Remisión {detalleDialog?.folio_remision}
              {detalleDialog && (
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${detalleDialog.asignados === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {detalleDialog.asignados === 0 ? "SIN ASIGNAR" : detalleDialog.estatus}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>Información completa del pedido, sus unidades y el documento adjunto.</DialogDescription>
          </DialogHeader>

          {detalleDialog && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Fecha</div>
                  <div className="font-semibold">{fmtDate(detalleDialog.fecha_remision)}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3 sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Cliente</div>
                  <div className="font-semibold break-words">{detalleDialog.cliente}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Vendedor</div>
                  <div className="font-semibold break-words">{detalleDialog.nombre_vendedor || detalleDialog.vendedor}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Solicitadas</div>
                  <div className="font-semibold">{detalleDialog.total_unidades}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Asignadas</div>
                  <div className="font-semibold">{detalleDialog.asignados}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Pendientes</div>
                  <div className="font-semibold text-red-600">{Math.max(detalleDialog.total_unidades - detalleDialog.asignados, 0)}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Tipo de pago</div>
                  <div className="font-semibold">{detalleDialog.tipo_pago === "contra_entrega" ? "Contra entrega" : detalleDialog.tipo_pago === "anticipado" ? "Anticipado" : "—"}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">Estado del pago</div>
                  <div className="font-semibold">{detalleDialog.pagado === null ? "—" : detalleDialog.pagado ? "Pagado" : "Pendiente"}</div>
                </div>
              </div>

              <div>
                <h3 className="text-base mb-2">Configuración del pedido</h3>
                {detalleDialog.items.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {detalleDialog.items.map((item: any) => (
                      <div key={item.id} className="rounded-lg border p-3 flex items-start gap-2">
                        <span>{tipoIcon[item.tipo_servicio] || "•"}</span>
                        <div className="min-w-0">
                          <div className="font-semibold">{tipoLabel[item.tipo_servicio] || item.tipo_servicio}</div>
                          <div className="text-sm text-muted-foreground break-words">
                            {[item.modelo, item.color, item.cantidad ? `Cantidad: ${item.cantidad}` : null, item.con_caja ? "Con caja" : null].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Sin configuración capturada.</div>
                )}
              </div>

              <div>
                <h3 className="text-base mb-2">Unidades asignadas</h3>
                {detalleLoading ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground text-center">Cargando unidades…</div>
                ) : detalleUnidades.length > 0 ? (
                  <div className="space-y-2">
                    {detalleUnidades.map(m => (
                      <div key={m.id} className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Orden:</span> <strong>#{m.orden_armado}</strong></div>
                        <div><span className="text-muted-foreground">Modelo/color:</span> <strong>{m.modelo || "—"} {m.color || ""}</strong></div>
                        <div className="break-all"><span className="text-muted-foreground">NS chasis:</span> <strong>{m.ns_chasis || "—"}</strong></div>
                        <div className="break-all"><span className="text-muted-foreground">NS motor:</span> <strong>{m.ns_motor || "—"}</strong></div>
                        <div><span className="text-muted-foreground">Armado:</span> <strong>{m.estatus_armado || "—"}</strong></div>
                        <div><span className="text-muted-foreground">Entrega:</span> <strong>{m.estatus_entrega || "—"}</strong></div>
                        <div><span className="text-muted-foreground">Armado estimado:</span> <strong>{fmtDate(m.fecha_estimada_armado)}</strong></div>
                        <div><span className="text-muted-foreground">Entrega estimada:</span> <strong>{fmtDate(m.fecha_estimada_entrega)}</strong></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Todavía no hay unidades asignadas.</div>
                )}
              </div>

              {detalleDialog.notas && (
                <div>
                  <h3 className="text-base mb-2">Notas</h3>
                  <div className="rounded-lg border bg-blue-50/50 p-3 text-sm whitespace-pre-wrap break-words">{detalleDialog.notas}</div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t pt-4">
                {detalleDialog.documento_url ? (
                  <>
                    <Button onClick={() => verDoc(detalleDialog.documento_url!)} className="flex-1 min-w-40 bg-[#1F3864] hover:bg-[#162a4d]">
                      <Eye className="h-4 w-4 mr-2" /> Visualizar PDF
                    </Button>
                    <Button variant="outline" onClick={() => descargarDoc(detalleDialog.documento_url!)} className="flex-1 min-w-40">
                      <Download className="h-4 w-4 mr-2" /> Descargar PDF
                    </Button>
                  </>
                ) : (
                  <div className="flex-1 rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">Esta remisión no tiene PDF adjunto.</div>
                )}
                <Button variant="outline" onClick={() => setDetalleDialog(null)}>Cerrar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
      <Dialog open={!!manualDialog} onOpenChange={o => { if (!o) { setManualDialog(null); setManualCapturando(false); } }}>
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
                          <span className="text-xs text-muted-foreground">Chasis: {m.ns_chasis ?? "sin serial"}</span>
                          {" · "}
                          <span className="text-xs text-muted-foreground">Motor: {m.ns_motor ?? "sin serial"}</span>
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

              {/* Buscador + lista de disponibles */}
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
              <div className="space-y-1.5 max-h-[35vh] overflow-y-auto">
                {disponiblesFiltrados.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No hay unidades disponibles{manualQ ? " con ese filtro" : ""}
                  </p>
                )}
                {disponiblesFiltrados.map(m => {
                  const tieneSerial = !!m.ns_chasis && !!m.ns_motor;
                  return (
                    <div key={m.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border hover:bg-slate-50 ${tieneSerial ? "bg-white" : "bg-amber-50/50 border-amber-200"}`}>
                      <div className="text-sm min-w-0 flex-1">
                        <span className="font-bold text-[#1F3864]">#{m.orden_armado}</span>
                        {" · "}
                        <span className="font-medium">{m.color}</span>
                        {" · "}
                        <span className={`text-xs ${m.ns_chasis ? "text-muted-foreground" : "text-amber-600 font-medium"}`}>
                          Chasis: {m.ns_chasis || "pendiente"}
                        </span>
                        {" · "}
                        <span className={`text-xs ${m.ns_motor ? "text-muted-foreground" : "text-amber-600 font-medium"}`}>
                          Motor: {m.ns_motor || "pendiente"}
                        </span>
                        {m.estatus_armado && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {m.estatus_armado}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {!tieneSerial && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setManualCapturando(true); setManualBusy(m.id); setManualNuevoChasis(""); setManualNuevoMotor(""); }}
                            disabled={manualCapturando && manualBusy !== m.id}
                            className="h-8 px-2 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                            title="Capturar seriales y asignar"
                          >
                            Capturar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => asignarManual(m.id)}
                          disabled={manualBusy === m.id && !manualCapturando}
                          className="h-8 px-3 bg-[#1F3864] hover:bg-[#2E75B6] text-white text-xs"
                        >
                          {manualBusy === m.id && !manualCapturando ? "…" : "Asignar"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Formulario de captura de seriales */}
              {manualCapturando && manualBusy && (
                <div className="border-2 border-amber-300 rounded-lg p-3 bg-amber-50/50 space-y-2">
                  <h4 className="text-sm font-semibold text-amber-800">
                    Capturar seriales para unidad #{disponibles.find(m => m.id === manualBusy)?.orden_armado}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="NS Chasis (ej. LDZ4B2P1XRA000123)"
                      value={manualNuevoChasis}
                      onChange={e => setManualNuevoChasis(e.target.value.toUpperCase().replace(/\s/g, ""))}
                      className="h-10 text-sm font-mono"
                    />
                    <Input
                      placeholder="NS Motor (ej. DZ164FMLT2M00654)"
                      value={manualNuevoMotor}
                      onChange={e => setManualNuevoMotor(e.target.value.toUpperCase().replace(/\s/g, ""))}
                      className="h-10 text-sm font-mono"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => capturarYAsignar(manualBusy, manualNuevoChasis, manualNuevoMotor)}
                      disabled={!manualNuevoChasis && !manualNuevoMotor}
                      className="h-9 bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      Guardar seriales y asignar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setManualCapturando(false); setManualBusy(null); }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setManualDialog(null); setManualCapturando(false); }}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
