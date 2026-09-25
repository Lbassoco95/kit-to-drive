import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Inbox, RefreshCw, Eye, Download, FileText, Package, Settings2, TriangleAlert, Wrench, UserPlus, X } from "lucide-react";
import { fmtDate, COLORES, claveStock, explicarError, normColor, normSerial,
         nombreComercial, claveCapacidad, CatalogoModelos, CapacidadColor,
         LineaProducto, ModeloInfo } from "@/lib/dazon";
import { cargarCapacidadColor } from "@/components/ColorChasis";
import { cargarModelosMotocarro, MODELOS_RESPALDO } from "@/lib/catalogoModelos";
import { remisionEsSoloCabina } from "@/lib/remisionesEdicion";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { DocumentViewerDialog } from "@/components/DocumentViewerDialog";
import { SerialAutocomplete } from "@/components/SerialAutocomplete";



const tipoIcon: Record<string, string> = {
  motocarro: "🏍️", cabina: "🛖", instalacion_cabina: "🔧", activacion: "⚡", flete: "🚛",
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
  tipo_remision: string | null;
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

/** Lo que el sistema ya sabe de un chasis que fábrica está capturando. */
type ChasisEnInventario = {
  numero_chasis: string;
  modelo: string;    // código de fábrica (DZ300Q7); su nombre comercial se
                     // traduce al dibujar, con el catálogo ya cargado
  color: string;     // color efectivo, con el que se arma
  colorVin: string;  // lo que declaró el VIN
};

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
  const { t } = useLang();
  const b = t.componentes.bandejaRemisiones;
  const puedeAsignarManual = area === "fabrica" || perms.esAdminGlobal;

  const [items, setItems] = useState<RemisionCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [configDialog, setConfigDialog] = useState<RemisionCard | null>(null);
  const [configForm, setConfigForm] = useState(defaultConfigForm());
  const [savingConfig, setSavingConfig] = useState(false);
  const [stock, setStock] = useState<Map<string, StockColor>>(new Map());
  const [modelos, setModelos] = useState<string[]>(MODELOS_RESPALDO);
  // Catálogo de fábrica y juegos de piezas por color: hacen falta para saber
  // qué es el chasis que fábrica está capturando y si su color tiene juego libre.
  const [catalogo, setCatalogo] = useState<CatalogoModelos>(new Map());
  const [capacidad, setCapacidad] = useState<Map<string, CapacidadColor>>(new Map());
  // El lote cerrado de unidades que ya estaban ensambladas: cuántas van, de
  // cuántas. `null` = la base todavía no tiene el tope, así que no hay nada que
  // decir (y tampoco hay tope que respetar).
  const [loteYaArmados, setLoteYaArmados] = useState<{ cargadas: number; limite: number; restantes: number } | null>(null);

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
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    cargarModelosMotocarro().then(setModelos);

    // El código de fábrica del chasis (DZ300Q7) no le dice nada a nadie en el
    // piso: se traduce a su nombre comercial ("300cc 2026"), que es el
    // cilindraje con el que se trabaja.
    supabase.from("modelos_producto").select("modelo, linea, nombre_comercial")
      .then(({ data }) => {
        const filas: [string, ModeloInfo][] = (data ?? []).map(c => [
          c.modelo,
          { linea: (c.linea ?? "otro") as LineaProducto, nombre_comercial: c.nombre_comercial },
        ]);
        setCatalogo(new Map(filas));
      });
    cargarCapacidadColor().then(setCapacidad);

    // Cuántas unidades ya armadas se han cargado del lote. Si la vista no está
    // (falta correr 20260908000002), no hay tope en la base tampoco: se calla
    // en vez de inventar una cuenta.
    supabase.from("v_carga_ya_armados").select("cargadas, limite, restantes").maybeSingle()
      .then(({ data }) => setLoteYaArmados(data ?? null));

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
      tipo_remision: null,
      items: [],
    }));
    setItems(mapped);

    const ids = base.map((r: any) => r.id);

    // ── Columnas extendidas ───────────────────────────────────────────────────
    try {
      const { data: ext } = await supabase
        .from("remisiones")
        .select("id,total_unidades_solicitadas,nombre_vendedor,documento_url,tipo_pago,pagado,tipo_remision")
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
          tipo_remision: extMap[r.id]?.tipo_remision ?? null,
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

    if (asignadas > 0) toast.success(b.okAsignados(asignadas));

    // Explicar el faltante línea por línea: de qué color, cuántas faltan y si
    // el problema es que no hay piezas o que fábrica no las ha configurado.
    (r?.detalle ?? []).filter((d: any) => (d?.faltan ?? 0) > 0).forEach((d: any) => {
      const que = [d.modelo, d.color].filter(Boolean).join(" ") || b.sinModeloColor;
      const detalle = d.piezas_por_configurar > 0
        ? b.detPorConfigurar(d.piezas_por_configurar)
        : d.unidades_sin_serial > 0
        ? b.detSinSerial(d.unidades_sin_serial)
        : d.unidades_detenidas > 0
        ? b.detDetenidas(d.unidades_detenidas)
        : b.detSinInventario;
      toast.warning(b.faltanDe(d.faltan, que, detalle));
    });

    if (!asignadas && !(r?.detalle ?? []).length) toast.info(b.nadaPorAsignar);
    if (r?.pedido_capturado === false) {
      toast.info(b.sinConfigAviso);
    }

    await load(); onChange?.();
  };

  const verDoc = (path: string) => setPreviewPath(path);

  const descargarDoc = async (path: string) => {
    const nombre = path.split("/").pop() || "remision.pdf";
    const { data, error } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60, { download: nombre });
    if (error || !data?.signedUrl) { toast.error(b.errorDescargar); return; }
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
    toast.success(b.configGuardada);
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
    if (error) { toast.error(b.errorUnidades); setDetalleUnidades([]); return; }
    setDetalleUnidades((data ?? []) as MotocarroDisponible[]);
  };

  // ── Asignación manual ─────────────────────────────────────────────────────
  const [manualNuevoChasis, setManualNuevoChasis] = useState("");
  const [manualNuevoMotor, setManualNuevoMotor] = useState("");
  const [manualCapturando, setManualCapturando] = useState<string | null>(null);
  const [manualYaArmado, setManualYaArmado] = useState(false);
  // Modelo (cilindraje) y color con los que se registra la unidad ya armada.
  // Fábrica los declara: la unidad que aparece en el piso no siempre es la que
  // capturó ventas, y antes se guardaba "como está en el sistema" sin manera de
  // decir lo contrario.
  const [armadoModelo, setArmadoModelo] = useState("");
  const [armadoColor, setArmadoColor] = useState("");
  // Lo que el sistema ya sabe del chasis capturado, si es que lo conoce.
  const [chasisInv, setChasisInv] = useState<ChasisEnInventario | null>(null);
  // Chasis libres de ese modelo por color: es la salida cuando el color que se
  // eligió no tiene juegos de piezas libres — probablemente la unidad es otra.
  const [chasisLibres, setChasisLibres] = useState<Map<string, number>>(new Map());
  // Confirmación antes de dar de alta: por aquí entra una unidad que nadie vio
  // armarse, así que fábrica lo dice con todas sus letras.
  const [confirmarArmado, setConfirmarArmado] = useState<{ chasis: string; motor: string } | null>(null);

  // Lo que pide la remisión abierta.
  const pedidoMoto = manualDialog?.items?.find(it => it.tipo_servicio === "motocarro");
  const pedidoModelo = (pedidoMoto?.modelo ?? "").trim();
  const pedidoColor = pedidoMoto?.color ? normColor(pedidoMoto.color) : "";
  const nombreColor = (c: string) => t.colors[c] ?? c;

  // Un valor que no esté en el catálogo (un modelo dado de baja, un color fuera
  // de la lista) se agrega a las opciones: un select que no contiene su propio
  // valor se dibuja vacío.
  const conValor = (lista: readonly string[], valor: string) =>
    valor && !lista.includes(valor) ? [valor, ...lista] : [...lista];
  const modelosArmado = conValor(conValor(modelos, pedidoModelo), armadoModelo);
  const coloresArmado = conValor(conValor(COLORES, pedidoColor), armadoColor);

  const armadoDifierePedido = !!(pedidoModelo || pedidoColor) &&
    (armadoModelo !== pedidoModelo || armadoColor !== pedidoColor);

  // Juegos de piezas libres de un color para el modelo del chasis capturado.
  // Va por código de fábrica, que es como se cuentan los juegos.
  const juegosLibresDe = (color: string) =>
    chasisInv ? (capacidad.get(claveCapacidad(chasisInv.modelo, color))?.libres ?? 0) : 0;
  // El color declarado no es el que trae el chasis en inventario.
  const colorCambiaChasis = !!chasisInv && !!armadoColor && armadoColor !== chasisInv.color;
  const sinJuegosDelColor = colorCambiaChasis && juegosLibresDe(armadoColor) <= 0;
  // El lote se acabó: por aquí ya no entra nada más hasta que Dirección suba
  // el tope. La base lo rechaza igual; la pantalla lo dice antes de capturar.
  const loteAgotado = !!loteYaArmados && loteYaArmados.restantes <= 0;

  // Al marcar "ya armado" los campos parten del pedido; en cuanto el chasis
  // capturado aparece en inventario, se corrigen con lo que dice el chasis.
  const prellenarArmado = () => {
    setArmadoModelo(pedidoModelo || modelos[0] || MODELOS_RESPALDO[0]);
    setArmadoColor(pedidoColor || "BLANCO");
  };

  // El chasis manda sobre el pedido: si ya está en inventario, el cilindraje y
  // el color de la unidad son los suyos. Precargar el color del PEDIDO mandaba
  // a repintar chasis que estaban bien —REM-015 pedía azul, el chasis era
  // blanco— y eso se atoraba contra los juegos de piezas de ese color.
  useEffect(() => {
    if (!manualYaArmado) { setChasisInv(null); setChasisLibres(new Map()); return; }
    const serial = normSerial(manualNuevoChasis);
    if (serial.length < 4) { setChasisInv(null); setChasisLibres(new Map()); return; }

    let cancelado = false;
    const temporizador = setTimeout(async () => {
      const { data } = await supabase
        .from("inventario_chasis")
        .select("numero_chasis, modelo, color, color_original")
        .eq("numero_chasis", serial)
        .maybeSingle();
      if (cancelado) return;
      if (!data) { setChasisInv(null); setChasisLibres(new Map()); return; }

      setChasisInv({
        numero_chasis: data.numero_chasis,
        modelo: data.modelo,
        color: normColor(data.color),
        colorVin: normColor(data.color_original ?? data.color),
      });

      const { data: libres } = await supabase
        .from("inventario_chasis")
        .select("color")
        .eq("modelo", data.modelo)
        .is("motocarro_id", null)
        .eq("estatus", "disponible");
      if (cancelado) return;
      const porColor = new Map<string, number>();
      for (const c of libres ?? []) {
        const col = normColor(c.color);
        porColor.set(col, (porColor.get(col) ?? 0) + 1);
      }
      setChasisLibres(porColor);
    }, 300);

    return () => { cancelado = true; clearTimeout(temporizador); };
  }, [manualYaArmado, manualNuevoChasis]);

  // Cuando un chasis nuevo queda identificado, los dos campos se van a lo que
  // dice el chasis — una sola vez por chasis, para no pisar la corrección que
  // fábrica haya hecho a mano después.
  const chasisPrellenado = useRef("");
  useEffect(() => {
    if (!chasisInv) { chasisPrellenado.current = ""; return; }
    if (chasisPrellenado.current === chasisInv.numero_chasis) return;
    chasisPrellenado.current = chasisInv.numero_chasis;
    setArmadoModelo(nombreComercial(chasisInv.modelo, catalogo));
    setArmadoColor(chasisInv.color);
  }, [chasisInv, catalogo]);

  const abrirManual = async (rem: RemisionCard) => {
    setManualDialog(rem);
    setManualLoading(true);
    setManualQ("");
    setManualNuevoChasis("");
    setManualNuevoMotor("");
    setManualCapturando(null);
    setManualYaArmado(false);
    setArmadoModelo("");
    setArmadoColor("");
    setChasisInv(null);
    setChasisLibres(new Map());

    const { data: asig } = await supabase
      .from("motocarros")
      .select("id, orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado")
      .eq("remision_id", rem.id)
      .order("orden_armado");
    setAsignadosManual((asig ?? []) as MotocarroDisponible[]);

    // Mostrar TODOS los motocarros sin remisión
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
    const { error } = await supabase.rpc("asignar_motocarro_a_remision", {
      _motocarro_id: motocarroId,
      _remision_id: manualDialog.id,
    });
    setManualBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(b.okUnidadAsignada);
    await abrirManual(manualDialog);
    await load(); onChange?.();
  };

  // Capturar seriales en una unidad y asignarla
  const capturarYAsignar = async (motocarroId: string, nsChasis: string, nsMotor: string) => {
    if (!manualDialog) return;
    setManualBusy(motocarroId);

    if (nsChasis || nsMotor) {
      const { error: capErr } = await supabase.rpc("capturar_seriales_unidad", {
        _motocarro_id: motocarroId,
        ...(nsChasis ? { _ns_chasis: nsChasis.toUpperCase().replace(/\s/g, "") } : {}),
        ...(nsMotor ? { _ns_motor: nsMotor.toUpperCase().replace(/\s/g, "") } : {}),
      });
      if (capErr) { setManualBusy(null); toast.error(capErr.message); return; }
    }

    const { error } = await supabase.rpc("asignar_motocarro_a_remision", {
      _motocarro_id: motocarroId,
      _remision_id: manualDialog.id,
    });
    setManualBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(b.okSerialesCapturados);
    setManualNuevoChasis("");
    setManualNuevoMotor("");
    setManualCapturando(null);
    await abrirManual(manualDialog);
    await load(); onChange?.();
  };

  // Buscar unidad por serial (chasis o motor) para asignarla
  const buscarYAsignarPorSerial = async () => {
    if (!manualDialog) return;
    const chasis = manualNuevoChasis.trim().toUpperCase().replace(/\s/g, "");
    const motor = manualNuevoMotor.trim().toUpperCase().replace(/\s/g, "");
    if (!chasis && !motor) { toast.error(b.faltaSerie); return; }

    setManualBusy("buscando");

    // Buscar si ya existe un motocarro con ese chasis o motor
    let motoId: string | null = null;

    if (chasis) {
      const { data } = await supabase
        .from("motocarros")
        .select("id, remision_id")
        .eq("ns_chasis", chasis)
        .maybeSingle();
      if (data) {
        if (data.remision_id) {
          setManualBusy(null);
          toast.error(b.chasisOcupado);
          return;
        }
        motoId = data.id;
      }
    }

    if (!motoId && motor) {
      const { data } = await supabase
        .from("motocarros")
        .select("id, remision_id")
        .eq("ns_motor", motor)
        .maybeSingle();
      if (data) {
        if (data.remision_id) {
          setManualBusy(null);
          toast.error(b.motorOcupado);
          return;
        }
        motoId = data.id;
      }
    }

    // Si no existe, dar de alta la unidad ya armada — pero no a la primera:
    // esto mete al sistema una unidad que nadie vio armarse, y es un lote
    // cerrado. Se pide confirmación explícita con lo que va a quedar
    // registrado, y el alta se hace desde ahí.
    if (!motoId && manualYaArmado) {
      if (!chasis || !motor) {
        setManualBusy(null);
        toast.error(b.faltanAmbosSeriales);
        return;
      }
      if (!(armadoModelo || pedidoModelo).trim() || !(armadoColor || pedidoColor).trim()) {
        setManualBusy(null);
        toast.error(b.faltaModeloColorArmada);
        return;
      }
      setManualBusy(null);
      setConfirmarArmado({ chasis, motor });
      return;
    }

    // Si no existe pero hay unidades sin serial, capturar en la primera disponible
    if (!motoId) {
      const sinSerial = disponibles.filter(m => !m.ns_chasis && !m.ns_motor);
      if (sinSerial.length > 0) {
        await capturarYAsignar(sinSerial[0].id, chasis, motor);
        return;
      }
      // No hay unidades disponibles para vincular
      setManualBusy(null);
      toast.error(b.sinUnidadParaSerial);
      return;
    }

    // Asignar la unidad encontrada (y actualizar seriales si falta alguno)
    if (chasis || motor) {
      const moto = disponibles.find(m => m.id === motoId);
      const necesitaCaptura = (chasis && moto?.ns_chasis !== chasis) || (motor && moto?.ns_motor !== motor);
      if (necesitaCaptura) {
        await capturarYAsignar(motoId, chasis, motor);
        return;
      }
    }

    // Asignar directamente
    const { error } = await supabase.rpc("asignar_motocarro_a_remision", {
      _motocarro_id: motoId,
      _remision_id: manualDialog.id,
    });
    setManualBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(b.okAsignadaPorSerial);
    setManualNuevoChasis("");
    setManualNuevoMotor("");
    await abrirManual(manualDialog);
    await load(); onChange?.();
  };

  // Alta de la unidad ya armada, una vez que fábrica confirmó que el motocarro
  // ya estaba físicamente ensamblado.
  const crearUnidadYaArmada = async () => {
    if (!manualDialog || !confirmarArmado) return;
    const { chasis, motor } = confirmarArmado;
    // Modelo (cilindraje) y color los declara fábrica al ingresar la unidad:
    // es lo que trae físicamente, no lo que quedó capturado en el pedido.
    const modelo = (armadoModelo || pedidoModelo).trim();
    const color = (armadoColor || pedidoColor).trim();

    setManualBusy("creando");
    const { data, error } = await supabase.rpc("crear_motocarro_ya_armado", {
      _ns_chasis: chasis,
      _ns_motor: motor,
      _modelo: modelo,
      _color: color,
      _remision_id: manualDialog.id,
    });
    setManualBusy(null);
    // `explicarError` y no `error.message`: si la base va atrás, esta RPC
    // contesta «function ... does not exist» y eso no le dice a nadie qué
    // hacer.
    if (error) { toast.error(explicarError(error, b.errorCrearArmada)); return; }
    const r = data as {
      ok?: boolean; orden_armado?: number;
      color_cambiado?: boolean; color_vin?: string; capacidad_ajustada?: boolean;
      ya_armados_cargados?: number; ya_armados_limite?: number;
    } | null;
    toast.success(b.okYaArmada(r?.orden_armado ?? 0));
    // El chasis ya estaba en inventario con otro color: se armó con este, y
    // eso consumió un juego de piezas de ese color.
    if (r?.color_cambiado) {
      toast.info(b.okColorDistintoChasis(nombreColor(color), nombreColor(r?.color_vin ?? "")));
    }
    // Del embarque no venían juegos libres de ese color: la unidad ya estaba
    // armada, así que se registró el juego extra. Que no pase en silencio.
    if (r?.capacidad_ajustada) {
      toast.warning(b.okJuegoExtraRegistrado(nombreColor(color)));
    }
    if (armadoDifierePedido) {
      toast.info(b.avisoDifierePedido(pedidoModelo || "—", pedidoColor ? nombreColor(pedidoColor) : "—"));
    }
    if (typeof r?.ya_armados_cargados === "number" && typeof r?.ya_armados_limite === "number") {
      setLoteYaArmados({
        cargadas: r.ya_armados_cargados,
        limite: r.ya_armados_limite,
        restantes: Math.max(r.ya_armados_limite - r.ya_armados_cargados, 0),
      });
    }
    setConfirmarArmado(null);
    setManualNuevoChasis("");
    setManualNuevoMotor("");
    setManualYaArmado(false);
    await abrirManual(manualDialog);
    await load(); onChange?.();
  };

  const desasignarManual = async (motocarroId: string) => {
    setManualBusy(motocarroId);
    const { error } = await supabase.rpc("desasignar_motocarro_de_remision", {
      _motocarro_id: motocarroId,
    });
    setManualBusy(null);
    // `explicarError` y no `error.message`: si la base va atrás, esta RPC
    // contesta «function ... does not exist», que no le dice a nadie qué
    // hacer. Pasó en producción con 20260826000003 a medias — quedó
    // `asignar_motocarro_a_remision` y no su contraparte.
    if (error) { toast.error(explicarError(error, b.errorLiberar)); return; }
    toast.success(b.okLiberada);
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

  // La venta de sola cabina no espera chasis: no entra a la bandeja de fábrica.
  const pendientesDeChasis = items.filter(rem => {
    if (rem.tipo_remision === "cabina") return false;
    if (rem.items.length && remisionEsSoloCabina(rem.items)) return false;
    return true;
  });

  if (!pendientesDeChasis.length && !loading) return null;

  return (
    <>
      <Card className="p-3 sm:p-5 border-2 border-[#E8A30D]/40 bg-gradient-to-br from-[#FFF8E7] to-white min-w-0">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-[#E8A30D]/15 flex items-center justify-center shrink-0">
            <Inbox className="h-6 w-6 text-[#A36B00]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-[#1F3864]">{b.title}</h2>
            <p className="text-sm text-muted-foreground">{b.subtitle(pendientesDeChasis.length)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 shrink-0">
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> {b.actualizar}
          </Button>
        </div>

        <div className="responsive-card-grid gap-3">
          {pendientesDeChasis.map(rem => {
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
                etiqueta: [it.modelo, it.color].filter(Boolean).join(" ") || b.sinModeloColor,
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
                    {sinAsignar ? b.sinAsignar : b.parcial}
                  </span>
                </div>

                {/* Info */}
                <div className="px-4 py-3 space-y-1.5 text-sm">
                  <div className="text-muted-foreground">{b.vendedor} <strong className="text-foreground">{vendedorDisplay}</strong></div>
                  <div className="text-muted-foreground">{b.cliente} <strong className="text-foreground">{rem.cliente}</strong></div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                    <span className="text-muted-foreground">{b.solicita} <strong className="text-foreground">{rem.total_unidades}</strong></span>
                    <span className="text-muted-foreground">{b.asignados} <strong className="text-foreground">{rem.asignados}</strong></span>
                    <span className="text-red-600 font-bold">{b.faltan(faltan)}</span>
                  </div>
                </div>

                {/* Configuración del pedido */}
                <div className="px-4 py-2.5 border-t bg-slate-50/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {b.configuracion}
                    </span>
                    <button
                      onClick={() => abrirConfig(rem)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2E75B6] hover:text-[#1F3864] hover:underline"
                    >
                      <Settings2 size={11} />
                      {tieneConfig ? b.editar : b.configurar}
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
                          {b.tipoServicio(it.tipo_servicio)}
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
                      {b.capturarConfig}
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
                              {b.conSerial(c.libres)}
                            </span>
                            {c.porConfigurar > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[#92400E]" title={b.tipPorConfigurar}>
                                <Wrench size={9} /> {b.porConfigurar(c.porConfigurar)}
                              </span>
                            )}
                            {c.sinSerial > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[#92400E]" title={b.tipSinNS}>
                                <TriangleAlert size={9} /> {b.sinNS(c.sinSerial)}
                              </span>
                            )}
                            {c.detenidas > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[#991B1B]" title={b.tipDetenidas}>
                                <TriangleAlert size={9} /> {b.detenidas(c.detenidas)}
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
                    <span className="font-semibold">{b.nota}</span> {rem.notas}
                  </div>
                )}

                {/* Acciones */}
                <div className="px-4 py-3 mt-auto border-t flex flex-wrap gap-2">
                  <Button
                    onClick={() => asignar(rem.id, faltan)}
                    disabled={busy === rem.id || faltan <= 0 || (cobertura.length > 0 && asignables <= 0)}
                    className="basis-full grow h-auto min-h-11 whitespace-normal bg-[#1F3864] hover:bg-[#2E75B6] text-white font-semibold text-sm"
                    title={cobertura.length > 0 && asignables <= 0
                      ? b.tipSinUnidades
                      : undefined}
                  >
                    {busy === rem.id
                      ? b.asignando
                      : cobertura.length > 0 && asignables <= 0
                      ? b.sinUnidadesModeloColor
                      : cobertura.length > 0 && asignables < faltan
                      ? b.asignarParcial(asignables, faltan)
                      : b.asignarTodas(faltan)}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => abrirDetalle(rem)}
                    className="basis-full h-11 px-3 border-[#1F3864]/30 text-[#1F3864] hover:bg-[#1F3864]/5"
                  >
                    <FileText className="h-4 w-4 mr-1.5" /> {b.verCompleta}
                  </Button>
                  {puedeAsignarManual && (
                    <Button
                      variant="outline"
                      onClick={() => abrirManual(rem)}
                      className="flex-1 min-w-24 h-11 px-3 border-[#1F3864]/30 text-[#1F3864] hover:bg-[#1F3864]/5"
                      title={b.tipManual}
                    >
                      <UserPlus className="h-4 w-4 mr-1.5" /> {b.manual}
                    </Button>
                  )}
                  {rem.documento_url && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => verDoc(rem.documento_url!)}
                        className="flex-1 min-w-24 h-11 px-3"
                        title={b.tipVerPdf}
                      >
                        <Eye className="h-4 w-4 mr-1.5" /> {b.verPdf}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => descargarDoc(rem.documento_url!)}
                        className="flex-1 min-w-24 h-11 px-3"
                        title={b.tipDescargarPdf}
                      >
                        <Download className="h-4 w-4 mr-1.5" /> {b.descargar}
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
              {b.detalleTitulo(detalleDialog?.folio_remision ?? "")}
              {detalleDialog && (
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${detalleDialog.asignados === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {detalleDialog.asignados === 0 ? b.sinAsignar : t.estatus[detalleDialog.estatus as keyof typeof t.estatus] ?? detalleDialog.estatus}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>{b.detalleDesc}</DialogDescription>
          </DialogHeader>

          {detalleDialog && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">{b.fecha}</div>
                  <div className="font-semibold">{fmtDate(detalleDialog.fecha_remision)}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3 sm:col-span-2">
                  <div className="text-xs text-muted-foreground">{b.clienteLbl}</div>
                  <div className="font-semibold break-words">{detalleDialog.cliente}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">{b.vendedorLbl}</div>
                  <div className="font-semibold break-words">{detalleDialog.nombre_vendedor || detalleDialog.vendedor}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">{b.solicitadas}</div>
                  <div className="font-semibold">{detalleDialog.total_unidades}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">{b.asignadas}</div>
                  <div className="font-semibold">{detalleDialog.asignados}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">{b.pendientes}</div>
                  <div className="font-semibold text-red-600">{Math.max(detalleDialog.total_unidades - detalleDialog.asignados, 0)}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">{b.tipoPago}</div>
                  <div className="font-semibold">{detalleDialog.tipo_pago === "contra_entrega" ? b.contraEntrega : detalleDialog.tipo_pago === "anticipado" ? b.anticipado : "—"}</div>
                </div>
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-xs text-muted-foreground">{b.estadoPago}</div>
                  <div className="font-semibold">{detalleDialog.pagado === null ? "—" : detalleDialog.pagado ? b.pagado : b.pendiente}</div>
                </div>
              </div>

              <div>
                <h3 className="text-base mb-2">{b.configuracion}</h3>
                {detalleDialog.items.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {detalleDialog.items.map((item: any) => (
                      <div key={item.id} className="rounded-lg border p-3 flex items-start gap-2">
                        <span>{tipoIcon[item.tipo_servicio] || "•"}</span>
                        <div className="min-w-0">
                          <div className="font-semibold">{b.tipoServicio(item.tipo_servicio)}</div>
                          <div className="text-sm text-muted-foreground break-words">
                            {[item.modelo, item.color, item.cantidad ? b.cantidadLbl(item.cantidad) : null, item.con_caja ? b.conCaja : null].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{b.sinConfiguracion}</div>
                )}
              </div>

              <div>
                <h3 className="text-base mb-2">{b.unidadesAsignadas}</h3>
                {detalleLoading ? (
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground text-center">{b.cargandoUnidades}</div>
                ) : detalleUnidades.length > 0 ? (
                  <div className="space-y-2">
                    {detalleUnidades.map(m => (
                      <div key={m.id} className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                        <div><span className="text-muted-foreground">{b.orden}</span> <strong>#{m.orden_armado}</strong></div>
                        <div><span className="text-muted-foreground">{b.modeloColor}</span> <strong>{m.modelo || "—"} {m.color || ""}</strong></div>
                        <div className="break-all"><span className="text-muted-foreground">{b.nsChasisLbl}</span> <strong>{m.ns_chasis || "—"}</strong></div>
                        <div className="break-all"><span className="text-muted-foreground">{b.nsMotorLbl}</span> <strong>{m.ns_motor || "—"}</strong></div>
                        <div><span className="text-muted-foreground">{b.armado}</span> <strong>{m.estatus_armado ? (t.estatus[m.estatus_armado as keyof typeof t.estatus] ?? m.estatus_armado) : "—"}</strong></div>
                        <div><span className="text-muted-foreground">{b.entrega}</span> <strong>{m.estatus_entrega ? (t.estatus[m.estatus_entrega as keyof typeof t.estatus] ?? m.estatus_entrega) : "—"}</strong></div>
                        <div><span className="text-muted-foreground">{b.armadoEstimado}</span> <strong>{fmtDate(m.fecha_estimada_armado)}</strong></div>
                        <div><span className="text-muted-foreground">{b.entregaEstimada}</span> <strong>{fmtDate(m.fecha_estimada_entrega)}</strong></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{b.sinUnidadesAsignadas}</div>
                )}
              </div>

              {detalleDialog.notas && (
                <div>
                  <h3 className="text-base mb-2">{b.notas}</h3>
                  <div className="rounded-lg border bg-blue-50/50 p-3 text-sm whitespace-pre-wrap break-words">{detalleDialog.notas}</div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t pt-4">
                {detalleDialog.documento_url ? (
                  <>
                    <Button onClick={() => verDoc(detalleDialog.documento_url!)} className="flex-1 min-w-40 bg-[#1F3864] hover:bg-[#162a4d]">
                      <Eye className="h-4 w-4 mr-2" /> {b.visualizarPdf}
                    </Button>
                    <Button variant="outline" onClick={() => descargarDoc(detalleDialog.documento_url!)} className="flex-1 min-w-40">
                      <Download className="h-4 w-4 mr-2" /> {b.descargarPdf}
                    </Button>
                  </>
                ) : (
                  <div className="flex-1 rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">{b.sinPdf}</div>
                )}
                <Button variant="outline" onClick={() => setDetalleDialog(null)}>{t.actions.close}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmación de alta de una unidad ya armada. Por aquí entra al
          sistema un motocarro que nadie vio armarse, y es un lote cerrado: se
          pone enfrente lo que va a quedar registrado y se pide un sí explícito. */}
      <Dialog open={!!confirmarArmado} onOpenChange={o => { if (!o) setConfirmarArmado(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-[#1F3864]" />
              {b.confirmarArmadoTitulo}
            </DialogTitle>
            <DialogDescription>
              {b.confirmarArmadoDesc(confirmarArmado?.chasis ?? "")}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border divide-y text-sm">
            {[
              [b.nsChasis, confirmarArmado?.chasis ?? ""],
              [b.nsMotor, confirmarArmado?.motor ?? ""],
              [b.cilindraje, armadoModelo || pedidoModelo],
              [b.color, nombreColor(armadoColor || pedidoColor)],
              [b.confirmarArmadoRemision, manualDialog?.folio_remision ?? ""],
            ].map(([etiqueta, valor]) => (
              <div key={etiqueta} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-muted-foreground text-xs">{etiqueta}</span>
                <span className="font-semibold text-[#1F3864] font-mono text-right break-all">{valor}</span>
              </div>
            ))}
          </div>

          {/* Lo que no cuadra, otra vez y aquí: es el último momento para verlo. */}
          {chasisInv && colorCambiaChasis && (
            <p className="text-xs text-[#92400E]">
              {b.colorCambiaChasis(nombreColor(armadoColor), nombreColor(chasisInv.color))}
            </p>
          )}
          {!chasisInv && (
            <p className="text-xs text-[#92400E]">{b.confirmarArmadoChasisNuevo}</p>
          )}
          {armadoDifierePedido && (
            <p className="text-xs text-[#92400E]">
              {b.difierePedido(pedidoModelo || "—", pedidoColor ? nombreColor(pedidoColor) : "—")}
            </p>
          )}
          {loteYaArmados && (
            <p className="text-xs text-muted-foreground">
              {b.confirmarArmadoLote(loteYaArmados.cargadas + 1, loteYaArmados.limite)}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmarArmado(null)} className="h-11">
              {b.confirmarArmadoNo}
            </Button>
            <Button
              onClick={crearUnidadYaArmada}
              disabled={manualBusy === "creando"}
              className="h-11 bg-[#065F46] hover:bg-[#054c38] text-white font-semibold"
            >
              {manualBusy === "creando" ? b.guardando : b.confirmarArmadoSi}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de configuración */}
      <Dialog open={!!configDialog} onOpenChange={o => { if (!o) setConfigDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-[#1F3864]" />
              {b.configTitulo(configDialog?.folio_remision ?? "")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Modelo y color */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">{b.modelo}</Label>
                <Select value={configForm.modelo} onValueChange={v => setConfigForm(f => ({ ...f, modelo: v }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{modelos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">{b.color}</Label>
                <Select value={configForm.color} onValueChange={v => setConfigForm(f => ({ ...f, color: v }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{COLORES.map(col => <SelectItem key={col} value={col}>{t.colors[col]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Cantidad */}
            <div>
              <Label className="text-sm">{b.cantidadMotocarros}</Label>
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
                {b.serviciosAdicionales}
              </div>
              {[
                { key: "con_caja",        icon: "📦", label: b.conCajaMontada,     disabled: configForm.con_instalacion },
                { key: "con_cabina",      icon: "🛖", label: b.cabina,             disabled: false },
                { key: "con_instalacion", icon: "🔧", label: b.instalacionCabina,  disabled: false },
                { key: "con_activacion",  icon: "⚡", label: b.activacion,          disabled: false },
                { key: "con_flete",       icon: "🚛", label: b.fleteOrden,         disabled: false },
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
                    <span className="ml-auto text-[10px] text-muted-foreground italic">{b.auto}</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialog(null)}>{t.actions.cancel}</Button>
            <Button
              onClick={guardarConfig}
              disabled={savingConfig}
              className="bg-[#1F3864] hover:bg-[#162a4d]"
            >
              {savingConfig ? b.guardando : b.guardarConfig}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de asignación manual */}
      <Dialog open={!!manualDialog} onOpenChange={o => { if (!o) { setManualDialog(null); setManualCapturando(null); setManualYaArmado(false); setArmadoModelo(""); setArmadoColor(""); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-[#1F3864]" />
              {b.manualTitulo(manualDialog?.folio_remision ?? "")}
            </DialogTitle>
          </DialogHeader>

          {manualLoading ? (
            <div className="py-8 text-center text-muted-foreground">{b.cargandoUnidades}</div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* FORMULARIO PRINCIPAL: asignar por serial */}
              <div className="border-2 border-[#1F3864]/30 rounded-lg p-4 bg-[#F8FAFC] space-y-3">
                <h4 className="text-sm font-bold text-[#1F3864]">
                  {b.asignarPorSerie}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {b.asignarPorSerieAyuda}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-[#1F3864]">{b.nsChasis}</Label>
                    <SerialAutocomplete
                      tipo="chasis"
                      value={manualNuevoChasis}
                      onChange={setManualNuevoChasis}
                      placeholder={b.buscarChasis}
                      className="h-11 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-[#1F3864]">{b.nsMotor}</Label>
                    <SerialAutocomplete
                      tipo="motor"
                      value={manualNuevoMotor}
                      onChange={setManualNuevoMotor}
                      placeholder={b.buscarMotor}
                      className="h-11 text-sm font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="yaArmado"
                    checked={manualYaArmado}
                    onCheckedChange={c => {
                      const marcado = c === true;
                      setManualYaArmado(marcado);
                      if (marcado) prellenarArmado();
                    }}
                  />
                  <label htmlFor="yaArmado" className="text-xs text-muted-foreground leading-tight cursor-pointer select-none">
                    <span className="font-medium text-[#1F3864] block mb-0.5">{b.yaArmado}</span>
                    {b.yaArmadoAyuda}
                  </label>
                </div>
                {/* Cilindraje y color de la unidad que se está ingresando.
                    Fábrica los corrige aquí: antes se guardaba lo que ventas
                    hubiera capturado, aunque el motocarro fuera otro. */}
                {manualYaArmado && (
                  <div className="rounded-lg border border-[#1F3864]/25 bg-white p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">{b.armadoDatosAyuda}</p>
                    {/* El lote es cerrado: por aquí entran las unidades que ya
                        estaban ensambladas antes del sistema, y son contadas. */}
                    {loteYaArmados && (
                      <p className={`text-xs font-medium ${loteAgotado ? "text-[#991B1B]" : "text-[#1F3864]"}`}>
                        {loteAgotado
                          ? b.loteYaArmadosAgotado(loteYaArmados.limite)
                          : b.loteYaArmados(loteYaArmados.cargadas, loteYaArmados.limite, loteYaArmados.restantes)}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-[#1F3864]">{b.cilindraje}</Label>
                        <Select value={armadoModelo} onValueChange={setArmadoModelo}>
                          <SelectTrigger className="h-11 text-sm"><SelectValue placeholder={b.elegirCilindraje} /></SelectTrigger>
                          <SelectContent>
                            {modelosArmado.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-[#1F3864]">{b.color}</Label>
                        <Select value={armadoColor} onValueChange={setArmadoColor}>
                          <SelectTrigger className="h-11 text-sm"><SelectValue placeholder={b.elegirColor} /></SelectTrigger>
                          <SelectContent>
                            {coloresArmado.map(c => <SelectItem key={c} value={c}>{nombreColor(c)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* Qué sabe el sistema del chasis capturado. Es de donde
                        salen los dos campos cuando ya está en inventario. */}
                    {chasisInv && (
                      <p className="text-xs text-muted-foreground">
                        {b.chasisEnInventario(chasisInv.numero_chasis, nombreComercial(chasisInv.modelo, catalogo), nombreColor(chasisInv.color))}
                        {chasisInv.colorVin !== chasisInv.color && " " + b.chasisVinDecia(nombreColor(chasisInv.colorVin))}
                      </p>
                    )}
                    {/* El color declarado no es el del chasis y no hay juego
                        libre de ese color: casi siempre la unidad es otra. */}
                    {sinJuegosDelColor && (
                      <p className="text-xs text-[#991B1B]">
                        {b.sinJuegosDelColor(nombreColor(armadoColor), nombreColor(chasisInv!.color))}
                        {(chasisLibres.get(armadoColor) ?? 0) > 0 &&
                          " " + b.hayChasisLibresDeEseColor(chasisLibres.get(armadoColor)!, nombreColor(armadoColor))}
                      </p>
                    )}
                    {colorCambiaChasis && !sinJuegosDelColor && (
                      <p className="text-xs text-[#92400E]">
                        {b.colorCambiaChasis(nombreColor(armadoColor), nombreColor(chasisInv!.color))}
                      </p>
                    )}
                    {!pedidoModelo && !pedidoColor ? (
                      <p className="text-xs text-[#92400E]">{b.pedidoSinConfig}</p>
                    ) : armadoDifierePedido ? (
                      <p className="text-xs text-[#92400E]">
                        {b.difierePedido(pedidoModelo || "—", pedidoColor ? nombreColor(pedidoColor) : "—")}
                      </p>
                    ) : null}
                  </div>
                )}
                <Button
                  onClick={buscarYAsignarPorSerial}
                  disabled={
                    (!manualNuevoChasis && !manualNuevoMotor) ||
                    (manualYaArmado && (!manualNuevoChasis || !manualNuevoMotor || !armadoModelo || !armadoColor || loteAgotado)) ||
                    manualBusy === "buscando"
                  }
                  className="w-full h-11 bg-[#1F3864] hover:bg-[#2E75B6] text-white font-semibold"
                >
                  {manualBusy === "buscando"
                    ? b.buscando
                    : manualYaArmado
                    ? b.crearAsignarArmada
                    : b.buscarAsignar}
                </Button>
              </div>

              {/* Unidades ya asignadas */}
              {asignadosManual.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-[#065F46] mb-2">
                    {b.asignadasA(asignadosManual.length)}
                  </h4>
                  <div className="space-y-1.5">
                    {asignadosManual.map(m => (
                      <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                        <div className="text-sm">
                          <span className="font-bold text-[#1F3864]">#{m.orden_armado}</span>
                          {" · "}
                          <span className="font-medium">{m.color}</span>
                          {" · "}
                          <span className="text-xs text-muted-foreground">{b.chasisCorto} {m.ns_chasis ?? b.sinSerial}</span>
                          {" · "}
                          <span className="text-xs text-muted-foreground">{b.motorCorto} {m.ns_motor ?? b.sinSerial}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => desasignarManual(m.id)}
                          disabled={manualBusy === m.id}
                          className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                          title={b.tipQuitar}
                        >
                          <X size={14} className="mr-1" />
                          {manualBusy === m.id ? "…" : b.quitar}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de unidades disponibles (selección directa) */}
              {disponiblesFiltrados.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-[#1F3864] mb-2">
                    {b.oSelecciona(disponiblesFiltrados.length)}
                  </h4>
                  <Input
                    placeholder={b.filtrar}
                    value={manualQ}
                    onChange={e => setManualQ(e.target.value)}
                    className="mb-2"
                  />
                  <div className="space-y-1.5 max-h-[25vh] overflow-y-auto">
                    {disponiblesFiltrados.map(m => (
                      <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border hover:bg-slate-50">
                        <div className="text-sm min-w-0 flex-1">
                          <span className="font-bold text-[#1F3864]">#{m.orden_armado}</span>
                          {" · "}
                          <span className="font-medium">{m.color}</span>
                          {" · "}
                          <span className={`text-xs ${m.ns_chasis ? "text-muted-foreground" : "text-amber-600"}`}>
                            {m.ns_chasis || b.sinChasis}
                          </span>
                          {" · "}
                          <span className={`text-xs ${m.ns_motor ? "text-muted-foreground" : "text-amber-600"}`}>
                            {m.ns_motor || b.sinMotor}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => asignarManual(m.id)}
                          disabled={manualBusy === m.id}
                          className="h-8 px-3 bg-[#1F3864] hover:bg-[#2E75B6] text-white text-xs shrink-0"
                        >
                          {manualBusy === m.id ? "…" : b.asignar}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setManualDialog(null); setManualCapturando(null); }}>{t.actions.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentViewerDialog
        path={previewPath}
        open={!!previewPath}
        onOpenChange={o => { if (!o) setPreviewPath(null); }}
      />
    </>
  );
}
