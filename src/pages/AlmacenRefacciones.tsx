import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Package, Search, Upload, Bike, RefreshCw, Eye, EyeOff, Wand2,
  LayoutGrid, List, Plus, X, Save, Pencil, PackageX, PackageCheck,
} from "lucide-react";
import { extractCompat, parseListaPreciosRefacciones } from "@/lib/refaccionesParser";
import { explicarError } from "@/lib/dazon";
import { cn } from "@/lib/utils";

type Producto = {
  id: string;
  codigo_nuevo: string;
  codigo_antiguo: string | null;
  clave_completa: string;
  linea_catalogo: string;
  marca: string | null;
  categoria: string | null;
  descripcion: string;
  descripcion_corta: string | null;
  descripcion_original?: string | null;
  unidad_medida: string | null;
  precio: number | null;
  stock: number;
  visible_venta: boolean;
  num_compatibilidades: number;
};

type Compat = {
  id: string;
  nombre: string;
  tipo_unidad: string | null;
  piezas_compartidas?: number;
};

type UnidadFiltro = { id: string; nombre: string; piezas: number };

type VistaMode = "tabla" | "tarjetas";
type OrdenMode = "codigo" | "descripcion" | "stock_desc" | "stock_asc";
type StockFiltro = "todos" | "con_stock" | "sin_stock";

const LINEA_LABEL: Record<string, string> = {
  linea_dorada: "Línea dorada",
  ref_motocarro: "Ref. motocarro",
  linea_azul: "Línea azul",
};

function nombreProducto(p: Producto) {
  return (p.descripcion_corta || p.descripcion || p.codigo_nuevo).trim();
}

