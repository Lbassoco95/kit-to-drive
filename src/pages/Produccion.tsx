import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmtDate, ESTATUS_ENTREGA_COLOR, effEstatusArmado, diasDesvio, normColor } from "@/lib/dazon";
import { EstatusBadge } from "@/components/EstatusBadge";
import { Download, Pencil, Bike, Search, LayoutGrid, Table as TableIcon, CheckCircle, Truck as TruckIcon, MessageSquare, Send, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BandejaRemisiones } from "@/components/BandejaRemisiones";
import { RecibirContenedor } from "@/components/RecibirContenedor";
import { InventarioStatus } from "@/components/InventarioStatus";
import { FileOrCamera } from "@/components/FileOrCamera";

type FilterKey = "TODOS" | "PENDIENTES" | "ARMADOS" | "ATRASADOS" | "ENTREGADOS";

// ──────────────────────────────────────────────────────────────────────────────
// Comentarios dialog
// ──────────────────────────────────────────────────────────────────────────────
function ComentariosDialog({ motocarroId, orden, open, onClose, t }: {
  motocarroId: string; orden: number; open: boolean; onClose: () => void; t: any;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const { lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "es-MX";
  const tr = t.produccion.comentarios;

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("comentarios_motocarros")
      .select("*, profiles(nombre_completo)")
      .eq("motocarro_id", motocarroId)
      .order("created_at", { ascending: true });
    setComments(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (open) { load(); setTexto(""); setFoto(null); } }, [open, motocarroId]);

  const send = async () => {
    if (!texto.trim() || !user) return;
    setSending(true);
    let foto_url: string | null = null;
    if (foto) {
      const ext = foto.name.split(".").pop();
      const path = `${motocarroId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("comentarios-fotos").upload(path, foto);
      if (!uploadErr) {
        const { data } = supabase.storage.from("comentarios-fotos").getPublicUrl(path);
        foto_url = data?.publicUrl ?? null;
      }
    }
    const { error } = await supabase.from("comentarios_motocarros").insert({
      motocarro_id: motocarroId,
      usuario_id: user.id,
      texto: texto.trim(),
      foto_url,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setTexto(""); setFoto(null); load();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg flex flex-col max-h-[80vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare size={18} /> {tr.title} — #{orden}
          </DialogTitle>
        </DialogHeader>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
          {loading ? (
            <div className="text-center text-sm text-muted-foreground py-6">{t.actions.loading}</div>
          ) : comments.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8 border rounded-lg border-dashed">{tr.sinComentarios}</div>
          ) : (
            comments.map(c => (
              <div key={c.id} className="flex gap-2.5">
                <div className="shrink-0 w-8 h-8 rounded-full bg-[#1F3864] text-white text-xs flex items-center justify-center font-bold">
                  {(c.profiles?.nombre_completo ?? "?").split(" ").map((n: string) => n[0]).slice(0,2).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">{c.profiles?.nombre_completo ?? "—"}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 break-words">{c.texto}</p>
                  {c.foto_url && (
                    <a href={c.foto_url} target="_blank" rel="noopener noreferrer" className="mt-1 block">
                      <img src={c.foto_url} alt="foto" className="max-h-32 rounded-md border object-contain" />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 pt-3 border-t space-y-2">
          <Textarea
            placeholder={tr.placeholder}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={2}
            className="resize-none"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <div className="space-y-2">
            <FileOrCamera value={foto} onChange={setFoto} imageOnly label={tr.agregarFoto} />
            <Button onClick={send} disabled={sending || !texto.trim()} size="sm" className="w-full h-10 bg-[#1F3864] hover:bg-[#162a4d]">
              <Send size={14} className="mr-1.5" />
              {sending ? tr.enviando : tr.enviar}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Produccion() {
  const { role } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("TODOS");
  const [colorFilter, setColorFilter] = useState<"TODOS" | "BLANCO" | "AZUL">("TODOS");
  const [view, setView] = useState<"cards" | "tabla">("cards");
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [confirm, setConfirm] = useState<{ moto: any; action: "ARMADO" | "LISTO" | "ENTREGADA" } | null>(null);
  const [comentariosMoto, setComentariosMoto] = useState<{ id: string; orden: number } | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("motocarros")
      .select("*, remisiones(folio_remision, tipo_pago, pagado, vendedor_id, profiles:vendedor_id(nombre_completo, codigo_vendedor), clientes(codigo_erp))")
      .order("orden_armado", { ascending: true });
    setRows((data ?? []).map((r: any) => ({ ...r, color: normColor(r.color), _eff: effEstatusArmado(r) })));
  };
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c = { TODOS: rows.length, PENDIENTES: 0, ARMADOS: 0, ATRASADOS: 0, ENTREGADOS: 0 };
    rows.forEach(r => {
      if (r.estatus_entrega === "ENTREGADA") c.ENTREGADOS++;
      else if (r._eff === "ATRASADO") c.ATRASADOS++;
      else if (r._eff === "ARMADO" || r._eff === "LISTO") c.ARMADOS++;
      else c.PENDIENTES++;
    });
    return c;
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (colorFilter !== "TODOS" && r.color !== colorFilter) return false;
    if (filter === "PENDIENTES" && !(r._eff === "PENDIENTE" || r._eff === "EN_PROCESO")) return false;
    if (filter === "ARMADOS" && !(r._eff === "ARMADO" || r._eff === "LISTO")) return false;
    if (filter === "ATRASADOS" && r._eff !== "ATRASADO") return false;
    if (filter === "ENTREGADOS" && r.estatus_entrega !== "ENTREGADA") return false;
    if (q) {
      const qLower = q.toLowerCase();
      const blob = [r.orden_armado, r.chasis_asignado, r.ns_chasis, r.ns_motor,
        r.remisiones?.folio_remision, r.remisiones?.clientes?.codigo_erp,
        r.remisiones?.profiles?.nombre_completo].filter(Boolean).join(" ").toLowerCase();
      if (!blob.includes(qLower)) return false;
    }
    return true;
  }), [rows, q, filter, colorFilter]);

  const exportCsv = () => {
    const header = ["Orden","Modelo","Color","Fecha estimada de armado","Estatus","Fecha real de armado","Número de serie del chasis","Número de serie del motor","Chasis","Vendedor","Cliente","Remisión","Fecha estimada de entrega","Estatus entrega"];
    const rows2 = filtered.map(r => [r.orden_armado, r.modelo, r.color, r.fecha_estimada_armado, r._eff, r.fecha_real_armado || "", r.ns_chasis||"", r.ns_motor||"", r.chasis_asignado||"", r.remisiones?.profiles?.nombre_completo||"", r.remisiones?.clientes?.codigo_erp||"", r.remisiones?.folio_remision||"", r.fecha_estimada_entrega||"", r.estatus_entrega]);
    const csv = [header, ...rows2].map(r => r.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "produccion.csv"; a.click();
  };

  const updateMoto = async (id: string, patch: any) => {
    const { error } = await supabase.from("motocarros").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(t.produccion.toastOk); load(); }
  };

  const doConfirm = async () => {
    if (!confirm) return;
    const { moto, action } = confirm;
    const today = new Date().toISOString().slice(0,10);
    if (action === "EN_PROCESO") await updateMoto(moto.id, { estatus_armado: "EN_PROCESO" });
    else if (action === "ARMADO") await updateMoto(moto.id, { estatus_armado: "ARMADO", fecha_real_armado: today });
    else if (action === "LISTO") await updateMoto(moto.id, { estatus_armado: "LISTO" });
    else if (action === "ENTREGADA") await updateMoto(moto.id, { estatus_entrega: "ENTREGADA", fecha_real_entrega: today });
    setConfirm(null);
  };

  const canEditFabrica = role === "admin" || role === "fabrica";
  const canEditEntrega = role === "admin" || role === "logistica";
  type ConfirmAction = "EN_PROCESO" | "ARMADO" | "LISTO" | "ENTREGADA";

  const FILTERS: { key: FilterKey; label: string; }[] = [
    { key: "TODOS", label: t.produccion.filtros.todos },
    { key: "PENDIENTES", label: t.produccion.filtros.pendientes },
    { key: "ARMADOS", label: t.produccion.filtros.armados },
    { key: "ATRASADOS", label: t.produccion.filtros.atrasados },
    { key: "ENTREGADOS", label: t.produccion.filtros.entregados },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>{t.produccion.title}</h1>
          <p className="text-muted-foreground text-base mt-1">{t.produccion.subtitle(filtered.length, rows.length)}</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="inline-flex rounded-lg border p-1 bg-card">
            <button onClick={() => setView("cards")} className={`px-3 py-2 rounded-md flex items-center gap-2 text-sm font-medium ${view === "cards" ? "bg-[#1F3864] text-white" : "text-muted-foreground"}`}>
              <LayoutGrid size={18}/> {t.produccion.vista.tarjetas}
            </button>
            <button onClick={() => setView("tabla")} className={`px-3 py-2 rounded-md flex items-center gap-2 text-sm font-medium ${view === "tabla" ? "bg-[#1F3864] text-white" : "text-muted-foreground"}`}>
              <TableIcon size={18}/> {t.produccion.vista.tabla}
            </button>
          </div>
          {(role === "admin" || role === "fabrica") && <RecibirContenedor onDone={load} />}
          <Button onClick={exportCsv} variant="outline" className="h-12"><Download className="h-5 w-5 mr-2" /> {t.produccion.exportarCsv}</Button>
        </div>
      </div>

      {/* InventarioStatus (alertas de déficit): solo admin/coordinador */}
      {(role === "admin" || role === "coordinador") && <InventarioStatus refreshKey={rows.length} />}
      {/* BandejaRemisiones: fábrica la necesita para asignar, ver docs y características */}
      {(role === "admin" || role === "fabrica" || role === "coordinador") && <BandejaRemisiones onChange={load} />}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-[48px] px-5 rounded-full font-semibold text-base transition-all border-2 ${active ? "bg-[#1F3864] text-white border-[#1F3864]" : "bg-white text-[#1F3864] border-[#2E75B6]/30 hover:border-[#2E75B6]"}`}
            >
              {f.label} <span className={`ml-2 px-2 py-0.5 rounded-full text-sm ${active ? "bg-white/20" : "bg-[#2E75B6]/10"}`}>{(counts as any)[f.key]}</span>
            </button>
          );
        })}
      </div>

      <Card className="p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder={t.produccion.buscar} value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="inline-flex rounded-lg border p-1 bg-card">
          {(["TODOS","BLANCO","AZUL"] as const).map(c => (
            <button key={c} onClick={() => setColorFilter(c)} className={`px-3 py-2 rounded-md text-sm font-medium ${colorFilter === c ? "bg-[#2E75B6] text-white" : "text-muted-foreground"}`}>
              {c === "TODOS" ? t.produccion.filtros.todosColores : c}
            </button>
          ))}
        </div>
      </Card>

      {view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(r => <MotocarroCard key={r.id} r={r} canEditFabrica={canEditFabrica} canEditEntrega={canEditEntrega}
            onEdit={() => { setEditing(r); setEditForm({ ns_chasis: r.ns_chasis || "", ns_motor: r.ns_motor || "", chasis_asignado: r.chasis_asignado || "", observaciones_paro: r.observaciones_paro || "", fecha_estimada_armado: r.fecha_estimada_armado || "" }); }}
            onAction={(action) => setConfirm({ moto: r, action })}
            onComentarios={() => setComentariosMoto({ id: r.id, orden: r.orden_armado })}
            t={t}
          />)}
          {!filtered.length && <div className="col-span-full text-center text-muted-foreground py-12 bg-card rounded-lg border">{t.produccion.sinResultados}</div>}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="data-table">
              <thead><tr>
                <th>{t.produccion.columna.orden}</th><th>{t.produccion.columna.modelo}</th><th>{t.produccion.columna.color}</th><th>{t.produccion.columna.fechaEstimada}</th><th>{t.produccion.columna.estatus}</th>
                <th>{t.produccion.columna.fechaReal}</th><th>{t.produccion.columna.ns_chasis}</th><th>{t.produccion.columna.ns_motor}</th><th>{t.produccion.columna.chasis}</th>
                <th>{t.produccion.columna.vendedor}</th><th>{t.produccion.columna.cliente}</th><th>{t.produccion.columna.remision}</th><th>{t.produccion.columna.fechaEntrega}</th><th>{t.produccion.columna.entrega}</th>
              </tr></thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td className="font-semibold text-primary">{r.orden_armado}</td>
                    <td>{r.modelo}</td><td>{r.color}</td>
                    <td>{fmtDate(r.fecha_estimada_armado)}</td>
                    <td><EstatusBadge estatus={r._eff} size="sm" /></td>
                    <td>{fmtDate(r.fecha_real_armado)}</td>
                    <td className="font-mono text-[11px]">{r.ns_chasis || "—"}</td>
                    <td className="font-mono text-[11px]">{r.ns_motor || "—"}</td>
                    <td>{r.chasis_asignado || "—"}</td>
                    <td>{r.remisiones?.profiles?.nombre_completo || "—"}</td>
                    <td>{r.remisiones?.clientes?.codigo_erp || "—"}</td>
                    <td>{r.remisiones?.folio_remision || "—"}</td>
                    <td>{fmtDate(r.fecha_estimada_entrega)}</td>
                    <td><span className={`px-2 py-0.5 rounded text-xs ${ESTATUS_ENTREGA_COLOR[r.estatus_entrega]}`}>{r.estatus_entrega}</span></td>
                    <td>{r.remisiones?.tipo_pago === "contra_entrega" && !r.remisiones?.pagado ? <span className="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-bold">{t.pago.retenidoCorto}</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Edit modal */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t.produccion.editarTitulo(editing?.orden_armado)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t.produccion.nsChasis}</Label><Input value={editForm.ns_chasis} onChange={e => setEditForm({ ...editForm, ns_chasis: e.target.value })} /></div>
            <div><Label>{t.produccion.nsMot}</Label><Input value={editForm.ns_motor} onChange={e => setEditForm({ ...editForm, ns_motor: e.target.value })} /></div>
            <div><Label>{t.produccion.chasisAsignado}</Label><Input value={editForm.chasis_asignado} onChange={e => setEditForm({ ...editForm, chasis_asignado: e.target.value })} /></div>
            <div><Label>{t.produccion.fechaEstimadaArmado}</Label><Input type="date" value={editForm.fecha_estimada_armado} onChange={e => setEditForm({ ...editForm, fecha_estimada_armado: e.target.value })} /></div>
            <div><Label>{t.produccion.observaciones}</Label><Textarea value={editForm.observaciones_paro} onChange={e => setEditForm({ ...editForm, observaciones_paro: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button onClick={async () => {
              const patch = { ...editForm };
              Object.keys(patch).forEach(k => { if (patch[k] === "") patch[k] = null; });
              await updateMoto(editing.id, patch);
              setEditing(null);
            }}>{t.actions.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comentarios */}
      {comentariosMoto && (
        <ComentariosDialog
          motocarroId={comentariosMoto.id}
          orden={comentariosMoto.orden}
          open={!!comentariosMoto}
          onClose={() => setComentariosMoto(null)}
          t={t}
        />
      )}

      {/* Confirmation */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.produccion.confirmarAccion}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.produccion.confirmarDesc(confirm?.moto.orden_armado,
              confirm?.action === "EN_PROCESO" ? "En proceso" :
              confirm?.action === "ARMADO" ? t.produccion.filtros.armados :
              confirm?.action === "LISTO" ? t.produccion.filtros.todos :
              t.produccion.entregado)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={doConfirm}>{t.produccion.siConfirmar}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MotocarroCard({ r, canEditFabrica, canEditEntrega, onEdit, onAction, onComentarios, t }: any) {
  const desv = diasDesvio(r);
  const desvLabel = desv == null ? null : desv > 0 ? `+${desv}d` : `${desv}d`;
  const desvCls = desv == null ? "" : desv > 0 ? "bg-[#FEE2E2] text-[#991B1B]" : "bg-[#D1FAE5] text-[#065F46]";

  const colorBike = r.color === "AZUL" ? "#2E75B6" : "#94A3B8";
  const colorBg   = r.color === "AZUL" ? "#DBEAFE" : "#F1F5F9";

  // timeline state
  const steps = ["PENDIENTE", "ARMADO", "LISTO", "ENTREGADO"];
  let activeIdx = 0;
  if (r.estatus_entrega === "ENTREGADA") activeIdx = 3;
  else if (r._eff === "LISTO") activeIdx = 2;
  else if (r._eff === "ARMADO") activeIdx = 1;

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow flex flex-col">
      <div className="flex items-start justify-between p-4 pb-2" style={{ background: colorBg }}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-white/70">
            <Bike size={36} strokeWidth={2} color={colorBike} />
          </div>
          <div>
            <div className="text-sm text-muted-foreground font-medium">{r.color}</div>
            <div className="text-base font-semibold text-[#1F3864]">{r.modelo}</div>
          </div>
        </div>
        <div className="px-3 py-1.5 rounded-md bg-[#1F3864] text-white font-bold text-xl tracking-tight">
          #{r.orden_armado}
        </div>
      </div>

      <div className="p-4 space-y-3 flex-1">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <EstatusBadge estatus={r.estatus_entrega === "ENTREGADA" ? "ENTREGADA" : r._eff} size="md" />
          <div className="flex gap-1.5 flex-wrap">
            {r.remisiones?.tipo_pago === "contra_entrega" && !r.remisiones?.pagado && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-300">
                {t.pago.retenido}
              </span>
            )}
            {desvLabel && <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${desvCls}`}>{desvLabel}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          {r.remisiones?.clientes?.codigo_erp && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-700 font-medium">
              👤 {r.remisiones.clientes.codigo_erp}
            </span>
          )}
          {r.remisiones?.profiles?.nombre_completo && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#DBEAFE] text-[#1E40AF] font-medium">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#2E75B6] text-white text-[10px] font-bold">
                {r.remisiones.profiles.nombre_completo.split(" ").map((n: string) => n[0]).slice(0,2).join("")}
              </span>
              {r.remisiones.profiles.nombre_completo.split(" ")[0]}
            </span>
          )}
          {r.remisiones?.folio_remision && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-slate-700 font-medium">
              📄 {r.remisiones.folio_remision}
            </span>
          )}
        </div>

        {/* Timeline */}
        <div className="flex items-center justify-between pt-2">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${i <= activeIdx ? "bg-[#1F3864] text-white" : "bg-slate-200 text-slate-400"}`} title={s}>
                {i + 1}
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-1 mx-1 rounded ${i < activeIdx ? "bg-[#1F3864]" : "bg-slate-200"}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground -mt-1">
          <span>{t.produccion.timeline.pend}</span><span>{t.produccion.timeline.armado}</span><span>{t.produccion.timeline.listo}</span><span>{t.produccion.timeline.entreg}</span>
        </div>

        <div className="text-xs text-muted-foreground">
          {t.produccion.estimadaArmado} <strong className="text-foreground">{fmtDate(r.fecha_estimada_armado)}</strong>
        </div>
      </div>

      <div className="border-t p-3 flex gap-2 items-stretch flex-wrap">
        {canEditFabrica && (r._eff === "PENDIENTE" || r._eff === "ATRASADO") && (
          <Button onClick={() => onAction("EN_PROCESO")} className="flex-1 h-12 bg-amber-600 hover:bg-amber-700 text-base min-w-[120px]">
            <Pencil className="h-5 w-5 mr-2" /> Iniciar ensamble
          </Button>
        )}
        {canEditFabrica && r._eff === "EN_PROCESO" && (
          <Button onClick={() => onAction("ARMADO")} className="flex-1 h-12 bg-[#1F3864] hover:bg-[#162a4d] text-base min-w-[120px]">
            <CheckCircle className="h-5 w-5 mr-2" /> {t.produccion.marcarArmado}
          </Button>
        )}
        {canEditFabrica && r._eff === "ARMADO" && (
          <Button onClick={() => onAction("LISTO")} className="flex-1 h-12 bg-[#065F46] hover:bg-[#054c38] text-base">
            <CheckCircle className="h-5 w-5 mr-2" /> {t.produccion.marcarListo}
          </Button>
        )}
        {canEditEntrega && r._eff === "LISTO" && r.estatus_entrega !== "ENTREGADA" && (
          <Button onClick={() => onAction("ENTREGADA")} className="flex-1 h-12 bg-[#5B21B6] hover:bg-[#4c1d95] text-base">
            <TruckIcon className="h-5 w-5 mr-2" /> {t.produccion.marcarEntregado}
          </Button>
        )}
        {r.estatus_entrega === "ENTREGADA" && (
          <div className="flex-1 h-12 flex items-center justify-center text-[#5B21B6] font-semibold bg-[#EDE9FE] rounded-md">
            <TruckIcon className="h-5 w-5 mr-2" /> {t.produccion.entregado}
          </div>
        )}
        {canEditFabrica && (
          <Button variant="outline" onClick={onEdit} className="h-12 w-12 p-0" title="Editar"><Pencil className="h-5 w-5" /></Button>
        )}
        <Button variant="outline" onClick={onComentarios} className="h-12 w-12 p-0" title={t.produccion.comentarios.title}>
          <MessageSquare className="h-5 w-5 text-[#1F3864]" />
        </Button>
      </div>
    </Card>
  );
}
