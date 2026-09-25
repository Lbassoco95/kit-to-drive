import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package, Wrench, Palette, Truck, AlertTriangle, CheckCircle2, Bike, Layers, Boxes, TriangleAlert, Pencil, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  lineaDe, LineaProducto, CatalogoModelos, displayFabrica, nombreComercial,
  ESTATUS_CHASIS, ESTATUS_INCIDENCIA, EstatusIncidencia, chasisDetenido, normColor,
  explicarError,
} from "@/lib/dazon";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { ColorChasis, ChasisColor, AjustarCapacidadColor } from "@/components/ColorChasis";
import { RecepcionesInventario } from "@/components/RecepcionesInventario";

type Chasis = {
  id: string;
  numero_chasis: string;
  modelo: string;
  color: string;
  color_original: string | null;
  estatus: string;
  contenedor_id: string | null;
  motocarro_id: string | null;
};

type Motor = {
  id: string;
  numero_motor: string;
  modelo: string;
  estatus: string;
  contenedor_id: string | null;
  motocarro_id: string | null;
};

type Unidad = {
  id: string;
  orden_armado: number;
  modelo: string;
  color: string;
  ns_chasis: string | null;
  ns_motor: string | null;
  estatus_armado: string;
  estatus_entrega: string;
  fecha_real_armado: string | null;
  remision_id: string | null;
  contenedor_id: string | null;
};

type Parte = {
  id: string;
  descripcion: string;
  modelo: string | null;
  cantidad_esperada: number;
  cantidad_recibida: number;
  contenedor_id: string;
};

type ColorInventario = {
  id: string;
  modelo: string;
  color: string;
  cantidad_disponible: number;
  umbral_alerta: number;
  piezas_total?: number | null;
  piezas_en_revision?: number | null;
  piezas_garantia?: number | null;
  piezas_no_util?: number | null;
  unidades_configuradas?: number | null;
  unidades_libres?: number | null;
  unidades_comprometidas?: number | null;
  unidades_entregadas?: number | null;
  piezas_recibidas?: number | null;
  piezas_extra?: number | null;
  juegos_usados?: number | null;
};

// Foto por modelo comercial y color: lo que hay, lo que está detenido, lo que
// ya se debe. Es la vista v_stock_modelo_color, calculada de los datos reales.
type StockColor = {
  modelo_comercial: string;
  color: string;
  piezas_disponibles: number;
  piezas_en_revision: number;
  piezas_garantia: number;
  piezas_no_util: number;
  unidades_libres: number;
  unidades_sin_serial: number;
  unidades_detenidas: number;
  unidades_comprometidas: number;
  capacidad_color: number;
  juegos_usados: number;
  capacidad_libre: number;
  piezas_recoloreadas: number;
  unidades_entregadas: number;
  solicitadas: number;
  asignadas: number;
  demanda_pendiente: number;
  holgura_con_serial: number;
  holgura_con_piezas: number;
};

type IncidenciaChasis = {
  chasis_id: string;
  folio: string | null;
  estatus: EstatusIncidencia;
  parte_afectada: string | null;
  retiene_chasis: boolean;
};

const LINEA_BADGE: Record<LineaProducto, string> = {
  motocarro: "bg-slate-100 text-slate-700",
  mototaxi: "bg-purple-100 text-purple-700",
  otro: "bg-amber-100 text-amber-700",
};