export default function AlmacenRefacciones() {
  const { t } = useLang();
  const { puedeVerRefacciones } = useAuth();
  const [rows, setRows] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [linea, setLinea] = useState<string>("todas");
  const [soloVisibles, setSoloVisibles] = useState(false);
  const [soloConCompat, setSoloConCompat] = useState(false);
  const [unidadFiltro, setUnidadFiltro] = useState<string>("todas");
  const [unidades, setUnidades] = useState<UnidadFiltro[]>([]);
  const [idsPorUnidad, setIdsPorUnidad] = useState<Set<string>>(new Set());
  const [importando, setImportando] = useState(false);
  const [reprocesando, setReprocesando] = useState(false);
  const [detalle, setDetalle] = useState<Producto | null>(null);
  const [compats, setCompats] = useState<Compat[]>([]);
  const [vista, setVista] = useState<VistaMode>("tarjetas");
  const [orden, setOrden] = useState<OrdenMode>("codigo");
  const [stockFiltro, setStockFiltro] = useState<StockFiltro>("todos");

  // Edición de compatibilidad en el detalle
  const [editandoCompat, setEditandoCompat] = useState(false);
  const [compatDraft, setCompatDraft] = useState<string[]>([]);
  const [nuevaUnidad, setNuevaUnidad] = useState("");
  const [guardandoCompat, setGuardandoCompat] = useState(false);

  const ar = t.almacenRefacciones;

  const loadUnidades = useCallback(async () => {
    const { data } = await supabase
      .from("almacen_refacciones_unidades" as any)
      .select("id, nombre, almacen_refacciones_producto_compat(count)")
      .order("nombre")
      .limit(5000);
    const list: UnidadFiltro[] = ((data as any[]) ?? [])
      .map(u => ({
        id: u.id as string,
        nombre: u.nombre as string,
        piezas: Number(u.almacen_refacciones_producto_compat?.[0]?.count ?? 0),
      }))
      .sort((a, b) => b.piezas - a.piezas || a.nombre.localeCompare(b.nombre));
    setUnidades(list);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("v_almacen_refacciones" as any)
      .select("*")
      .order("codigo_nuevo")
      .limit(5000);
    if (error) {
      toast.error(explicarError(error, ar?.errorCargar ?? "Error al cargar"));
      setRows([]);
    } else {
      setRows(((data as unknown) as Producto[]) ?? []);
    }
    setLoading(false);
    void loadUnidades();
  }, [ar, loadUnidades]);

  useEffect(() => {
    if (puedeVerRefacciones) load();
  }, [puedeVerRefacciones, load]);

  useEffect(() => {
    if (unidadFiltro === "todas") {
      setIdsPorUnidad(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("almacen_refacciones_producto_compat" as any)
        .select("producto_id")
        .eq("unidad_id", unidadFiltro);
      if (cancelled) return;
      setIdsPorUnidad(new Set(((data as any[]) ?? []).map(x => x.producto_id as string)));
    })();
    return () => { cancelled = true; };
  }, [unidadFiltro]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = rows.filter(r => {
      if (linea !== "todas" && r.linea_catalogo !== linea) return false;
      if (soloVisibles && !r.visible_venta) return false;
      if (soloConCompat && !(r.num_compatibilidades > 0)) return false;
      if (stockFiltro === "con_stock" && !(r.stock > 0)) return false;
      if (stockFiltro === "sin_stock" && r.stock > 0) return false;
      if (unidadFiltro !== "todas" && !idsPorUnidad.has(r.id)) return false;
      if (!term) return true;
      const blob = [
        r.codigo_nuevo, r.codigo_antiguo, r.clave_completa,
        r.descripcion, r.descripcion_corta, r.categoria, r.marca,
      ].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(term);
    });

    list = [...list].sort((a, b) => {
      if (orden === "codigo") return a.codigo_nuevo.localeCompare(b.codigo_nuevo, "es");
      if (orden === "descripcion") {
        return nombreProducto(a).localeCompare(nombreProducto(b), "es", { sensitivity: "base" });
      }
      if (orden === "stock_desc") return (b.stock || 0) - (a.stock || 0) || a.codigo_nuevo.localeCompare(b.codigo_nuevo);
      return (a.stock || 0) - (b.stock || 0) || a.codigo_nuevo.localeCompare(b.codigo_nuevo);
    });
    return list;
  }, [rows, q, linea, soloVisibles, soloConCompat, stockFiltro, unidadFiltro, idsPorUnidad, orden]);

  const stats = useMemo(() => {
    const dual = rows.filter(r => r.codigo_antiguo).length;
    const conCompat = rows.filter(r => r.num_compatibilidades > 0).length;
    const sinCompat = rows.length - conCompat;
    const conStock = rows.filter(r => r.stock > 0).length;
    const sinStock = rows.length - conStock;
    const stock = rows.reduce((s, r) => s + (r.stock || 0), 0);
    return { total: rows.length, dual, conCompat, sinCompat, conStock, sinStock, stock, unidades: unidades.filter(u => u.piezas > 0).length };
  }, [rows, unidades]);

  const abrirDetalle = async (p: Producto, opts?: { editarSiVacio?: boolean }) => {
    setDetalle(p);
    setCompats([]);
    setEditandoCompat(false);
    setNuevaUnidad("");
    const { data } = await supabase
      .from("almacen_refacciones_producto_compat" as any)
      .select("unidad_id, almacen_refacciones_unidades(id, nombre, tipo_unidad)")
      .eq("producto_id", p.id);
    const base: Compat[] = ((data as any[]) ?? []).map(x => ({
      id: x.almacen_refacciones_unidades?.id ?? x.unidad_id,
      nombre: x.almacen_refacciones_unidades?.nombre ?? "—",
      tipo_unidad: x.almacen_refacciones_unidades?.tipo_unidad ?? null,
      piezas_compartidas: unidades.find(u => u.id === (x.almacen_refacciones_unidades?.id ?? x.unidad_id))?.piezas ?? 0,
    }));
    const sorted = base.sort((a, b) => a.nombre.localeCompare(b.nombre));
    setCompats(sorted);
    setCompatDraft(sorted.map(c => c.nombre));
    // Si no tiene compat, abrir en edición (salvo al refrescar tras guardar)
    if ((opts?.editarSiVacio ?? true) && sorted.length === 0) setEditandoCompat(true);
  };

  const filtrarPorUnidad = (unidadId: string) => {
    setUnidadFiltro(unidadId);
    setDetalle(null);
    setSoloConCompat(false);
  };

  const empezarEditarCompat = () => {
    setCompatDraft(compats.map(c => c.nombre));
    setEditandoCompat(true);
    setNuevaUnidad("");
  };

  const cancelarEditarCompat = () => {
    setCompatDraft(compats.map(c => c.nombre));
    setEditandoCompat(false);
    setNuevaUnidad("");
  };

  const agregarUnidadDraft = (nombreRaw: string) => {
    const nombre = nombreRaw.trim().replace(/\s+/g, " ");
    if (!nombre) return;
    const existe = compatDraft.some(n => n.toLowerCase() === nombre.toLowerCase());
    if (existe) {
      toast.message(ar?.compatYaAgregada ?? "Esa unidad ya está en la lista");
      return;
    }
    setCompatDraft(prev => [...prev, nombre].sort((a, b) => a.localeCompare(b, "es")));
    setNuevaUnidad("");
  };

  const quitarUnidadDraft = (nombre: string) => {
    setCompatDraft(prev => prev.filter(n => n !== nombre));
  };

  const guardarCompat = async () => {
    if (!detalle) return;
    setGuardandoCompat(true);
    try {
      const { data, error } = await supabase.rpc("sincronizar_compat_refacciones" as any, {
        _items: [{
          codigo_nuevo: detalle.codigo_nuevo,
          descripcion_corta: detalle.descripcion_corta || detalle.descripcion,
          compatibilidades: compatDraft,
        }],
      });
      if (error) throw error;
      const n = (data as any)?.compatibilidades ?? compatDraft.length;
      toast.success(
        (ar?.okCompatGuardada ?? ((c: number) => `Compatibilidad actualizada (${c} unidades)`))(n),
      );
      await load();
      const actualizado = (await supabase
        .from("v_almacen_refacciones" as any)
        .select("*")
        .eq("id", detalle.id)
        .maybeSingle()).data as Producto | null;
      if (actualizado) {
        await abrirDetalle(actualizado, { editarSiVacio: false });
      } else {
        setDetalle(null);
      }
    } catch (e: any) {
      toast.error(explicarError(e, ar?.errorCompatGuardar ?? "No se pudo guardar la compatibilidad"));
    } finally {
      setGuardandoCompat(false);
    }
  };

  const onImport = async (file: File) => {
    setImportando(true);
    try {
      const buf = await file.arrayBuffer();
      const items = parseListaPreciosRefacciones(buf);
      if (!items.length) {
        toast.error(ar?.sinProductos ?? "No se encontraron productos en el Excel");
        return;
      }
      let procesados = 0;
      const CHUNK = 80;
      for (let i = 0; i < items.length; i += CHUNK) {
        const chunk = items.slice(i, i + CHUNK);
        const { data, error } = await supabase.rpc("importar_almacen_refacciones" as any, {
          _items: chunk,
        });
        if (error) throw error;
        procesados += (data as any)?.procesados ?? chunk.length;
      }
      toast.success((ar?.okImportados ?? ((n: number) => `Importados ${n} productos`))(procesados));
      await load();
    } catch (e: any) {
      toast.error(explicarError(e, ar?.errorImportar ?? "Error al importar"));
    } finally {
      setImportando(false);
    }
  };

  const reprocesarCompat = async () => {
    setReprocesando(true);
    try {
      const payload = rows.map(r => {
        const fuente = r.descripcion_original || r.descripcion;
        const { corta, comps } = extractCompat(fuente);
        return {
          codigo_nuevo: r.codigo_nuevo,
          descripcion_corta: corta,
          compatibilidades: comps,
        };
      });
      let procesados = 0;
      const CHUNK = 100;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const chunk = payload.slice(i, i + CHUNK);
        const { data, error } = await supabase.rpc("sincronizar_compat_refacciones" as any, {
          _items: chunk,
        });
        if (error) throw error;
        procesados += (data as any)?.procesados ?? chunk.length;
      }
      toast.success(
        (ar?.okReprocesados ?? ((n: number) => `Compatibilidades actualizadas en ${n} productos`))(procesados),
      );
      await load();
    } catch (e: any) {
      toast.error(explicarError(e, ar?.errorReprocesar ?? "Error al reprocesar"));
    } finally {
      setReprocesando(false);
    }
  };

  if (!puedeVerRefacciones) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {ar?.sinAcceso ?? "No tienes acceso a este módulo."}
      </div>
    );
  }

  const money = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

  const unidadFiltroNombre = unidades.find(u => u.id === unidadFiltro)?.nombre;

  const unidadesSugeridas = useMemo(() => {
    const term = nuevaUnidad.trim().toLowerCase();
    const ya = new Set(compatDraft.map(n => n.toLowerCase()));
    return unidades
      .filter(u => !ya.has(u.nombre.toLowerCase()))
      .filter(u => !term || u.nombre.toLowerCase().includes(term))
      .slice(0, 12);
  }, [unidades, compatDraft, nuevaUnidad]);

  const StockBadge = ({ stock }: { stock: number }) => {
    if (stock > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-xs font-semibold tabular-nums">
          <PackageCheck className="h-3 w-3" />
          {stock.toLocaleString("es-MX")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 text-xs font-semibold">
        <PackageX className="h-3 w-3" />
        {ar?.sinStock ?? "Sin stock"}
      </span>
    );
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3864] flex items-center gap-2">
            <Package className="h-7 w-7" />
            {ar?.titulo ?? "Inventario de refacciones"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {ar?.subtitulo ??
              "Catálogo de venta independiente. Descripción del producto y motos/unidades compatibles reutilizables."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {ar?.actualizar ?? "Actualizar"}
          </Button>
          <Button variant="outline" onClick={reprocesarCompat} disabled={reprocesando || !rows.length}>
            <Wand2 className={`h-4 w-4 mr-2 ${reprocesando ? "animate-spin" : ""}`} />
            {reprocesando
              ? (ar?.reprocesando ?? "Reprocesando…")
              : (ar?.reprocesar ?? "Actualizar compatibilidades")}
          </Button>
          <Button asChild disabled={importando}>
            <label className="cursor-pointer inline-flex items-center justify-center gap-2">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={importando}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) onImport(f);
                  e.target.value = "";
                }}
              />
              <Upload className="h-4 w-4" />
              {importando
                ? (ar?.importando ?? "Importando…")
                : (ar?.importar ?? "Importar lista")}
            </label>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{ar?.statProductos ?? "Productos"}</div>
          <div className="text-2xl font-bold text-[#1F3864]">{stats.total}</div>
        </Card>
        <Card
          className={cn("p-4 cursor-pointer transition-colors", stockFiltro === "con_stock" && "ring-2 ring-emerald-500")}
          onClick={() => setStockFiltro(s => s === "con_stock" ? "todos" : "con_stock")}
        >
          <div className="text-xs text-muted-foreground">{ar?.statConStock ?? "Con disponibilidad"}</div>
          <div className="text-2xl font-bold text-emerald-700">{stats.conStock}</div>
        </Card>
        <Card
          className={cn("p-4 cursor-pointer transition-colors", stockFiltro === "sin_stock" && "ring-2 ring-rose-400")}
          onClick={() => setStockFiltro(s => s === "sin_stock" ? "todos" : "sin_stock")}
        >
          <div className="text-xs text-muted-foreground">{ar?.statSinStock ?? "Sin stock"}</div>
          <div className="text-2xl font-bold text-rose-600">{stats.sinStock}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{ar?.statCompat ?? "Con compatibilidad"}</div>
          <div className="text-2xl font-bold text-[#1F3864]">{stats.conCompat}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {(ar?.statSinCompat ?? ((n: number) => `${n} sin configurar`))(stats.sinCompat)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{ar?.statUnidades ?? "Motos/unidades"}</div>
          <div className="text-2xl font-bold text-[#1F3864]">{stats.unidades}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{ar?.statStock ?? "Piezas en stock"}</div>
          <div className="text-2xl font-bold text-[#1F3864]">{stats.stock.toLocaleString("es-MX")}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={ar?.buscar ?? "Buscar por código, descripción o moto…"}
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <Select value={orden} onValueChange={v => setOrden(v as OrdenMode)}>
            <SelectTrigger className="w-full md:w-52">
              <SelectValue placeholder={ar?.ordenarPor ?? "Ordenar"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="codigo">{ar?.ordenCodigo ?? "Código A–Z"}</SelectItem>
              <SelectItem value="descripcion">{ar?.ordenDesc ?? "Descripción A–Z"}</SelectItem>
              <SelectItem value="stock_desc">{ar?.ordenStockDesc ?? "Más stock primero"}</SelectItem>
              <SelectItem value="stock_asc">{ar?.ordenStockAsc ?? "Sin stock primero"}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stockFiltro} onValueChange={v => setStockFiltro(v as StockFiltro)}>
            <SelectTrigger className="w-full md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{ar?.stockTodos ?? "Todo el stock"}</SelectItem>
              <SelectItem value="con_stock">{ar?.stockDisponible ?? "Con disponibilidad"}</SelectItem>
              <SelectItem value="sin_stock">{ar?.stockAgotado ?? "Sin stock"}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={linea} onValueChange={setLinea}>
            <SelectTrigger className="w-full md:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{ar?.todasLineas ?? "Todas las líneas"}</SelectItem>
              <SelectItem value="linea_dorada">{LINEA_LABEL.linea_dorada}</SelectItem>
              <SelectItem value="ref_motocarro">{LINEA_LABEL.ref_motocarro}</SelectItem>
              <SelectItem value="linea_azul">{LINEA_LABEL.linea_azul}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={unidadFiltro} onValueChange={setUnidadFiltro}>
            <SelectTrigger className="w-full md:w-56">
              <SelectValue placeholder="Compatible con…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="todas">
                {ar?.todasUnidades ?? "Todas las motos/unidades"}
              </SelectItem>
              {unidades.filter(u => u.piezas > 0).slice(0, 400).map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nombre} ({u.piezas})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1 rounded-md border p-0.5 bg-slate-50">
            <Button
              type="button"
              size="sm"
              variant={vista === "tarjetas" ? "default" : "ghost"}
              className="h-8"
              onClick={() => setVista("tarjetas")}
              title={ar?.vistaTarjetas ?? "Vista tarjetas"}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant={vista === "tabla" ? "default" : "ghost"}
              className="h-8"
              onClick={() => setVista("tabla")}
              title={ar?.vistaTabla ?? "Vista tabla"}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant={soloVisibles ? "default" : "outline"}
            onClick={() => setSoloVisibles(v => !v)}
            className="shrink-0"
          >
            {soloVisibles ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
            {ar?.soloVisibles ?? "Sólo visibles"}
          </Button>
          <Button
            variant={soloConCompat ? "default" : "outline"}
            onClick={() => setSoloConCompat(v => !v)}
            className="shrink-0"
          >
            <Bike className="h-4 w-4 mr-2" />
            {ar?.soloCompat ?? "Con compat."}
          </Button>
        </div>

        {unidadFiltro !== "todas" && unidadFiltroNombre && (
          <div className="flex items-center gap-2 text-sm bg-slate-50 border rounded-md px-3 py-2">
            <Bike className="h-4 w-4 text-[#1F3864]" />
            <span>
              {ar?.filtrandoUnidad ?? "Piezas compatibles con"}{" "}
              <strong>{unidadFiltroNombre}</strong>
            </span>
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setUnidadFiltro("todas")}>
              Quitar filtro
            </Button>
          </div>
        )}

        {vista === "tarjetas" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[65vh] overflow-auto pr-1">
            {filtered.map(p => {
              const conStock = p.stock > 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => abrirDetalle(p)}
                  className={cn(
                    "text-left rounded-lg border bg-white p-3 transition-all hover:border-[#1F3864] hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3864]",
                    !conStock && "opacity-90 bg-slate-50/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-mono text-sm font-bold text-[#1F3864]">{p.codigo_nuevo}</span>
                    <StockBadge stock={p.stock} />
                  </div>
                  <div className="text-sm font-medium leading-snug line-clamp-2 min-h-[2.5rem]">
                    {nombreProducto(p)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="font-normal">
                      {LINEA_LABEL[p.linea_catalogo] ?? p.linea_catalogo}
                    </Badge>
                    {p.marca && <span className="truncate max-w-[8rem]">{p.marca}</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold tabular-nums">{money(p.precio)}</span>
                    {p.num_compatibilidades > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-[#1F3864]">
                        <Bike className="h-3 w-3" />
                        {p.num_compatibilidades}
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        {ar?.compatPendiente ?? "Configurar compat."}
                      </span>
                    )}
                  </div>
                  {p.codigo_antiguo && (
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground truncate">
                      {p.codigo_antiguo}
                    </div>
                  )}
                </button>
              );
            })}
            {!loading && filtered.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-12">
                {ar?.vacio ?? "No hay productos con esos filtros"}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border overflow-auto max-h-[65vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar?.colNuevo ?? "Código nuevo"}</TableHead>
                  <TableHead>{ar?.colAntiguo ?? "Código antiguo"}</TableHead>
                  <TableHead>{ar?.colDesc ?? "Descripción"}</TableHead>
                  <TableHead>{ar?.colLinea ?? "Línea"}</TableHead>
                  <TableHead>{ar?.colMarca ?? "Marca"}</TableHead>
                  <TableHead className="text-right">{ar?.colPrecio ?? "Precio"}</TableHead>
                  <TableHead className="text-right">{ar?.colStock ?? "Stock"}</TableHead>
                  <TableHead className="text-center">{ar?.colCompat ?? "Compat."}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow
                    key={p.id}
                    className={cn(
                      "cursor-pointer hover:bg-slate-50",
                      !(p.stock > 0) && "bg-rose-50/40",
                    )}
                    onClick={() => abrirDetalle(p)}
                  >
                    <TableCell className="font-mono text-sm font-semibold">{p.codigo_nuevo}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.codigo_antiguo ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      <div className="truncate font-medium">{nombreProducto(p)}</div>
                      {p.categoria && (
                        <div className="text-xs text-muted-foreground truncate">{p.categoria}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{LINEA_LABEL[p.linea_catalogo] ?? p.linea_catalogo}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{p.marca ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(p.precio)}</TableCell>
                    <TableCell className="text-right">
                      <StockBadge stock={p.stock} />
                    </TableCell>
                    <TableCell className="text-center">
                      {p.num_compatibilidades > 0 ? (
                        <Badge variant="default">{p.num_compatibilidades}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                          {ar?.compatPendienteCorto ?? "Configurar"}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                      {ar?.vacio ?? "No hay productos con esos filtros"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {(ar?.mostrando ?? ((a: number, b: number) => `Mostrando ${a} de ${b}`))(
            filtered.length,
            rows.length,
          )}
        </p>
      </Card>

      <Dialog open={!!detalle} onOpenChange={open => { if (!open) { setDetalle(null); setEditandoCompat(false); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-[#1F3864]">{detalle.codigo_nuevo}</DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  {detalle.codigo_antiguo
                    ? `Antiguo: ${detalle.codigo_antiguo} · ${detalle.clave_completa}`
                    : detalle.clave_completa}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Precio</div>
                    <div className="text-lg font-semibold">{money(detalle.precio)}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Stock</div>
                    <div className="mt-1"><StockBadge stock={detalle.stock} /></div>
                  </div>
                </div>

                <section className="rounded-md border p-3 space-y-1.5 bg-slate-50/80">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {ar?.seccionDesc ?? "Descripción"}
                  </h3>
                  <p className="text-base font-medium leading-snug text-[#1F3864]">
                    {nombreProducto(detalle)}
                  </p>
                  {detalle.categoria && (
                    <p className="text-xs text-muted-foreground">{detalle.categoria}{detalle.marca ? ` · ${detalle.marca}` : ""}</p>
                  )}
                </section>

                <section className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Bike className="h-3.5 w-3.5" />
                      {ar?.seccionCompat ?? "Compatible con"}{" "}
                      ({editandoCompat ? compatDraft.length : compats.length})
                    </h3>
                    {!editandoCompat && (
                      <Button type="button" size="sm" variant="outline" className="h-7" onClick={empezarEditarCompat}>
                        <Pencil className="h-3 w-3 mr-1.5" />
                        {compats.length === 0
                          ? (ar?.configurarCompat ?? "Configurar")
                          : (ar?.editarCompat ?? "Editar")}
                      </Button>
                    )}
                  </div>

                  {!editandoCompat && (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {ar?.compatHint ??
                          "Cada moto/unidad se reutiliza en el catálogo. Pulsa una para ver todas las refacciones compatibles con ella."}
                      </p>
                      {compats.length === 0 ? (
                        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/60 p-3 space-y-2">
                          <p className="text-sm text-amber-900">
                            {ar?.sinCompatConfig ??
                              "Esta pieza aún no tiene motos compatibles. Configúralas para poder filtrar el inventario por unidad."}
                          </p>
                          <Button type="button" size="sm" onClick={empezarEditarCompat}>
                            <Plus className="h-4 w-4 mr-1.5" />
                            {ar?.configurarCompat ?? "Configurar compatibilidad"}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {compats.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => filtrarPorUnidad(c.id)}
                              className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-left text-sm hover:border-[#1F3864] hover:bg-[#EFF6FF] transition-colors"
                              title="Ver otras piezas compatibles con esta unidad"
                            >
                              <span className="font-medium">{c.nombre}</span>
                              {c.piezas_compartidas != null && c.piezas_compartidas > 0 && (
                                <span className="text-[11px] text-muted-foreground tabular-nums">
                                  {c.piezas_compartidas} pzas
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {editandoCompat && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        {ar?.compatEditHint ??
                          "Agrega motos/unidades existentes o escribe un nombre nuevo. Al guardar se actualiza el catálogo."}
                      </p>
                      {compatDraft.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {compatDraft.map(nombre => (
                            <span
                              key={nombre}
                              className="inline-flex items-center gap-1 rounded-md border bg-white pl-2.5 pr-1 py-1 text-sm"
                            >
                              {nombre}
                              <button
                                type="button"
                                className="rounded p-0.5 hover:bg-rose-50 text-muted-foreground hover:text-rose-600"
                                onClick={() => quitarUnidadDraft(nombre)}
                                aria-label={`Quitar ${nombre}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          {ar?.compatVaciaEdit ?? "Sin unidades todavía — agrega al menos una."}
                        </p>
                      )}

                      <div className="flex gap-2">
                        <Input
                          list="unidades-refacciones-sugeridas"
                          placeholder={ar?.compatPlaceholder ?? "Ej. GS150, FT-125, DIABOLO 150…"}
                          value={nuevaUnidad}
                          onChange={e => setNuevaUnidad(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              agregarUnidadDraft(nuevaUnidad);
                            }
                          }}
                        />
                        <datalist id="unidades-refacciones-sugeridas">
                          {unidades.slice(0, 800).map(u => (
                            <option key={u.id} value={u.nombre} />
                          ))}
                        </datalist>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => agregarUnidadDraft(nuevaUnidad)}
                          disabled={!nuevaUnidad.trim()}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {unidadesSugeridas.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {ar?.compatSugeridas ?? "Del catálogo"}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {unidadesSugeridas.map(u => (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => agregarUnidadDraft(u.nombre)}
                                className="text-xs rounded-md border px-2 py-1 hover:border-[#1F3864] hover:bg-[#EFF6FF]"
                              >
                                {u.nombre}
                                {u.piezas > 0 && (
                                  <span className="ml-1 text-muted-foreground">({u.piezas})</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button type="button" onClick={guardarCompat} disabled={guardandoCompat}>
                          <Save className="h-4 w-4 mr-1.5" />
                          {guardandoCompat
                            ? (ar?.guardandoCompat ?? "Guardando…")
                            : (ar?.guardarCompat ?? "Guardar compatibilidad")}
                        </Button>
                        <Button type="button" variant="ghost" onClick={cancelarEditarCompat} disabled={guardandoCompat}>
                          {ar?.cancelarCompat ?? "Cancelar"}
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
