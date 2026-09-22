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
import { Package, Search, Upload, Bike, RefreshCw, Eye, EyeOff } from "lucide-react";
import { parseListaPreciosRefacciones } from "@/lib/refaccionesParser";
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
  visible_venta: boolean;
  num_compatibilidades: number;
};

type Compat = { id: string; nombre: string; tipo_unidad: string | null };

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
  const [importando, setImportando] = useState(false);
  const [detalle, setDetalle] = useState<Producto | null>(null);
  const [compats, setCompats] = useState<Compat[]>([]);

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
  }, [t]);

  useEffect(() => {
    if (puedeVerRefacciones) load();
  }, [puedeVerRefacciones, load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter(r => {
      if (linea !== "todas" && r.linea_catalogo !== linea) return false;
      if (soloVisibles && !r.visible_venta) return false;
      if (soloConCompat && !(r.num_compatibilidades > 0)) return false;
      if (!term) return true;
      const blob = [
        r.codigo_nuevo, r.codigo_antiguo, r.clave_completa,
        r.descripcion, r.descripcion_corta, r.categoria, r.marca,
      ].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(term);
    });
  }, [rows, q, linea, soloVisibles, soloConCompat]);

  const stats = useMemo(() => {
    const dual = rows.filter(r => r.codigo_antiguo).length;
    const conCompat = rows.filter(r => r.num_compatibilidades > 0).length;
    const stock = rows.reduce((s, r) => s + (r.stock || 0), 0);
    return { total: rows.length, dual, conCompat, stock };
  }, [rows]);

  const abrirDetalle = async (p: Producto) => {
    setDetalle(p);
    const { data } = await supabase
      .from("almacen_refacciones_producto_compat" as any)
      .select("unidad_id, almacen_refacciones_unidades(id, nombre, tipo_unidad)")
      .eq("producto_id", p.id);
    const list: Compat[] = ((data as any[]) ?? []).map(x => ({
      id: x.almacen_refacciones_unidades?.id ?? x.unidad_id,
      nombre: x.almacen_refacciones_unidades?.nombre ?? "—",
      tipo_unidad: x.almacen_refacciones_unidades?.tipo_unidad ?? null,
    }));
    setCompats(list);
  };

  const onImport = async (file: File) => {
    setImportando(true);
    try {
      const buf = await file.arrayBuffer();
      const items = parseListaPreciosRefacciones(buf);
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

  if (!puedeVerRefacciones) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t.almacenRefacciones?.sinAcceso ?? "No tienes acceso a este módulo."}
      </div>
    );
  }

  const money = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3864] flex items-center gap-2">
            <Package className="h-7 w-7" />
            {t.almacenRefacciones?.titulo ?? "Almacén de refacciones"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t.almacenRefacciones?.subtitulo ??
              "Catálogo de venta con código nuevo/antiguo y compatibilidades por unidad"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {t.almacenRefacciones?.actualizar ?? "Actualizar"}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t.almacenRefacciones?.statProductos ?? "Productos"}</div>
          <div className="text-2xl font-bold text-[#1F3864]">{stats.total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t.almacenRefacciones?.statDual ?? "Con código dual"}</div>
          <div className="text-2xl font-bold text-[#1F3864]">{stats.dual}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t.almacenRefacciones?.statCompat ?? "Con compatibilidad"}</div>
          <div className="text-2xl font-bold text-[#1F3864]">{stats.conCompat}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{t.almacenRefacciones?.statStock ?? "Piezas en stock"}</div>
          <div className="text-2xl font-bold text-[#1F3864]">{stats.stock.toLocaleString("es-MX")}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t.almacenRefacciones?.buscar ?? "Buscar por código nuevo, antiguo, descripción o moto…"}
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <Select value={linea} onValueChange={setLinea}>
            <SelectTrigger className="w-full md:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{t.almacenRefacciones?.todasLineas ?? "Todas las líneas"}</SelectItem>
              <SelectItem value="linea_dorada">{LINEA_LABEL.linea_dorada}</SelectItem>
              <SelectItem value="ref_motocarro">{LINEA_LABEL.ref_motocarro}</SelectItem>
              <SelectItem value="linea_azul">{LINEA_LABEL.linea_azul}</SelectItem>
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

        <div className="rounded-md border overflow-auto max-h-[65vh]">
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
                <TableHead className="text-center">{t.almacenRefacciones?.colCompat ?? "Compat."}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow
                  key={p.id}
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
                  <TableCell className="text-right tabular-nums">{p.stock}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={p.num_compatibilidades > 0 ? "default" : "secondary"}>
                      {p.num_compatibilidades}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">{detalle.codigo_nuevo}</DialogTitle>
                <DialogDescription>{detalle.descripcion_corta || detalle.descripcion}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Código antiguo</div>
                    <div className="font-mono">{detalle.codigo_antiguo ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Clave completa</div>
                    <div className="font-mono text-xs">{detalle.clave_completa}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Precio</div>
                    <div>{money(detalle.precio)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Stock</div>
                    <div>{detalle.stock}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Descripción completa</div>
                  <p className="text-sm leading-relaxed">{detalle.descripcion}</p>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <Bike className="h-3.5 w-3.5" />
                    Compatibilidades ({compats.length})
                  </div>
                  {compats.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Sin unidades parseadas aún</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {compats.map(c => (
                        <Badge key={c.id} variant="outline" className="font-normal">
                          {c.nombre}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