function LineaBadge({ modelo, catalogo }: { modelo: string; catalogo: CatalogoModelos }) {
  const { t } = useLang();
  const linea = lineaDe(modelo, catalogo);
  const sinClasificar = catalogo.size > 0 && !catalogo.has(modelo);
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${LINEA_BADGE[linea]}`} title={sinClasificar ? t.inventario.modeloSinClasificar(modelo) : undefined}>
      {t.catalogos.linea[linea]}{sinClasificar && " ⚠"}
    </span>
  );
}

// Agrupa por nombre comercial (no por código de fábrica): un DZ300Q7 y un
// legacy "300cc 2026" son la misma línea para ventas/dirección.
function agruparModeloColor<T extends { modelo: string; color?: string }>(items: T[], catalogo: CatalogoModelos) {
  const map = new Map<string, { modelo: string; color: string; n: number }>();
  items.forEach(i => {
    const modelo = nombreComercial(i.modelo, catalogo);
    const key = `${modelo}__${i.color ?? "-"}`;
    const cur = map.get(key) ?? { modelo, color: i.color ?? "-", n: 0 };
    cur.n++;
    map.set(key, cur);
  });
  return [...map.values()].sort((a, b) => a.modelo.localeCompare(b.modelo) || a.color.localeCompare(b.color));
}

export default function Inventario() {
  const [pestana, setPestana] = useState("unidades");
  const { role } = useAuth();
  const { t } = useLang();
  const puedeEditarColor = role === "admin" || role === "fabrica";
  const [colorChasis, setColorChasis] = useState<ChasisColor | null>(null);
  const [capacidadEdit, setCapacidadEdit] = useState<{ modelo: string; color: string; juegos: number } | null>(null);
  const [chasis, setChasis] = useState<Chasis[]>([]);
  const [motores, setMotores] = useState<Motor[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [colores, setColores] = useState<ColorInventario[]>([]);
  const [stock, setStock] = useState<StockColor[]>([]);
  const [incidencias, setIncidencias] = useState<Map<string, IncidenciaChasis>>(new Map());
  const [catalogo, setCatalogo] = useState<CatalogoModelos>(new Map());
  const [loading, setLoading] = useState(true);
  const [lineaFiltro, setLineaFiltro] = useState<"TODAS" | LineaProducto>("TODAS");

  useEffect(() => {
    cargarInventario();
  }, []);

  const cargarInventario = async () => {
    setLoading(true);
    try {
      const [chasisData, motoresData, unidadesData, partesData, coloresData, catalogoData, stockData, incData] = await Promise.all([
        supabase.from("inventario_chasis").select("*").order("fecha_importacion", { ascending: false }),
        supabase.from("inventario_motor").select("*").order("fecha_importacion", { ascending: false }),
        supabase.from("motocarros").select("id, orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado, estatus_entrega, fecha_real_armado, remision_id, contenedor_id").order("orden_armado"),
        supabase.from("inventario_partes").select("*").order("descripcion"),
        supabase.from("inventario_colores").select("*").order("modelo").order("color"),
        supabase.from("modelos_producto").select("modelo, linea, nombre_comercial"),
        supabase.from("v_stock_modelo_color").select("*"),
        supabase.from("incidencias_chasis")
          .select("chasis_id, folio, estatus, parte_afectada, retiene_chasis")
          .order("reportado_at", { ascending: false }),
      ]);

      if (chasisData.error) throw chasisData.error;
      if (motoresData.error) throw motoresData.error;
      if (unidadesData.error) throw unidadesData.error;
      if (partesData.error) throw partesData.error;
      if (coloresData.error) throw coloresData.error;
      // modelos_producto es nuevo (KIT-3); si aún no se aplicó la migración no
      // rompemos el resto del inventario, sólo se pierde la clasificación de línea.
      if (catalogoData.error) console.warn("modelos_producto no disponible:", catalogoData.error.message);

      setChasis(chasisData.data || []);
      setMotores(motoresData.data || []);
      setUnidades((unidadesData.data as any) || []);
      setPartes(partesData.data || []);
      setColores((coloresData.data as any) || []);
      // Vistas/tablas nuevas (KIT-4): si la migración aún no se aplicó, el
      // resto del inventario sigue funcionando.
      if (stockData.error) console.warn("v_stock_modelo_color no disponible:", stockData.error.message);
      if (incData.error) console.warn("incidencias_chasis no disponible:", incData.error.message);
      setStock(((stockData.data as any) ?? []).map((r: any) => ({
        modelo_comercial: r.modelo_comercial ?? "—",
        color: r.color ?? "—",
        piezas_disponibles: r.piezas_disponibles ?? 0,
        piezas_en_revision: r.piezas_en_revision ?? 0,
        piezas_garantia: r.piezas_garantia ?? 0,
        piezas_no_util: r.piezas_no_util ?? 0,
        unidades_libres: r.unidades_libres ?? 0,
        unidades_sin_serial: r.unidades_sin_serial ?? 0,
        unidades_detenidas: r.unidades_detenidas ?? 0,
        unidades_comprometidas: r.unidades_comprometidas ?? 0,
        capacidad_color: r.capacidad_color ?? 0,
        juegos_usados: r.juegos_usados ?? 0,
        capacidad_libre: r.capacidad_libre ?? 0,
        piezas_recoloreadas: r.piezas_recoloreadas ?? 0,
        unidades_entregadas: r.unidades_entregadas ?? 0,
        solicitadas: r.solicitadas ?? 0,
        asignadas: r.asignadas ?? 0,
        demanda_pendiente: r.demanda_pendiente ?? 0,
        holgura_con_serial: r.holgura_con_serial ?? 0,
        holgura_con_piezas: r.holgura_con_piezas ?? 0,
      })));
      // Un chasis puede tener varias incidencias en su historia: se muestra la
      // más reciente (la consulta viene ordenada desc).
      const incMap = new Map<string, IncidenciaChasis>();
      ((incData.data as any) ?? []).forEach((i: any) => {
        if (!incMap.has(i.chasis_id)) incMap.set(i.chasis_id, i);
      });
      setIncidencias(incMap);
      setCatalogo(new Map((catalogoData.data ?? []).map((c: any) => [c.modelo, { linea: c.linea as LineaProducto, nombre_comercial: c.nombre_comercial }])));
    } catch (error) {
      console.error("Error loading inventory:", error);
      toast.error(explicarError(error, t.inventario.errorCargar));
    } finally {
      setLoading(false);
    }
  };

  const getUnidadOrden = (motocarro_id: string | null) => {
    if (!motocarro_id) return <span className="text-amber-600 text-xs">{t.inventario.sinParear}</span>;
    const u = unidades.find(m => m.id === motocarro_id);
    return <span className="font-medium">#{u?.orden_armado ?? motocarro_id.slice(0, 8)}</span>;
  };

  const getParteDiferencia = (esperada: number, recibida: number) => recibida - esperada;

  const getColorStatus = (disponible: number, umbral: number) => {
    if (disponible === 0) return { icon: <AlertTriangle className="h-5 w-5" />, color: "text-red-600 bg-red-50", text: t.inventario.colores.sinStock };
    if (disponible <= umbral) return { icon: <AlertTriangle className="h-5 w-5" />, color: "text-amber-600 bg-amber-50", text: t.inventario.colores.bajoStock };
    return { icon: <CheckCircle2 className="h-5 w-5" />, color: "text-green-600 bg-green-50", text: t.inventario.colores.ok };
  };

  const pasaFiltro = (modelo: string) => lineaFiltro === "TODAS" || lineaDe(modelo, catalogo) === lineaFiltro;

  const chasisFiltrado = useMemo(() => chasis.filter(c => pasaFiltro(c.modelo)), [chasis, lineaFiltro, catalogo]);
  const motoresFiltrado = useMemo(() => motores.filter(m => pasaFiltro(m.modelo)), [motores, lineaFiltro, catalogo]);
  const unidadesFiltrado = useMemo(() => unidades.filter(u => pasaFiltro(u.modelo)), [unidades, lineaFiltro, catalogo]);

  // ── Otras líneas (mototaxis, modelos sin clasificar) ──────────────────────
  const otrasChasis = useMemo(() => chasis.filter(c => lineaDe(c.modelo, catalogo) !== "motocarro"), [chasis, catalogo]);
  const otrasMotores = useMemo(() => motores.filter(m => lineaDe(m.modelo, catalogo) !== "motocarro"), [motores, catalogo]);
  const otrasUnidades = useMemo(() => unidades.filter(u => lineaDe(u.modelo, catalogo) !== "motocarro"), [unidades, catalogo]);

  // ── Stock terminado y arrastre (sólo línea motocarro) ─────────────────────
  const unidadesMotocarro = useMemo(() => unidades.filter(u => lineaDe(u.modelo, catalogo) === "motocarro"), [unidades, catalogo]);
  const armadas = useMemo(() => unidadesMotocarro.filter(u => u.estatus_armado === "ARMADO" || u.estatus_armado === "LISTO"), [unidadesMotocarro]);
  const stockLibre = useMemo(() => armadas.filter(u => !u.remision_id), [armadas]);
  const stockComprometido = useMemo(() => armadas.filter(u => u.remision_id && u.estatus_entrega !== "ENTREGADA"), [armadas]);
  // Un chasis detenido por una incidencia (retenido, en garantía o no útil)
  // sigue en inventario pero no cuenta como configurable.
  const chasisPorConfigurar = useMemo(
    () => chasis.filter(c => !c.motocarro_id && !chasisDetenido(c.estatus) && lineaDe(c.modelo, catalogo) === "motocarro"),
    [chasis, catalogo]
  );
  const chasisDetenidos = useMemo(() => chasis.filter(c => chasisDetenido(c.estatus)), [chasis]);

  const hoy = new Date();
  const arrastre = useMemo(() => {
    return stockLibre
      .filter(u => u.fecha_real_armado)
      .map(u => ({
        ...u,
        dias: Math.floor((hoy.getTime() - new Date(u.fecha_real_armado + "T00:00:00").getTime()) / 86400000),
      }))
      .sort((a, b) => b.dias - a.dias);
  }, [stockLibre]);

  const rangos = useMemo(() => {
    const r = { "0-15": 0, "16-30": 0, "31-60": 0, "60+": 0 };
    arrastre.forEach(u => {
      if (u.dias <= 15) r["0-15"]++;
      else if (u.dias <= 30) r["16-30"]++;
      else if (u.dias <= 60) r["31-60"]++;
      else r["60+"]++;
    });
    return r;
  }, [arrastre]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t.inventario.cargando}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t.inventario.title}</h1>
        <p className="text-muted-foreground mt-1">{t.inventario.subtitle}</p>
      </div>

      <Tabs value={pestana} onValueChange={setPestana} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="unidades" className="text-base"><Bike className="h-4 w-4 mr-2" />{t.inventario.tabs.unidades}</TabsTrigger>
          <TabsTrigger value="chasis" className="text-base"><Truck className="h-4 w-4 mr-2" />{t.inventario.tabs.chasis}</TabsTrigger>
          <TabsTrigger value="motores" className="text-base"><Wrench className="h-4 w-4 mr-2" />{t.inventario.tabs.motores}</TabsTrigger>
          <TabsTrigger value="partes" className="text-base"><Package className="h-4 w-4 mr-2" />{t.inventario.tabs.partes}</TabsTrigger>
          <TabsTrigger value="colores" className="text-base"><Palette className="h-4 w-4 mr-2" />{t.inventario.tabs.colores}</TabsTrigger>
          <TabsTrigger value="otras" className="text-base"><Layers className="h-4 w-4 mr-2" />{t.inventario.tabs.otras}</TabsTrigger>
          <TabsTrigger value="stock" className="text-base"><Boxes className="h-4 w-4 mr-2" />{t.inventario.tabs.stock}</TabsTrigger>
          <TabsTrigger value="recepciones" className="text-base"><ClipboardList className="h-4 w-4 mr-2" />{t.inventario.tabs.recepciones}</TabsTrigger>
        </TabsList>

        {/* Filtro de línea — aplica a Unidades, Chasis y Motores */}
        {pestana !== "recepciones" && <div className="flex items-center gap-2 mt-3">
          <span className="text-sm text-muted-foreground">{t.inventario.lineaFiltro}</span>
          <div className="inline-flex rounded-lg border p-1 bg-card">
            {(["TODAS", "motocarro", "mototaxi", "otro"] as const).map(l => (
              <button
                key={l}
                onClick={() => setLineaFiltro(l)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${lineaFiltro === l ? "bg-[#2E75B6] text-white" : "text-muted-foreground"}`}
              >
                {l === "TODAS" ? t.inventario.todas : t.catalogos.linea[l]}
              </button>
            ))}
          </div>
        </div>}

        <TabsContent value="recepciones">
          <RecepcionesInventario />
        </TabsContent>

        <TabsContent value="unidades" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t.inventario.tabs.unidades}</h3>
              <div className="text-sm text-muted-foreground">
                {t.inventario.totalUnidades(unidadesFiltrado.length)}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>{t.inventario.col.orden}</TableHead>
                    <TableHead>{t.inventario.col.modelo}</TableHead>
                    <TableHead>{t.inventario.col.linea}</TableHead>
                    <TableHead>{t.inventario.col.color}</TableHead>
                    <TableHead>{t.inventario.col.chasis}</TableHead>
                    <TableHead>{t.inventario.col.motor}</TableHead>
                    <TableHead>{t.inventario.col.estatus}</TableHead>
                    <TableHead>{t.inventario.col.remision}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unidadesFiltrado.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-bold">#{u.orden_armado}</TableCell>
                      <TableCell>{displayFabrica(u.modelo, catalogo)}</TableCell>
                      <TableCell><LineaBadge modelo={u.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>{u.color}</TableCell>
                      <TableCell className="font-mono text-xs">{u.ns_chasis ?? '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{u.ns_motor ?? '-'}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          u.estatus_armado === 'PENDIENTE' ? 'bg-gray-100 text-gray-700' :
                          u.estatus_armado === 'ARMADO' || u.estatus_armado === 'LISTO' ? 'bg-green-100 text-green-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {t.estatus[u.estatus_armado as keyof typeof t.estatus] ?? u.estatus_armado}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{u.remision_id ? u.remision_id.slice(0, 8) + '...' : t.inventario.sinAsignar}</TableCell>
                    </TableRow>
                  ))}
                  {unidadesFiltrado.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {t.inventario.vacio.unidades}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="chasis" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t.inventario.tabs.chasis}</h3>
              <div className="text-sm text-muted-foreground flex items-center gap-3">
                <span>{t.inventario.totalPiezas(chasisFiltrado.length, chasisFiltrado.filter(c => c.estatus === 'disponible').length)}</span>
                {chasisDetenidos.length > 0 && (
                  <Link to="/incidencias" className="inline-flex items-center gap-1 text-[#991B1B] font-medium hover:underline">
                    <TriangleAlert className="h-4 w-4" /> {t.inventario.detenidosIncidencia(chasisDetenidos.length)}
                  </Link>
                )}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>{t.inventario.col.chasisFrame}</TableHead>
                    <TableHead>{t.inventario.col.modelo}</TableHead>
                    <TableHead>{t.inventario.col.linea}</TableHead>
                    <TableHead>{t.inventario.col.color}</TableHead>
                    <TableHead>{t.inventario.col.estatus}</TableHead>
                    <TableHead>{t.inventario.col.incidencia}</TableHead>
                    <TableHead>{t.inventario.col.unidad}</TableHead>
                    <TableHead>{t.inventario.col.contenedorId}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chasisFiltrado.map((c) => {
                    const est = ESTATUS_CHASIS[c.estatus] ?? { label: c.estatus, cls: "bg-gray-100 text-gray-700" };
                    const estLabel = t.catalogos.estatusChasis(c.estatus);
                    const inc = incidencias.get(c.id);
                    const incMeta = inc ? ESTATUS_INCIDENCIA[inc.estatus] : null;
                    return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono">{c.numero_chasis}</TableCell>
                      <TableCell>{displayFabrica(c.modelo, catalogo)}</TableCell>
                      <TableCell><LineaBadge modelo={c.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span>{normColor(c.color)}</span>
                          {normColor(c.color_original ?? c.color) !== normColor(c.color) && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]"
                              title={t.inventario.tip.vinDeclaro(normColor(c.color_original), normColor(c.color))}
                            >
                              VIN: {normColor(c.color_original)}
                            </span>
                          )}
                          {puedeEditarColor && (
                            <button
                              onClick={() => setColorChasis({
                                id: c.id, numero_chasis: c.numero_chasis, modelo: c.modelo,
                                color: c.color, color_original: c.color_original, motocarro_id: c.motocarro_id,
                              })}
                              className="text-muted-foreground hover:text-[#1F3864]"
                              title={t.inventario.tip.cambiarColor}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${est.cls}`}>{estLabel}</span>
                      </TableCell>
                      <TableCell>
                        {inc ? (
                          <Link to="/incidencias" className="inline-flex flex-col gap-0.5 hover:underline" title={inc.parte_afectada ?? undefined}>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${incMeta?.cls ?? ""}`}>
                              {inc.folio} · {t.catalogos.estatusIncidencia(inc.estatus)}
                            </span>
                            {inc.parte_afectada && <span className="text-[10px] text-muted-foreground">{inc.parte_afectada}</span>}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>{getUnidadOrden(c.motocarro_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{c.contenedor_id?.slice(0, 8)}...</TableCell>
                    </TableRow>
                    );
                  })}
                  {chasisFiltrado.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {t.inventario.vacio.chasis}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="motores" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t.inventario.tabs.motores}</h3>
              <div className="text-sm text-muted-foreground">
                {t.inventario.totalPiezas(motoresFiltrado.length, motoresFiltrado.filter(m => m.estatus === 'disponible').length)}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>{t.inventario.col.motor}</TableHead>
                    <TableHead>{t.inventario.col.modelo}</TableHead>
                    <TableHead>{t.inventario.col.linea}</TableHead>
                    <TableHead>{t.inventario.col.estatus}</TableHead>
                    <TableHead>{t.inventario.col.unidad}</TableHead>
                    <TableHead>{t.inventario.col.contenedorId}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {motoresFiltrado.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono">{m.numero_motor}</TableCell>
                      <TableCell>{displayFabrica(m.modelo, catalogo)}</TableCell>
                      <TableCell><LineaBadge modelo={m.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          m.estatus === 'disponible' ? 'bg-green-100 text-green-700' :
                          m.estatus === 'configurado' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {t.catalogos.estatusChasis(m.estatus)}
                        </span>
                      </TableCell>
                      <TableCell>{getUnidadOrden(m.motocarro_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.contenedor_id?.slice(0, 8)}...</TableCell>
                    </TableRow>
                  ))}
                  {motoresFiltrado.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t.inventario.vacio.motores}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="partes" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t.inventario.tabs.partes}</h3>
              <div className="text-sm text-muted-foreground">
                {t.inventario.totalRegistros(partes.length)}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>{t.inventario.col.parte}</TableHead>
                    <TableHead>{t.inventario.col.modelo}</TableHead>
                    <TableHead className="text-right">{t.inventario.col.esperada}</TableHead>
                    <TableHead className="text-right">{t.inventario.col.recibida}</TableHead>
                    <TableHead className="text-right">{t.inventario.col.diferencia}</TableHead>
                    <TableHead>{t.inventario.col.contenedorId}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partes.map((p) => {
                    const diff = getParteDiferencia(p.cantidad_esperada, p.cantidad_recibida);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.descripcion}</TableCell>
                        <TableCell>{p.modelo || '-'}</TableCell>
                        <TableCell className="text-right">{p.cantidad_esperada}</TableCell>
                        <TableCell className="text-right">{p.cantidad_recibida}</TableCell>
                        <TableCell className={`text-right font-medium ${diff < 0 ? 'text-red-600' : diff === 0 ? 'text-green-600' : 'text-amber-600'}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.contenedor_id.slice(0, 8)}...</TableCell>
                      </TableRow>
                    );
                  })}
                  {partes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t.inventario.vacio.partes}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="colores" className="space-y-4 mt-4">
          {/* Lo que ventas y dirección necesitan ver: por modelo comercial y
              color, qué hay disponible, qué está comprometido y qué se debe. */}
          <Card className="p-4">
            <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-lg">{t.inventario.colores.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {t.inventario.colores.desc1} <strong>{t.inventario.colores.juegosBold}</strong> {t.inventario.colores.desc2}
                </p>
              </div>
            </div>
            <div className="border rounded-lg overflow-x-auto max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>{t.inventario.col.modeloComercial}</TableHead>
                    <TableHead>{t.inventario.col.color}</TableHead>
                    <TableHead className="text-right" title={t.inventario.tip.piezasDisponibles}>{t.inventario.col.piezasDisponibles}</TableHead>
                    <TableHead className="text-right" title={t.inventario.tip.unidadesLibres}>{t.inventario.col.unidadesLibres}</TableHead>
                    <TableHead className="text-right" title={t.inventario.tip.sinNS}>{t.inventario.col.sinNS}</TableHead>
                    <TableHead className="text-right" title={t.inventario.tip.comprometidas}>{t.inventario.col.comprometidas}</TableHead>
                    <TableHead className="text-right" title={t.inventario.tip.detenidas}>{t.inventario.col.detenidas}</TableHead>
                    <TableHead className="text-right" title={t.inventario.tip.juegos}>{t.inventario.col.juegos}</TableHead>
                    <TableHead className="text-right" title={t.inventario.tip.juegosLibres}>{t.inventario.col.juegosLibres}</TableHead>
                    <TableHead className="text-right" title={t.inventario.tip.demanda}>{t.inventario.col.demanda}</TableHead>
                    <TableHead className="text-right" title={t.inventario.tip.holgura}>{t.inventario.col.holgura}</TableHead>
                    <TableHead>{t.inventario.col.estatus}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stock.map((r, i) => {
                    // Detenidas = piezas + unidades que una incidencia saca de
                    // circulación (siguen en inventario, no se venden).
                    const detenidas = r.piezas_en_revision + r.piezas_garantia + r.piezas_no_util + r.unidades_detenidas;
                    const cubierta = r.demanda_pendiente === 0;
                    const cubiertaConPiezas = !cubierta && r.holgura_con_piezas >= 0;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.modelo_comercial}</TableCell>
                        <TableCell>{r.color}</TableCell>
                        <TableCell className="text-right font-bold">{r.piezas_disponibles}</TableCell>
                        <TableCell className="text-right font-bold text-[#065F46]">{r.unidades_libres}</TableCell>
                        <TableCell className={`text-right ${r.unidades_sin_serial > 0 ? "text-[#92400E] font-semibold" : "text-muted-foreground"}`}>
                          {r.unidades_sin_serial}
                        </TableCell>
                        <TableCell className="text-right text-[#5B21B6]">{r.unidades_comprometidas}</TableCell>
                        <TableCell className={`text-right ${detenidas > 0 ? "text-[#991B1B] font-semibold" : "text-muted-foreground"}`}>
                          {detenidas}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.capacidad_color}
                          {r.piezas_recoloreadas > 0 && (
                            <span className="text-[10px] text-[#92400E] ml-1" title={t.inventario.tip.recoloreadas(r.piezas_recoloreadas)}>
                              ↺{r.piezas_recoloreadas}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${r.capacidad_libre > 0 ? "text-[#065F46]" : "text-muted-foreground"}`}>
                          {r.capacidad_libre}
                        </TableCell>
                        <TableCell className="text-right font-bold">{r.demanda_pendiente}</TableCell>
                        <TableCell className={`text-right font-bold ${r.holgura_con_serial < 0 ? "text-[#991B1B]" : "text-[#065F46]"}`}>
                          {r.holgura_con_serial > 0 ? `+${r.holgura_con_serial}` : r.holgura_con_serial}
                        </TableCell>
                        <TableCell>
                          {cubierta ? (
                            <span className="px-2 py-1 rounded-full text-xs bg-green-50 text-green-700 inline-flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" /> {t.inventario.colores.sinDemanda}
                            </span>
                          ) : r.holgura_con_serial >= 0 ? (
                            <span className="px-2 py-1 rounded-full text-xs bg-green-50 text-green-700 inline-flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" /> {t.inventario.colores.cubierta}
                            </span>
                          ) : cubiertaConPiezas ? (
                            <span className="px-2 py-1 rounded-full text-xs bg-amber-50 text-amber-700 inline-flex items-center gap-1">
                              <Wrench className="h-4 w-4" /> {t.inventario.colores.faltaConfigurar}
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-xs bg-red-50 text-red-600 inline-flex items-center gap-1">
                              <AlertTriangle className="h-4 w-4" /> {t.inventario.colores.faltanPiezas}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {stock.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                        {t.inventario.vacio.stockColor}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* La misma información por código de fábrica, que es como llega la
              mercancía y como la cuenta fábrica, con su umbral de alerta. */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-semibold text-lg">{t.inventario.colores.porCodigoFabrica}</h3>
              <div className="text-sm text-muted-foreground">{t.inventario.colores.alertaUmbral}</div>
            </div>
            <div className="border rounded-lg overflow-x-auto max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>{t.inventario.col.modelo}</TableHead>
                    <TableHead>{t.inventario.col.color}</TableHead>
                    <TableHead className="text-right">{t.inventario.col.piezasTotales}</TableHead>
                    <TableHead className="text-right">{t.inventario.col.disponibles}</TableHead>
                    <TableHead className="text-right">{t.inventario.col.enUnidades}</TableHead>
                    <TableHead className="text-right">{t.inventario.col.entregadas}</TableHead>
                    <TableHead className="text-right">{t.inventario.col.juegosColor}</TableHead>
                    <TableHead className="text-right">{t.inventario.col.umbral}</TableHead>
                    <TableHead>{t.inventario.col.estatus}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colores.map((c) => {
                    const status = getColorStatus(c.cantidad_disponible, c.umbral_alerta);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{displayFabrica(c.modelo, catalogo)}</TableCell>
                        <TableCell>{c.color}</TableCell>
                        <TableCell className="text-right">{c.piezas_total ?? "—"}</TableCell>
                        <TableCell className="text-right font-bold">{c.cantidad_disponible}</TableCell>
                        <TableCell className="text-right">{c.unidades_configuradas ?? "—"}</TableCell>
                        <TableCell className="text-right">{c.unidades_entregadas ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold">{c.piezas_recibidas ?? "—"}</span>
                          <span className="text-muted-foreground text-xs">{t.inventario.colores.usados(c.juegos_usados ?? 0)}</span>
                          {puedeEditarColor && (
                            <button
                              onClick={() => setCapacidadEdit({ modelo: c.modelo, color: c.color, juegos: c.piezas_recibidas ?? 0 })}
                              className="ml-1.5 text-muted-foreground hover:text-[#1F3864]"
                              title={t.inventario.tip.registrarJuegos}
                            >
                              <Pencil className="h-3.5 w-3.5 inline" />
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{c.umbral_alerta}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 ${status.color}`}>
                            {status.icon}
                            {status.text}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {colores.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        {t.inventario.vacio.colores}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="otras" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t.inventario.otras.title}</h3>
              <div className="text-sm text-muted-foreground">
                {t.inventario.otras.desc}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>{t.inventario.col.tipo}</TableHead>
                    <TableHead>{t.inventario.col.identificador}</TableHead>
                    <TableHead>{t.inventario.col.modelo}</TableHead>
                    <TableHead>{t.inventario.col.linea}</TableHead>
                    <TableHead>{t.inventario.col.color}</TableHead>
                    <TableHead>{t.inventario.col.contenedorRemision}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {otrasUnidades.map(u => (
                    <TableRow key={`u-${u.id}`}>
                      <TableCell><span className="px-2 py-1 rounded-full text-xs bg-slate-100">{t.inventario.otras.unidad(u.orden_armado)}</span></TableCell>
                      <TableCell className="font-mono text-xs">{u.ns_chasis} / {u.ns_motor}</TableCell>
                      <TableCell>{displayFabrica(u.modelo, catalogo)}</TableCell>
                      <TableCell><LineaBadge modelo={u.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>{u.color}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.remision_id ? t.inventario.otras.remisionCorta(u.remision_id.slice(0, 8) + "...") : t.inventario.sinRemision}</TableCell>
                    </TableRow>
                  ))}
                  {otrasChasis.map(c => (
                    <TableRow key={`c-${c.id}`}>
                      <TableCell><span className="px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700">{t.inventario.otras.chasis}</span></TableCell>
                      <TableCell className="font-mono text-xs">{c.numero_chasis}</TableCell>
                      <TableCell>{displayFabrica(c.modelo, catalogo)}</TableCell>
                      <TableCell><LineaBadge modelo={c.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>{c.color}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.contenedor_id ? c.contenedor_id.slice(0, 8) + "..." : "-"} {c.motocarro_id ? t.inventario.configurado : t.inventario.disponible}</TableCell>
                    </TableRow>
                  ))}
                  {otrasMotores.map(m => (
                    <TableRow key={`m-${m.id}`}>
                      <TableCell><span className="px-2 py-1 rounded-full text-xs bg-purple-50 text-purple-700">{t.inventario.otras.motor}</span></TableCell>
                      <TableCell className="font-mono text-xs">{m.numero_motor}</TableCell>
                      <TableCell>{displayFabrica(m.modelo, catalogo)}</TableCell>
                      <TableCell><LineaBadge modelo={m.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>-</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.contenedor_id ? m.contenedor_id.slice(0, 8) + "..." : "-"} {m.motocarro_id ? t.inventario.configurado : t.inventario.disponible}</TableCell>
                    </TableRow>
                  ))}
                  {!otrasUnidades.length && !otrasChasis.length && !otrasMotores.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {t.inventario.vacio.otras}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="stock" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">{t.inventario.stock.libre}</div>
              <div className="text-3xl font-bold text-[#065F46]">{stockLibre.length}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.inventario.stock.libreDesc}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">{t.inventario.stock.comprometido}</div>
              <div className="text-3xl font-bold text-[#5B21B6]">{stockComprometido.length}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.inventario.stock.comprometidoDesc}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">{t.inventario.stock.porConfigurar}</div>
              <div className="text-3xl font-bold text-[#1F3864]">{chasisPorConfigurar.length}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.inventario.stock.porConfigurarDesc}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">{t.inventario.stock.masDe60}</div>
              <div className={`text-3xl font-bold ${rangos["60+"] > 0 ? "text-[#991B1B]" : "text-[#065F46]"}`}>{rangos["60+"]}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.inventario.stock.masDe60Desc}</div>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">{t.inventario.stock.libreModeloColor}</h3>
              <div className="space-y-1 text-sm">
                {agruparModeloColor(stockLibre, catalogo).map((g, i) => (
                  <div key={i} className="flex justify-between border-b py-1 last:border-0">
                    <span>{g.modelo} · {g.color}</span>
                    <span className="font-bold">{g.n}</span>
                  </div>
                ))}
                {!stockLibre.length && <div className="text-muted-foreground text-center py-4">{t.inventario.vacio.stockLibre}</div>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">{t.inventario.stock.porConfigurarModeloColor}</h3>
              <div className="space-y-1 text-sm">
                {agruparModeloColor(chasisPorConfigurar, catalogo).map((g, i) => (
                  <div key={i} className="flex justify-between border-b py-1 last:border-0">
                    <span>{g.modelo} · {g.color}</span>
                    <span className="font-bold">{g.n}</span>
                  </div>
                ))}
                {!chasisPorConfigurar.length && <div className="text-muted-foreground text-center py-4">{t.inventario.vacio.porConfigurar}</div>}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-semibold">{t.inventario.stock.arrastre}</h3>
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-slate-100">0-15d: {rangos["0-15"]}</span>
                <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700">16-30d: {rangos["16-30"]}</span>
                <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800">31-60d: {rangos["31-60"]}</span>
                <span className="px-2 py-1 rounded-full bg-red-100 text-red-700">+60d: {rangos["60+"]}</span>
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>{t.inventario.col.orden}</TableHead>
                    <TableHead>{t.inventario.col.modelo}</TableHead>
                    <TableHead>{t.inventario.col.color}</TableHead>
                    <TableHead>{t.inventario.col.armadaDesde}</TableHead>
                    <TableHead className="text-right">{t.inventario.col.diasEnStock}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {arrastre.slice(0, 20).map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-bold">#{u.orden_armado}</TableCell>
                      <TableCell>{nombreComercial(u.modelo, catalogo)}</TableCell>
                      <TableCell>{u.color}</TableCell>
                      <TableCell>{u.fecha_real_armado}</TableCell>
                      <TableCell className={`text-right font-bold ${u.dias > 60 ? "text-[#991B1B]" : u.dias > 30 ? "text-[#92400E]" : ""}`}>{u.dias}</TableCell>
                    </TableRow>
                  ))}
                  {!arrastre.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{t.inventario.vacio.arrastre}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <ColorChasis
        chasis={colorChasis}
        open={!!colorChasis}
        onOpenChange={o => { if (!o) setColorChasis(null); }}
        onDone={() => { setColorChasis(null); cargarInventario(); }}
      />

      {capacidadEdit && (
        <AjustarCapacidadColor
          modelo={capacidadEdit.modelo}
          color={capacidadEdit.color}
          juegosActuales={capacidadEdit.juegos}
          open={!!capacidadEdit}
          onOpenChange={o => { if (!o) setCapacidadEdit(null); }}
          onDone={() => { setCapacidadEdit(null); cargarInventario(); }}
        />
      )}
    </div>
  );
}
