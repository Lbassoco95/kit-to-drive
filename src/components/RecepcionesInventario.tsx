import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { fdb } from "@/lib/finanzasDb";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { explicarError } from "@/lib/dazon";
import {
  TIPOS_LINEA,
  estatusCompra,
  faltanteLinea,
  type EstatusCompra,
  type LineaCompraEstado,
  type TipoLineaRecepcion,
} from "@/lib/recepcionInventario";

type Compra = {
  id: string;
  folio: string;
  proveedor_id: string | null;
  contenedor_id: string | null;
  fecha: string;
  estatus: EstatusCompra;
  notas: string | null;
};

type CompraLinea = LineaCompraEstado & {
  id: string;
  compra_id: string;
  tipo: TipoLineaRecepcion;
  descripcion: string | null;
  modelo: string | null;
  color: string | null;
  notas: string | null;
};

type Documento = {
  id: string;
  folio: string;
  contenedor_id: string;
  folio_contenedor: string;
  compra_id: string | null;
  origen: "excel" | "manual" | "partes";
  fecha: string;
  notas: string | null;
};

type DocumentoLinea = {
  id: string;
  documento_id: string;
  tipo: TipoLineaRecepcion;
  clave: string;
  modelo: string | null;
  color: string | null;
  cantidad_esperada: number;
  cantidad_recibida: number;
};

type LineaForm = {
  tipo: TipoLineaRecepcion;
  descripcion: string;
  modelo: string;
  color: string;
  cantidad: string;
};

const LINEA_VACIA: LineaForm = { tipo: "chasis", descripcion: "", modelo: "", color: "", cantidad: "1" };

const ESTATUS_COLOR: Record<EstatusCompra, string> = {
  abierta: "bg-slate-100 text-slate-700",
  parcial: "bg-amber-100 text-amber-800",
  completa: "bg-emerald-100 text-emerald-800",
  ajustada: "bg-sky-100 text-sky-800",
};

