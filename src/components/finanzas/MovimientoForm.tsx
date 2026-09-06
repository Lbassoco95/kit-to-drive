// Formulario de captura de un movimiento de caja. El mismo formulario sirve
// para ingresos y egresos; lo que cambia son las etiquetas y la vía del dinero.
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownCircle, ArrowUpCircle, AlertTriangle, Search } from "lucide-react";
import ContraparteSelector from "./ContraparteSelector";
import { useLang } from "@/contexts/LangContext";
import { fdb } from "@/lib/finanzasDb";
import {
  MONEDAS, METODOS_PAGO, fmtMoneda, etiquetaVia, etiquetaIntermediario,
  requiereComprobacion, type Cuenta, type MetodoPago, type MovTipo,
  type MovVia, type MovimientoForm as FormState,
} from "@/lib/finanzas";

interface Perfil { id: string; nombre_completo: string | null; email: string | null }
interface Props {
  form: FormState;
  setForm: (f: FormState) => void;
  cuentas: Cuenta[];
  /** Bloquea el cambio de tipo cuando se está editando un movimiento ya guardado. */
  tipoFijo?: boolean;
}

export default function MovimientoForm({ form, setForm, cuentas, tipoFijo }: Props) {
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "es-MX";
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [remisiones, setRemisiones] = useState<{ id: string; folio_remision: string }[]>([]);
  const [qRemision, setQRemision] = useState("");

  const set = (parcial: Partial<FormState>) => setForm({ ...form, ...parcial });

  useEffect(() => {
    fdb.from("profiles").select("id, nombre_completo, email").order("nombre_completo")
      .then(({ data }: { data: Perfil[] | null }) => setPerfiles(data ?? []));
  }, []);

  useEffect(() => {
    fdb.from("categorias_financieras")
      .select("nombre").eq("tipo", form.tipo).eq("activo", true).order("orden")
      .then(({ data }: { data: { nombre: string }[] | null }) =>
        setCategorias((data ?? []).map(c => c.nombre)));
  }, [form.tipo]);

  // Las remisiones solo aplican a ingresos: sirven para saber qué venta se está cobrando
  useEffect(() => {
    if (form.tipo !== "INGRESO") { setRemisiones([]); return; }
    fdb.from("remisiones").select("id, folio_remision")
      .order("created_at", { ascending: false }).limit(300)
      .then(({ data }: { data: { id: string; folio_remision: string }[] | null }) =>
        setRemisiones(data ?? []));
  }, [form.tipo]);

  const remisionesFiltradas = useMemo(() => {
    const term = qRemision.trim().toLowerCase();
    const base = term
      ? remisiones.filter(r => r.folio_remision?.toLowerCase().includes(term))
      : remisiones;
    return base.slice(0, 30);
  }, [remisiones, qRemision]);

  const cuentasCompatibles = cuentas.filter(c => c.activo && c.moneda === form.moneda);
  const cuentaElegida = cuentas.find(c => c.id === form.cuenta_id);
  const exigeComprobacion = requiereComprobacion(form);
  const nombrePerfil = (p: Perfil) => p.nombre_completo || p.email || "—";

  // Cambiar de moneda invalida la cuenta si ya no coincide
  const cambiarMoneda = (moneda: string) => {
    const sigueValiendo = cuentas.some(c => c.id === form.cuenta_id && c.moneda === moneda);
    set({
      moneda,
      cuenta_id: sigueValiendo ? form.cuenta_id : "",
      tipo_cambio: moneda === "MXN" ? "" : form.tipo_cambio,
    });
  };

  const cambiarTipo = (tipo: MovTipo) => {
    set({
      tipo,
      categoria: "",
      contraparte_tipo: tipo === "INGRESO" ? "CLIENTE" : "PROVEEDOR",
      cliente_id: null, proveedor_id: null, empleado_id: null, contraparte_nombre: "",
      remision_id: null,
    });
  };

  const montoNum = parseFloat(form.monto) || 0;
  const tcNum = parseFloat(form.tipo_cambio) || 0;

  return (
    <div className="space-y-4">
      {/* ── Tipo de movimiento ── */}
      <div className="grid grid-cols-2 gap-2">
        {(["INGRESO", "EGRESO"] as MovTipo[]).map(tipo => {
          const activo = form.tipo === tipo;
          const esIngreso = tipo === "INGRESO";
          const Icon = esIngreso ? ArrowDownCircle : ArrowUpCircle;
          return (
            <button
              key={tipo}
              type="button"
              disabled={tipoFijo}
              onClick={() => cambiarTipo(tipo)}
              className={`flex items-center justify-center gap-2 rounded-lg border-2 py-3 font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                activo
                  ? esIngreso
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-red-400 bg-red-50 text-red-600"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              <Icon size={20} />
              {esIngreso ? t.finanzas.form.ingresoCaja : t.finanzas.form.egresoPago}
            </button>
          );
        })}
      </div>

      {/* ── Qué fue ── */}
      <div>
        <Label>{t.finanzas.form.concepto}</Label>
        <Input
          value={form.concepto}
          onChange={e => set({ concepto: e.target.value })}
          className="h-11"
          placeholder={form.tipo === "INGRESO" ? t.finanzas.form.conceptoIngreso : t.finanzas.form.conceptoEgreso}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{t.finanzas.form.categoria}</Label>
          <Select value={form.categoria || undefined} onValueChange={v => set({ categoria: v })}>
            <SelectTrigger className="h-11"><SelectValue placeholder={t.finanzas.form.selecciona} /></SelectTrigger>
            <SelectContent>
              {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t.finanzas.form.fecha}</Label>
          <Input
            type="date"
            value={form.fecha_movimiento}
            onChange={e => set({ fecha_movimiento: e.target.value })}
            className="h-11"
          />
        </div>
      </div>

      {/* ── Cuánto ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>{t.finanzas.form.monto}</Label>
          <Input
            type="number" min="0" step="0.01"
            value={form.monto}
            onChange={e => set({ monto: e.target.value })}
            className="h-11"
            placeholder="0.00"
          />
        </div>
        <div>
          <Label>{t.finanzas.form.moneda}</Label>
          <Select value={form.moneda} onValueChange={cambiarMoneda}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONEDAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t.finanzas.form.tipoCambio} {form.moneda !== "MXN" && "*"}</Label>
          <Input
            type="number" min="0" step="0.0001"
            value={form.tipo_cambio}
            onChange={e => set({ tipo_cambio: e.target.value })}
            className="h-11"
            disabled={form.moneda === "MXN"}
            placeholder={form.moneda === "MXN" ? "—" : "18.4250"}
          />
        </div>
      </div>

      {form.moneda !== "MXN" && montoNum > 0 && tcNum > 0 && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {t.finanzas.form.equivaleA} <strong className="text-[#1F3864]">{fmtMoneda(montoNum * tcNum, "MXN", locale)}</strong>
        </p>
      )}

      {/* ── Cómo y de dónde ── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>{t.finanzas.form.formaPago}</Label>
          <Select value={form.metodo_pago} onValueChange={v => set({ metodo_pago: v as MetodoPago })}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {METODOS_PAGO.map(m => <SelectItem key={m.value} value={m.value}>{t.finanzas.metodoPago(m.value)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{form.tipo === "INGRESO" ? t.finanzas.form.entroA : t.finanzas.form.salioDe}</Label>
          <Select value={form.cuenta_id || undefined} onValueChange={v => set({ cuenta_id: v })}>
            <SelectTrigger className="h-11">
              <SelectValue placeholder={cuentasCompatibles.length ? t.finanzas.form.cajaOBanco : t.finanzas.form.sinCuentas(form.moneda)} />
            </SelectTrigger>
            <SelectContent>
              {cuentasCompatibles.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre} · {c.moneda}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cuentaElegida && cuentaElegida.moneda !== form.moneda && (
            <p className="mt-1 text-xs text-red-600">
              {t.finanzas.form.cuentaMoneda(cuentaElegida.nombre, cuentaElegida.moneda)}
            </p>
          )}
        </div>
      </div>

      {form.metodo_pago !== "EFECTIVO" && (
        <div>
          <Label>{t.finanzas.form.referencia}</Label>
          <Input
            value={form.referencia}
            onChange={e => set({ referencia: e.target.value })}
            className="h-11"
            placeholder={t.finanzas.form.referenciaPlaceholder}
          />
        </div>
      )}

      {/* ── Contraparte ── */}
      <div className="rounded-lg border p-3">
        <ContraparteSelector
          tipoMovimiento={form.tipo}
          contraparteTipo={form.contraparte_tipo}
          clienteId={form.cliente_id}
          proveedorId={form.proveedor_id}
          empleadoId={form.empleado_id}
          nombre={form.contraparte_nombre}
          onChange={v => set(v)}
        />
      </div>

      {/* ── Vía del dinero ── */}
      <div className="rounded-lg border p-3 space-y-2">
        <Label>{t.finanzas.form.comoSeMovio}</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["DIRECTO", "INTERMEDIARIO"] as MovVia[]).map(v => (
            <button
              key={v}
              type="button"
              onClick={() => set({
                via: v,
                intermediario_id: v === "DIRECTO" ? null : form.intermediario_id,
                intermediario_nombre: v === "DIRECTO" ? "" : form.intermediario_nombre,
              })}
              className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                form.via === v
                  ? "border-[#1F3864] bg-[#EFF6FF] font-semibold text-[#1F3864]"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {etiquetaVia(form.tipo, v, t.finanzas.validacion)}
            </button>
          ))}
        </div>

        {form.via === "INTERMEDIARIO" && (
          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{etiquetaIntermediario(form.tipo, t.finanzas.validacion)} {t.finanzas.form.delEquipo}</Label>
              <Select
                value={form.intermediario_id || undefined}
                onValueChange={v => set({ intermediario_id: v, intermediario_nombre: "" })}
              >
                <SelectTrigger className="h-11"><SelectValue placeholder={t.finanzas.form.selecciona} /></SelectTrigger>
                <SelectContent>
                  {perfiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{nombrePerfil(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t.finanzas.form.oExterno}</Label>
              <Input
                value={form.intermediario_nombre}
                onChange={e => set({ intermediario_nombre: e.target.value, intermediario_id: null })}
                className="h-11"
                placeholder={t.finanzas.form.nombreQuienLlevo}
              />
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs">
            {form.tipo === "INGRESO" ? t.finanzas.form.quienRecibio : t.finanzas.form.quienAutorizo}
          </Label>
          <Select value={form.recibido_por || undefined} onValueChange={v => set({ recibido_por: v })}>
            <SelectTrigger className="h-11"><SelectValue placeholder={t.finanzas.form.selecciona} /></SelectTrigger>
            <SelectContent>
              {perfiles.map(p => (
                <SelectItem key={p.id} value={p.id}>{nombrePerfil(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {exigeComprobacion && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs text-amber-800">
              {t.finanzas.form.avisoComprobar1} <strong>{t.finanzas.form.avisoComprobarBold}</strong>{t.finanzas.form.avisoComprobar2}
            </p>
          </div>
        )}
      </div>

      {/* ── Amarre con la venta ── */}
      {form.tipo === "INGRESO" && (
        <div className="rounded-lg border p-3 space-y-2">
          <Label>{t.finanzas.form.remisionCobrada}</Label>
          {form.remision_id ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
              <span className="text-sm font-semibold text-blue-900">
                {remisiones.find(r => r.id === form.remision_id)?.folio_remision ?? t.finanzas.form.remisionLigada}
              </span>
              <button
                type="button"
                className="text-xs text-blue-700 underline"
                onClick={() => set({ remision_id: null })}
              >
                {t.finanzas.form.quitar}
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-11 pl-9"
                  placeholder={t.finanzas.form.buscarRemision}
                  value={qRemision}
                  onChange={e => setQRemision(e.target.value)}
                />
              </div>
              {qRemision && (
                <div className="max-h-32 divide-y overflow-y-auto rounded-md border">
                  {remisionesFiltradas.length === 0 ? (
                    <div className="p-2.5 text-sm text-muted-foreground">{t.finanzas.form.sinResultados}</div>
                  ) : remisionesFiltradas.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => { set({ remision_id: r.id }); setQRemision(""); }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    >
                      {r.folio_remision}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Datos fiscales ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs">{t.finanzas.form.folioFactura}</Label>
          <Input
            value={form.factura_folio}
            onChange={e => set({ factura_folio: e.target.value })}
            className="h-11"
            placeholder="A-1234"
          />
        </div>
        <div>
          <Label className="text-xs">{t.finanzas.form.uuidCfdi}</Label>
          <Input
            value={form.factura_uuid}
            onChange={e => set({ factura_uuid: e.target.value })}
            className="h-11"
            placeholder={t.finanzas.form.opcional}
          />
        </div>
        <div>
          <Label className="text-xs">{t.finanzas.form.rfc}</Label>
          <Input
            value={form.factura_rfc}
            onChange={e => set({ factura_rfc: e.target.value.toUpperCase() })}
            className="h-11"
            placeholder={t.finanzas.form.opcional}
          />
        </div>
      </div>

      <div>
        <Label>{t.finanzas.form.notas}</Label>
        <Textarea
          value={form.descripcion}
          onChange={e => set({ descripcion: e.target.value })}
          rows={2}
          placeholder={t.finanzas.form.notasPlaceholder}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {t.finanzas.form.pieExpediente}
        {form.tipo === "EGRESO" && (
          <Badge variant="outline" className="ml-2 text-[11px]">
            {t.finanzas.form.requiereAutorizacion}
          </Badge>
        )}
      </p>
    </div>
  );
}
