// Módulo de Crédito: clientes con línea de crédito y su cartera (CxC).
// Si hay cuentas abiertas y vencidas, Remisiones detiene el proceso.
import { useEffect, useMemo, useState } from "react";
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
  Search, CreditCard, AlertTriangle, Plus, Banknote, XCircle, RefreshCw,
} from "lucide-react";
import { fmtMoneda, fmtFecha } from "@/lib/finanzas";
import { InputNumero } from "@/components/InputNumero";
import {
  filtrarCartera, formCxcVacio, formAbonoVacio, validarFormCxc, validarFormAbono,
  cxcEstaVencida, creditoDisponible, calcularFechaVencimiento, diasAtraso,
  type ClienteCredito, type CuentaPorCobrar, type FormCxc, type FormAbono,
  type FiltroCartera,
} from "@/lib/credito";
import {
  listarClientesCredito, listarCxCDeCliente, crearCxC, registrarAbono, cancelarCxC,
} from "@/lib/creditoDb";

export default function Credito() {
  const { user, perms } = useAuth();
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "es-MX";
  const tc = t.credito;

  const [rows, setRows] = useState<ClienteCredito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [schemaFalta, setSchemaFalta] = useState(false);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroCartera>("TODOS");

  const [detalle, setDetalle] = useState<ClienteCredito | null>(null);
  const [cxcs, setCxcs] = useState<CuentaPorCobrar[]>([]);
  const [cargandoCxC, setCargandoCxC] = useState(false);

  const [altaAbierta, setAltaAbierta] = useState(false);
  const [formCxc, setFormCxc] = useState<FormCxc>(formCxcVacio());
  const [guardando, setGuardando] = useState(false);

  const [abonoTarget, setAbonoTarget] = useState<CuentaPorCobrar | null>(null);
  const [formAbono, setFormAbono] = useState<FormAbono>(formAbonoVacio());

  // Comercial ve la cartera; sólo Administración (Finanzas) captura CxC y abonos.
  const puedeCapturar = perms.puedeCrear("finanzas");
  const puedeCancelar = perms.puedeEliminar("finanzas") || perms.puedeAprobar("finanzas");

  const cargar = async () => {
    setCargando(true);
    const res = await listarClientesCredito();
    if (res.schemaFalta) {
      setSchemaFalta(true);
      setRows([]);
    } else if (res.error) {
      toast.error(res.error.message);
      setRows([]);
    } else {
      setSchemaFalta(false);
      setRows(res.data);
    }
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(
    () => filtrarCartera(rows, filtro, q),
    [rows, filtro, q],
  );

  const totales = useMemo(() => ({
    clientes: rows.length,
    vencidos: rows.filter(c => Number(c.saldo_vencido) > 0).length,
    saldoAbierto: rows.reduce((s, c) => s + Number(c.saldo_abierto || 0), 0),
    saldoVencido: rows.reduce((s, c) => s + Number(c.saldo_vencido || 0), 0),
  }), [rows]);

  const abrirDetalle = async (c: ClienteCredito) => {
    setDetalle(c);
    setCargandoCxC(true);
    const res = await listarCxCDeCliente(c.id);
    if (res.error && !res.schemaFalta) toast.error(res.error.message);
    setCxcs(res.data);
    setCargandoCxC(false);
  };

  const refrescarDetalle = async () => {
    if (!detalle) return;
    const [cartera, detalleCxC] = await Promise.all([
      listarClientesCredito(),
      listarCxCDeCliente(detalle.id),
    ]);
    if (!cartera.error) {
      setRows(cartera.data);
      const actualizado = cartera.data.find(c => c.id === detalle.id) ?? detalle;
      setDetalle(actualizado);
    }
    if (!detalleCxC.error) setCxcs(detalleCxC.data);
  };

  const abrirAltaCxC = () => {
    if (!detalle) return;
    setFormCxc(formCxcVacio(detalle.dias_credito || 0));
    setAltaAbierta(true);
  };

  const guardarCxC = async () => {
    if (!detalle) return;
    const errores = validarFormCxc(formCxc, tc.validacion);
    if (errores.length) { toast.error(errores[0]); return; }

    setGuardando(true);
    const monto = parseFloat(formCxc.monto);
    const { data, error } = await crearCxC({
      cliente_id: detalle.id,
      concepto: formCxc.concepto.trim(),
      monto,
      saldo: monto,
      moneda: formCxc.moneda || detalle.moneda_credito || "MXN",
      fecha_emision: formCxc.fecha_emision,
      fecha_vencimiento: formCxc.fecha_vencimiento,
      remision_id: formCxc.remision_id.trim() || null,
      notas: formCxc.notas.trim() || null,
      created_by: user?.id,
    });
    setGuardando(false);
    if (error) { toast.error(error.message); return; }

    toast.success(tc.cxcRegistrada(data?.folio || ""));
    setAltaAbierta(false);
    await refrescarDetalle();
  };

  const abrirAbono = (cxc: CuentaPorCobrar) => {
    setFormAbono({
      ...formAbonoVacio(),
      monto: String(cxc.saldo),
    });
    setAbonoTarget(cxc);
  };

  const guardarAbono = async () => {
    if (!abonoTarget) return;
    const errores = validarFormAbono(formAbono, Number(abonoTarget.saldo), tc.validacionAbono);
    if (errores.length) { toast.error(errores[0]); return; }

    setGuardando(true);
    const { error } = await registrarAbono({
      cxc_id: abonoTarget.id,
      monto: parseFloat(formAbono.monto),
      fecha_abono: formAbono.fecha_abono,
      metodo_pago: formAbono.metodo_pago || null,
      referencia: formAbono.referencia.trim() || null,
      notas: formAbono.notas.trim() || null,
      created_by: user?.id,
    });
    setGuardando(false);
    if (error) { toast.error(error.message); return; }

    toast.success(tc.abonoRegistrado);
    setAbonoTarget(null);
    await refrescarDetalle();
  };

  const onCancelarCxC = async (cxc: CuentaPorCobrar) => {
    if (!confirm(tc.confirmarCancelar(cxc.folio || ""))) return;
    const { error } = await cancelarCxC(cxc.id);
    if (error) { toast.error(error.message); return; }
    toast.success(tc.cxcCancelada);
    await refrescarDetalle();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3864] flex items-center gap-2">
            <CreditCard className="h-7 w-7" />
            {tc.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tc.subtitle(totales.clientes, totales.vencidos)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${cargando ? "animate-spin" : ""}`} />
          {tc.actualizar}
        </Button>
      </div>

      {schemaFalta && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <div className="font-semibold">{tc.schemaFaltaTitulo}</div>
            <div className="mt-0.5">{tc.schemaFaltaDesc}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{tc.kpiClientes}</div>
          <div className="text-2xl font-bold text-[#1F3864]">{totales.clientes}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{tc.kpiVencidos}</div>
          <div className={`text-2xl font-bold ${totales.vencidos ? "text-red-600" : "text-[#1F3864]"}`}>
            {totales.vencidos}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{tc.kpiSaldoAbierto}</div>
          <div className="text-xl font-bold text-[#1F3864]">
            {fmtMoneda(totales.saldoAbierto, "MXN", locale)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{tc.kpiSaldoVencido}</div>
          <div className={`text-xl font-bold ${totales.saldoVencido ? "text-red-600" : "text-[#1F3864]"}`}>
            {fmtMoneda(totales.saldoVencido, "MXN", locale)}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={tc.buscar}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        {(["TODOS", "VENCIDOS", "AL_CORRIENTE"] as FiltroCartera[]).map(f => (
          <Button
            key={f}
            size="sm"
            variant={filtro === f ? "default" : "outline"}
            onClick={() => setFiltro(f)}
          >
            {tc.filtros[f]}
          </Button>
        ))}
      </div>

      {cargando ? (
        <p className="text-sm text-muted-foreground">{tc.cargando}</p>
      ) : !filtrados.length ? (
        <Card className="p-8 text-center text-muted-foreground">
          {rows.length ? tc.sinCoincidencias : tc.vacio}
        </Card>
      ) : (
        <div className="responsive-card-grid gap-4">
          {filtrados.map(c => {
            const vencido = Number(c.saldo_vencido) > 0;
            const disponible = creditoDisponible(c);
            return (
              <Card
                key={c.id}
                className={`p-4 cursor-pointer hover:border-[#1F3864]/40 transition-colors ${
                  vencido ? "border-red-200 bg-red-50/40" : ""
                }`}
                onClick={() => abrirDetalle(c)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#1F3864] truncate">
                      {c.nombre_comercial || c.razon_social || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {c.folio_interno || c.codigo_erp || "—"}
                      {c.dias_credito > 0 && <> · {tc.diasCorto(c.dias_credito)}</>}
                    </div>
                  </div>
                  {vencido ? (
                    <Badge className="bg-red-100 text-red-700 border-red-200 shrink-0">
                      {tc.badgeVencido}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">{tc.badgeAlCorriente}</Badge>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">{tc.limite}</div>
                    <div className="font-medium">
                      {c.limite_credito != null
                        ? fmtMoneda(Number(c.limite_credito), c.moneda_credito || "MXN", locale)
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{tc.disponible}</div>
                    <div className="font-medium">
                      {disponible == null
                        ? "—"
                        : fmtMoneda(disponible, c.moneda_credito || "MXN", locale)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{tc.saldoAbierto}</div>
                    <div className="font-medium">
                      {fmtMoneda(Number(c.saldo_abierto || 0), c.moneda_credito || "MXN", locale)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{tc.saldoVencido}</div>
                    <div className={`font-medium ${vencido ? "text-red-600" : ""}`}>
                      {fmtMoneda(Number(c.saldo_vencido || 0), c.moneda_credito || "MXN", locale)}
                    </div>
                  </div>
                </div>
                {vencido && (
                  <div className="mt-3 text-xs text-red-700 font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {tc.bloqueaProceso}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Detalle del cliente */}
      <Dialog open={!!detalle} onOpenChange={open => { if (!open) setDetalle(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#1F3864]">
                  {detalle.nombre_comercial || detalle.razon_social || "—"}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {detalle.folio_interno || detalle.codigo_erp || "—"}
                  {" · "}
                  {tc.diasCorto(detalle.dias_credito)}
                  {detalle.email_cobranza ? ` · ${detalle.email_cobranza}` : ""}
                </p>
              </DialogHeader>

              {Number(detalle.saldo_vencido) > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {tc.avisoBloqueo}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">{tc.carteraTitle}</h3>
                {puedeCapturar && (
                  <Button size="sm" onClick={abrirAltaCxC}>
                    <Plus className="h-4 w-4 mr-1" />
                    {tc.nuevaCxC}
                  </Button>
                )}
              </div>

              {cargandoCxC ? (
                <p className="text-sm text-muted-foreground">{tc.cargando}</p>
              ) : !cxcs.length ? (
                <p className="text-sm text-muted-foreground py-4">{tc.sinCxC}</p>
              ) : (
                <div className="space-y-2">
                  {cxcs.map(cxc => {
                    const vencida = cxcEstaVencida(cxc);
                    const abierta = cxc.estatus === "ABIERTA" || cxc.estatus === "PARCIAL";
                    return (
                      <div
                        key={cxc.id}
                        className={`rounded-md border p-3 ${
                          vencida ? "border-red-200 bg-red-50/50" : "bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-sm">
                              {cxc.folio || "—"} · {cxc.concepto}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {tc.vence}: {fmtFecha(cxc.fecha_vencimiento, locale)}
                              {vencida && (
                                <span className="text-red-600 font-semibold">
                                  {" "}· {tc.diasAtraso(diasAtraso(cxc.fecha_vencimiento))}
                                </span>
                              )}
                              {cxc.remisiones?.folio_remision && (
                                <> · {tc.remision}: {cxc.remisiones.folio_remision}</>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">{tc.estatus[cxc.estatus]}</Badge>
                            <div className="text-sm font-semibold mt-1">
                              {fmtMoneda(Number(cxc.saldo), cxc.moneda, locale)}
                              <span className="text-xs font-normal text-muted-foreground">
                                {" "}/ {fmtMoneda(Number(cxc.monto), cxc.moneda, locale)}
                              </span>
                            </div>
                          </div>
                        </div>
                        {abierta && Number(cxc.saldo) > 0 && puedeCapturar && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Button size="sm" variant="outline" onClick={() => abrirAbono(cxc)}>
                              <Banknote className="h-3.5 w-3.5 mr-1" />
                              {tc.registrarAbono}
                            </Button>
                            {puedeCancelar && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600"
                                onClick={() => onCancelarCxC(cxc)}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />
                                {tc.cancelarCxC}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Alta CxC */}
      <Dialog open={altaAbierta} onOpenChange={setAltaAbierta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tc.nuevaCxC}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{tc.campos.concepto}</Label>
              <Input
                value={formCxc.concepto}
                onChange={e => setFormCxc({ ...formCxc, concepto: e.target.value })}
                placeholder={tc.campos.conceptoPlaceholder}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{tc.campos.monto}</Label>
                <InputNumero
                  value={formCxc.monto}
                  onValueChange={v => setFormCxc({ ...formCxc, monto: v == null ? "" : String(v) })}
                  placeholder="25,000.00"
                />
              </div>
              <div>
                <Label>{tc.campos.moneda}</Label>
                <Input
                  value={formCxc.moneda}
                  onChange={e => setFormCxc({ ...formCxc, moneda: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{tc.campos.fechaEmision}</Label>
                <Input
                  type="date"
                  value={formCxc.fecha_emision}
                  onChange={e => {
                    const emision = e.target.value;
                    setFormCxc({
                      ...formCxc,
                      fecha_emision: emision,
                      fecha_vencimiento: calcularFechaVencimiento(
                        emision,
                        detalle?.dias_credito || 0,
                      ),
                    });
                  }}
                />
              </div>
              <div>
                <Label>{tc.campos.fechaVencimiento}</Label>
                <Input
                  type="date"
                  value={formCxc.fecha_vencimiento}
                  onChange={e => setFormCxc({ ...formCxc, fecha_vencimiento: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>{tc.campos.notas}</Label>
              <Textarea
                value={formCxc.notas}
                onChange={e => setFormCxc({ ...formCxc, notas: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAltaAbierta(false)}>{t.actions.cancel}</Button>
            <Button onClick={guardarCxC} disabled={guardando}>
              {guardando ? tc.guardando : tc.guardarCxC}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abono */}
      <Dialog open={!!abonoTarget} onOpenChange={open => { if (!open) setAbonoTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tc.registrarAbono}</DialogTitle>
            {abonoTarget && (
              <p className="text-sm text-muted-foreground">
                {abonoTarget.folio} · {tc.saldoPendiente}:{" "}
                {fmtMoneda(Number(abonoTarget.saldo), abonoTarget.moneda, locale)}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{tc.campos.montoAbono}</Label>
                <InputNumero
                  value={formAbono.monto}
                  onValueChange={v => setFormAbono({ ...formAbono, monto: v == null ? "" : String(v) })}
                  placeholder="5,000.00"
                />
              </div>
              <div>
                <Label>{tc.campos.fechaAbono}</Label>
                <Input
                  type="date"
                  value={formAbono.fecha_abono}
                  onChange={e => setFormAbono({ ...formAbono, fecha_abono: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>{tc.campos.metodoPago}</Label>
              <Input
                value={formAbono.metodo_pago}
                onChange={e => setFormAbono({ ...formAbono, metodo_pago: e.target.value })}
              />
            </div>
            <div>
              <Label>{tc.campos.referencia}</Label>
              <Input
                value={formAbono.referencia}
                onChange={e => setFormAbono({ ...formAbono, referencia: e.target.value })}
              />
            </div>
            <div>
              <Label>{tc.campos.notas}</Label>
              <Textarea
                value={formAbono.notas}
                onChange={e => setFormAbono({ ...formAbono, notas: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbonoTarget(null)}>{t.actions.cancel}</Button>
            <Button onClick={guardarAbono} disabled={guardando}>
              {guardando ? tc.guardando : tc.guardarAbono}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
