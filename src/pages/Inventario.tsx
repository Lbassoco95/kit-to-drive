import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package, Wrench, Palette, Truck, AlertTriangle, CheckCircle2, Bike, Layers, Boxes } from "lucide-react";
import { toast } from "sonner";
import { lineaDe, LineaProducto } from "@/lib/dazon";

type Chasis = {
  id: string;
  numero_chasis: string;
  modelo: string;
  color: string;
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
};

const LINEA_LABEL: Record<LineaProducto, string> = { motocarro: "Motocarro", mototaxi: "Mototaxi", otro: "Otro" };
const LINEA_BADGE: Record<LineaProducto, string> = {
  motocarro: "bg-slate-100 text-slate-700",
  mototaxi: "bg-purple-100 text-purple-700",
  otro: "bg-amber-100 text-amber-700",
};

function LineaBadge({ modelo, catalogo }: { modelo: string; catalogo: Map<string, LineaProducto> }) {
  const linea = lineaDe(modelo, catalogo);
  const sinClasificar = catalogo.size > 0 && !catalogo.has(modelo);
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${LINEA_BADGE[linea]}`} title={sinClasificar ? `Modelo ${modelo} sin clasificar — pídele a un administrador que lo agregue al catálogo.` : undefined}>
      {LINEA_LABEL[linea]}{sinClasificar && " ⚠"}
    </span>
  );
}

function agruparModeloColor<T extends { modelo: string; color?: string }>(items: T[]) {
  const map = new Map<string, { modelo: string; color: string; n: number }>();
  items.forEach(i => {
    const key = `${i.modelo}__${i.color ?? "-"}`;
    const cur = map.get(key) ?? { modelo: i.modelo, color: i.color ?? "-", n: 0 };
    cur.n++;
    map.set(key, cur);
  });
  return [...map.values()].sort((a, b) => a.modelo.localeCompare(b.modelo) || a.color.localeCompare(b.color));
}

export default function Inventario() {
  const [chasis, setChasis] = useState<Chasis[]>([]);
  const [motores, setMotores] = useState<Motor[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [colores, setColores] = useState<ColorInventario[]>([]);
  const [catalogo, setCatalogo] = useState<Map<string, LineaProducto>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lineaFiltro, setLineaFiltro] = useState<"TODAS" | LineaProducto>("TODAS");

  useEffect(() => {
    cargarInventario();
  }, []);

  const cargarInventario = async () => {
    setLoading(true);
    try {
      const [chasisData, motoresData, unidadesData, partesData, coloresData, catalogoData] = await Promise.all([
        supabase.from("inventario_chasis").select("*").order("fecha_importacion", { ascending: false }),
        supabase.from("inventario_motor").select("*").order("fecha_importacion", { ascending: false }),
        supabase.from("motocarros").select("id, orden_armado, modelo, color, ns_chasis, ns_motor, estatus_armado, estatus_entrega, fecha_real_armado, remision_id, contenedor_id").order("orden_armado"),
        supabase.from("inventario_partes").select("*").order("descripcion"),
        supabase.from("inventario_colores").select("*").order("modelo, color"),
        supabase.from("modelos_producto").select("modelo, linea"),
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
      setColores(coloresData.data || []);
      setCatalogo(new Map((catalogoData.data ?? []).map((c: any) => [c.modelo, c.linea as LineaProducto])));
    } catch (error) {
      console.error("Error loading inventory:", error);
      toast.error("Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  const getUnidadOrden = (motocarro_id: string | null) => {
    if (!motocarro_id) return <span className="text-amber-600 text-xs">sin parear</span>;
    const u = unidades.find(m => m.id === motocarro_id);
    return <span className="font-medium">#{u?.orden_armado ?? motocarro_id.slice(0, 8)}</span>;
  };

  const getParteDiferencia = (esperada: number, recibida: number) => recibida - esperada;

  const getColorStatus = (disponible: number, umbral: number) => {
    if (disponible === 0) return { icon: <AlertTriangle className="h-5 w-5" />, color: "text-red-600 bg-red-50", text: "Sin stock" };
    if (disponible <= umbral) return { icon: <AlertTriangle className="h-5 w-5" />, color: "text-amber-600 bg-amber-50", text: "Bajo stock" };
    return { icon: <CheckCircle2 className="h-5 w-5" />, color: "text-green-600 bg-green-50", text: "OK" };
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
  const chasisPorConfigurar = useMemo(
    () => chasis.filter(c => !c.motocarro_id && lineaDe(c.modelo, catalogo) === "motocarro"),
    [chasis, catalogo]
  );

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
        <p className="text-muted-foreground">Cargando inventario...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Inventario de Contenedores</h1>
        <p className="text-muted-foreground mt-1">Gestión de unidades, chasis, motores, partes y colores</p>
      </div>

      <Tabs defaultValue="unidades" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="unidades" className="text-base"><Bike className="h-4 w-4 mr-2" />Unidades</TabsTrigger>
          <TabsTrigger value="chasis" className="text-base"><Truck className="h-4 w-4 mr-2" />Chasis</TabsTrigger>
          <TabsTrigger value="motores" className="text-base"><Wrench className="h-4 w-4 mr-2" />Motores</TabsTrigger>
          <TabsTrigger value="partes" className="text-base"><Package className="h-4 w-4 mr-2" />Partes</TabsTrigger>
          <TabsTrigger value="colores" className="text-base"><Palette className="h-4 w-4 mr-2" />Colores</TabsTrigger>
          <TabsTrigger value="otras" className="text-base"><Layers className="h-4 w-4 mr-2" />Otras líneas</TabsTrigger>
          <TabsTrigger value="stock" className="text-base"><Boxes className="h-4 w-4 mr-2" />Stock</TabsTrigger>
        </TabsList>

        {/* Filtro de línea — aplica a Unidades, Chasis y Motores */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-sm text-muted-foreground">Línea:</span>
          <div className="inline-flex rounded-lg border p-1 bg-card">
            {(["TODAS", "motocarro", "mototaxi", "otro"] as const).map(l => (
              <button
                key={l}
                onClick={() => setLineaFiltro(l)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium ${lineaFiltro === l ? "bg-[#2E75B6] text-white" : "text-muted-foreground"}`}
              >
                {l === "TODAS" ? "Todas" : LINEA_LABEL[l]}
              </button>
            ))}
          </div>
        </div>

        <TabsContent value="unidades" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Unidades</h3>
              <div className="text-sm text-muted-foreground">
                Total: {unidadesFiltrado.length} unidades
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Orden</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Línea</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Chasis</TableHead>
                    <TableHead>Motor</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead>Remisión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unidadesFiltrado.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-bold">#{u.orden_armado}</TableCell>
                      <TableCell>{u.modelo}</TableCell>
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
                          {u.estatus_armado}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{u.remision_id ? u.remision_id.slice(0, 8) + '...' : 'sin asignar'}</TableCell>
                    </TableRow>
                  ))}
                  {unidadesFiltrado.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No hay unidades en inventario
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
              <h3 className="font-semibold text-lg">Inventario de Chasis</h3>
              <div className="text-sm text-muted-foreground">
                Total: {chasisFiltrado.length} piezas | Disponibles: {chasisFiltrado.filter(c => c.estatus === 'disponible').length}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Chasis (FRAME NUMBER)</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Línea</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Contenedor ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chasisFiltrado.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono">{c.numero_chasis}</TableCell>
                      <TableCell>{c.modelo}</TableCell>
                      <TableCell><LineaBadge modelo={c.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>{c.color}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          c.estatus === 'disponible' ? 'bg-green-100 text-green-700' :
                          c.estatus === 'configurado' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {c.estatus}
                        </span>
                      </TableCell>
                      <TableCell>{getUnidadOrden(c.motocarro_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{c.contenedor_id?.slice(0, 8)}...</TableCell>
                    </TableRow>
                  ))}
                  {chasisFiltrado.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No hay chasis en inventario
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
              <h3 className="font-semibold text-lg">Inventario de Motores</h3>
              <div className="text-sm text-muted-foreground">
                Total: {motoresFiltrado.length} piezas | Disponibles: {motoresFiltrado.filter(m => m.estatus === 'disponible').length}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Motor</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Línea</TableHead>
                    <TableHead>Estatus</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Contenedor ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {motoresFiltrado.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono">{m.numero_motor}</TableCell>
                      <TableCell>{m.modelo}</TableCell>
                      <TableCell><LineaBadge modelo={m.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          m.estatus === 'disponible' ? 'bg-green-100 text-green-700' :
                          m.estatus === 'configurado' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {m.estatus}
                        </span>
                      </TableCell>
                      <TableCell>{getUnidadOrden(m.motocarro_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.contenedor_id?.slice(0, 8)}...</TableCell>
                    </TableRow>
                  ))}
                  {motoresFiltrado.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No hay motores en inventario
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
              <h3 className="font-semibold text-lg">Inventario de Partes</h3>
              <div className="text-sm text-muted-foreground">
                Total registros: {partes.length}
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Parte</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead className="text-right">Esperada</TableHead>
                    <TableHead className="text-right">Recibida</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                    <TableHead>Contenedor ID</TableHead>
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
                        No hay partes en inventario
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="colores" className="space-y-4 mt-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Inventario de Colores</h3>
              <div className="text-sm text-muted-foreground">
                Alerta cuando disponible ≤ umbral
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-right">Umbral Alerta</TableHead>
                    <TableHead>Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colores.map((c) => {
                    const status = getColorStatus(c.cantidad_disponible, c.umbral_alerta);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{c.modelo}</TableCell>
                        <TableCell>{c.color}</TableCell>
                        <TableCell className="text-right font-bold">{c.cantidad_disponible}</TableCell>
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
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No hay colores en inventario
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
              <h3 className="font-semibold text-lg">Otras líneas</h3>
              <div className="text-sm text-muted-foreground">
                Mototaxis y modelos fuera del flujo de armado de motocarros
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0">
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Identificador</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Línea</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Contenedor / Remisión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {otrasUnidades.map(u => (
                    <TableRow key={`u-${u.id}`}>
                      <TableCell><span className="px-2 py-1 rounded-full text-xs bg-slate-100">Unidad #{u.orden_armado}</span></TableCell>
                      <TableCell className="font-mono text-xs">{u.ns_chasis} / {u.ns_motor}</TableCell>
                      <TableCell>{u.modelo}</TableCell>
                      <TableCell><LineaBadge modelo={u.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>{u.color}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.remision_id ? `Remisión ${u.remision_id.slice(0, 8)}...` : "sin remisión"}</TableCell>
                    </TableRow>
                  ))}
                  {otrasChasis.map(c => (
                    <TableRow key={`c-${c.id}`}>
                      <TableCell><span className="px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700">Chasis</span></TableCell>
                      <TableCell className="font-mono text-xs">{c.numero_chasis}</TableCell>
                      <TableCell>{c.modelo}</TableCell>
                      <TableCell><LineaBadge modelo={c.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>{c.color}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.contenedor_id ? c.contenedor_id.slice(0, 8) + "..." : "-"} {c.motocarro_id ? "· configurado" : "· disponible"}</TableCell>
                    </TableRow>
                  ))}
                  {otrasMotores.map(m => (
                    <TableRow key={`m-${m.id}`}>
                      <TableCell><span className="px-2 py-1 rounded-full text-xs bg-purple-50 text-purple-700">Motor</span></TableCell>
                      <TableCell className="font-mono text-xs">{m.numero_motor}</TableCell>
                      <TableCell>{m.modelo}</TableCell>
                      <TableCell><LineaBadge modelo={m.modelo} catalogo={catalogo} /></TableCell>
                      <TableCell>-</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.contenedor_id ? m.contenedor_id.slice(0, 8) + "..." : "-"} {m.motocarro_id ? "· configurado" : "· disponible"}</TableCell>
                    </TableRow>
                  ))}
                  {!otrasUnidades.length && !otrasChasis.length && !otrasMotores.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No hay piezas ni unidades fuera de la línea motocarro
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
              <div className="text-sm text-muted-foreground">Libre (vendible hoy)</div>
              <div className="text-3xl font-bold text-[#065F46]">{stockLibre.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Armadas/listas sin remisión</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Comprometido</div>
              <div className="text-3xl font-bold text-[#5B21B6]">{stockComprometido.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Con remisión, aún no entregadas</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Por configurar</div>
              <div className="text-3xl font-bold text-[#1F3864]">{chasisPorConfigurar.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Chasis disponibles sin unidad</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Más de 60 días en stock</div>
              <div className={`text-3xl font-bold ${rangos["60+"] > 0 ? "text-[#991B1B]" : "text-[#065F46]"}`}>{rangos["60+"]}</div>
              <div className="text-xs text-muted-foreground mt-1">De las unidades libres</div>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Libre por modelo y color</h3>
              <div className="space-y-1 text-sm">
                {agruparModeloColor(stockLibre).map((g, i) => (
                  <div key={i} className="flex justify-between border-b py-1 last:border-0">
                    <span>{g.modelo} · {g.color}</span>
                    <span className="font-bold">{g.n}</span>
                  </div>
                ))}
                {!stockLibre.length && <div className="text-muted-foreground text-center py-4">Sin stock libre</div>}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Por configurar por modelo y color</h3>
              <div className="space-y-1 text-sm">
                {agruparModeloColor(chasisPorConfigurar).map((g, i) => (
                  <div key={i} className="flex justify-between border-b py-1 last:border-0">
                    <span>{g.modelo} · {g.color}</span>
                    <span className="font-bold">{g.n}</span>
                  </div>
                ))}
                {!chasisPorConfigurar.length && <div className="text-muted-foreground text-center py-4">No hay chasis sin configurar</div>}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-semibold">Arrastre — antigüedad del stock libre</h3>
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
                    <TableHead>Orden</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead>Armada desde</TableHead>
                    <TableHead className="text-right">Días en stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {arrastre.slice(0, 20).map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-bold">#{u.orden_armado}</TableCell>
                      <TableCell>{u.modelo}</TableCell>
                      <TableCell>{u.color}</TableCell>
                      <TableCell>{u.fecha_real_armado}</TableCell>
                      <TableCell className={`text-right font-bold ${u.dias > 60 ? "text-[#991B1B]" : u.dias > 30 ? "text-[#92400E]" : ""}`}>{u.dias}</TableCell>
                    </TableRow>
                  ))}
                  {!arrastre.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin stock libre con fecha de armado</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
