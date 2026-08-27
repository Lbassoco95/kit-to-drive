// Expediente de un movimiento: datos, contraparte, quién movió el dinero,
// comprobación del efectivo, documentos y bitácora.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
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
    toast.success("✓ Movimiento confirmado — ya afecta el saldo");
    cargar();
  };

  const cancelar = async () => {
    if (!mov) return;
    if (motivo.trim().length < 5) { toast.error("Escribe el motivo de la cancelación"); return; }
    setTrabajando(true);
    const { error } = await fdb.from("movimientos_financieros").update({
      estatus: "CANCELADO",
      motivo_cancelacion: motivo.trim(),
      cancelado_por: user?.id,
      cancelado_at: new Date().toISOString(),
    }).eq("id", mov.id);
    setTrabajando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Movimiento cancelado");
    setCancelarAbierto(false);
    setMotivo("");
    cargar();
  };

  const comprobar = async () => {
    if (!mov) return;
    const comprobado = parseFloat(montoComprobado);
    const devuelto = parseFloat(montoDevuelto || "0");
    if (isNaN(comprobado) || comprobado < 0) { toast.error("Captura el monto comprobado"); return; }
    if (isNaN(devuelto) || devuelto < 0) { toast.error("El cambio devuelto no es válido"); return; }
    if (comprobado + devuelto > Number(mov.monto)) {
      toast.error("Lo comprobado más el cambio no puede pasar de lo entregado");
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
    toast.success("✓ Efectivo comprobado");
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
    const errores = validarMovimiento(form, cuentas);
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
    toast.success("✓ Movimiento actualizado");
    setEditarAbierto(false);
    cargar();
  };

  const borrar = async () => {
    if (!mov) return;
    setTrabajando(true);
    const { error } = await fdb.from("movimientos_financieros").delete().eq("id", mov.id);
    setTrabajando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Movimiento eliminado");
    navigate("/finanzas");
  };

  // ── Render ────────────────────────────────────────────────
  if (cargando) {
    return <div className="py-16 text-center text-muted-foreground">Cargando expediente…</div>;
  }
  if (!mov) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate("/finanzas")}>
          <ArrowLeft size={16} className="mr-2" /> Volver
        </Button>
        <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground">
          No se encontró el movimiento.
        </div>
      </div>
    );
  }

  const esIngreso = mov.tipo === "INGRESO";
  const est = ESTATUS_MOV[mov.estatus];
  const pendienteComprobar = mov.requiere_comprobacion && !mov.comprobado;
  const faltante = faltanteComprobacion(mov);
  const metodoLabel = METODOS_PAGO.find(m => m.value === mov.metodo_pago)?.label ?? mov.metodo_pago;

  return (
    <div className="space-y-5">
      <Button variant="ghost" className="h-9 -ml-2" onClick={() => navigate("/finanzas")}>
        <ArrowLeft size={16} className="mr-2" /> Control Financiero
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
              <Badge variant="outline" className={est.clase}>{est.label}</Badge>
              {pendienteComprobar && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  <AlertTriangle size={12} className="mr-1" /> Efectivo por comprobar
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-[#1F3864]">{mov.concepto}</h1>
            <p className="text-sm text-muted-foreground">
              {esIngreso ? "Nos pagó" : "Le pagamos a"}{" "}
              <strong className="text-foreground">{mov.contraparte_nombre}</strong>
              {" · "}{fmtFecha(mov.fecha_movimiento)}
            </p>
          </div>

          <div className="text-right">
            <div className={`text-3xl font-extrabold ${esIngreso ? "text-emerald-600" : "text-red-600"}`}>
              {esIngreso ? "+" : "−"}{fmtMoneda(Number(mov.monto), mov.moneda)}
            </div>
            {mov.moneda !== "MXN" && (
              <div className="text-sm text-muted-foreground">
                {fmtMoneda(Number(mov.monto_mxn), "MXN")} · TC {mov.tipo_cambio}
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
              <CheckCircle2 size={16} className="mr-2" /> Confirmar
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
              <HandCoins size={16} className="mr-2" /> Comprobar efectivo
            </Button>
          )}
          {puedeEditar && mov.estatus !== "CANCELADO" && (
            <Button variant="outline" className="h-11" onClick={abrirEdicion}>
              <Pencil size={15} className="mr-2" /> Editar
            </Button>
          )}
          {esAdminFin && mov.estatus !== "CANCELADO" && (
            <Button variant="outline" className="h-11" onClick={() => setCancelarAbierto(true)}>
              <XCircle size={15} className="mr-2" /> Cancelar movimiento
            </Button>
          )}
          {esAdminFin && (
            <Button variant="ghost" className="h-11 text-red-500" onClick={() => setBorrarAbierto(true)}>
              <Trash2 size={15} className="mr-2" /> Eliminar
            </Button>
          )}
        </div>

        {mov.estatus === "CANCELADO" && mov.motivo_cancelacion && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>Cancelado:</strong> {mov.motivo_cancelacion}
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Datos del movimiento */}
        <Card className="space-y-4 p-5">
          <h3 className="flex items-center gap-2 font-bold text-[#1F3864]">
            <Wallet size={16} /> Datos del movimiento
          </h3>
          <dl className="grid grid-cols-2 gap-3">
            <Dato etiqueta="Categoría">{mov.categoria}</Dato>
            <Dato etiqueta="Forma de pago">{metodoLabel}</Dato>
            <Dato etiqueta={esIngreso ? "Entró a" : "Salió de"}>{mov.cuenta_nombre}</Dato>
            <Dato etiqueta="Referencia">{mov.referencia}</Dato>
            <Dato etiqueta="Folio de factura">{mov.factura_folio}</Dato>
            <Dato etiqueta="RFC">{mov.factura_rfc}</Dato>
            {mov.factura_uuid && (
              <div className="col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">UUID del CFDI</dt>
                <dd className="break-all font-mono text-xs">{mov.factura_uuid}</dd>
              </div>
            )}
            <Dato etiqueta="Registró">{mov.registrado_por_nombre}</Dato>
            <Dato etiqueta="Autorizó">{mov.autorizado_nombre}</Dato>
            {mov.folio_remision && (
              <Dato etiqueta="Remisión cobrada">{mov.folio_remision}</Dato>
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
            <User size={16} /> {esIngreso ? "Quién pagó y quién lo trajo" : "A quién y por medio de quién"}
          </h3>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              {mov.contraparte_tipo === "PROVEEDOR" ? <Building2 size={15} className="text-[#2E75B6]" />
                : <User size={15} className="text-[#2E75B6]" />}
              <span className="font-semibold">{mov.contraparte_nombre}</span>
              <Badge variant="outline" className="ml-auto text-[11px]">
                {mov.contraparte_tipo === "CLIENTE" ? "Cliente"
                  : mov.contraparte_tipo === "PROVEEDOR" ? "Proveedor"
                  : mov.contraparte_tipo === "EMPLEADO" ? "Personal" : "Externo"}
              </Badge>
            </div>
            {mov.cliente_codigo && (
              <p className="mt-1 text-xs text-muted-foreground">Código {mov.cliente_codigo}</p>
            )}
          </div>

          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">{etiquetaVia(mov.tipo, mov.via)}</p>
            {mov.via === "INTERMEDIARIO" && (
              <p className="mt-1 text-muted-foreground">
                {esIngreso ? "Lo trajo: " : "Se le entregó a: "}
                <strong className="text-foreground">{mov.intermediario_display ?? "—"}</strong>
              </p>
            )}
            {mov.recibido_por_nombre && (
              <p className="mt-1 text-muted-foreground">
                {esIngreso ? "Recibió en oficina: " : "Autorizó la salida: "}
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
                  {mov.comprobado ? "Efectivo comprobado" : "Efectivo pendiente de comprobar"}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <Dato etiqueta="Entregado">{fmtMoneda(Number(mov.monto), mov.moneda)}</Dato>
                <Dato etiqueta="Comprobado">
                  {mov.monto_comprobado != null ? fmtMoneda(Number(mov.monto_comprobado), mov.moneda) : "—"}
                </Dato>
                <Dato etiqueta="Cambio devuelto">
                  {mov.monto_devuelto != null ? fmtMoneda(Number(mov.monto_devuelto), mov.moneda) : "—"}
                </Dato>
              </dl>
              {mov.comprobado && faltante !== 0 && (
                <p className="mt-2 text-xs font-semibold text-red-700">
                  Diferencia sin aclarar: {fmtMoneda(faltante, mov.moneda)}
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
          <ScrollText size={16} /> Bitácora
        </h3>
        {bitacora.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
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
                  {new Date(b.created_at).toLocaleString("es-MX", {
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
          <DialogHeader><DialogTitle>Cancelar movimiento</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            El movimiento deja de afectar el saldo, pero se queda en el histórico con su
            expediente y su motivo.
          </p>
          <div>
            <Label>Motivo *</Label>
            <Textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
              placeholder="ej. Se capturó dos veces el mismo depósito"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setCancelarAbierto(false)}>
              Volver
            </Button>
            <Button variant="destructive" className="h-11" onClick={cancelar} disabled={trabajando}>
              Cancelar movimiento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: comprobar efectivo ── */}
      <Dialog open={comprobarAbierto} onOpenChange={o => { if (!o) setComprobarAbierto(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Comprobar el efectivo entregado</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se entregaron <strong>{fmtMoneda(Number(mov.monto), mov.moneda)}</strong> a{" "}
            <strong>{mov.intermediario_display ?? "—"}</strong>. Captura cuánto se comprobó con
            documentos y cuánto cambio regresó.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto comprobado *</Label>
              <Input
                type="number" min="0" step="0.01" className="h-11"
                value={montoComprobado}
                onChange={e => setMontoComprobado(e.target.value)}
              />
            </div>
            <div>
              <Label>Cambio devuelto</Label>
              <Input
                type="number" min="0" step="0.01" className="h-11"
                value={montoDevuelto}
                onChange={e => setMontoDevuelto(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Diferencia:{" "}
            <strong>
              {fmtMoneda(
                Math.round((Number(mov.monto) - (parseFloat(montoComprobado) || 0) - (parseFloat(montoDevuelto) || 0)) * 100) / 100,
                mov.moneda,
              )}
            </strong>{" "}
            — si no queda en cero, hay que aclararla.
          </p>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setComprobarAbierto(false)}>
              Volver
            </Button>
            <Button
              className="h-11 bg-amber-600 hover:bg-amber-700"
              onClick={comprobar}
              disabled={trabajando}
            >
              Guardar comprobación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: editar ── */}
      <Dialog open={editarAbierto} onOpenChange={o => { if (!o) setEditarAbierto(false); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Editar movimiento {mov.folio}</DialogTitle></DialogHeader>
          {form && <MovimientoForm form={form} setForm={setForm} cuentas={cuentas} tipoFijo />}
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setEditarAbierto(false)}>
              Cancelar
            </Button>
            <Button
              className="h-11 bg-[#1F3864] px-6 hover:bg-[#162a4d]"
              onClick={guardarEdicion}
              disabled={trabajando}
            >
              {trabajando ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: eliminar ── */}
      <Dialog open={borrarAbierto} onOpenChange={o => { if (!o) setBorrarAbierto(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar el movimiento?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se borra <strong>{mov.folio}</strong> y todo su expediente. Queda registrado en la
            bitácora de eliminaciones. Normalmente conviene <em>cancelar</em> en lugar de eliminar.
          </p>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setBorrarAbierto(false)}>
              Volver
            </Button>
            <Button variant="destructive" className="h-11" onClick={borrar} disabled={trabajando}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
