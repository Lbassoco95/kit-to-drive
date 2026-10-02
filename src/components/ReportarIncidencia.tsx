import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import {
  CatalogoModelos, displayFabrica, ESTATUS_CHASIS, ESTATUS_INCIDENCIA,
  PARTES_FRECUENTES, SEVERIDADES, TIPOS_FALLA,
} from "@/lib/dazon";

export type ChasisParaReporte = {
  id: string;
  numero_chasis: string;
  modelo: string;
  color: string;
  estatus: string;
  motocarro_id: string | null;
};

type Props = {
  /** Si viene, el reporte es de ese chasis y no se muestra el buscador. */
  chasis?: ChasisParaReporte | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

const defaultForm = () => ({
  tipo_falla: "falta_parte",
  parte_afectada: "",
  descripcion: "",
  severidad: "mayor",
  retiene: false,
});

/**
 * Levantar un reporte de un chasis que llegó mal (p.ej. sin el soporte del
 * radiador). Por default el chasis NO se detiene: sigue en inventario y se
 * puede configurar mientras se revisa. Sólo se retiene si quien reporta lo
 * marca — así el reporte no frena la línea por sí solo.
 */
export function ReportarIncidencia({ chasis, open, onOpenChange, onDone }: Props) {
  const { t } = useLang();
  const [form, setForm] = useState(defaultForm());
  const [busy, setBusy] = useState(false);
  const [lista, setLista] = useState<ChasisParaReporte[]>([]);
  const [conReporte, setConReporte] = useState<Set<string>>(new Set());
  const [catalogo, setCatalogo] = useState<CatalogoModelos>(new Map());
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<ChasisParaReporte | null>(null);

  const elegido = chasis ?? sel;

  useEffect(() => {
    if (!open) return;
    setForm(defaultForm());
    setSel(null);
    setQ("");
    if (chasis) return; // con chasis fijo no hace falta cargar el pool

    (async () => {
      const [{ data: chData }, { data: incData }, { data: catData }] = await Promise.all([
        supabase.from("inventario_chasis")
          .select("id, numero_chasis, modelo, color, estatus, motocarro_id")
          .order("numero_chasis"),
        supabase.from("incidencias_chasis")
          .select("chasis_id, estatus")
          .in("estatus", ["abierta", "en_revision"]),
        supabase.from("modelos_producto").select("modelo, linea, nombre_comercial"),
      ]);
      setLista((chData ?? []) as ChasisParaReporte[]);
      setConReporte(new Set((incData ?? []).map((i: any) => i.chasis_id)));
      setCatalogo(new Map((catData ?? []).map((c: any) => [c.modelo, { linea: c.linea, nombre_comercial: c.nombre_comercial }])));
    })();
  }, [open, chasis]);

  const filtrados = useMemo(() => {
    const t = q.trim().toUpperCase();
    const base = t
      ? lista.filter(c =>
          c.numero_chasis.includes(t) ||
          c.modelo.toUpperCase().includes(t) ||
          (c.color ?? "").toUpperCase().includes(t))
      : lista;
    return base.slice(0, 200);
  }, [lista, q]);

  const guardar = async () => {
    if (!elegido) { toast.error(t.componentes.reportarIncidencia.faltaChasis); return; }
    if (form.descripcion.trim().length < 5) { toast.error(t.componentes.reportarIncidencia.faltaDescripcion); return; }

    setBusy(true);
    const { data, error } = await supabase.rpc("reportar_incidencia_chasis", {
      _chasis_id: elegido.id,
      _tipo_falla: form.tipo_falla,
      _descripcion: form.descripcion.trim(),
      _parte_afectada: form.parte_afectada.trim() || undefined,
      _severidad: form.severidad,
      _retiene: form.retiene,
    });
    setBusy(false);

    if (error) { toast.error(error.message); return; }
    const r = data as { folio?: string; retiene_chasis?: boolean } | null;
    toast.success(
      r?.retiene_chasis
        ? t.componentes.reportarIncidencia.okRetiene(r?.folio ?? "")
        : t.componentes.reportarIncidencia.okNoRetiene(r?.folio ?? "")
    );
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <TriangleAlert className="h-6 w-6 text-[#D97706]" /> {t.componentes.reportarIncidencia.titulo}
          </DialogTitle>
          <DialogDescription>{t.componentes.reportarIncidencia.desc}</DialogDescription>
        </DialogHeader>

        {/* Selección de chasis */}
        {chasis ? (
          <div className="rounded-3xl border bg-slate-50 p-3">
            <div className="font-mono font-bold text-base">{chasis.numero_chasis}</div>
            <div className="text-xs text-muted-foreground">
              {chasis.modelo} · {chasis.color} · {t.catalogos.estatusChasis(chasis.estatus)}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>{t.componentes.reportarIncidencia.chasis} {elegido && <span className="text-[#065F46] font-mono">— {elegido.numero_chasis}</span>}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 h-10" placeholder={t.componentes.reportarIncidencia.buscar} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="border rounded-3xl max-h-52 overflow-hidden overflow-y-auto divide-y">
              {filtrados.map(c => {
                const yaTiene = conReporte.has(c.id);
                return (
                  <button
                    key={c.id}
                    disabled={yaTiene}
                    onClick={() => setSel(c)}
                    className={`w-full text-left px-3 py-2 text-sm ${yaTiene ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"} ${sel?.id === c.id ? "bg-[#DBEAFE]" : ""}`}
                  >
                    <div className="font-mono font-semibold flex items-center gap-2">
                      {c.numero_chasis}
                      {yaTiene && <span className="text-[10px] font-sans px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">{t.componentes.reportarIncidencia.yaTieneReporte}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {displayFabrica(c.modelo, catalogo)} · {c.color} ·{" "}
                      {t.catalogos.estatusChasis(c.estatus)}
                      {c.motocarro_id ? t.componentes.reportarIncidencia.yaEnUnidad : ""}
                    </div>
                  </button>
                );
              })}
              {!filtrados.length && <div className="p-4 text-sm text-center text-muted-foreground">{t.componentes.reportarIncidencia.sinCoincidencias}</div>}
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>{t.componentes.reportarIncidencia.tipoFalla}</Label>
            <Select value={form.tipo_falla} onValueChange={v => setForm(f => ({ ...f, tipo_falla: v }))}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_FALLA.map(f => <SelectItem key={f.key} value={f.key}>{f.icon} {t.catalogos.tipoFalla(f.key)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t.componentes.reportarIncidencia.severidad}</Label>
            <Select value={form.severidad} onValueChange={v => setForm(f => ({ ...f, severidad: v }))}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEVERIDADES.map(s => <SelectItem key={s.key} value={s.key}>{t.catalogos.severidad(s.key)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>{t.componentes.reportarIncidencia.parteAfectada}</Label>
          <Input
            className="h-11"
            placeholder={t.componentes.reportarIncidencia.partePlaceholder}
            value={form.parte_afectada}
            onChange={e => setForm(f => ({ ...f, parte_afectada: e.target.value }))}
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {PARTES_FRECUENTES.map((p, i) => {
              // El valor que se guarda es el español (así vive en la base); lo
              // que se ve es la traducción con el mismo índice.
              const etiqueta = t.catalogos.partesFrecuentes[i] ?? p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, parte_afectada: p }))}
                  className={`text-[11px] px-2 py-1 rounded-full border ${form.parte_afectada === p ? "bg-primary text-white border-primary" : "bg-white text-slate-600 hover:border-secondary"}`}
                >
                  {etiqueta}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>{t.componentes.reportarIncidencia.queTraeMal}</Label>
          <Textarea
            placeholder={t.componentes.reportarIncidencia.queTraeMalPlaceholder}
            value={form.descripcion}
            onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
          />
        </div>

        <label className="flex items-start gap-3 rounded-3xl border p-3 cursor-pointer hover:bg-slate-50">
          <input
            type="checkbox"
            checked={form.retiene}
            onChange={e => setForm(f => ({ ...f, retiene: e.target.checked }))}
            className="w-4 h-4 mt-0.5 accent-[#C0392B]"
          />
          <span className="text-sm">
            <span className="font-semibold">{t.componentes.reportarIncidencia.retener}</span>
            <span className="block text-xs text-muted-foreground">{t.componentes.reportarIncidencia.retenerDesc}</span>
          </span>
        </label>

        {form.retiene && (
          <div className="rounded-3xl p-3 flex items-start gap-2 bg-[#FEF3C7] text-[#92400E] text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {t.catalogos.ayudaIncidencia("en_revision")}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t.actions.cancel}</Button>
          <Button onClick={guardar} disabled={busy || !elegido} className="h-11 bg-[#C0392B] hover:bg-[#a03024]">
            <TriangleAlert className="h-5 w-5 mr-2" /> {busy ? t.componentes.reportarIncidencia.guardando : t.componentes.reportarIncidencia.levantar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
