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

const RESULTADOS = [
  {
    key: "adaptacion", label: "Sí se pudo adaptar", icon: Wrench,
    cls: "bg-[#065F46] hover:bg-[#054c38]",
    ayuda: "El chasis vuelve a servir. El registro se queda pegado a la pieza y a la unidad para darle seguimiento.",
  },
  {
    key: "garantia", label: "Se reclama en garantía", icon: ShieldCheck,
    cls: "bg-[#5B21B6] hover:bg-[#4c1d95]",
    ayuda: "El chasis queda identificado y fuera del disponible, con el folio del reclamo.",
  },
  {
    key: "no_util", label: "No se puede usar", icon: Ban,
    cls: "bg-[#C0392B] hover:bg-[#a03024]",
    ayuda: "Deja de contar como disponible pero NO se elimina: sigue en inventario, identificado.",
  },
  {
    key: "descartada", label: "Falsa alarma", icon: XCircle,
    cls: "bg-slate-600 hover:bg-slate-700",
    ayuda: "La pieza estaba bien; el chasis regresa a disponible.",
  },
] as const;

export default function Incidencias() {
  const { role } = useAuth();
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
      _nota: retiene ? "Se retiene el chasis para revisarlo" : "Entra a revisión sin detener el chasis",
      _retiene: retiene,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(retiene ? "✓ En revisión — el chasis queda retenido" : "✓ En revisión — el chasis sigue disponible");
    load();
  };

  const guardarResolucion = async () => {
    if (!resolver) return;
    if (resolucion.trim().length < 5) { toast.error("Escribe qué se hizo (mínimo 5 caracteres)"); return; }
    if (resultado === "garantia" && !folioGarantia.trim()) { toast.error("Captura el folio o referencia de la garantía"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("resolver_incidencia_chasis", {
      _incidencia_id: resolver.id,
      _resultado: resultado,
      _resolucion: resolucion.trim(),
      _folio_garantia: folioGarantia.trim() || undefined,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const label = RESULTADOS.find(r => r.key === resultado)?.label ?? resultado;
    toast.success(`✓ ${resolver.folio} cerrada — ${label}`);
    setResolver(null); setResolucion(""); setFolioGarantia(""); setResultado("adaptacion");
    load();
  };

  const guardarReapertura = async () => {
    if (!reabrir) return;
    if (motivo.trim().length < 5) { toast.error("Se requiere un motivo (mínimo 5 caracteres)"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("reabrir_incidencia_chasis", {
      _incidencia_id: reabrir.id, _motivo: motivo.trim(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`✓ ${reabrir.folio} reabierta — vuelve a revisión sin perder su historia`);
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

  const FILTROS: { key: FiltroKey; label: string }[] = [
    { key: "ABIERTAS",  label: "Por revisar" },
    { key: "RETENIDOS", label: "Chasis detenidos" },
    { key: "ADAPTADAS", label: "Adaptados" },
    { key: "GARANTIA",  label: "En garantía" },
    { key: "NO_UTIL",   label: "No útiles" },
    { key: "TODAS",     label: "Todas" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Incidencias de chasis</h1>
          <p className="text-muted-foreground mt-1">
            Piezas que llegaron mal: se reportan, se revisan y se resuelven — ninguna se elimina.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-12" onClick={load} disabled={loading}>
            <RefreshCw className={`h-5 w-5 mr-2 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </Button>
          {puedeReportar && (
            <Button className="h-12 bg-[#C0392B] hover:bg-[#a03024]" onClick={() => setReportar(true)}>
              <TriangleAlert className="h-5 w-5 mr-2" /> Levantar reporte
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Por revisar" value={conteos.ABIERTAS} accent="#92400E" />
        <Kpi label="Chasis detenidos" value={conteos.RETENIDOS} accent={conteos.RETENIDOS ? "#C0392B" : "#64748B"} />
        <Kpi label="Adaptados" value={conteos.ADAPTADAS} accent="#065F46" />
        <Kpi label="En garantía" value={conteos.GARANTIA} accent="#5B21B6" />
        <Kpi label="No útiles" value={conteos.NO_UTIL} accent={conteos.NO_UTIL ? "#991B1B" : "#64748B"} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => {
          const activo = filtro === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`min-h-[44px] px-4 rounded-full font-semibold text-sm border-2 ${activo ? "bg-[#1F3864] text-white border-[#1F3864]" : "bg-white text-[#1F3864] border-[#2E75B6]/30 hover:border-[#2E75B6]"}`}
            >
              {f.label}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${activo ? "bg-white/20" : "bg-[#2E75B6]/10"}`}>
                {(conteos as any)[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      <Card className="p-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12" placeholder="Buscar folio, chasis, parte…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtrados.map(i => {
          const meta = ESTATUS_INCIDENCIA[i.estatus];
          const sev = SEVERIDADES.find(s => s.key === i.severidad);
          const tipo = TIPOS_FALLA.find(t => t.key === i.tipo_falla);
          const unidad = i.motocarro_id ? unidades.get(i.motocarro_id) : undefined;
          return (
            <Card key={i.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-mono font-bold text-[#1F3864]">{i.folio ?? "—"}</div>
                  <div className="font-mono text-sm">{i.ns_chasis}</div>
                  <div className="text-xs text-muted-foreground">
                    {displayFabrica(i.modelo ?? "", catalogo)} · {i.color ?? "—"}
                    {unidad != null && <> · <span className="inline-flex items-center gap-1"><Bike className="h-3 w-3" /> unidad #{unidad}</span></>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${meta.cls}`}>{meta.label}</span>
                  {i.retiene_chasis && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEE2E2] text-[#991B1B] border border-[#C0392B]/30">
                      CHASIS DETENIDO
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700">{tipo?.icon} {tipo?.label ?? i.tipo_falla}</span>
                {i.parte_afectada && <span className="px-2 py-1 rounded-md bg-[#DBEAFE] text-[#1E40AF] font-medium">🔧 {i.parte_afectada}</span>}
                {sev && <span className={`px-2 py-1 rounded-md border font-medium ${sev.cls}`}>{sev.label}</span>}
                {i.folio_garantia && <span className="px-2 py-1 rounded-md bg-[#EDE9FE] text-[#5B21B6] font-mono">{i.folio_garantia}</span>}
              </div>

              <p className="text-sm">{i.descripcion}</p>
              {i.resolucion && (
                <p className="text-sm bg-slate-50 border-l-2 border-[#1F3864] pl-2 py-1">
                  <span className="font-semibold">Resolución:</span> {i.resolucion}
                </p>
              )}

              <div className="text-xs text-muted-foreground">
                Reportada {fmtDate(i.reportado_at.slice(0, 10))}
                {i.resuelto_at && ` · cerrada ${fmtDate(i.resuelto_at.slice(0, 10))}`}
              </div>

              <div className="flex gap-2 flex-wrap pt-1 border-t">
                {puedeResolver && i.estatus === "abierta" && (
                  <>
                    <Button size="sm" variant="outline" className="h-10" disabled={busy} onClick={() => tomarRevision(i, false)}>
                      <Eye className="h-4 w-4 mr-1.5" /> Revisar
                    </Button>
                    <Button size="sm" variant="outline" className="h-10 border-amber-300 text-amber-700 hover:bg-amber-50" disabled={busy} onClick={() => tomarRevision(i, true)}>
                      <Ban className="h-4 w-4 mr-1.5" /> Revisar y retener
                    </Button>
                  </>
                )}
                {puedeResolver && meta.abierta && (
                  <Button size="sm" className="h-10 bg-[#1F3864] hover:bg-[#162a4d]" onClick={() => { setResolver(i); setResultado("adaptacion"); setResolucion(""); setFolioGarantia(i.folio_garantia ?? ""); }}>
                    <Wrench className="h-4 w-4 mr-1.5" /> Resolver
                  </Button>
                )}
                {puedeResolver && !meta.abierta && (
                  <Button size="sm" variant="outline" className="h-10" onClick={() => { setReabrir(i); setMotivo(""); }}>
                    <RefreshCw className="h-4 w-4 mr-1.5" /> Reabrir
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-10" onClick={() => verHistorial(i)}>
                  <History className="h-4 w-4 mr-1.5" /> Historia
                </Button>
              </div>
            </Card>
          );
        })}
        {!filtrados.length && (
          <Card className="p-10 text-center text-muted-foreground lg:col-span-2">
            {loading ? "Cargando…" : "Sin incidencias con este filtro"}
          </Card>
        )}
      </div>

      <ReportarIncidencia open={reportar} onOpenChange={setReportar} onDone={load} />

      {/* Resolver */}
      <Dialog open={!!resolver} onOpenChange={o => { if (!o) setResolver(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolver {resolver?.folio} — {resolver?.ns_chasis}</DialogTitle>
            <DialogDescription>
              {resolver?.parte_afectada ? `${resolver.parte_afectada}: ` : ""}{resolver?.descripcion}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {RESULTADOS.map(r => (
              <label
                key={r.key}
                className={`flex items-start gap-3 rounded-lg border-2 p-3 cursor-pointer ${resultado === r.key ? "border-[#1F3864] bg-[#EFF6FF]" : "hover:bg-slate-50"}`}
              >
                <input type="radio" className="mt-1 accent-[#1F3864]" checked={resultado === r.key} onChange={() => setResultado(r.key)} />
                <span className="text-sm">
                  <span className="font-semibold flex items-center gap-1.5"><r.icon className="h-4 w-4" /> {r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.ayuda}</span>
                </span>
              </label>
            ))}
          </div>

          {resultado === "garantia" && (
            <div>
              <Label>Folio / referencia de la garantía *</Label>
              <Input className="h-11" placeholder="Ej. GAR-2026-014" value={folioGarantia} onChange={e => setFolioGarantia(e.target.value)} />
            </div>
          )}

          <div>
            <Label>¿Qué se hizo? *</Label>
            <Textarea
              placeholder="Ej. Se fabricó y soldó un soporte adaptado; se probó en frío y caliente."
              value={resolucion}
              onChange={e => setResolucion(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolver(null)}>Cancelar</Button>
            <Button onClick={guardarResolucion} disabled={busy} className={RESULTADOS.find(r => r.key === resultado)?.cls}>
              {busy ? "Guardando…" : "Cerrar incidencia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reabrir */}
      <Dialog open={!!reabrir} onOpenChange={o => { if (!o) setReabrir(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir {reabrir?.folio}</DialogTitle>
            <DialogDescription>
              Vuelve a revisión con todo su historial. Sirve cuando un chasis marcado no útil
              consigue garantía, o cuando sí se logró adaptar después.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Motivo *</Label>
            <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Fábrica aceptó revisar la garantía del bastidor" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReabrir(null)}>Cancelar</Button>
            <Button onClick={guardarReapertura} disabled={busy} className="bg-[#1F3864] hover:bg-[#162a4d]">Reabrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historia */}
      <Dialog open={!!historial} onOpenChange={o => { if (!o) setHistorial(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#1F3864]" /> {historial?.inc.folio} — {historial?.inc.ns_chasis}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {(historial?.eventos ?? []).map((e: any, idx: number) => (
              <div key={idx} className="border rounded-md p-2 text-sm">
                <div className="font-medium">
                  {e.estatus_anterior ? `${ESTATUS_INCIDENCIA[e.estatus_anterior as EstatusIncidencia]?.label ?? e.estatus_anterior} → ` : ""}
                  {ESTATUS_INCIDENCIA[e.estatus_nuevo as EstatusIncidencia]?.label ?? e.estatus_nuevo}
                </div>
                {e.nota && <div className="text-xs mt-0.5">{e.nota}</div>}
                <div className="text-[11px] text-muted-foreground mt-0.5">{new Date(e.creado_at).toLocaleString("es-MX")}</div>
              </div>
            ))}
            {!(historial?.eventos ?? []).length && (
              <div className="text-sm text-muted-foreground text-center py-4">Sin movimientos registrados</div>
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
