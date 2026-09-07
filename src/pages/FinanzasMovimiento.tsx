// Expediente de un movimiento: datos, contraparte, quién movió el dinero,
// comprobación del efectivo, documentos y bitácora.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowDownCircle, ArrowUpCircle, CheckCircle2, XCircle, Pencil,
  Trash2, AlertTriangle, HandCoins, ScrollText, Wallet, User, Building2,
} from "lucide-react";
import ExpedienteAdjuntos from "@/components/finanzas/ExpedienteAdjuntos";
import MovimientoForm from "@/components/finanzas/MovimientoForm";
import { fdb } from "@/lib/finanzasDb";
import {
  fmtMoneda, fmtFecha, ESTATUS_MOV, METODOS_PAGO, etiquetaVia,
  faltanteComprobacion, validarMovimiento,
  type Movimiento, type BitacoraEntrada, type Cuenta, type MovimientoForm as FormState,
} from "@/lib/finanzas";

const Dato = ({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
    <dd className="text-sm font-medium">{children ?? "—"}</dd>
  </div>
);

export default function FinanzasMovimiento() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role, profileName } = useAuth();
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "es-MX";

  const [mov, setMov] = useState<Movimiento | null>(null);
  const [bitacora, setBitacora] = useState<BitacoraEntrada[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);

  // Diálogos
  const [cancelarAbierto, setCancelarAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [comprobarAbierto, setComprobarAbierto] = useState(false);
  const [montoComprobado, setMontoComprobado] = useState("");
  const [montoDevuelto, setMontoDevuelto] = useState("");
  const [editarAbierto, setEditarAbierto] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [borrarAbierto, setBorrarAbierto] = useState(false);

  const esAdminFin = role === "admin" || role === "admin_financiero";
  const puedeConfirmar = esAdminFin;
  const esPropio = !!mov && mov.created_by === user?.id;
  const puedeEditar = esAdminFin || (role === "finanzas" && esPropio &&
    (mov?.estatus === "PENDIENTE" || mov?.estatus === "BORRADOR"));

  const cargar = async () => {
    if (!id) return;
    setCargando(true);
    const [mv, bt, ct] = await Promise.all([
      fdb.from("v_movimientos_financieros").select("*").eq("id", id).maybeSingle(),
      fdb.from("movimiento_bitacora").select("*").eq("movimiento_id", id)
         .order("created_at", { ascending: false }),
      fdb.from("cuentas_financieras").select("*").order("orden"),
    ]);
    if (mv.error) toast.error(mv.error.message);
    setMov(mv.data ?? null);
    setBitacora(bt.data ?? []);
    setCuentas(ct.data ?? []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [id]);

  // ── Acciones ──────────────────────────────────────────────
  const confirmar = async () => {
    if (!mov) return;
    setTrabajando(true);
    const { error } = await fdb.from("movimientos_financieros").update({
      estatus: "CONFIRMADO",
      confirmado_por: user?.id,
      confirmado_at: new Date().toISOString(),
      autorizado_por: user?.id,
      autorizado_nombre: profileName || null,
      autorizado_at: new Date().toISOString(),
    }).eq("id", mov.id);
    setTrabajando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t.finanzas.detalle.okConfirmado);
    cargar();
  };

  const cancelar = async () => {
    if (!mov) return;
    if (motivo.trim().length < 5) { toast.error(t.finanzas.detalle.faltaMotivo); return; }
    setTrabajando(true);
    const { error } = await fdb.from("movimientos_financieros").update({
      estatus: "CANCELADO",
      motivo_cancelacion: motivo.trim(),
      cancelado_por: user?.id,
      cancelado_at: new Date().toISOString(),
    }).eq("id", mov.id);
    setTrabajando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t.finanzas.detalle.okCancelado);
    setCancelarAbierto(false);
    setMotivo("");
    cargar();
  };

  const comprobar = async () => {
    if (!mov) return;
    const comprobado = parseFloat(montoComprobado);
    const devuelto = parseFloat(montoDevuelto || "0");
    if (isNaN(comprobado) || comprobado < 0) { toast.error(t.finanzas.detalle.faltaComprobado); return; }
    if (isNaN(devuelto) || devuelto < 0) { toast.error(t.finanzas.detalle.cambioInvalido); return; }
    if (comprobado + devuelto > Number(mov.monto)) {
      toast.error(t.finanzas.detalle.excedeEntregado);
      return;
    }
    setTrabajando(true);
    const { error } = await fdb.from("movimientos_financieros").update({
      comprobado: true,
      monto_comprobado: comprobado,
      monto_devuelto: devuelto,
      comprobado_por: user?.id,
      comprobado_at: new Date().toISOString(),
    }).eq("id", mov.id);
    setTrabajando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t.finanzas.detalle.okComprobado);
    setComprobarAbierto(false);
    cargar();
  };

  const abrirEdicion = () => {
    if (!mov) return;
    setForm({
      tipo: mov.tipo,
      concepto: mov.concepto,
      categoria: mov.categoria ?? "",
      descripcion: mov.descripcion ?? "",
      monto: String(mov.monto),
      moneda: mov.moneda,
      tipo_cambio: mov.tipo_cambio ? String(mov.tipo_cambio) : "",
      fecha_movimiento: mov.fecha_movimiento?.slice(0, 10) ?? "",
      metodo_pago: mov.metodo_pago,
      cuenta_id: mov.cuenta_id ?? "",
      referencia: mov.referencia ?? "",
      contraparte_tipo: mov.contraparte_tipo,
      cliente_id: mov.cliente_id,
      proveedor_id: mov.proveedor_id,
      empleado_id: mov.empleado_id,
      contraparte_nombre: mov.contraparte_nombre,
      via: mov.via,
      intermediario_id: mov.intermediario_id,
      intermediario_nombre: mov.intermediario_nombre ?? "",
      recibido_por: mov.recibido_por,
      factura_folio: mov.factura_folio ?? "",
      factura_uuid: mov.factura_uuid ?? "",
      factura_rfc: mov.factura_rfc ?? "",
      remision_id: mov.remision_id,
    });
    setEditarAbierto(true);
  };

  const guardarEdicion = async () => {
    if (!mov || !form) return;
    const errores = validarMovimiento(form, cuentas, t.finanzas.validacion);
    if (errores.length) { toast.error(errores[0]); return; }
    setTrabajando(true);
    const { error } = await fdb.from("movimientos_financieros").update({
      concepto: form.concepto.trim(),
      categoria: form.categoria || null,
      descripcion: form.descripcion.trim() || null,
      monto: parseFloat(form.monto),
      moneda: form.moneda,
      tipo_cambio: form.moneda === "MXN" ? null : parseFloat(form.tipo_cambio),
      fecha_movimiento: form.fecha_movimiento,
      metodo_pago: form.metodo_pago,
      cuenta_id: form.cuenta_id || null,
      referencia: form.referencia.trim() || null,
      contraparte_tipo: form.contraparte_tipo,
      cliente_id: form.cliente_id,
      proveedor_id: form.proveedor_id,
      empleado_id: form.empleado_id,
      contraparte_nombre: form.contraparte_nombre.trim(),
      via: form.via,
      intermediario_id: form.intermediario_id,
      intermediario_nombre: form.intermediario_nombre.trim() || null,
      recibido_por: form.recibido_por,
      factura_folio: form.factura_folio.trim() || null,
      factura_uuid: form.factura_uuid.trim() || null,
      factura_rfc: form.factura_rfc.trim() || null,
      remision_id: form.remision_id,
    }).eq("id", mov.id);
    setTrabajando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t.finanzas.detalle.okActualizado);
    setEditarAbierto(false);
    cargar();
  };

  const borrar = async () => {
    if (!mov) return;
    setTrabajando(true);
    const { error } = await fdb.from("movimientos_financieros").delete().eq("id", mov.id);
    setTrabajando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t.finanzas.detalle.okEliminado);
    navigate("/finanzas");
  };

  // ── Render ────────────────────────────────────────────────
  if (cargando) {
    return <div className="py-16 text-center text-muted-foreground">{t.finanzas.detalle.cargando}</div>;
  }
  if (!mov) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate("/finanzas")}>
          <ArrowLeft size={16} className="mr-2" /> {t.finanzas.volver}
        </Button>
        <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground">
          {t.finanzas.detalle.noEncontrado}
        </div>
      </div>
    );
  }

  const esIngreso = mov.tipo === "INGRESO";
  const est = ESTATUS_MOV[mov.estatus];
  const pendienteComprobar = mov.requiere_comprobacion && !mov.comprobado;
  const faltante = faltanteComprobacion(mov);
  const metodoLabel = t.finanzas.metodoPago(mov.metodo_pago);

  return (
    <div className="space-y-5">
      <Button variant="ghost" className="h-9 -ml-2" onClick={() => navigate("/finanzas")}>
        <ArrowLeft size={16} className="mr-2" /> {t.finanzas.title}
      </Button>

      {/* Encabezado */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full p-2 ${
                  esIngreso ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                }`}
              >
                {esIngreso ? <ArrowDownCircle size={22} /> : <ArrowUpCircle size={22} />}
              </span>
              <span className="font-mono text-sm text-muted-foreground">{mov.folio}</span>
              <Badge variant="outline" className={est.clase}>{t.finanzas.estatusMov(mov.estatus)}</Badge>
              {pendienteComprobar && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  <AlertTriangle size={12} className="mr-1" /> {t.finanzas.detalle.efectivoPorComprobar}
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-[#1F3864]">{mov.concepto}</h1>
            <p className="text-sm text-muted-foreground">
              {esIngreso ? t.finanzas.detalle.nosPago : t.finanzas.detalle.lePagamosA}{" "}
              <strong className="text-foreground">{mov.contraparte_nombre}</strong>
              {" · "}{fmtFecha(mov.fecha_movimiento, locale)}
            </p>
          </div>

          <div className="text-right">
            <div className={`text-3xl font-extrabold ${esIngreso ? "text-emerald-600" : "text-red-600"}`}>
              {esIngreso ? "+" : "−"}{fmtMoneda(Number(mov.monto), mov.moneda, locale)}
            </div>
            {mov.moneda !== "MXN" && (
              <div className="text-sm text-muted-foreground">
                {fmtMoneda(Number(mov.monto_mxn), "MXN", locale)} · TC {mov.tipo_cambio}
              </div>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          {puedeConfirmar && (mov.estatus === "PENDIENTE" || mov.estatus === "BORRADOR") && (
            <Button
              onClick={confirmar}
              disabled={trabajando}
              className="h-11 bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 size={16} className="mr-2" /> {t.finanzas.detalle.confirmar}
            </Button>
          )}
          {pendienteComprobar && (
            <Button
              onClick={() => {
                setMontoComprobado(String(mov.monto));
                setMontoDevuelto("0");
                setComprobarAbierto(true);
              }}
              className="h-11 bg-amber-600 hover:bg-amber-700"
            >
              <HandCoins size={16} className="mr-2" /> {t.finanzas.detalle.comprobarEfectivo}
            </Button>
          )}
          {puedeEditar && mov.estatus !== "CANCELADO" && (
            <Button variant="outline" className="h-11" onClick={abrirEdicion}>
              <Pencil size={15} className="mr-2" /> {t.finanzas.detalle.editar}
            </Button>
          )}
          {esAdminFin && mov.estatus !== "CANCELADO" && (
            <Button variant="outline" className="h-11" onClick={() => setCancelarAbierto(true)}>
              <XCircle size={15} className="mr-2" /> {t.finanzas.detalle.cancelarMovimiento}
            </Button>
          )}
          {esAdminFin && (
            <Button variant="ghost" className="h-11 text-red-500" onClick={() => setBorrarAbierto(true)}>
              <Trash2 size={15} className="mr-2" /> {t.finanzas.detalle.eliminar}
            </Button>
          )}
        </div>

        {mov.estatus === "CANCELADO" && mov.motivo_cancelacion && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>{t.finanzas.detalle.cancelado}</strong> {mov.motivo_cancelacion}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Datos del movimiento */}
        <Card className="space-y-4 p-5">
          <h3 className="flex items-center gap-2 font-bold text-[#1F3864]">
            <Wallet size={16} /> {t.finanzas.detalle.datosMovimiento}
          </h3>
          <dl className="grid grid-cols-2 gap-3">
            <Dato etiqueta={t.finanzas.detalle.categoria}>{mov.categoria}</Dato>
            <Dato etiqueta={t.finanzas.detalle.formaPago}>{metodoLabel}</Dato>
            <Dato etiqueta={esIngreso ? t.finanzas.detalle.entroA : t.finanzas.detalle.salioDe}>{mov.cuenta_nombre}</Dato>
            <Dato etiqueta={t.finanzas.detalle.referencia}>{mov.referencia}</Dato>
            <Dato etiqueta={t.finanzas.detalle.folioFactura}>{mov.factura_folio}</Dato>
            <Dato etiqueta={t.finanzas.detalle.rfc}>{mov.factura_rfc}</Dato>
            {mov.factura_uuid && (
              <div className="col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t.finanzas.detalle.uuidCfdi}</dt>
                <dd className="break-all font-mono text-xs">{mov.factura_uuid}</dd>
              </div>
            )}
            <Dato etiqueta={t.finanzas.detalle.registro}>{mov.registrado_por_nombre}</Dato>
            <Dato etiqueta={t.finanzas.detalle.autorizo}>{mov.autorizado_nombre}</Dato>
            {mov.folio_remision && (
              <Dato etiqueta={t.finanzas.detalle.remisionCobrada}>{mov.folio_remision}</Dato>
            )}
          </dl>
          {mov.descripcion && (
            <div className="rounded-md bg-slate-50 p-3 text-sm text-muted-foreground">
              {mov.descripcion}
            </div>
          )}
        </Card>

        {/* Quién y cómo */}
        <Card className="space-y-4 p-5">
          <h3 className="flex items-center gap-2 font-bold text-[#1F3864]">
            <User size={16} /> {esIngreso ? t.finanzas.detalle.quienPagoTrajo : t.finanzas.detalle.aQuienPorMedio}
          </h3>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              {mov.contraparte_tipo === "PROVEEDOR" ? <Building2 size={15} className="text-[#2E75B6]" />
                : <User size={15} className="text-[#2E75B6]" />}
              <span className="font-semibold">{mov.contraparte_nombre}</span>
              <Badge variant="outline" className="ml-auto text-[11px]">
                {t.finanzas.detalle.contraparte[mov.contraparte_tipo] ?? t.finanzas.detalle.contraparte.OTRO}
              </Badge>
            </div>
            {mov.cliente_codigo && (
              <p className="mt-1 text-xs text-muted-foreground">{t.finanzas.detalle.codigo(mov.cliente_codigo)}</p>
            )}
          </div>

          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{etiquetaVia(mov.tipo, mov.via, t.finanzas.validacion)}</p>
            {mov.via === "INTERMEDIARIO" && (
              <p className="mt-1 text-muted-foreground">
                {esIngreso ? t.finanzas.detalle.loTrajoLbl : t.finanzas.detalle.seEntregoA}
                <strong className="text-foreground">{mov.intermediario_display ?? "—"}</strong>
              </p>
            )}
            {mov.recibido_por_nombre && (
              <p className="mt-1 text-muted-foreground">
                {esIngreso ? t.finanzas.detalle.recibioOficina : t.finanzas.detalle.autorizoSalida}
                <strong className="text-foreground">{mov.recibido_por_nombre}</strong>
              </p>
            )}
          </div>

          {/* Comprobación de efectivo */}
          {mov.requiere_comprobacion && (
            <div
              className={`rounded-lg border p-3 ${
                mov.comprobado ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <HandCoins size={15} className={mov.comprobado ? "text-emerald-600" : "text-amber-600"} />
                <span className="text-sm font-bold">
                  {mov.comprobado ? t.finanzas.detalle.efectivoComprobado : t.finanzas.detalle.efectivoPendiente}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <Dato etiqueta={t.finanzas.detalle.entregado}>{fmtMoneda(Number(mov.monto), mov.moneda, locale)}</Dato>
                <Dato etiqueta={t.finanzas.detalle.comprobado}>
                  {mov.monto_comprobado != null ? fmtMoneda(Number(mov.monto_comprobado), mov.moneda, locale) : "—"}
                </Dato>
                <Dato etiqueta={t.finanzas.detalle.cambioDevuelto}>
                  {mov.monto_devuelto != null ? fmtMoneda(Number(mov.monto_devuelto), mov.moneda, locale) : "—"}
                </Dato>
              </dl>
              {mov.comprobado && faltante !== 0 && (
                <p className="mt-2 text-xs font-semibold text-red-700">
                  {t.finanzas.detalle.diferenciaSinAclarar(fmtMoneda(faltante, mov.moneda, locale))}
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Expediente */}
      <Card className="p-5">
        <ExpedienteAdjuntos
          movimientoId={mov.id}
          usuarioId={user?.id}
          puedeSubir={role === "admin" || role === "admin_financiero" || role === "finanzas"}
          puedeBorrar={esAdminFin}
          onCambio={cargar}
        />
      </Card>

      {/* Bitácora */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 font-bold text-[#1F3864]">
          <ScrollText size={16} /> {t.finanzas.detalle.bitacora}
        </h3>
        {bitacora.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.finanzas.detalle.sinBitacora}</p>
        ) : (
          <div className="space-y-2">
            {bitacora.map(b => (
              <div key={b.id} className="flex gap-3 border-b pb-2 last:border-0">
                <Badge variant="outline" className="h-6 shrink-0 text-[11px]">{b.accion}</Badge>
                <div className="min-w-0 flex-1">
                  {b.detalle && Object.keys(b.detalle).length > 0 && (
                    <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {JSON.stringify(b.detalle, null, 1)}
                    </pre>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(b.created_at).toLocaleString(locale, {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Diálogo: cancelar ── */}
      <Dialog open={cancelarAbierto} onOpenChange={o => { if (!o) setCancelarAbierto(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t.finanzas.detalle.cancelarTitulo}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t.finanzas.detalle.cancelarDesc}</p>
          <div>
            <Label>{t.finanzas.detalle.motivo}</Label>
            <Textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              placeholder={t.finanzas.detalle.motivoPlaceholder}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setCancelarAbierto(false)}>
              {t.finanzas.volver}
            </Button>
            <Button variant="destructive" className="h-11" onClick={cancelar} disabled={trabajando}>
              {t.finanzas.detalle.cancelarMovimiento}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: comprobar efectivo ── */}
      <Dialog open={comprobarAbierto} onOpenChange={o => { if (!o) setComprobarAbierto(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t.finanzas.detalle.comprobarTitulo}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t.finanzas.detalle.comprobarDesc1} <strong>{fmtMoneda(Number(mov.monto), mov.moneda, locale)}</strong>{" → "}
            <strong>{mov.intermediario_display ?? "—"}</strong>{t.finanzas.detalle.comprobarDesc2}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t.finanzas.detalle.montoComprobado}</Label>
              <Input
                type="number" min="0" step="0.01" className="h-11"
                value={montoComprobado}
                onChange={e => setMontoComprobado(e.target.value)}
              />
            </div>
            <div>
              <Label>{t.finanzas.detalle.cambioDevueltoLbl}</Label>
              <Input
                type="number" min="0" step="0.01" className="h-11"
                value={montoDevuelto}
                onChange={e => setMontoDevuelto(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.finanzas.detalle.diferencia}{" "}
            <strong>
              {fmtMoneda(
                Math.round((Number(mov.monto) - (parseFloat(montoComprobado) || 0) - (parseFloat(montoDevuelto) || 0)) * 100) / 100,
                mov.moneda,
                locale,
              )}
            </strong>{" "}
            {t.finanzas.detalle.diferenciaNota}
          </p>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setComprobarAbierto(false)}>
              {t.finanzas.volver}
            </Button>
            <Button
              className="h-11 bg-amber-600 hover:bg-amber-700"
              onClick={comprobar}
              disabled={trabajando}
            >
              {t.finanzas.detalle.guardarComprobacion}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: editar ── */}
      <Dialog open={editarAbierto} onOpenChange={o => { if (!o) setEditarAbierto(false); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{t.finanzas.detalle.editarTitulo(mov.folio)}</DialogTitle></DialogHeader>
          {form && <MovimientoForm form={form} setForm={setForm} cuentas={cuentas} tipoFijo />}
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setEditarAbierto(false)}>
              {t.actions.cancel}
            </Button>
            <Button
              className="h-11 bg-[#1F3864] px-6 hover:bg-[#162a4d]"
              onClick={guardarEdicion}
              disabled={trabajando}
            >
              {trabajando ? t.finanzas.guardando : t.finanzas.guardarCambios}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: eliminar ── */}
      <Dialog open={borrarAbierto} onOpenChange={o => { if (!o) setBorrarAbierto(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t.finanzas.detalle.eliminarTitulo}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t.finanzas.detalle.eliminarDesc1} <strong>{mov.folio}</strong> {t.finanzas.detalle.eliminarDesc2}{" "}
            <em>{t.finanzas.detalle.cancelarPalabra}</em> {t.finanzas.detalle.eliminarDesc3}
          </p>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setBorrarAbierto(false)}>
              {t.finanzas.volver}
            </Button>
            <Button variant="destructive" className="h-11" onClick={borrar} disabled={trabajando}>
              {t.finanzas.detalle.eliminar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
