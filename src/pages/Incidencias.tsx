import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  History, RefreshCw, Search, ShieldCheck, TriangleAlert, Wrench, XCircle, Ban, Bike, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { ReportarIncidencia } from "@/components/ReportarIncidencia";
import {
  CatalogoModelos, displayFabrica, ESTATUS_INCIDENCIA, EstatusIncidencia,
  fmtDate, SEVERIDADES, TIPOS_FALLA,
} from "@/lib/dazon";

type Incidencia = {
  id: string;
  folio: string | null;
  chasis_id: string;
  ns_chasis: string;
  modelo: string | null;
  color: string | null;
  motocarro_id: string | null;
  tipo_falla: string;
  parte_afectada: string | null;
  descripcion: string;
  severidad: string;
  estatus: EstatusIncidencia;
  retiene_chasis: boolean;
  resolucion: string | null;
  folio_garantia: string | null;
  reportado_at: string;
  resuelto_at: string | null;
};

type FiltroKey = "ABIERTAS" | "RETENIDOS" | "ADAPTADAS" | "GARANTIA" | "NO_UTIL" | "TODAS";

// El texto de cada resultado se resuelve con `t.incidencias.resultados`; aquí
// sólo vive lo que no se traduce (icono y clases de color).
const RESULTADOS = [
  { key: "adaptacion", icon: Wrench,      cls: "bg-[#065F46] hover:bg-[#054c38]" },
  { key: "garantia",   icon: ShieldCheck, cls: "bg-[#5B21B6] hover:bg-[#4c1d95]" },
  { key: "no_util",    icon: Ban,         cls: "bg-[#C0392B] hover:bg-[#a03024]" },
  { key: "descartada", icon: XCircle,     cls: "bg-slate-600 hover:bg-slate-700" },
] as const;

