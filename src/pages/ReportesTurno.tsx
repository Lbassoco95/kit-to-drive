import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Plus, ClipboardList, Pencil, Sun, Sunset, Moon } from "lucide-react";

type Turno = "manana" | "tarde" | "noche";

interface Reporte {
  id: string;
  fecha: string;
  turno: Turno;
  unidades_armadas: number;
  paros: string | null;
  observaciones: string | null;
  usuario_id: string;
  created_at: string;
  profiles?: { nombre_completo: string | null } | null;
}

const TURNO_ICONS: Record<Turno, typeof Sun> = {
  manana: Sun,
  tarde: Sunset,
  noche: Moon,
};

const TURNO_COLORS: Record<Turno, string> = {
  manana: "bg-amber-50 border-amber-300 text-amber-700",
  tarde:  "bg-orange-50 border-orange-300 text-orange-700",
  noche:  "bg-indigo-50 border-indigo-300 text-indigo-700",
};

const EMPTY_FORM = { fecha: new Date().toISOString().split("T")[0], turno: "manana" as Turno, unidades_armadas: 0, paros: "", observaciones: "" };

export default function ReportesTurno() {
  const { role, user } = useAuth();
  const { t, lang } = useLang();
  const tr = t.reportesTurno;

  const [rows, setRows] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reporte | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const canCreate = role === "admin" || role === "fabrica";

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reportes_turno")
      .select("*, profiles(nombre_completo)")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      // Tabla no en schema cache aún — silenciar hasta que se corra NOTIFY pgrst
      if (!error.message.includes("schema cache")) toast.error(error.message);
    } else setRows((data as Reporte[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, fecha: new Date().toISOString().split("T")[0] });
    setOpen(true);
  };

  const openEdit = (r: Reporte) => {
    setEditing(r);
    setForm({ fecha: r.fecha, turno: r.turno, unidades_armadas: r.unidades_armadas, paros: r.paros ?? "", observaciones: r.observaciones ?? "" });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const payload = {
      fecha: form.fecha,
      turno: form.turno,
      unidades_armadas: Number(form.unidades_armadas),
      paros: form.paros || null,
      observaciones: form.observaciones || null,
      usuario_id: user.id,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("reportes_turno").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("reportes_turno").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(tr.guardado);
    setOpen(false);
    load();
  };

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, Reporte[]>();
    rows.forEach(r => {
      const list = map.get(r.fecha) ?? [];
      list.push(r);
      map.set(r.fecha, list);
    });
    return map;
  }, [rows]);

  const locale = lang === "zh" ? "zh-CN" : "es-MX";
  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(locale, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1>{tr.title}</h1>
          <p className="text-base text-muted-foreground mt-1">{tr.subtitle(rows.length)}</p>
        </div>
        {canCreate && (
          <Button onClick={openNew} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2" /> {tr.nuevo}
          </Button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">{t.actions.loading}</div>
      ) : rows.length === 0 ? (
        <Card className="text-center py-16 text-muted-foreground">
          <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
          <p>{tr.sinReportes}</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([fecha, reportes]) => (
            <div key={fecha}>
              <h2 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-3 px-1 capitalize">
                {formatDate(fecha)}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {reportes.map(r => {
                  const TurnoIcon = TURNO_ICONS[r.turno];
                  const colorClass = TURNO_COLORS[r.turno];
                  const isOwn = user?.id === r.usuario_id;
                  const isToday = r.fecha === new Date().toISOString().split("T")[0];
                  const canEdit = role === "admin" || (isOwn && isToday);
                  return (
                    <Card key={r.id} className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                      {/* Turno badge + edit */}
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${colorClass}`}>
                          <TurnoIcon size={13} />
                          {tr.turnos[r.turno]}
                        </span>
                        {canEdit && (
                          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => openEdit(r)}>
                            <Pencil size={15} />
                          </Button>
                        )}
                      </div>

                      {/* Units */}
                      <div className="flex items-end gap-2">
                        <span className="text-4xl font-extrabold text-[#1F3864]">{r.unidades_armadas}</span>
                        <span className="text-sm text-muted-foreground mb-1">{tr.unidadesArmadas}</span>
                      </div>

                      {/* Paros */}
                      {r.paros && (
                        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                          <span className="font-semibold">{tr.paros}:</span> {r.paros}
                        </div>
                      )}

                      {/* Observaciones */}
                      {r.observaciones && (
                        <p className="text-sm text-muted-foreground border-t pt-2">{r.observaciones}</p>
                      )}

                      {/* Footer */}
                      <div className="text-xs text-muted-foreground mt-auto pt-2 border-t">
                        {tr.registradoPor}: <span className="font-medium text-foreground">{r.profiles?.nombre_completo ?? "—"}</span>
                        <span className="ml-2 text-[11px]">
                          {new Date(r.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={o => { if (!o) setOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? tr.editarTitulo : tr.crearTitulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">{tr.fecha}</Label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={e => setForm({ ...form, fecha: e.target.value })}
                  className="h-11"
                />
              </div>
              <div>
                <Label className="text-sm">{tr.turno}</Label>
                <div className="flex gap-2 mt-1">
                  {(["manana", "tarde", "noche"] as Turno[]).map(tv => {
                    const Icon = TURNO_ICONS[tv];
                    return (
                      <button
                        key={tv}
                        type="button"
                        onClick={() => setForm({ ...form, turno: tv })}
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-md border text-xs font-medium transition-all ${
                          form.turno === tv
                            ? "border-[#1F3864] bg-[#1F3864] text-white"
                            : "border-slate-200 text-slate-500 hover:border-slate-400"
                        }`}
                      >
                        <Icon size={16} />
                        {tr.turnos[tv]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <Label className="text-sm">{tr.unidadesArmadas}</Label>
              <Input
                type="number"
                min={0}
                value={form.unidades_armadas}
                onChange={e => setForm({ ...form, unidades_armadas: parseInt(e.target.value) || 0 })}
                className="h-11 text-lg font-bold"
              />
            </div>

            <div>
              <Label className="text-sm">{tr.paros}</Label>
              <Textarea
                placeholder={tr.parasPlaceholder}
                value={form.paros}
                onChange={e => setForm({ ...form, paros: e.target.value })}
                rows={2}
              />
            </div>

            <div>
              <Label className="text-sm">{tr.observaciones}</Label>
              <Textarea
                placeholder={tr.observacionesPlaceholder}
                value={form.observaciones}
                onChange={e => setForm({ ...form, observaciones: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="h-11">{t.actions.cancel}</Button>
            <Button onClick={save} disabled={saving} className="h-11 px-6 bg-[#1F3864] hover:bg-[#162a4d]">
              {saving ? t.actions.loading : t.actions.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
