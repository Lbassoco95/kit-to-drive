import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { cargarClientes, type ClienteCatalogo } from "@/lib/catalogoClientes";
import { explicarError, fmtDate } from "@/lib/dazon";
import {
  PASOS_REMISION_REFACCION,
  envioListo,
  faltantesDePedido,
  puedeMarcarEntregada,
  siguienteFolioSerie,
  type EtapaRefaccion,
  type EstatusLineaRefaccion,
  type PasoRemisionRefaccion,
} from "@/lib/remisionesRefacciones";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Boxes, Download, Plus, Search, TriangleAlert, Truck, Warehouse } from "lucide-react";

type Etapa = EtapaRefaccion;
type EstatusLinea = EstatusLineaRefaccion;

type Remision = {
  id: string;
  folio: string;
  cliente_id: string;
  vendedor_id: string | null;
  nombre_vendedor: string | null;
  fecha_remision: string | null;
  notas: string | null;
  etapa: Etapa;
  area_actual: "ventas" | "almacen" | "logistica";
  abierta: boolean;
  created_by: string | null;
  created_at: string;
  tipo_envio: "paqueteria" | "directo" | null;
  direccion_entrega: string | null;
  contacto_entrega: string | null;
  telefono_entrega: string | null;
  paqueteria: string | null;
  guia_envio: string | null;
  tipo_pago: "anticipado" | "contra_entrega" | null;
  pagado: boolean;
  nota_pago: string | null;
  entregada_at: string | null;
  clientes?: {
    codigo_erp?: string | null;
    folio_interno?: string | null;
    nombre_comercial?: string | null;
  } | null;
};

type Item = {
  id: string;
  remision_id: string;
  producto_id: string;
  codigo_nuevo: string;
  codigo_antiguo: string | null;
  descripcion: string;
  precio_unitario: number | null;
  cantidad: number;
  cantidad_bloqueada: number;
  cantidad_surtida: number;
  cantidad_faltante: number;
  estatus: EstatusLinea;
  nota_almacen: string | null;
};

type Evento = {
  id: string;
  etapa: string | null;
  area: "ventas" | "almacen" | "logistica" | "finanzas";
  accion: string;
  detalle: string | null;
  created_at: string;
};

type Producto = {
  id: string;
  codigo_nuevo: string;
  codigo_antiguo: string | null;
  descripcion: string;
  descripcion_corta: string | null;
  precio: number | null;
  stock: number;
  stock_bloqueado?: number | null;
  stock_disponible?: number | null;
  visible_venta: boolean;
  foto_url?: string | null;
};

type Borrador = {
  productoId: string;
  codigo: string;
  descripcion: string;
  precio: number | null;
  cantidad: number;
  disponible: number;
};

const CAMPOS_REMISION =
  "id, folio, cliente_id, vendedor_id, nombre_vendedor, fecha_remision, notas, etapa, area_actual, abierta, created_by, created_at, tipo_envio, direccion_entrega, contacto_entrega, telefono_entrega, paqueteria, guia_envio, tipo_pago, pagado, nota_pago, entregada_at, clientes(codigo_erp, folio_interno, nombre_comercial)";

const money = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const clienteLabel = (c?: { codigo_erp?: string | null; folio_interno?: string | null; nombre_comercial?: string | null } | null) => {
  if (!c) return "—";
  const codigo = c.codigo_erp || c.folio_interno || "—";
  return c.nombre_comercial ? `${codigo} — ${c.nombre_comercial}` : codigo;
};

