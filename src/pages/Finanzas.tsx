// Control Financiero — libro mayor de caja: ingresos y egresos en una sola
// línea de tiempo, con saldos por caja/banco y pendientes de comprobar.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Search, Wallet, ArrowDownCircle, ArrowUpCircle, FileText,
  AlertTriangle, Banknote, Landmark, Building2, ChevronRight, Filter, X,
} from "lucide-react";
import MovimientoForm from "@/components/finanzas/MovimientoForm";
import { fdb } from "@/lib/finanzasDb";
import {
  fmtMoneda, fmtFecha, formVacio, validarMovimiento, coincideBusqueda,
  totalesMXN, ESTATUS_MOV, METODOS_PAGO,
  type Cuenta, type SaldoCuenta, type Movimiento, type MovEstatus,
  type MovTipo, type MovimientoForm as FormState,
} from "@/lib/finanzas";

type FiltroTipo = "TODOS" | MovTipo;

export default function Finanzas() {
  const { user, perms } = useAuth();
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "es-MX";
  const navigate = useNavigate();

  const [movs, setMovs] = useState<Movimiento[]>([]);
  const [saldos, setSaldos] = useState<SaldoCuenta[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Filtros
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<FiltroTipo>("TODOS");
  const [estatus, setEstatus] = useState<MovEstatus | "TODOS">("TODOS");
  const [cuentaId, setCuentaId] = useState("TODAS");
  const [metodo, setMetodo] = useState("TODOS");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [soloPorComprobar, setSoloPorComprobar] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  // Alta
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [form, setForm] = useState<FormState>(formVacio("INGRESO"));

  const puedeCapturar = perms.puedeCrear("finanzas");

  // ── Carga ─────────────────────────────────────────────────
  const cargar = async () => {
    setCargando(true);
    const [mv, sd, ct] = await Promise.all([
      fdb.from("v_movimientos_financieros").select("*")
         .order("fecha_movimiento", { ascending: false })
         .order("created_at", { ascending: false })
         .limit(500),
      fdb.from("v_saldos_cuentas").select("*").order("orden"),
      fdb.from("cuentas_financieras").select("*").order("orden"),
    ]);
    if (mv.error) toast.error(mv.error.message); else setMovs(mv.data ?? []);
    if (!sd.error) setSaldos(sd.data ?? []);
    if (!ct.error) setCuentas(ct.data ?? []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, []);

  // ── Filtrado ──────────────────────────────────────────────
  const filtrados = useMemo(() => movs.filter(m => {
    if (tipo !== "TODOS" && m.tipo !== tipo) return false;
    if (estatus !== "TODOS" && m.estatus !== estatus) return false;
    if (cuentaId !== "TODAS" && m.cuenta_id !== cuentaId) return false;
    if (metodo !== "TODOS" && m.metodo_pago !== metodo) return false;
    if (desde && m.fecha_movimiento < desde) return false;
    if (hasta && m.fecha_movimiento > hasta) return false;
    if (soloPorComprobar && !(m.requiere_comprobacion && !m.comprobado)) return false;
    return coincideBusqueda(m, q);
  }), [movs, tipo, estatus, cuentaId, metodo, desde, hasta, soloPorComprobar, q]);

  const totales = useMemo(() => totalesMXN(filtrados), [filtrados]);

  const porComprobar = useMemo(
    () => movs.filter(m => m.requiere_comprobacion && !m.comprobado && m.estatus !== "CANCELADO"),
    [movs]);

  const filtrosActivos =
    tipo !== "TODOS" || estatus !== "TODOS" || cuentaId !== "TODAS" ||
    metodo !== "TODOS" || !!desde || !!hasta || soloPorComprobar;

  const limpiarFiltros = () => {
    setTipo("TODOS"); setEstatus("TODOS"); setCuentaId("TODAS");
    setMetodo("TODOS"); setDesde(""); setHasta(""); setSoloPorComprobar(false);
  };

  // ── Alta ──────────────────────────────────────────────────
  const abrirAlta = (t: MovTipo) => {
    setForm(formVacio(t));
    setAltaAbierta(true);
  };

  const guardar = async () => {
    const errores = validarMovimiento(form, cuentas, t.finanzas.validacion);
    if (errores.length) { toast.error(errores[0]); return; }

    setGuardando(true);
    const { data, error } = await fdb.from("movimientos_financieros").insert({
      tipo: form.tipo,
      estatus: "PENDIENTE",
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
      created_by: user?.id,
    }).select("id, folio").single();

    setGuardando(false);
    if (error) { toast.error(error.message); return; }

    toast.success(t.finanzas.registrado(data.folio));
    setAltaAbierta(false);
    await cargar();
    navigate(`/finanzas/${data.id}`);
  };

  // ── Render ────────────────────────────────────────────────
  const iconoCuenta = (t: string) => (t === "EFECTIVO" ? Banknote : Landmark);

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Wallet size={28} className="text-primary" />
            {t.finanzas.title}
          </h1>
          <p className="mt-1 text-base text-muted-foreground">{t.finanzas.subtitle(filtrados.length, movs.length)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-12 px-4 text-base" onClick={() => navigate("/proveedores")}>
            <Building2 className="mr-2 h-5 w-5" /> {t.finanzas.proveedores}
          </Button>
          {puedeCapturar && (
            <>
              <Button
                onClick={() => abrirAlta("INGRESO")}
                className="h-12 bg-emerald-600 px-5 text-base hover:bg-emerald-700"
              >
                <ArrowDownCircle className="mr-2 h-5 w-5" /> {t.finanzas.registrarIngreso}
              </Button>
              <Button
                onClick={() => abrirAlta("EGRESO")}
                className="h-12 bg-primary px-5 text-base hover:bg-primary-hover"
              >
                <ArrowUpCircle className="mr-2 h-5 w-5" /> {t.finanzas.registrarEgreso}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Saldos por caja / banco */}
      {saldos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {saldos.filter(s => s.activo).map(s => {
            const Icono = iconoCuenta(s.tipo);
            const negativo = Number(s.saldo_actual) < 0;
            return (
              <Card key={s.id} className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icono size={15} className="text-secondary" />
                  <span className="truncate font-medium">{s.nombre}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">{s.moneda}</Badge>
                </div>
                <div className={`mt-1.5 text-2xl font-extrabold ${negativo ? "text-red-600" : "text-primary"}`}>
                  {fmtMoneda(Number(s.saldo_actual), s.moneda, locale)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="text-emerald-600">+{fmtMoneda(Number(s.total_ingresos), s.moneda, locale)}</span>
                  {" · "}
                  <span className="text-red-500">−{fmtMoneda(Number(s.total_egresos), s.moneda, locale)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Alerta de efectivo sin comprobar */}
      {porComprobar.length > 0 && (
        <Card
          className="cursor-pointer border-amber-200 bg-amber-50 p-4 transition-shadow hover:shadow-md"
          onClick={() => { setSoloPorComprobar(true); setFiltrosAbiertos(true); }}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="font-bold text-amber-900">{t.finanzas.sinComprobar(porComprobar.length)}</p>
              <p className="text-sm text-amber-800">
                {t.finanzas.sinComprobarDesc(fmtMoneda(porComprobar.reduce((s, m) => s + Number(m.monto_mxn ?? 0), 0), "MXN", locale))}
              </p>
            </div>
            <ChevronRight size={18} className="text-amber-600" />
          </div>
        </Card>
      )}

      {/* Totales del filtro */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t.finanzas.ingresosConfirmados}</p>
          <p className="text-2xl font-extrabold text-emerald-600">{fmtMoneda(totales.ingresos, "MXN", locale)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t.finanzas.egresosConfirmados}</p>
          <p className="text-2xl font-extrabold text-red-600">{fmtMoneda(totales.egresos, "MXN", locale)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{t.finanzas.neto}</p>
          <p className={`text-2xl font-extrabold ${totales.neto < 0 ? "text-red-600" : "text-primary"}`}>
            {fmtMoneda(totales.neto, "MXN", locale)}
          </p>
        </Card>
      </div>

      {/* Búsqueda + pestañas */}
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          {([
            { v: "TODOS" as FiltroTipo, label: t.finanzas.tabs.todos },
            { v: "INGRESO" as FiltroTipo, label: t.finanzas.tabs.ingresos },
            { v: "EGRESO" as FiltroTipo, label: t.finanzas.tabs.egresos },
          ]).map(t => (
            <button
              key={t.v}
              onClick={() => setTipo(t.v)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                tipo === t.v ? "bg-primary text-white" : "bg-secondary/10 text-primary hover:bg-secondary/20"
              }`}
            >
              {t.label}
            </button>
          ))}
          <Button
            variant="outline"
            className="ml-auto h-10"
            onClick={() => setFiltrosAbiertos(v => !v)}
          >
            <Filter size={15} className="mr-1.5" />
            {t.finanzas.filtros}{filtrosActivos ? " ·" : ""}
          </Button>
          {filtrosActivos && (
            <Button variant="ghost" className="h-10" onClick={limpiarFiltros}>
              <X size={15} className="mr-1" /> {t.finanzas.limpiar}
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input
            className="h-12 pl-10 text-base"
            placeholder={t.finanzas.buscar}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {filtrosAbiertos && (
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label className="text-xs">{t.finanzas.estatus}</Label>
              <Select value={estatus} onValueChange={v => setEstatus(v as MovEstatus | "TODOS")}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">{t.finanzas.todos}</SelectItem>
                  {(Object.keys(ESTATUS_MOV) as MovEstatus[]).map(e => (
                    <SelectItem key={e} value={e}>{t.finanzas.estatusMov(e)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t.finanzas.cajaBanco}</Label>
              <Select value={cuentaId} onValueChange={setCuentaId}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">{t.finanzas.todas}</SelectItem>
                  {cuentas.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre} · {c.moneda}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t.finanzas.formaPago}</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">{t.finanzas.todas}</SelectItem>
                  {METODOS_PAGO.map(m => (
                    <SelectItem key={m.value} value={m.value}>{t.finanzas.metodoPago(m.value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t.finanzas.desde}</Label>
              <Input type="date" className="h-10" value={desde} onChange={e => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{t.finanzas.hasta}</Label>
              <Input type="date" className="h-10" value={hasta} onChange={e => setHasta(e.target.value)} />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setSoloPorComprobar(v => !v)}
                className={`h-10 w-full rounded-md border px-3 text-sm font-medium transition-colors ${
                  soloPorComprobar
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {t.finanzas.soloPorComprobar}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Lista */}
      {cargando ? (
        <div className="py-16 text-center text-muted-foreground">{t.finanzas.cargando}</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground">
          {movs.length === 0 ? t.finanzas.sinMovimientos : t.finanzas.sinCoincidencias}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtrados.map(m => {
            const esIngreso = m.tipo === "INGRESO";
            const est = ESTATUS_MOV[m.estatus];
            const pendienteComprobar = m.requiere_comprobacion && !m.comprobado;
            return (
              <Card
                key={m.id}
                className="cursor-pointer p-4 transition-shadow hover:shadow-md"
                onClick={() => navigate(`/finanzas/${m.id}`)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 shrink-0 rounded-full p-2 ${
                      esIngreso ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                    }`}
                  >
                    {esIngreso ? <ArrowDownCircle size={20} /> : <ArrowUpCircle size={20} />}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{m.folio}</span>
                      <span className="truncate text-base font-bold text-primary">{m.concepto}</span>
                      <Badge variant="outline" className={est.clase}>{t.finanzas.estatusMov(m.estatus)}</Badge>
                      {m.tiene_factura && (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-xs text-emerald-700">
                          <FileText size={11} className="mr-1" /> {t.finanzas.conFactura}
                        </Badge>
                      )}
                      {pendienteComprobar && (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-xs text-amber-800">
                          <AlertTriangle size={11} className="mr-1" /> {t.finanzas.porComprobar}
                        </Badge>
                      )}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {esIngreso ? t.finanzas.pago : t.finanzas.pagamosA}
                      </span>{" "}
                      {m.contraparte_nombre}
                      {m.via === "INTERMEDIARIO" && m.intermediario_display && (
                        <span className="text-amber-700">
                          {" "}· {esIngreso ? t.finanzas.loTrajo : t.finanzas.via} {m.intermediario_display}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{fmtFecha(m.fecha_movimiento, locale)}</span>
                      {m.cuenta_nombre && <span>· {m.cuenta_nombre}</span>}
                      <span>· {t.finanzas.metodoPago(m.metodo_pago)}</span>
                      {m.categoria && <span>· {m.categoria}</span>}
                      {m.folio_remision && <span>· {t.finanzas.remisionCorta(m.folio_remision)}</span>}
                      {!!m.adjuntos_count && <span>· {t.finanzas.docs(m.adjuntos_count)}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className={`text-lg font-extrabold ${esIngreso ? "text-emerald-600" : "text-red-600"}`}>
                      {esIngreso ? "+" : "−"}{fmtMoneda(Number(m.monto), m.moneda, locale)}
                    </div>
                    {m.moneda !== "MXN" && (
                      <div className="text-xs text-muted-foreground">
                        {fmtMoneda(Number(m.monto_mxn), "MXN", locale)}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Alta de movimiento */}
      <Dialog open={altaAbierta} onOpenChange={o => { if (!o) setAltaAbierta(false); }}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus size={18} />
              {form.tipo === "INGRESO" ? t.finanzas.altaIngreso : t.finanzas.altaEgreso}
            </DialogTitle>
          </DialogHeader>
          <MovimientoForm form={form} setForm={setForm} cuentas={cuentas} />
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setAltaAbierta(false)}>
              {t.actions.cancel}
            </Button>
            <Button
              onClick={guardar}
              disabled={guardando}
              className="h-11 bg-primary px-6 hover:bg-primary-hover"
            >
              {guardando ? t.finanzas.guardando : t.finanzas.guardarAbrirExpediente}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


