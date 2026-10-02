import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
import { Package, Search, Upload, Bike, RefreshCw, Eye, EyeOff, Wand2 } from "lucide-react";
import { extractCompat, parseListaPreciosRefacciones } from "@/lib/refaccionesParser";
import { explicarError } from "@/lib/dazon";

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
  unidad_medida: string | null;
  precio: number | null;
  stock: number;
  stock_bloqueado?: number | null;
  stock_disponible?: number | null;
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

const LINEA_LABEL: Record<string, string> = {
  linea_dorada: "Línea dorada",
  ref_motocarro: "Ref. motocarro",
  linea_azul: "Línea azul",
};

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
      .filter(u => u.piezas > 0)
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
      toast.error(explicarError(error, t.almacenRefacciones?.errorCargar ?? "Error al cargar"));
      setRows([]);
    } else {
      setRows(((data as unknown) as Producto[]) ?? []);
    }
    setLoading(false);
    void loadUnidades();
  }, [t, loadUnidades]);

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
    const orden = ["linea_dorada", "ref_motocarro", "linea_azul"];
    return rows.filter(r => {
      if (linea !== "todas" && r.linea_catalogo !== linea) return false;
      if (soloVisibles && !r.visible_venta) return false;
      if (soloConCompat && !(r.num_compatibilidades > 0)) return false;
      if (unidadFiltro !== "todas" && !idsPorUnidad.has(r.id)) return false;
      if (!term) return true;
      const blob = [
        r.codigo_nuevo, r.codigo_antiguo, r.clave_completa,
        r.descripcion, r.descripcion_corta, r.categoria, r.marca,
      ].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(term);
    }).sort((a, b) => orden.indexOf(a.linea_catalogo) - orden.indexOf(b.linea_catalogo) || a.codigo_nuevo.localeCompare(b.codigo_nuevo));
  }, [rows, q, linea, soloVisibles, soloConCompat, unidadFiltro, idsPorUnidad]);

  const stats = useMemo(() => {
    const dual = rows.filter(r => r.codigo_antiguo).length;
    const conCompat = rows.filter(r => r.num_compatibilidades > 0).length;
    const stock = rows.reduce((s, r) => s + (r.stock || 0), 0);
    const apartado = rows.reduce((s, r) => s + (r.stock_bloqueado || 0), 0);
    return { total: rows.length, dual, conCompat, stock, apartado, unidades: unidades.length };
  }, [rows, unidades]);

  const abrirDetalle = async (p: Producto) => {
    setDetalle(p);
    setCompats([]);
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
    setCompats(base.sort((a, b) => a.nombre.localeCompare(b.nombre)));
  };

  const filtrarPorUnidad = (unidadId: string) => {
    setUnidadFiltro(unidadId);
    setDetalle(null);
    setSoloConCompat(true);
  };

  const onImport = async (file: File) => {
    setImportando(true);
    try {
      const buf = await file.arrayBuffer();
      const items = await parseListaPreciosRefacciones(buf);
      if (!items.length) {
        toast.error(t.almacenRefacciones?.sinProductos ?? "No se encontraron productos en el Excel");
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
      toast.success(
        (t.almacenRefacciones?.okImportados ?? ((n: number) => `Importados ${n} productos`))(procesados),
      );
      await load();
    } catch (e: any) {
      toast.error(explicarError(e, t.almacenRefacciones?.errorImportar ?? "Error al importar"));
    } finally {
      setImportando(false);
    }
  };

  /** Vuelve a extraer descripción vs compatibilidades de lo ya cargado. */
  const reprocesarCompat = async () => {
    setReprocesando(true);
    try {
      const payload = rows.map(r => {
        const { corta, comps } = extractCompat(r.descripcion);
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
        (t.almacenRefacciones?.okReprocesados ?? ((n: number) => `Compatibilidades actualizadas en ${n} productos`))(procesados),
      );
      await load();
    } catch (e: any) {
      toast.error(explicarError(e, t.almacenRefacciones?.errorReprocesar ?? "Error al reprocesar"));
    } finally {
      setReprocesando(false);
    }
  };

  if (!puedeVerRefacciones) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t.almacenRefacciones?.sinAcceso ?? "No tienes acceso a este módulo."}
      </div>
    );
  }

  const money = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

  const unidadFiltroNombre = unidades.find(u => u.id === unidadFiltro)?.nombre;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Package className="h-7 w-7" />
            {t.almacenRefacciones?.titulo ?? "Inventario de refacciones"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {t.almacenRefacciones?.subtitulo ??
              "Catálogo de venta independiente. Descripción del producto y motos/unidades compatibles reutilizables."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {t.almacenRefacciones?.actualizar ?? "Actualizar"}
          </Button>
          <Button variant="outline" onClick={reprocesarCompat} disabled={reprocesando || !rows.length}>
            <Wand2 className={`h-4 w-4 mr-2 ${reprocesando ? "animate-spin" : ""}`} />
            {reprocesando
              ? (t.almacenRefacciones?.reprocesando ?? "Reprocesando…")
              : (t.almacenRefacciones?.reprocesar ?? "Actualizar compatibilidades")}
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
                ? (t.almacenRefacciones?.importando ?? "Importando…")
                : (t.almacenRefacciones?.importar ?? "Importar lista")}
            </label>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t.almacenRefacciones?.statProductos ?? "Productos"}</div>
          <div className="text-2xl font-bold text-primary">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t.almacenRefacciones?.statDual ?? "Con código dual"}</div>
          <div className="text-2xl font-bold text-primary">{stats.dual}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t.almacenRefacciones?.statCompat ?? "Con compatibilidad"}</div>
          <div className="text-2xl font-bold text-primary">{stats.conCompat}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t.almacenRefacciones?.statUnidades ?? "Motos/unidades"}</div>
          <div className="text-2xl font-bold text-primary">{stats.unidades}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t.almacenRefacciones?.statStock ?? "Piezas en stock"}</div>
          <div className="text-2xl font-bold text-primary">{stats.stock.toLocaleString("es-MX")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t.almacenRefacciones?.statApartado ?? "Apartadas en remisión"}</div>
          <div className="text-2xl font-bold text-amber-700">{stats.apartado.toLocaleString("es-MX")}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t.almacenRefacciones?.buscar ?? "Buscar por código, descripción o moto…"}
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <Select value={linea} onValueChange={setLinea}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{t.almacenRefacciones?.todasLineas ?? "Todas las líneas"}</SelectItem>
              <SelectItem value="linea_dorada">{LINEA_LABEL.linea_dorada}</SelectItem>
              <SelectItem value="ref_motocarro">{LINEA_LABEL.ref_motocarro}</SelectItem>
              <SelectItem value="linea_azul">{LINEA_LABEL.linea_azul}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={unidadFiltro} onValueChange={setUnidadFiltro}>
            <SelectTrigger className="w-full md:w-64">
              <SelectValue placeholder="Compatible con…" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="todas">
                {t.almacenRefacciones?.todasUnidades ?? "Todas las motos/unidades"}
              </SelectItem>
              {unidades.slice(0, 400).map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nombre} ({u.piezas})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={soloVisibles ? "default" : "outline"}
            onClick={() => setSoloVisibles(v => !v)}
            className="shrink-0"
          >
            {soloVisibles ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
            {t.almacenRefacciones?.soloVisibles ?? "Sólo visibles"}
          </Button>
          <Button
            variant={soloConCompat ? "default" : "outline"}
            onClick={() => setSoloConCompat(v => !v)}
            className="shrink-0"
          >
            <Bike className="h-4 w-4 mr-2" />
            {t.almacenRefacciones?.soloCompat ?? "Con compat."}
          </Button>
        </div>

        {unidadFiltro !== "todas" && unidadFiltroNombre && (
          <div className="flex items-center gap-2 text-sm bg-slate-50 border rounded-3xl px-3 py-2">
            <Bike className="h-4 w-4 text-primary" />
            <span>
              {t.almacenRefacciones?.filtrandoUnidad ?? "Piezas compatibles con"}{" "}
              <strong>{unidadFiltroNombre}</strong>
            </span>
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setUnidadFiltro("todas")}>
              Quitar filtro
            </Button>
          </div>
        )}

        <div className="rounded-3xl border overflow-auto max-h-[65vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.almacenRefacciones?.colNuevo ?? "Código nuevo"}</TableHead>
                <TableHead>{t.almacenRefacciones?.colAntiguo ?? "Código antiguo"}</TableHead>
                <TableHead>{t.almacenRefacciones?.colDesc ?? "Descripción"}</TableHead>
                <TableHead>{t.almacenRefacciones?.colLinea ?? "Línea"}</TableHead>
                <TableHead>{t.almacenRefacciones?.colMarca ?? "Marca"}</TableHead>
                <TableHead className="text-right">{t.almacenRefacciones?.colPrecio ?? "Precio"}</TableHead>
                <TableHead className="text-right">{t.almacenRefacciones?.colStock ?? "Stock"}</TableHead>
                <TableHead className="text-right">{t.almacenRefacciones?.colDisponible ?? "Disponible"}</TableHead>
                <TableHead className="text-center">{t.almacenRefacciones?.colCompat ?? "Compat."}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p, i) => {
                const previa = i > 0 ? filtered[i - 1].linea_catalogo : "";
                const titulo = LINEA_LABEL[p.linea_catalogo] ?? p.linea_catalogo;
                return (
                <Fragment key={p.id}>
                {p.linea_catalogo !== previa && (
                  <TableRow className="bg-primary/5 hover:bg-primary/5">
                    <TableCell colSpan={9} className="font-semibold text-primary">{titulo}</TableCell>
                  </TableRow>
                )}
                <TableRow
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => abrirDetalle(p)}
                >
                  <TableCell className="font-mono text-sm font-semibold">{p.codigo_nuevo}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.codigo_antiguo ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <div className="truncate font-medium">{p.descripcion_corta || p.descripcion}</div>
                    {p.categoria && (
                      <div className="text-xs text-muted-foreground truncate">{p.categoria}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{LINEA_LABEL[p.linea_catalogo] ?? p.linea_catalogo}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{p.marca ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(p.precio)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div>{p.stock}</div>
                    {(p.stock_bloqueado ?? 0) > 0 && (
                      <div className="text-[11px] text-amber-700">{p.stock_bloqueado} apart.</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.stock_disponible ?? p.stock}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={p.num_compatibilidades > 0 ? "default" : "secondary"}>
                      {p.num_compatibilidades}
                    </Badge>
                  </TableCell>
                </TableRow>
                </Fragment>
              );})}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    {t.almacenRefacciones?.vacio ?? "No hay productos con esos filtros"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          {(t.almacenRefacciones?.mostrando ?? ((a: number, b: number) => `Mostrando ${a} de ${b}`))(
            filtered.length,
            rows.length,
          )}
        </p>
      </Card>

      <Dialog open={!!detalle} onOpenChange={open => { if (!open) setDetalle(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-primary">{detalle.codigo_nuevo}</DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  {detalle.codigo_antiguo
                    ? `Antiguo: ${detalle.codigo_antiguo} · ${detalle.clave_completa}`
                    : detalle.clave_completa}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-3xl border p-3">
                    <div className="text-xs text-muted-foreground">Precio</div>
                    <div className="text-lg font-semibold">{money(detalle.precio)}</div>
                  </div>
                  <div className="rounded-3xl border p-3">
                    <div className="text-xs text-muted-foreground">Stock</div>
                    <div className="text-lg font-semibold">{detalle.stock}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t.almacenRefacciones?.colDisponible ?? "Disponible"}: {detalle.stock_disponible ?? detalle.stock}
                      {(detalle.stock_bloqueado ?? 0) > 0 ? ` · ${detalle.stock_bloqueado} apart.` : ""}
                    </div>
                  </div>
                </div>

                <section className="rounded-3xl border p-3 space-y-1.5 bg-slate-50/80">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.almacenRefacciones?.seccionDesc ?? "Descripción del producto"}
                  </h3>
                  <p className="text-base font-medium leading-snug text-primary">
                    {detalle.descripcion_corta || detalle.descripcion}
                  </p>
                  {detalle.categoria && (
                    <p className="text-xs text-muted-foreground">{detalle.categoria}{detalle.marca ? ` · ${detalle.marca}` : ""}</p>
                  )}
                </section>

                <section className="rounded-3xl border p-3 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Bike className="h-3.5 w-3.5" />
                    {t.almacenRefacciones?.seccionCompat ?? "Compatible con"} ({compats.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t.almacenRefacciones?.compatHint ??
                      "Cada moto/unidad se reutiliza en el catálogo. Pulsa una para ver todas las refacciones compatibles con ella."}
                  </p>
                  {compats.length === 0 ? (
                    <p className="text-muted-foreground text-sm py-2">
                      {t.almacenRefacciones?.sinCompat ?? "Sin unidades parseadas — usa «Actualizar compatibilidades»."}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {compats.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => filtrarPorUnidad(c.id)}
                          className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1.5 text-left text-sm hover:border-primary hover:bg-[#EFF6FF] transition-colors"
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
                </section>

                {detalle.descripcion !== detalle.descripcion_corta && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground">
                      {t.almacenRefacciones?.verOriginal ?? "Ver texto original del Excel"}
                    </summary>
                    <p className="mt-2 leading-relaxed whitespace-pre-wrap">{detalle.descripcion}</p>
                  </details>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