export default function Incidencias() {
  const { role } = useAuth();
  const { t, lang } = useLang();
  const puedeResolver = role === "admin" || role === "fabrica";
  const puedeReportar = puedeResolver || role === "coordinador";

  const [items, setItems] = useState<Incidencia[]>([]);
  const [unidades, setUnidades] = useState<Map<string, number>>(new Map());
  const [catalogo, setCatalogo] = useState<CatalogoModelos>(new Map());
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<FiltroKey>("ABIERTAS");
  const [q, setQ] = useState("");

  const [reportar, setReportar] = useState(false);
  const [resolver, setResolver] = useState<Incidencia | null>(null);
  const [resultado, setResultado] = useState<string>("adaptacion");
  const [resolucion, setResolucion] = useState("");
  const [folioGarantia, setFolioGarantia] = useState("");
  const [reabrir, setReabrir] = useState<Incidencia | null>(null);
  const [motivo, setMotivo] = useState("");
  const [historial, setHistorial] = useState<{ inc: Incidencia; eventos: any[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: motos }, { data: cat }] = await Promise.all([
      supabase.from("incidencias_chasis").select("*").order("reportado_at", { ascending: false }),
      supabase.from("motocarros").select("id, orden_armado"),
      supabase.from("modelos_producto").select("modelo, linea, nombre_comercial"),
    ]);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as Incidencia[]);
    setUnidades(new Map((motos ?? []).map((m: any) => [m.id, m.orden_armado])));
    setCatalogo(new Map((cat ?? []).map((c: any) => [c.modelo, { linea: c.linea, nombre_comercial: c.nombre_comercial }])));
  };

  useEffect(() => { load(); }, []);

  const conteos = useMemo(() => {
    const c = { ABIERTAS: 0, RETENIDOS: 0, ADAPTADAS: 0, GARANTIA: 0, NO_UTIL: 0, TODAS: items.length };
    items.forEach(i => {
      if (i.estatus === "abierta" || i.estatus === "en_revision") c.ABIERTAS++;
      if (i.retiene_chasis) c.RETENIDOS++;
      if (i.estatus === "adaptacion") c.ADAPTADAS++;
      if (i.estatus === "garantia") c.GARANTIA++;
      if (i.estatus === "no_util") c.NO_UTIL++;
    });
    return c;
  }, [items]);

  const filtrados = useMemo(() => items.filter(i => {
    if (filtro === "ABIERTAS" && !(i.estatus === "abierta" || i.estatus === "en_revision")) return false;
    if (filtro === "RETENIDOS" && !i.retiene_chasis) return false;
    if (filtro === "ADAPTADAS" && i.estatus !== "adaptacion") return false;
    if (filtro === "GARANTIA" && i.estatus !== "garantia") return false;
    if (filtro === "NO_UTIL" && i.estatus !== "no_util") return false;
    if (q) {
      const blob = [i.folio, i.ns_chasis, i.modelo, i.color, i.parte_afectada, i.descripcion, i.folio_garantia]
        .filter(Boolean).join(" ").toLowerCase();
      if (!blob.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [items, filtro, q]);

  const tomarRevision = async (inc: Incidencia, retiene: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc("revisar_incidencia_chasis", {
      _incidencia_id: inc.id,
      _nota: retiene ? t.incidencias.notas.retiene : t.incidencias.notas.noRetiene,
      _retiene: retiene,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(retiene ? t.incidencias.notas.okRetiene : t.incidencias.notas.okNoRetiene);
    load();
  };

  const guardarResolucion = async () => {
    if (!resolver) return;
    if (resolucion.trim().length < 5) { toast.error(t.incidencias.notas.faltaResolucion); return; }
    if (resultado === "garantia" && !folioGarantia.trim()) { toast.error(t.incidencias.notas.faltaFolioGarantia); return; }
    setBusy(true);
    const { error } = await supabase.rpc("resolver_incidencia_chasis", {
      _incidencia_id: resolver.id,
      _resultado: resultado,
      _resolucion: resolucion.trim(),
      _folio_garantia: folioGarantia.trim() || undefined,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const label = t.incidencias.resultados[resultado as keyof typeof t.incidencias.resultados] ?? resultado;
    toast.success(t.incidencias.notas.cerrada(resolver.folio ?? "", label));
    setResolver(null); setResolucion(""); setFolioGarantia(""); setResultado("adaptacion");
    load();
  };

  const guardarReapertura = async () => {
    if (!reabrir) return;
    if (motivo.trim().length < 5) { toast.error(t.incidencias.notas.faltaMotivo); return; }
    setBusy(true);
    const { error } = await supabase.rpc("reabrir_incidencia_chasis", {
      _incidencia_id: reabrir.id, _motivo: motivo.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t.incidencias.notas.reabierta(reabrir.folio ?? ""));
    setReabrir(null); setMotivo(""); load();
  };

  const verHistorial = async (inc: Incidencia) => {
    const { data } = await supabase
      .from("incidencias_chasis_eventos")
      .select("estatus_anterior, estatus_nuevo, nota, creado_at")
      .eq("incidencia_id", inc.id)
      .order("creado_at", { ascending: true });
    setHistorial({ inc, eventos: data ?? [] });
  };

  const FILTROS: FiltroKey[] = ["ABIERTAS", "RETENIDOS", "ADAPTADAS", "GARANTIA", "NO_UTIL", "TODAS"];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t.incidencias.title}</h1>
          <p className="text-muted-foreground mt-1">{t.incidencias.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-12" onClick={load} disabled={loading}>
            <RefreshCw className={`h-5 w-5 mr-2 ${loading ? "animate-spin" : ""}`} /> {t.incidencias.actualizar}
          </Button>
          {puedeReportar && (
            <Button className="h-12 bg-[#C0392B] hover:bg-[#a03024]" onClick={() => setReportar(true)}>
              <TriangleAlert className="h-5 w-5 mr-2" /> {t.incidencias.levantarReporte}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label={t.incidencias.filtros.ABIERTAS} value={conteos.ABIERTAS} accent="#92400E" />
        <Kpi label={t.incidencias.filtros.RETENIDOS} value={conteos.RETENIDOS} accent={conteos.RETENIDOS ? "#C0392B" : "#64748B"} />
        <Kpi label={t.incidencias.filtros.ADAPTADAS} value={conteos.ADAPTADAS} accent="#065F46" />
        <Kpi label={t.incidencias.filtros.GARANTIA} value={conteos.GARANTIA} accent="#5B21B6" />
        <Kpi label={t.incidencias.filtros.NO_UTIL} value={conteos.NO_UTIL} accent={conteos.NO_UTIL ? "#991B1B" : "#64748B"} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => {
          const activo = filtro === f;
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`min-h-[44px] px-4 rounded-full font-semibold text-sm border-2 ${activo ? "bg-primary text-white border-primary" : "bg-white text-primary border-secondary/30 hover:border-secondary"}`}
            >
              {t.incidencias.filtros[f]}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activo ? "bg-white/20" : "bg-secondary/10"}`}>
                {conteos[f]}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="p-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12" placeholder={t.incidencias.buscar} value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtrados.map(i => {
          const meta = ESTATUS_INCIDENCIA[i.estatus];
          const sev = SEVERIDADES.find(s => s.key === i.severidad);
          const tipoIcon = TIPOS_FALLA.find(x => x.key === i.tipo_falla)?.icon;
          const unidad = i.motocarro_id ? unidades.get(i.motocarro_id) : undefined;
          return (
            <Card key={i.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-mono font-bold text-primary">{i.folio ?? "—"}</div>
                  <div className="font-mono text-sm">{i.ns_chasis}</div>
                  <div className="text-xs text-muted-foreground">
                    {displayFabrica(i.modelo ?? "", catalogo)} · {i.color ?? "—"}
                    {unidad != null && <> · <span className="inline-flex items-center gap-1"><Bike className="h-3 w-3" /> {t.incidencias.unidad(unidad)}</span></>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${meta.cls}`}>{t.catalogos.estatusIncidencia(i.estatus)}</span>
                  {i.retiene_chasis && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEE2E2] text-[#991B1B] border border-[#C0392B]/30">
                      {t.incidencias.chasisDetenido}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">{tipoIcon} {t.catalogos.tipoFalla(i.tipo_falla)}</span>
                {i.parte_afectada && <span className="px-2 py-1 rounded-md bg-[#DBEAFE] text-[#1E40AF] font-medium">🔧 {i.parte_afectada}</span>}
                {sev && <span className={`px-2 py-1 rounded-md border font-medium ${sev.cls}`}>{t.catalogos.severidad(i.severidad)}</span>}
                {i.folio_garantia && <span className="px-2 py-1 rounded-md bg-[#EDE9FE] text-[#5B21B6] font-mono">{i.folio_garantia}</span>}
              </div>

              <p className="text-sm">{i.descripcion}</p>
              {i.resolucion && (
                <p className="text-sm bg-slate-50 border-l-2 border-primary pl-2 py-1">
                  <span className="font-semibold">{t.incidencias.resolucion}</span> {i.resolucion}
                </p>
              )}

              <div className="text-xs text-muted-foreground">
                {t.incidencias.reportada(fmtDate(i.reportado_at.slice(0, 10)))}
                {i.resuelto_at && t.incidencias.cerrada(fmtDate(i.resuelto_at.slice(0, 10)))}
              </div>

              <div className="flex gap-2 flex-wrap pt-1 border-t">
                {puedeResolver && i.estatus === "abierta" && (
                  <>
                    <Button size="sm" variant="outline" className="h-10" disabled={busy} onClick={() => tomarRevision(i, false)}>
                      <Eye className="h-4 w-4 mr-1.5" /> {t.incidencias.acciones.revisar}
                    </Button>
                    <Button size="sm" variant="outline" className="h-10 border-amber-300 text-amber-700 hover:bg-amber-50" disabled={busy} onClick={() => tomarRevision(i, true)}>
                      <Ban className="h-4 w-4 mr-1.5" /> {t.incidencias.acciones.revisarRetener}
                    </Button>
                  </>
                )}
                {puedeResolver && meta.abierta && (
                  <Button size="sm" className="h-10 bg-primary hover:bg-primary-hover" onClick={() => { setResolver(i); setResultado("adaptacion"); setResolucion(""); setFolioGarantia(i.folio_garantia ?? ""); }}>
                    <Wrench className="h-4 w-4 mr-1.5" /> {t.incidencias.acciones.resolver}
                  </Button>
                )}
                {puedeResolver && !meta.abierta && (
                  <Button size="sm" variant="outline" className="h-10" onClick={() => { setReabrir(i); setMotivo(""); }}>
                    <RefreshCw className="h-4 w-4 mr-1.5" /> {t.incidencias.acciones.reabrir}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-10" onClick={() => verHistorial(i)}>
                  <History className="h-4 w-4 mr-1.5" /> {t.incidencias.acciones.historia}
                </Button>
              </div>
            </Card>
          );
        })}
        {!filtrados.length && (
          <Card className="p-10 text-center text-muted-foreground lg:col-span-2">
            {loading ? t.actions.loading : t.incidencias.sinIncidencias}
          </Card>
        )}
      </div>

      <ReportarIncidencia open={reportar} onOpenChange={setReportar} onDone={load} />

      {/* Resolver */}
      <Dialog open={!!resolver} onOpenChange={o => { if (!o) setResolver(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.incidencias.dialogos.resolverTitulo(resolver?.folio ?? "", resolver?.ns_chasis ?? "")}</DialogTitle>
            <DialogDescription>
              {resolver?.parte_afectada ? `${resolver.parte_afectada}: ` : ""}{resolver?.descripcion}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {RESULTADOS.map(r => (
              <label
                key={r.key}
                className={`flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer ${resultado === r.key ? "border-primary bg-[#EFF6FF]" : "hover:bg-slate-50"}`}
              >
                <input type="radio" className="mt-1 accent-primary" checked={resultado === r.key} onChange={() => setResultado(r.key)} />
                <span className="text-sm">
                  <span className="font-semibold flex items-center gap-1.5"><r.icon className="h-4 w-4" /> {t.incidencias.resultados[r.key]}</span>
                  <span className="block text-xs text-muted-foreground">{t.incidencias.resultados[`${r.key}Ayuda`]}</span>
                </span>
              </label>
            ))}
          </div>

          {resultado === "garantia" && (
            <div>
              <Label>{t.incidencias.dialogos.folioGarantia}</Label>
              <Input className="h-11" placeholder={t.incidencias.dialogos.folioGarantiaPlaceholder} value={folioGarantia} onChange={e => setFolioGarantia(e.target.value)} />
            </div>
          )}

          <div>
            <Label>{t.incidencias.dialogos.queSeHizo}</Label>
            <Textarea
              placeholder={t.incidencias.dialogos.queSeHizoPlaceholder}
              value={resolucion}
              onChange={e => setResolucion(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolver(null)}>{t.actions.cancel}</Button>
            <Button onClick={guardarResolucion} disabled={busy} className={RESULTADOS.find(r => r.key === resultado)?.cls}>
              {busy ? t.incidencias.dialogos.guardando : t.incidencias.dialogos.cerrarIncidencia}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reabrir */}
      <Dialog open={!!reabrir} onOpenChange={o => { if (!o) setReabrir(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.incidencias.dialogos.reabrirTitulo(reabrir?.folio ?? "")}</DialogTitle>
            <DialogDescription>{t.incidencias.dialogos.reabrirDesc}</DialogDescription>
          </DialogHeader>
          <div>
            <Label>{t.incidencias.dialogos.motivo}</Label>
            <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={t.incidencias.dialogos.motivoPlaceholder} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReabrir(null)}>{t.actions.cancel}</Button>
            <Button onClick={guardarReapertura} disabled={busy} className="bg-primary hover:bg-primary-hover">{t.incidencias.acciones.reabrir}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historia */}
      <Dialog open={!!historial} onOpenChange={o => { if (!o) setHistorial(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> {historial?.inc.folio} — {historial?.inc.ns_chasis}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {(historial?.eventos ?? []).map((e: any, idx: number) => (
              <div key={idx} className="border rounded-md p-2 text-sm">
                <div className="font-medium">
                  {e.estatus_anterior ? `${t.catalogos.estatusIncidencia(e.estatus_anterior)} → ` : ""}
                  {t.catalogos.estatusIncidencia(e.estatus_nuevo)}
                </div>
                {e.nota && <div className="text-xs mt-0.5">{e.nota}</div>}
                <div className="text-[11px] text-muted-foreground mt-0.5">{new Date(e.creado_at).toLocaleString(lang === "zh" ? "zh-CN" : "es-MX")}</div>
              </div>
            ))}
            {!(historial?.eventos ?? []).length && (
              <div className="text-sm text-muted-foreground text-center py-4">{t.incidencias.dialogos.sinMovimientos}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <Card className="p-4">
      <div className="text-3xl font-bold" style={{ color: accent }}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </Card>
  );
}