export function RecepcionesInventario() {
  const { t } = useLang();
  const { perms } = useAuth();
  const r = t.inventario.recepciones;
  const puedeCapturar = perms.esAdminGlobal || perms.area === "compras" || perms.area === "administracion" || perms.area === "fabrica";
  const puedeAjustar = perms.esAdminGlobal || perms.area === "compras" || perms.area === "administracion";

  const [compras, setCompras] = useState<Compra[]>([]);
  const [lineas, setLineas] = useState<CompraLinea[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [proveedores, setProveedores] = useState<{ id: string; nombre_comercial: string }[]>([]);
  const [contenedores, setContenedores] = useState<{ id: string; folio_contenedor: string }[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DocumentoLinea[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [alta, setAlta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [folio, setFolio] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [proveedorId, setProveedorId] = useState("");
  const [contenedorId, setContenedorId] = useState("");
  const [notas, setNotas] = useState("");
  const [formLineas, setFormLineas] = useState<LineaForm[]>([{ ...LINEA_VACIA }]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [c, l, d, p, k] = await Promise.all([
      fdb.from("compras").select("id, folio, proveedor_id, contenedor_id, fecha, estatus, notas").order("created_at", { ascending: false }).limit(200),
      fdb.from("compra_lineas").select("id, compra_id, tipo, descripcion, modelo, color, cantidad_pedida, cantidad_recibida, cantidad_ajustada, notas").order("created_at").limit(1000),
      fdb.from("documentos_inventario").select("id, folio, contenedor_id, folio_contenedor, compra_id, origen, fecha, notas").order("created_at", { ascending: false }).limit(200),
      fdb.from("proveedores").select("id, nombre_comercial").eq("activo", true).order("nombre_comercial").limit(500),
      fdb.from("contenedores").select("id, folio_contenedor").order("created_at", { ascending: false }).limit(200),
    ]);
    const error = c.error || l.error || d.error || p.error || k.error;
    if (error) toast.error(explicarError(error, r.errorCargar));
    setCompras((c.data ?? []) as Compra[]);
    setLineas((l.data ?? []) as CompraLinea[]);
    setDocumentos((d.data ?? []) as Documento[]);
    setProveedores((p.data ?? []) as { id: string; nombre_comercial: string }[]);
    setContenedores((k.data ?? []) as { id: string; folio_contenedor: string }[]);
    setCargando(false);
  }, [r.errorCargar]);

  useEffect(() => { void cargar(); }, [cargar]);

  const lineasPorCompra = useMemo(() => {
    const map = new Map<string, CompraLinea[]>();
    for (const linea of lineas) {
      const grupo = map.get(linea.compra_id) ?? [];
      grupo.push(linea);
      map.set(linea.compra_id, grupo);
    }
    return map;
  }, [lineas]);

  const folioCompra = (id: string | null) => compras.find(c => c.id === id)?.folio ?? "—";
  const folioContenedor = (id: string | null) => contenedores.find(c => c.id === id)?.folio_contenedor ?? "—";
  const nombreProveedor = (id: string | null) => proveedores.find(p => p.id === id)?.nombre_comercial ?? "—";

  const verDocumento = async (doc: Documento) => {
    if (abierto === doc.id) { setAbierto(null); return; }
    setAbierto(doc.id);
    setDetalle([]);
    setCargandoDetalle(true);
    const { data, error } = await fdb
      .from("documento_inventario_lineas")
      .select("id, documento_id, tipo, clave, modelo, color, cantidad_esperada, cantidad_recibida")
      .eq("documento_id", doc.id)
      .order("tipo")
      .order("clave")
      .limit(1000);
    setCargandoDetalle(false);
    if (error) { toast.error(explicarError(error, r.errorCargar)); return; }
    setDetalle((data ?? []) as DocumentoLinea[]);
  };

  const guardarCompra = async () => {
    if (!folio.trim()) { toast.error(r.folioRequerido); return; }
    const payload = formLineas.map(l => ({
      tipo: l.tipo,
      descripcion: l.descripcion.trim() || null,
      modelo: l.modelo.trim() || null,
      color: l.color.trim() || null,
      cantidad_pedida: Number(l.cantidad),
    }));
    if (payload.some(l => (!l.descripcion && !l.modelo) || !Number.isInteger(l.cantidad_pedida) || l.cantidad_pedida <= 0)) {
      toast.error(r.lineaInvalida);
      return;
    }
    setGuardando(true);
    const { error } = await fdb.rpc("crear_compra", {
      _folio: folio.trim(),
      _proveedor_id: proveedorId || null,
      _contenedor_id: contenedorId || null,
      _fecha: fecha,
      _notas: notas.trim() || null,
      _lineas: payload,
    });
    setGuardando(false);
    if (error) { toast.error(explicarError(error, r.errorCompra)); return; }
    toast.success(r.okCompra);
    setAlta(false);
    setFolio("");
    setNotas("");
    setProveedorId("");
    setContenedorId("");
    setFormLineas([{ ...LINEA_VACIA }]);
    void cargar();
  };

  const ajustar = async (linea: CompraLinea, accion: "aceptar_llegada" | "seguir_pendiente") => {
    const nota = accion === "aceptar_llegada" ? r.notaAceptar(linea.cantidad_recibida) : r.notaReabrir;
    const { error } = await fdb.rpc("ajustar_compra_faltante", {
      _compra_linea_id: linea.id,
      _accion: accion,
      _notas: nota,
    });
    if (error) { toast.error(explicarError(error, r.errorAjuste)); return; }
    toast.success(r.okAjuste);
    void cargar();
  };

  return (
    <div className="space-y-4 mt-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#1F3864]" /> {r.documentos}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{r.documentosAyuda}</p>
          </div>
        </div>
        {cargando ? <p className="text-sm text-muted-foreground">{r.cargando}</p> : (
          <div className="border rounded-lg overflow-hidden max-h-[50vh] overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0">
                <TableRow>
                  <TableHead>{r.colFolio}</TableHead>
                  <TableHead>{r.colFecha}</TableHead>
                  <TableHead>{r.colContenedor}</TableHead>
                  <TableHead>{r.colCompra}</TableHead>
                  <TableHead>{r.colOrigen}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.map(doc => (
                  <Fragment key={doc.id}>
                    <TableRow>
                      <TableCell className="font-mono font-medium">{doc.folio}</TableCell>
                      <TableCell>{doc.fecha}</TableCell>
                      <TableCell>{doc.folio_contenedor}</TableCell>
                      <TableCell>{folioCompra(doc.compra_id)}</TableCell>
                      <TableCell>{r.origen[doc.origen]}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => void verDocumento(doc)}>
                          {abierto === doc.id ? r.ocultar : r.ver}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {abierto === doc.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-slate-50">
                          {doc.notas && <p className="text-sm mb-2">{doc.notas}</p>}
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{r.colTipo}</TableHead>
                                <TableHead>{r.colClave}</TableHead>
                                <TableHead>{r.colModelo}</TableHead>
                                <TableHead>{r.colColor}</TableHead>
                                <TableHead className="text-right">{r.colEsperada}</TableHead>
                                <TableHead className="text-right">{r.colRecibida}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detalle.map(l => {
                                const corta = l.cantidad_recibida < l.cantidad_esperada;
                                return (
                                  <TableRow key={l.id}>
                                    <TableCell>{r.tipo[l.tipo]}</TableCell>
                                    <TableCell className="font-mono text-xs">{l.clave}</TableCell>
                                    <TableCell>{l.modelo ?? "—"}</TableCell>
                                    <TableCell>{l.color ?? "—"}</TableCell>
                                    <TableCell className="text-right">{l.cantidad_esperada}</TableCell>
                                    <TableCell className={`text-right font-medium ${corta ? "text-[#C0392B]" : "text-[#065F46]"}`}>
                                      {l.cantidad_recibida}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                              {detalle.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={6} className="text-muted-foreground">{cargandoDetalle ? r.cargando : r.vacioDocumento}</TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                {documentos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{r.vacioDocumentos}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-[#065F46]" /> {r.compras}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{r.comprasAyuda}</p>
          </div>
          {puedeCapturar && (
            <Button onClick={() => setAlta(true)} className="bg-[#065F46] hover:bg-[#054c38]">
              <Plus className="h-4 w-4 mr-2" /> {r.nuevaCompra}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {compras.map(compra => {
            const grupo = lineasPorCompra.get(compra.id) ?? [];
            const estatus = estatusCompra(grupo);
            return (
              <div key={compra.id} className="border rounded-lg p-3">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-bold text-[#1F3864]">{compra.folio}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTATUS_COLOR[estatus]}`}>{r.estatus[estatus]}</span>
                  <span className="text-sm text-muted-foreground">{compra.fecha}</span>
                  <span className="text-sm text-muted-foreground">{nombreProveedor(compra.proveedor_id)}</span>
                  <span className="text-sm text-muted-foreground">{r.contenedor}: {folioContenedor(compra.contenedor_id)}</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{r.colTipo}</TableHead>
                      <TableHead>{r.colDescripcion}</TableHead>
                      <TableHead className="text-right">{r.colPedida}</TableHead>
                      <TableHead className="text-right">{r.colRecibida}</TableHead>
                      <TableHead className="text-right">{r.colFaltante}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grupo.map(linea => {
                      const faltante = faltanteLinea(linea);
                      const aceptada = linea.cantidad_ajustada != null && linea.cantidad_ajustada < linea.cantidad_pedida;
                      return (
                        <TableRow key={linea.id}>
                          <TableCell>{r.tipo[linea.tipo]}</TableCell>
                          <TableCell>
                            {linea.descripcion || linea.modelo || "—"}
                            {linea.modelo && linea.descripcion ? <span className="text-muted-foreground"> · {linea.modelo}</span> : null}
                            {linea.color ? <span className="text-muted-foreground"> · {linea.color}</span> : null}
                          </TableCell>
                          <TableCell className="text-right">
                            {linea.cantidad_pedida}
                            {aceptada && <div className="text-xs text-sky-700">{r.objetivo(linea.cantidad_ajustada ?? 0)}</div>}
                          </TableCell>
                          <TableCell className="text-right">{linea.cantidad_recibida}</TableCell>
                          <TableCell className={`text-right font-medium ${faltante > 0 ? "text-[#C0392B]" : "text-[#065F46]"}`}>
                            {faltante}
                          </TableCell>
                          <TableCell className="text-right">
                            {puedeAjustar && faltante > 0 && (
                              <Button size="sm" variant="outline" onClick={() => void ajustar(linea, "aceptar_llegada")}>
                                {r.aceptarLlegada}
                              </Button>
                            )}
                            {puedeAjustar && aceptada && (
                              <Button size="sm" variant="ghost" onClick={() => void ajustar(linea, "seguir_pendiente")}>
                                {r.reabrir}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })}
          {!cargando && compras.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">{r.vacioCompras}</p>
          )}
        </div>
      </Card>

      <Dialog open={alta} onOpenChange={setAlta}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{r.nuevaCompra}</DialogTitle>
            <DialogDescription>{r.comprasAyuda}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>{r.folio}</Label>
              <Input value={folio} onChange={e => setFolio(e.target.value)} maxLength={50} className="h-11" placeholder="OC-2026-014" />
            </div>
            <div>
              <Label>{r.fecha}</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-11" />
            </div>
            <div>
              <Label>{r.proveedor}</Label>
              <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{r.sinProveedor}</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre_comercial}</option>)}
              </select>
            </div>
            <div>
              <Label>{r.contenedor}</Label>
              <select value={contenedorId} onChange={e => setContenedorId(e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{r.sinContenedor}</option>
                {contenedores.map(c => <option key={c.id} value={c.id}>{c.folio_contenedor}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <Label>{r.notas}</Label>
              <Textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{r.lineas}</p>
              <Button size="sm" variant="outline" onClick={() => setFormLineas(prev => [...prev, { ...LINEA_VACIA }])}>{r.agregarLinea}</Button>
            </div>
            {formLineas.map((linea, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <select
                  value={linea.tipo}
                  onChange={e => setFormLineas(prev => prev.map((l, idx) => idx === i ? { ...l, tipo: e.target.value as TipoLineaRecepcion } : l))}
                  className="col-span-2 h-10 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {TIPOS_LINEA.map(tipo => <option key={tipo} value={tipo}>{r.tipo[tipo]}</option>)}
                </select>
                <Input className="col-span-3 h-10" placeholder={r.colDescripcion} value={linea.descripcion} onChange={e => setFormLineas(prev => prev.map((l, idx) => idx === i ? { ...l, descripcion: e.target.value } : l))} />
                <Input className="col-span-3 h-10" placeholder={r.colModelo} value={linea.modelo} onChange={e => setFormLineas(prev => prev.map((l, idx) => idx === i ? { ...l, modelo: e.target.value } : l))} />
                <Input className="col-span-2 h-10" placeholder={r.colColor} value={linea.color} onChange={e => setFormLineas(prev => prev.map((l, idx) => idx === i ? { ...l, color: e.target.value } : l))} />
                <Input className="col-span-1 h-10" type="number" min={1} value={linea.cantidad} onChange={e => setFormLineas(prev => prev.map((l, idx) => idx === i ? { ...l, cantidad: e.target.value } : l))} />
                <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setFormLineas(prev => prev.filter((_, idx) => idx !== i))} disabled={formLineas.length === 1}>
                  <Trash2 className="h-4 w-4 text-[#C0392B]" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlta(false)}>{r.cancelar}</Button>
            <Button onClick={() => void guardarCompra()} disabled={guardando} className="bg-[#065F46] hover:bg-[#054c38]">
              {guardando ? r.guardando : r.guardar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