export default function RemisionesRefacciones() {
  const { t } = useLang();
  const tx = t.remisionesRefacciones;
  const { perms, puedeVerRefacciones, area, user, profileName, nivel } = useAuth();
  const puedeEntrar = perms.puedeVer("remisiones") || !!puedeVerRefacciones;
  const puedeCapturar = area === "comercial" || !!perms.esAdminGlobal;
  const puedeAlmacen = !!puedeVerRefacciones || !!perms.esAdminGlobal;
  const puedeLogistica = area === "almacen_logistica" || !!perms.esAdminGlobal;
  const puedeFinanzas = area === "administracion" || !!perms.esAdminGlobal;

  const [rows, setRows] = useState<Remision[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"curso" | "contingencia" | "logistica" | "entregada" | "cancelada">("curso");
  const [qFolio, setQFolio] = useState("");
  const [open, setOpen] = useState(false);
  const [detalle, setDetalle] = useState<Remision | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("remisiones_refacciones" as any)
      .select(CAMPOS_REMISION)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error(explicarError(error, tx.errorCargar));
      setRows([]);
    } else {
      setRows(((data as unknown) as Remision[]) ?? []);
    }
    setLoading(false);
  }, [tx.errorCargar]);

  useEffect(() => {
    if (puedeEntrar) void load();
  }, [puedeEntrar, load]);

  const visibles = useMemo(() => {
    const term = qFolio.trim().toLowerCase();
    return rows.filter(r => {
      if (tab === "curso") return r.abierta || r.etapa === "almacen";
      if (tab === "contingencia") return r.etapa === "contingencia";
      if (tab === "logistica") return r.etapa === "logistica" || r.etapa === "surtida";
      if (tab === "entregada") return r.etapa === "entregada";
      return r.etapa === "cancelada";
    }).filter(r => {
      if (!term) return true;
      const blob = [r.folio, r.nombre_vendedor, clienteLabel(r.clientes), r.direccion_entrega].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(term);
    });
  }, [rows, tab, qFolio]);

  const abrir = async (r: Remision) => {
    setDetalle(r);
    setItems([]);
    setEventos([]);
    const [its, evs] = await Promise.all([
      supabase.from("remision_refaccion_items" as any).select("*").eq("remision_id", r.id).order("created_at"),
      supabase.from("remision_refaccion_eventos" as any).select("id, etapa, area, accion, detalle, created_at").eq("remision_id", r.id).order("created_at"),
    ]);
    if (its.error) toast.error(explicarError(its.error, tx.errorCargar));
    else setItems(((its.data as unknown) as Item[]) ?? []);
    if (!evs.error) setEventos(((evs.data as unknown) as Evento[]) ?? []);
  };

  const refrescarDetalle = async () => {
    await load();
    if (!detalle) return;
    const { data } = await supabase
      .from("remisiones_refacciones" as any)
      .select(CAMPOS_REMISION)
      .eq("id", detalle.id)
      .maybeSingle();
    if (data) await abrir(data as unknown as Remision);
  };

  const puedeCancelar = (r: Remision) => {
    if (!puedeCapturar || !r.abierta) return false;
    if (perms.esAdminGlobal || nivel !== "operador") return true;
    return r.vendedor_id === user?.id || r.created_by === user?.id;
  };

  if (!puedeEntrar) {
    return <div className="p-8 text-center text-muted-foreground">{tx.sinAcceso}</div>;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3864] flex items-center gap-2">
            <Boxes className="h-7 w-7" />
            {tx.titulo}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{tx.subtitulo}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeCapturar && (
            <Button className="bg-[#1F3864] hover:bg-[#162a4d]" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {tx.nueva}
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4 text-sm text-[#1F3864] bg-[#EFF6FF] border-[#1F3864]/15">
        {tx.leyendaBloqueo}
      </Card>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" value={qFolio} onChange={e => setQFolio(e.target.value)} placeholder={tx.buscarFolio} />
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ["curso", tx.tabCurso],
          ["contingencia", tx.tabContingencia],
          ["logistica", tx.tabLogistica],
          ["entregada", tx.tabEntregadas],
          ["cancelada", tx.tabCanceladas],
        ] as const).map(([id, label]) => (
          <Button key={id} variant={tab === id ? "default" : "outline"} onClick={() => setTab(id)}>
            {label}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {visibles.map(r => (
          <Card key={r.id} className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <div className="space-y-0.5">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{tx.folioSeguimiento}</div>
                  <div className="font-mono text-2xl font-bold text-[#1F3864] leading-tight">{r.folio}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <EtapaBadge etapa={r.etapa} abierta={r.abierta} />
                  <AreaBadge area={r.area_actual} />
                </div>
                <div className="text-sm">{clienteLabel(r.clientes)}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtDate(r.fecha_remision)} · {r.nombre_vendedor || "—"}
                </div>
              </div>
              <Button variant="outline" onClick={() => abrir(r)}>{tx.detalle}</Button>
            </div>
            <div className="mt-3">
              <Camino etapa={r.etapa} />
            </div>
          </Card>
        ))}
        {!loading && visibles.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">{tx.sinRegistros}</p>
        )}
      </div>

      <NuevaRemision
        open={open}
        onOpenChange={setOpen}
        vendedor={profileName}
        onCreada={load}
      />

      <Dialog open={!!detalle} onOpenChange={o => { if (!o) setDetalle(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-[#1F3864]">
                  <span className="font-mono">{detalle.folio}</span>
                  <EtapaBadge etapa={detalle.etapa} abierta={detalle.abierta} />
                  <AreaBadge area={detalle.area_actual} />
                </DialogTitle>
              </DialogHeader>
              <Camino etapa={detalle.etapa} />
              <div className="text-sm text-muted-foreground">
                {clienteLabel(detalle.clientes)} · {fmtDate(detalle.fecha_remision)} · {detalle.nombre_vendedor || "—"}
              </div>
              {detalle.notas && <p className="text-sm">{detalle.notas}</p>}
              {detalle.etapa === "contingencia" && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{tx.avisoFaltante}</p>
              )}
              <EnvioPanel
                remision={detalle}
                puedeEditar={puedeCancelar(detalle) || (puedeCapturar && detalle.etapa !== "entregada" && detalle.etapa !== "cancelada" && (perms.esAdminGlobal || nivel !== "operador" || detalle.created_by === user?.id || detalle.vendedor_id === user?.id))}
                puedeLogistica={puedeLogistica}
                puedeFinanzas={puedeFinanzas}
                onHecho={refrescarDetalle}
              />
              <HistorialCliente clienteId={detalle.cliente_id} actualId={detalle.id} />
              <Button variant="outline" onClick={() => { void descargarPdf(detalle, items); }}>
                <Download className="h-4 w-4 mr-2" />
                {tx.descargarPdf}
              </Button>

              <div className="space-y-3">
                {items.map(it => (
                  <Partida
                    key={`${it.id}-${it.estatus}-${it.cantidad_bloqueada}-${it.cantidad_faltante}`}
                    item={it}
                    puedeAlmacen={puedeAlmacen && detalle.abierta}
                    puedeCancelar={puedeCancelar(detalle)}
                    onHecho={refrescarDetalle}
                  />
                ))}
              </div>

              {puedeCancelar(detalle) && items.some(i => i.cantidad_bloqueada > 0) && (
                <CancelarRemision id={detalle.id} onHecho={refrescarDetalle} />
              )}

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tx.historial}</h3>
                <ol className="space-y-2">
                  {eventos.map(ev => (
                    <li key={ev.id} className="rounded-md border px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <AreaBadge area={ev.area} />
                        <span className="font-medium">{tx.accion[ev.accion as keyof typeof tx.accion] ?? ev.accion}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{fmtDate(ev.created_at)}</span>
                      </div>
                      {ev.detalle && <p className="mt-1 text-muted-foreground">{ev.detalle}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EtapaBadge({ etapa, abierta }: { etapa: Etapa; abierta: boolean }) {
  const { t } = useLang();
  const tono =
    etapa === "surtida" || etapa === "entregada" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
    etapa === "logistica" ? "bg-sky-100 text-sky-800 border-sky-200" :
    etapa === "contingencia" ? "bg-amber-100 text-amber-800 border-amber-200" :
    etapa === "cancelada" ? "bg-slate-100 text-slate-700 border-slate-200" :
    "bg-indigo-100 text-indigo-800 border-indigo-200";
  return (
    <Badge variant="outline" className={tono}>
      {t.remisionesRefacciones.etapa[etapa]}
      {etapa === "contingencia" ? ` · ${abierta ? t.remisionesRefacciones.abierta : t.remisionesRefacciones.cerrada}` : ""}
    </Badge>
  );
}

function AreaBadge({ area }: { area: Remision["area_actual"] | Evento["area"] }) {
  const { t } = useLang();
  const tx = t.remisionesRefacciones;
  const etiqueta =
    area === "almacen" ? tx.areaAlmacen :
    area === "logistica" ? tx.areaLogistica :
    area === "finanzas" ? tx.areaFinanzas :
    tx.areaVentas;
  const tono =
    area === "almacen" ? "bg-indigo-50 text-indigo-800" :
    area === "logistica" ? "bg-sky-50 text-sky-800" :
    area === "finanzas" ? "bg-violet-50 text-violet-800" :
    "bg-teal-50 text-teal-800";
  return (
    <Badge variant="outline" className={tono}>
      {area === "almacen" ? <Warehouse className="h-3 w-3 mr-1" /> : area === "logistica" ? <Truck className="h-3 w-3 mr-1" /> : null}
      {tx.enArea(etiqueta)}
    </Badge>
  );
}

function marcaPaso(etapa: Etapa, paso: PasoRemisionRefaccion): "hecho" | "aqui" | "omitido" | "pendiente" {
  if (etapa === "almacen") {
    if (paso === "ventas") return "hecho";
    if (paso === "almacen") return "aqui";
    return "pendiente";
  }
  if (etapa === "contingencia") {
    if (paso === "ventas" || paso === "almacen") return "hecho";
    if (paso === "contingencia") return "aqui";
    return "pendiente";
  }
  if (etapa === "surtida" || etapa === "logistica") {
    if (paso === "contingencia") return "omitido";
    if (paso === "logistica") return "aqui";
    if (paso === "entregada") return "pendiente";
    return "hecho";
  }
  if (etapa === "entregada") {
    if (paso === "contingencia") return "omitido";
    if (paso === "entregada") return "aqui";
    return "hecho";
  }
  return "pendiente";
}

function Camino({ etapa }: { etapa: Etapa }) {
  const { t } = useLang();
  const tx = t.remisionesRefacciones;
  if (etapa === "cancelada") {
    return <p className="text-xs text-muted-foreground">{tx.etapa.cancelada} · {tx.enArea(tx.areaVentas)}</p>;
  }
  return (
    <ol className="flex flex-wrap gap-2">
      {PASOS_REMISION_REFACCION.map((paso, i) => {
        const marca = marcaPaso(etapa, paso);
        const tono =
          marca === "aqui" ? "bg-[#1F3864] text-white" :
          marca === "hecho" ? "bg-emerald-100 text-emerald-800" :
          marca === "omitido" ? "bg-slate-50 text-slate-400 line-through" :
          "bg-slate-100 text-slate-500";
        return (
          <li key={paso} className={`rounded-full px-3 py-1 text-xs font-medium ${tono}`}>
            {i + 1}. {tx.paso[paso]}
          </li>
        );
      })}
    </ol>
  );
}

function NuevaRemision({
  open, onOpenChange, vendedor, onCreada,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendedor: string;
  onCreada: () => Promise<void> | void;
}) {
  const { t } = useLang();
  const tx = t.remisionesRefacciones;
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [qCliente, setQCliente] = useState("");
  const [productos, setProductos] = useState<Producto[]>([]);
  const [qProd, setQProd] = useState("");
  const [lineas, setLineas] = useState<Borrador[]>([]);
  const [notas, setNotas] = useState("");
  const [tipoEnvio, setTipoEnvio] = useState<"paqueteria" | "directo">("paqueteria");
  const [direccion, setDireccion] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipoPago, setTipoPago] = useState<"anticipado" | "contra_entrega">("anticipado");
  const [guardando, setGuardando] = useState(false);
  const [catalogoListo, setCatalogoListo] = useState(false);
  const [folioPrevisto, setFolioPrevisto] = useState("RF-00001");

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await cargarClientes();
      if (res.error) toast.error(explicarError(res.error, tx.errorCargar));
      setClientes(res.data.filter(c => c.activo !== false));
      const { data, error } = await supabase
        .from("v_almacen_refacciones" as any)
        .select("id, codigo_nuevo, codigo_antiguo, descripcion, descripcion_corta, precio, stock, stock_bloqueado, stock_disponible, visible_venta, foto_url")
        .eq("visible_venta", true)
        .order("codigo_nuevo")
        .limit(5000);
      if (error) toast.error(explicarError(error, tx.errorCargar));
      else setProductos(((data as unknown) as Producto[]) ?? []);
      const folios = await supabase.from("remisiones_refacciones" as any).select("folio").limit(2000);
      const lista = ((folios.data as unknown) as { folio?: string }[] | null) ?? [];
      setFolioPrevisto(siguienteFolioSerie(lista.map(r => r.folio ?? "")));
      setCatalogoListo(true);
    })();
  }, [open, tx.errorCargar]);

  const reset = () => {
    setClienteId(""); setQCliente(""); setQProd(""); setLineas([]); setNotas("");
    setTipoEnvio("paqueteria"); setDireccion(""); setContacto(""); setTelefono(""); setTipoPago("anticipado");
    setCatalogoListo(false);
  };

  const dispDe = (p: Producto) => {
    const base = p.stock_disponible ?? p.stock ?? 0;
    const ya = lineas.filter(l => l.productoId === p.id).reduce((s, l) => s + l.cantidad, 0);
    return base - ya;
  };

  const coincidencias = useMemo(() => {
    const term = qProd.trim().toLowerCase();
    if (term.length < 2) return [];
    return productos.filter(p => {
      const blob = [p.codigo_nuevo, p.codigo_antiguo, p.descripcion, p.descripcion_corta].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(term);
    }).slice(0, 12);
  }, [productos, qProd]);

  const clientesFiltrados = useMemo(() => {
    const term = qCliente.trim().toLowerCase();
    const base = term
      ? clientes.filter(c => clienteLabel(c).toLowerCase().includes(term))
      : clientes;
    const elegido = clientes.find(c => c.id === clienteId);
    const lista = elegido && !base.some(c => c.id === elegido.id) ? [elegido, ...base] : base;
    return lista.slice(0, 40);
  }, [clientes, qCliente, clienteId]);

  const agregar = (p: Producto) => {
    const disp = dispDe(p);
    if (disp < 1) {
      toast.error(tx.sinDisponible);
      return;
    }
    setLineas(prev => {
      const i = prev.findIndex(l => l.productoId === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], cantidad: next[i].cantidad + 1 };
        return next;
      }
      return [...prev, {
        productoId: p.id,
        codigo: p.codigo_nuevo,
        descripcion: p.descripcion_corta || p.descripcion,
        precio: p.precio,
        cantidad: 1,
        disponible: p.stock_disponible ?? p.stock ?? 0,
      }];
    });
  };

  const guardar = async () => {
    if (!clienteId) { toast.error(tx.seleccionaCliente); return; }
    if (!envioListo({ tipo: tipoEnvio, direccion, tipoPago })) {
      toast.error(tx.envioIncompleto);
      return;
    }
    const faltan = faltantesDePedido(lineas.map(l => ({
      productoId: l.productoId,
      cantidad: l.cantidad,
      disponible: l.disponible,
      descripcion: l.descripcion,
    })));
    if (!lineas.length || faltan.length) {
      const primero = faltan[0];
      toast.error(primero
        ? tx.sinExistencia(primero.descripcion || primero.productoId, primero.pedido, primero.disponible)
        : tx.agregaPieza);
      return;
    }
    setGuardando(true);
    const { data, error } = await supabase.rpc("crear_remision_refacciones" as any, {
      _cliente_id: clienteId,
      _notas: notas,
      _nombre_vendedor: vendedor || null,
      _items: lineas.map(l => ({ producto_id: l.productoId, cantidad: l.cantidad })),
      _envio: {
        tipo_envio: tipoEnvio,
        direccion,
        contacto,
        telefono,
        tipo_pago: tipoPago,
        vendedor_id: clientes.find(c => c.id === clienteId)?.vendedor_id ?? null,
      },
    });
    setGuardando(false);
    if (error) { toast.error(explicarError(error, tx.errorCrear)); return; }
    const folio = (data as { folio?: string } | null)?.folio ?? "";
    toast.success(tx.okCreada(folio));
    onOpenChange(false);
    reset();
    await onCreada();
  };

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tx.crearTitulo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-[#1F3864]/20 bg-[#EFF6FF] px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#1F3864]">{tx.folioSeguimiento}</div>
            <div className="font-mono text-2xl font-bold text-[#1F3864]">{folioPrevisto}</div>
            <p className="text-xs text-muted-foreground mt-1">{tx.folioSerie}</p>
          </div>
          <div>
            <Label>{tx.cliente}</Label>
            <Input className="mt-1" value={qCliente} onChange={e => setQCliente(e.target.value)} placeholder={tx.buscarCliente} />
            {catalogoListo && clientesFiltrados.length > 0 ? (
              <Select value={clienteId || undefined} onValueChange={id => {
              setClienteId(id);
              const c = clientes.find(x => x.id === id);
              const extra = c as (ClienteCatalogo & { direccion?: string | null; nombre_contacto?: string | null; telefono?: string | null }) | undefined;
              if (extra?.direccion) setDireccion(extra.direccion);
              if (extra?.nombre_contacto) setContacto(extra.nombre_contacto);
              if (extra?.telefono) setTelefono(extra.telefono);
            }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={tx.seleccionaCliente} /></SelectTrigger>
                <SelectContent>
                  {clientesFiltrados.map(c => (
                    <SelectItem key={c.id} value={c.id}>{clienteLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : catalogoListo ? (
              <p className="text-xs text-amber-700 mt-1">{tx.catalogoVacio}</p>
            ) : null}
          </div>

          <div>
            <Label>{tx.buscarProducto}</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" value={qProd} onChange={e => setQProd(e.target.value)} placeholder={tx.buscarProducto} />
            </div>
            <div className="mt-2 space-y-1">
              {coincidencias.map(p => {
                const disp = dispDe(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => agregar(p)}
                    className="w-full text-left rounded-md border px-3 py-2 hover:bg-slate-50 flex items-center gap-3"
                  >
                    <span className="font-mono text-xs font-semibold w-28 shrink-0">{p.codigo_nuevo}</span>
                    <span className="flex-1 text-sm truncate">{p.descripcion_corta || p.descripcion}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{money(p.precio)}</span>
                    <span className={`text-xs tabular-nums ${disp > 0 ? "text-emerald-700" : "text-amber-700"}`}>
                      {tx.disponible}: {Math.max(0, disp)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {lineas.length > 0 && (
            <div className="space-y-2">
              {lineas.map(l => (
                <div key={l.productoId} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-semibold">{l.codigo}</div>
                    <div className="text-sm truncate">{l.descripcion}</div>
                    <div className="text-xs text-muted-foreground">{tx.disponible}: {l.disponible} · {money(l.precio)}</div>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={l.disponible}
                    className="w-20"
                    value={l.cantidad}
                    onChange={e => {
                      const n = Math.max(1, Number(e.target.value) || 1);
                      setLineas(prev => prev.map(x => x.productoId === l.productoId ? { ...x, cantidad: n } : x));
                    }}
                  />
                  <Button type="button" variant="ghost" onClick={() => setLineas(prev => prev.filter(x => x.productoId !== l.productoId))}>
                    {tx.quitar}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>{tx.envio}</Label>
              <Select value={tipoEnvio} onValueChange={v => setTipoEnvio(v as "paqueteria" | "directo")}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paqueteria">{tx.paqueteria}</SelectItem>
                  <SelectItem value="directo">{tx.directo}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{tx.tipoPago}</Label>
              <Select value={tipoPago} onValueChange={v => setTipoPago(v as "anticipado" | "contra_entrega")}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="anticipado">{tx.anticipado}</SelectItem>
                  <SelectItem value="contra_entrega">{tx.contraEntrega}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{tx.direccion}</Label>
            <Textarea className="mt-1" value={direccion} onChange={e => setDireccion(e.target.value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>{tx.contacto}</Label>
              <Input className="mt-1" value={contacto} onChange={e => setContacto(e.target.value)} />
            </div>
            <div>
              <Label>{tx.telefono}</Label>
              <Input className="mt-1" value={telefono} onChange={e => setTelefono(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>{tx.notas}</Label>
            <Textarea className="mt-1" value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
          <Button onClick={guardar} disabled={guardando} className="w-full bg-[#1F3864] hover:bg-[#162a4d]">
            {guardando ? tx.creando : tx.crearBtn}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Partida({
  item, puedeAlmacen, puedeCancelar, onHecho,
}: {
  item: Item;
  puedeAlmacen: boolean;
  puedeCancelar: boolean;
  onHecho: () => Promise<void>;
}) {
  const { t } = useLang();
  const tx = t.remisionesRefacciones;
  const [qtyLib, setQtyLib] = useState(item.cantidad_bloqueada || 1);
  const [qtyFalta, setQtyFalta] = useState(item.cantidad_faltante || item.cantidad_bloqueada || 1);
  const [nota, setNota] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const enRevision = item.estatus === "bloqueada" || item.estatus === "faltante";

  const correr = async (fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>) => {
    setOcupado(true);
    const { error } = await fn();
    setOcupado(false);
    if (error) { toast.error(explicarError(error, tx.errorAccion)); return; }
    toast.success(tx.okAccion);
    await onHecho();
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-sm font-semibold">{item.codigo_nuevo}</div>
          <div className="text-sm">{item.descripcion}</div>
          {item.nota_almacen && (
            <p className="text-xs text-amber-800 mt-1 flex items-start gap-1">
              <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {item.nota_almacen}
            </p>
          )}
        </div>
        <Badge variant="outline">{tx.estatus[item.estatus]}</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <Dato label={tx.pedidas} value={item.cantidad} />
        <Dato label={tx.apartado} value={item.cantidad_bloqueada} />
        <Dato label={tx.surtidas} value={item.cantidad_surtida} />
        <Dato label={tx.faltante} value={item.cantidad_faltante} />
        <Dato label={tx.precio} value={money(item.precio_unitario)} />
      </div>

      {puedeAlmacen && enRevision && (
        <div className="grid gap-2 md:grid-cols-2 border-t pt-2">
          <div className="space-y-1">
            <Label className="text-xs">{tx.liberar}</Label>
            <div className="flex gap-2">
              <Input type="number" min={1} max={item.cantidad_bloqueada} value={qtyLib}
                onChange={e => setQtyLib(Number(e.target.value) || 1)} className="w-20" />
              <Button size="sm" disabled={ocupado} onClick={() => correr(() =>
                supabase.rpc("liberar_refaccion_remision" as any, { _item_id: item.id, _cantidad: qtyLib }),
              )}>{tx.liberar}</Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{tx.reportar}</Label>
            <div className="flex gap-2">
              <Input type="number" min={1} max={item.cantidad_bloqueada} value={qtyFalta}
                onChange={e => setQtyFalta(Number(e.target.value) || 1)} className="w-20" />
              <Input value={nota} onChange={e => setNota(e.target.value)} placeholder={tx.notaAlmacen} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={ocupado} onClick={() => {
                if (nota.trim().length < 3) { toast.error(tx.notaObligatoria); return; }
                void correr(() => supabase.rpc("reportar_faltante_refaccion" as any, {
                  _item_id: item.id, _cantidad: qtyFalta, _nota: nota.trim(),
                }));
              }}>{tx.reportar}</Button>
              <Button size="sm" variant="outline" disabled={ocupado} onClick={() => {
                if (nota.trim().length < 3) { toast.error(tx.notaObligatoria); return; }
                void correr(() => supabase.rpc("confirmar_sin_existencia_refaccion" as any, {
                  _item_id: item.id, _nota: nota.trim(),
                }));
              }}>{tx.confirmarSin}</Button>
            </div>
          </div>
        </div>
      )}

      {puedeCancelar && item.cantidad_bloqueada > 0 && (
        <div className="flex flex-wrap gap-2 border-t pt-2">
          <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={tx.motivoCancelar} className="max-w-sm" />
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => {
            if (motivo.trim().length < 3) { toast.error(tx.notaObligatoria); return; }
            void correr(() => supabase.rpc("cancelar_linea_refaccion" as any, {
              _item_id: item.id, _motivo: motivo.trim(),
            }));
          }}>{tx.cancelarLinea}</Button>
        </div>
      )}
    </div>
  );
}

function CancelarRemision({ id, onHecho }: { id: string; onHecho: () => Promise<void> }) {
  const { t } = useLang();
  const tx = t.remisionesRefacciones;
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="flex flex-wrap gap-2 rounded-md border border-dashed p-3">
      <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={tx.motivoCancelar} className="max-w-sm" />
      <Button variant="outline" disabled={ocupado} onClick={async () => {
        if (motivo.trim().length < 3) { toast.error(tx.notaObligatoria); return; }
        setOcupado(true);
        const { error } = await supabase.rpc("cancelar_remision_refacciones" as any, {
          _remision_id: id, _motivo: motivo.trim(),
        });
        setOcupado(false);
        if (error) { toast.error(explicarError(error, tx.errorAccion)); return; }
        toast.success(tx.okAccion);
        await onHecho();
      }}>{tx.cancelarRemision}</Button>
    </div>
  );
}

async function descargarPdf(remision: Remision, lineas: Item[]) {
  const ids = lineas.map(it => it.producto_id);
  const fotos = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase
      .from("v_almacen_refacciones" as any)
      .select("id, foto_url")
      .in("id", ids);
    for (const row of (data as { id: string; foto_url: string | null }[] | null) ?? []) {
      if (row.foto_url) fotos.set(row.id, row.foto_url);
    }
  }
  const filas = lineas.map(it => {
    const foto = fotos.get(it.producto_id);
    const importe = (it.precio_unitario ?? 0) * it.cantidad;
    return `<tr>
      <td>${foto ? `<img src="${esc(foto)}" alt="" width="48" height="48">` : "—"}</td>
      <td>${esc(it.codigo_nuevo)}</td>
      <td>${esc(it.descripcion)}</td>
      <td class="num">${it.cantidad}</td>
      <td class="num">${esc(money(it.precio_unitario))}</td>
      <td class="num">${esc(money(importe))}</td>
    </tr>`;
  }).join("");
  const total = lineas.reduce((s, it) => s + (it.precio_unitario ?? 0) * it.cantidad, 0);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(remision.folio)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #1F3864; margin: 32px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #d0d7e2; padding: 6px 8px; font-size: 12px; text-align: left; }
      th { background: #1F3864; color: white; }
      .num { text-align: right; }
      .meta { font-size: 13px; color: #334155; }
      @media print { button { display: none; } }
    </style></head><body>
    <button onclick="print()">Imprimir / Guardar PDF</button>
    <h1>Remisión de refacciones ${esc(remision.folio)}</h1>
    <p class="meta">${esc(clienteLabel(remision.clientes))}<br>
      ${esc(remision.nombre_vendedor || "")} · ${esc(remision.fecha_remision || "")}<br>
      Envío: ${esc(remision.tipo_envio || "")} · ${esc(remision.direccion_entrega || "")}<br>
      ${esc(remision.contacto_entrega || "")} ${esc(remision.telefono_entrega || "")}<br>
      Pago: ${esc(remision.tipo_pago || "")} · ${remision.pagado ? "Pagado" : "No pagado"}
      ${remision.guia_envio ? `<br>Guía: ${esc(remision.guia_envio)}` : ""}
    </p>
    <table><thead><tr><th>Foto</th><th>Código</th><th>Pieza</th><th>Cant.</th><th>Precio</th><th>Importe</th></tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><td colspan="5" class="num"><strong>Total</strong></td><td class="num"><strong>${esc(money(total))}</strong></td></tr></tfoot>
    </table>
    <script>onload=function(){setTimeout(function(){print()}, 300)}</script>
    </body></html>`;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

function EnvioPanel({
  remision, puedeEditar, puedeLogistica, puedeFinanzas, onHecho,
}: {
  remision: Remision;
  puedeEditar: boolean;
  puedeLogistica: boolean;
  puedeFinanzas: boolean;
  onHecho: () => Promise<void>;
}) {
  const { t } = useLang();
  const tx = t.remisionesRefacciones;
  const [direccion, setDireccion] = useState(remision.direccion_entrega || "");
  const [contacto, setContacto] = useState(remision.contacto_entrega || "");
  const [telefono, setTelefono] = useState(remision.telefono_entrega || "");
  const [tipoEnvio, setTipoEnvio] = useState(remision.tipo_envio || "paqueteria");
  const [tipoPago, setTipoPago] = useState(remision.tipo_pago || "anticipado");
  const [paqueteria, setPaqueteria] = useState(remision.paqueteria || "");
  const [guia, setGuia] = useState(remision.guia_envio || "");
  const [notaPago, setNotaPago] = useState(remision.nota_pago || "");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    setDireccion(remision.direccion_entrega || "");
    setContacto(remision.contacto_entrega || "");
    setTelefono(remision.telefono_entrega || "");
    setTipoEnvio(remision.tipo_envio || "paqueteria");
    setTipoPago(remision.tipo_pago || "anticipado");
    setPaqueteria(remision.paqueteria || "");
    setGuia(remision.guia_envio || "");
    setNotaPago(remision.nota_pago || "");
  }, [remision]);

  const correr = async (fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>) => {
    setOcupado(true);
    const { error } = await fn();
    setOcupado(false);
    if (error) { toast.error(explicarError(error, tx.errorAccion)); return; }
    toast.success(tx.okAccion);
    await onHecho();
  };

  const pagoLabel = remision.pagado ? tx.pagado : tx.noPagado;
  const envioLabel = remision.tipo_envio === "directo" ? tx.directo : remision.tipo_envio === "paqueteria" ? tx.paqueteria : "—";

  return (
    <section className="rounded-md border p-3 space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline"><Truck className="h-3 w-3 mr-1" />{envioLabel}</Badge>
        <Badge variant="outline" className={remision.pagado ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}>{pagoLabel}</Badge>
      </div>
      <p>{remision.direccion_entrega || "—"}</p>
      <p className="text-muted-foreground">{[remision.contacto_entrega, remision.telefono_entrega].filter(Boolean).join(" · ") || "—"}</p>
      {(remision.paqueteria || remision.guia_envio) && (
        <p>{tx.nombrePaqueteria}: {remision.paqueteria || "—"} · {tx.guia}: {remision.guia_envio || "—"}</p>
      )}
      {remision.nota_pago && <p className="text-muted-foreground">{remision.nota_pago}</p>}

      {puedeEditar && remision.etapa !== "entregada" && remision.etapa !== "cancelada" && (
        <div className="grid gap-2 border-t pt-2">
          <div className="grid gap-2 md:grid-cols-2">
            <Select value={tipoEnvio} onValueChange={v => setTipoEnvio(v as "paqueteria" | "directo")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paqueteria">{tx.paqueteria}</SelectItem>
                <SelectItem value="directo">{tx.directo}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tipoPago} onValueChange={v => setTipoPago(v as "anticipado" | "contra_entrega")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="anticipado">{tx.anticipado}</SelectItem>
                <SelectItem value="contra_entrega">{tx.contraEntrega}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea value={direccion} onChange={e => setDireccion(e.target.value)} />
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={contacto} onChange={e => setContacto(e.target.value)} placeholder={tx.contacto} />
            <Input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder={tx.telefono} />
          </div>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={() => {
            if (!envioListo({ tipo: tipoEnvio, direccion, tipoPago })) { toast.error(tx.envioIncompleto); return; }
            void correr(() => supabase.rpc("actualizar_envio_remision_refaccion" as any, {
              _remision_id: remision.id,
              _envio: { tipo_envio: tipoEnvio, direccion, contacto, telefono, tipo_pago: tipoPago },
            }));
          }}>{tx.guardarEnvio}</Button>
        </div>
      )}

      {puedeLogistica && (remision.etapa === "logistica" || remision.etapa === "surtida") && (
        <div className="grid gap-2 border-t pt-2">
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={paqueteria} onChange={e => setPaqueteria(e.target.value)} placeholder={tx.nombrePaqueteria} />
            <Input value={guia} onChange={e => setGuia(e.target.value)} placeholder={tx.guia} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => correr(() =>
              supabase.rpc("registrar_guia_remision_refaccion" as any, {
                _remision_id: remision.id, _paqueteria: paqueteria, _guia: guia,
              }),
            )}>{tx.registrarGuia}</Button>
            <Button size="sm" disabled={ocupado} onClick={() => {
              if (!puedeMarcarEntregada(remision.etapa === "surtida" ? "logistica" : remision.etapa, remision.tipo_envio, guia)) {
                toast.error(tx.guiaObligatoria);
                return;
              }
              void correr(() => supabase.rpc("entregar_remision_refaccion" as any, { _remision_id: remision.id }));
            }}>{tx.entregar}</Button>
          </div>
        </div>
      )}

      {puedeFinanzas && remision.etapa !== "cancelada" && (
        <div className="grid gap-2 border-t pt-2">
          <Input value={notaPago} onChange={e => setNotaPago(e.target.value)} placeholder={tx.notaPago} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={ocupado} onClick={() => {
              if (notaPago.trim().length < 3) { toast.error(tx.notaObligatoria); return; }
              void correr(() => supabase.rpc("marcar_pago_remision_refaccion" as any, {
                _remision_id: remision.id, _pagado: true, _nota: notaPago.trim(),
              }));
            }}>{tx.marcarPagado}</Button>
            {remision.pagado && (
              <Button size="sm" variant="outline" disabled={ocupado} onClick={() => correr(() =>
                supabase.rpc("marcar_pago_remision_refaccion" as any, {
                  _remision_id: remision.id, _pagado: false, _nota: notaPago.trim(),
                }),
              )}>{tx.quitarPago}</Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function HistorialCliente({ clienteId, actualId }: { clienteId: string; actualId: string }) {
  const { t } = useLang();
  const tx = t.remisionesRefacciones;
  const [top, setTop] = useState<{ codigo: string; descripcion: string; cantidad: number; pedidos: number }[]>([]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data: rems } = await supabase
        .from("remisiones_refacciones" as any)
        .select("id")
        .eq("cliente_id", clienteId)
        .neq("etapa", "cancelada")
        .limit(200);
      const ids = ((rems as { id: string }[] | null) ?? []).map(r => r.id).filter(id => id !== actualId);
      if (!ids.length) { if (vivo) setTop([]); return; }
      const { data: its } = await supabase
        .from("remision_refaccion_items" as any)
        .select("codigo_nuevo, descripcion, cantidad, remision_id")
        .in("remision_id", ids);
      const mapa = new Map<string, { codigo: string; descripcion: string; cantidad: number; pedidos: Set<string> }>();
      for (const it of (its as { codigo_nuevo: string; descripcion: string; cantidad: number; remision_id: string }[] | null) ?? []) {
        const prev = mapa.get(it.codigo_nuevo) ?? { codigo: it.codigo_nuevo, descripcion: it.descripcion, cantidad: 0, pedidos: new Set<string>() };
        prev.cantidad += it.cantidad;
        prev.pedidos.add(it.remision_id);
        mapa.set(it.codigo_nuevo, prev);
      }
      const lista = [...mapa.values()]
        .map(v => ({ codigo: v.codigo, descripcion: v.descripcion, cantidad: v.cantidad, pedidos: v.pedidos.size }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 5);
      if (vivo) setTop(lista);
    })();
    return () => { vivo = false; };
  }, [clienteId, actualId]);

  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tx.pedidosCliente}</h3>
      {top.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tx.sinHistorial}</p>
      ) : (
        <ul className="text-sm space-y-1">
          {top.map(p => (
            <li key={p.codigo} className="flex justify-between gap-2">
              <span className="truncate"><span className="font-mono text-xs">{p.codigo}</span> {p.descripcion}</span>
              <span className="tabular-nums text-muted-foreground shrink-0">{p.cantidad} · {p.pedidos}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Dato({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded bg-slate-50 px-2 py-1">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
