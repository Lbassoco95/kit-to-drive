// Control Financiero — libro mayor de caja: ingresos y egresos en una sola
// línea de tiempo, con saldos por caja/banco y pendientes de comprobar.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
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
  Bike, Truck, BarChart3, Users, TrendingUp, CheckCircle, DollarSign,
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
    const errores = validarMovimiento(form, cuentas);
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

    toast.success(`✓ ${data.folio} registrado — agrega su expediente`);
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
            <Wallet size={28} className="text-[#1F3864]" />
            Control Financiero
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Ingresos de caja y egresos · {filtrados.length} de {movs.length} movimientos
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-12 px-4 text-base" onClick={() => navigate("/proveedores")}>
            <Building2 className="mr-2 h-5 w-5" /> Proveedores
          </Button>
          {puedeCapturar && (
            <>
              <Button
                onClick={() => abrirAlta("INGRESO")}
                className="h-12 bg-emerald-600 px-5 text-base hover:bg-emerald-700"
              >
                <ArrowDownCircle className="mr-2 h-5 w-5" /> Registrar ingreso
              </Button>
              <Button
                onClick={() => abrirAlta("EGRESO")}
                className="h-12 bg-[#1F3864] px-5 text-base hover:bg-[#162a4d]"
              >
                <ArrowUpCircle className="mr-2 h-5 w-5" /> Registrar egreso
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
                  <Icono size={15} className="text-[#2E75B6]" />
                  <span className="truncate font-medium">{s.nombre}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">{s.moneda}</Badge>
                </div>
                <div className={`mt-1.5 text-2xl font-extrabold ${negativo ? "text-red-600" : "text-[#1F3864]"}`}>
                  {fmtMoneda(Number(s.saldo_actual), s.moneda)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="text-emerald-600">+{fmtMoneda(Number(s.total_ingresos), s.moneda)}</span>
                  {" · "}
                  <span className="text-red-500">−{fmtMoneda(Number(s.total_egresos), s.moneda)}</span>
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
              <p className="font-bold text-amber-900">
                {porComprobar.length} entrega{porComprobar.length === 1 ? "" : "s"} de efectivo sin comprobar
              </p>
              <p className="text-sm text-amber-800">
                {fmtMoneda(porComprobar.reduce((s, m) => s + Number(m.monto_mxn ?? 0), 0))} entregados que
                todavía no tienen comprobante ni cambio de vuelta.
              </p>
            </div>
            <ChevronRight size={18} className="text-amber-600" />
          </div>
        </Card>
      )}

      {/* Totales del filtro */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Ingresos confirmados</p>
          <p className="text-2xl font-extrabold text-emerald-600">{fmtMoneda(totales.ingresos)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Egresos confirmados</p>
          <p className="text-2xl font-extrabold text-red-600">{fmtMoneda(totales.egresos)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Neto (MXN)</p>
          <p className={`text-2xl font-extrabold ${totales.neto < 0 ? "text-red-600" : "text-[#1F3864]"}`}>
            {fmtMoneda(totales.neto)}
          </p>
        </Card>
      </div>

      <ResumenEjecutivo />

      {/* Búsqueda + pestañas */}
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap gap-2">
          {([
            { v: "TODOS" as FiltroTipo, label: "Todos" },
            { v: "INGRESO" as FiltroTipo, label: "Ingresos" },
            { v: "EGRESO" as FiltroTipo, label: "Egresos" },
          ]).map(t => (
            <button
              key={t.v}
              onClick={() => setTipo(t.v)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                tipo === t.v ? "bg-[#1F3864] text-white" : "bg-[#2E75B6]/10 text-[#1F3864] hover:bg-[#2E75B6]/20"
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
            Filtros{filtrosActivos ? " ·" : ""}
          </Button>
          {filtrosActivos && (
            <Button variant="ghost" className="h-10" onClick={limpiarFiltros}>
              <X size={15} className="mr-1" /> Limpiar
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input
            className="h-12 pl-10 text-base"
            placeholder="Buscar por folio, concepto, cliente, proveedor, referencia…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {filtrosAbiertos && (
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label className="text-xs">Estatus</Label>
              <Select value={estatus} onValueChange={v => setEstatus(v as MovEstatus | "TODOS")}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  {(Object.keys(ESTATUS_MOV) as MovEstatus[]).map(e => (
                    <SelectItem key={e} value={e}>{ESTATUS_MOV[e].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Caja / banco</Label>
              <Select value={cuentaId} onValueChange={setCuentaId}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas</SelectItem>
                  {cuentas.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre} · {c.moneda}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Forma de pago</Label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todas</SelectItem>
                  {METODOS_PAGO.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Desde</Label>
              <Input type="date" className="h-10" value={desde} onChange={e => setDesde(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Hasta</Label>
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
                Solo pendientes de comprobar
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Lista */}
      {cargando ? (
        <div className="py-16 text-center text-muted-foreground">Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground">
          {movs.length === 0
            ? "Aún no hay movimientos. Registra el primer ingreso o egreso."
            : "Ningún movimiento coincide con la búsqueda."}
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
                      <span className="truncate text-base font-bold text-[#1F3864]">{m.concepto}</span>
                      <Badge variant="outline" className={est.clase}>{est.label}</Badge>
                      {m.tiene_factura && (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-xs text-emerald-700">
                          <FileText size={11} className="mr-1" /> Con factura
                        </Badge>
                      )}
                      {pendienteComprobar && (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-xs text-amber-800">
                          <AlertTriangle size={11} className="mr-1" /> Por comprobar
                        </Badge>
                      )}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {esIngreso ? "Pagó:" : "Pagamos a:"}
                      </span>{" "}
                      {m.contraparte_nombre}
                      {m.via === "INTERMEDIARIO" && m.intermediario_display && (
                        <span className="text-amber-700">
                          {" "}· {esIngreso ? "lo trajo" : "vía"} {m.intermediario_display}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{fmtFecha(m.fecha_movimiento)}</span>
                      {m.cuenta_nombre && <span>· {m.cuenta_nombre}</span>}
                      <span>· {METODOS_PAGO.find(x => x.value === m.metodo_pago)?.label ?? m.metodo_pago}</span>
                      {m.categoria && <span>· {m.categoria}</span>}
                      {m.folio_remision && <span>· Remisión {m.folio_remision}</span>}
                      {!!m.adjuntos_count && <span>· {m.adjuntos_count} doc.</span>}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className={`text-lg font-extrabold ${esIngreso ? "text-emerald-600" : "text-red-600"}`}>
                      {esIngreso ? "+" : "−"}{fmtMoneda(Number(m.monto), m.moneda)}
                    </div>
                    {m.moneda !== "MXN" && (
                      <div className="text-xs text-muted-foreground">
                        {fmtMoneda(Number(m.monto_mxn), "MXN")}
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
              {form.tipo === "INGRESO" ? "Registrar ingreso a caja" : "Registrar egreso / pago"}
            </DialogTitle>
          </DialogHeader>
          <MovimientoForm form={form} setForm={setForm} cuentas={cuentas} />
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setAltaAbierta(false)}>
              Cancelar
            </Button>
            <Button
              onClick={guardar}
              disabled={guardando}
              className="h-11 bg-[#1F3864] px-6 hover:bg-[#162a4d]"
            >
              {guardando ? "Guardando…" : "Guardar y abrir expediente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Resumen ejecutivo para Dirección / Finanzas: une dinero (que ya está
// en la pantalla), motocarros y actividad del equipo comercial.
function ResumenEjecutivo() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({
    motosTotal: 0,
    motosEntregados: 0,
    motosPorEntregar: 0,
    remisionesTotal: 0,
    remisionesCompletas: 0,
    remisionesParciales: 0,
    oportunidadesTotal: 0,
    oportunidadesGanadas: 0,
    oportunidadesMonto: 0,
    actividadesMes: 0,
    topVendedores: [] as { nombre: string; monto: number }[],
  });

  useEffect(() => {
    let mounted = true;
    const cargar = async () => {
      const ahora = new Date();
      const hace30 = new Date(ahora.setDate(ahora.getDate() - 30)).toISOString();
      const [
        { data: motos },
        { data: rems },
        { count: opsTotal },
        { count: opsGanadas },
        { data: opsGanadasData },
        { count: actividades },
      ] = await Promise.all([
        supabase.from("motocarros").select("estatus_entrega"),
        supabase.from("remisiones").select("estatus"),
        supabase.from("crm_oportunidades").select("*", { count: "exact", head: true }),
        supabase.from("crm_oportunidades").select("*", { count: "exact", head: true }).eq("etapa", "ganado"),
        supabase.from("crm_oportunidades").select("vendedor_id, monto_estimado").eq("etapa", "ganado"),
        supabase.from("crm_actividades").select("*", { count: "exact", head: true }).gte("fecha", hace30),
      ]);

      const motosTotal = (motos ?? []).length;
      const motosEntregados = (motos ?? []).filter((m: any) => m.estatus_entrega === "ENTREGADA").length;
      const motosPorEntregar = motosTotal - motosEntregados;

      const remisionesTotal = (rems ?? []).length;
      const remisionesCompletas = (rems ?? []).filter((r: any) => r.estatus === "COMPLETA").length;
      const remisionesParciales = (rems ?? []).filter((r: any) => r.estatus === "PARCIAL").length;

      const montoTotal = (opsGanadasData ?? []).reduce((s: number, o: any) => s + (o.monto_estimado || 0), 0);

      const vendedorMontos: Record<string, number> = {};
      (opsGanadasData ?? []).forEach((o: any) => {
        if (o.vendedor_id && o.monto_estimado) {
          vendedorMontos[o.vendedor_id] = (vendedorMontos[o.vendedor_id] || 0) + o.monto_estimado;
        }
      });

      let topVendedores: { nombre: string; monto: number }[] = [];
      const vendedorIds = Object.keys(vendedorMontos);
      if (vendedorIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, nombre_completo").in("id", vendedorIds);
        topVendedores = (profiles ?? [])
          .map((p: any) => ({ nombre: p.nombre_completo || "Sin nombre", monto: vendedorMontos[p.id] || 0 }))
          .sort((a, b) => b.monto - a.monto)
          .slice(0, 5);
      }

      if (mounted) {
        setKpis({
          motosTotal,
          motosEntregados,
          motosPorEntregar,
          remisionesTotal,
          remisionesCompletas,
          remisionesParciales,
          oportunidadesTotal: opsTotal || 0,
          oportunidadesGanadas: opsGanadas || 0,
          oportunidadesMonto: montoTotal,
          actividadesMes: actividades || 0,
          topVendedores,
        });
        setLoading(false);
      }
    };
    cargar();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return <div className="text-center py-10 text-muted-foreground">Cargando resumen ejecutivo…</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-[#1F3864]">Resumen ejecutivo</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 bg-[#1F3864]/5 border-[#1F3864]/10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bike size={18} className="text-[#1F3864]" /> Motocarros totales
          </div>
          <div className="text-3xl font-extrabold text-[#1F3864] mt-1">{kpis.motosTotal}</div>
        </Card>
        <Card className="p-4 bg-emerald-50 border-emerald-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle size={18} className="text-emerald-600" /> Entregados
          </div>
          <div className="text-3xl font-extrabold text-emerald-600 mt-1">{kpis.motosEntregados}</div>
        </Card>
        <Card className="p-4 bg-amber-50 border-amber-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Truck size={18} className="text-amber-600" /> Por entregar
          </div>
          <div className="text-3xl font-extrabold text-amber-600 mt-1">{kpis.motosPorEntregar}</div>
        </Card>
        <Card className="p-4 bg-blue-50 border-blue-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart3 size={18} className="text-blue-600" /> Remisiones
          </div>
          <div className="text-3xl font-extrabold text-blue-600 mt-1">{kpis.remisionesTotal}</div>
        </Card>
        <Card className="p-4 bg-purple-50 border-purple-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp size={18} className="text-purple-600" /> Oportunidades
          </div>
          <div className="text-3xl font-extrabold text-purple-600 mt-1">{kpis.oportunidadesTotal}</div>
        </Card>
        <Card className="p-4 bg-green-50 border-green-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle size={18} className="text-green-600" /> Oportunidades ganadas
          </div>
          <div className="text-3xl font-extrabold text-green-600 mt-1">{kpis.oportunidadesGanadas}</div>
        </Card>
        <Card className="p-4 bg-yellow-50 border-yellow-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign size={18} className="text-yellow-600" /> Monto ganado
          </div>
          <div className="text-2xl font-extrabold text-yellow-600 mt-1">{fmtMoneda(kpis.oportunidadesMonto)}</div>
        </Card>
        <Card className="p-4 bg-indigo-50 border-indigo-100">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users size={18} className="text-indigo-600" /> Actividades (30d)
          </div>
          <div className="text-3xl font-extrabold text-indigo-600 mt-1">{kpis.actividadesMes}</div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-[#1F3864] flex items-center gap-2 mb-3">
            <Truck size={20} /> Estado de remisiones
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between p-2 bg-slate-50 rounded"><span>Completas</span><span className="font-bold text-emerald-600">{kpis.remisionesCompletas}</span></div>
            <div className="flex justify-between p-2 bg-slate-50 rounded"><span>Parciales</span><span className="font-bold text-[#1F3864]">{kpis.remisionesParciales}</span></div>
            <div className="flex justify-between p-2 bg-slate-50 rounded"><span>Otras</span><span className="font-bold text-slate-600">{kpis.remisionesTotal - kpis.remisionesCompletas - kpis.remisionesParciales}</span></div>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold text-[#1F3864] flex items-center gap-2 mb-3">
            <Users size={20} /> Top vendedores (monto ganado)
          </h3>
          {kpis.topVendedores.length > 0 ? (
            <div className="space-y-2">
              {kpis.topVendedores.map((v, idx) => (
                <div key={v.nombre} className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="font-medium">{idx + 1}. {v.nombre}</span>
                  <span className="font-bold text-[#1F3864]">{fmtMoneda(v.monto)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">Sin ventas registradas</div>
          )}
        </Card>
      </div>
    </div>
  );
}
