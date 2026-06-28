import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fmtDate, normColor, effEstatusArmado } from "@/lib/dazon";
import { useLang } from "@/contexts/LangContext";
import { EstatusBadge } from "@/components/EstatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Upload, Wand2, FileDown, FileText, ChevronDown, UserPlus, CalendarClock, CheckCircle2, Factory, Truck, DollarSign, ImageIcon } from "lucide-react";

// Sugiere el siguiente folio incrementando el sufijo numérico del último
function suggestNextFolio(folios: string[]): string {
  if (!folios.length) return "REM-001";
  const parsed = folios
    .map(f => {
      const m = (f || "").match(/^(.*?)(\d+)\s*$/);
      return m ? { prefix: m[1], num: parseInt(m[2], 10), pad: m[2].length, raw: f } : null;
    })
    .filter(Boolean) as { prefix: string; num: number; pad: number; raw: string }[];
  if (!parsed.length) return folios[0] + "-1";
  const last = parsed.sort((a, b) => b.num - a.num)[0];
  return `${last.prefix}${String(last.num + 1).padStart(last.pad, "0")}`;
}

export default function Remisiones() {
  const { role, user } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [recentFolios, setRecentFolios] = useState<string[]>([]);
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ codigo_erp: "", nombre_comercial: "", telefono: "" });
  const [form, setForm] = useState<any>({ folio_remision: "", cliente_id: "", total_unidades_solicitadas: 1, color_solicitado: "BLANCO", fecha_remision: new Date().toISOString().slice(0,10), notas: "", tipo_pago: "anticipado", pagado: true });
  const [formFile, setFormFile] = useState<File | null>(null);
  const [pagoDialog, setPagoDialog] = useState<any | null>(null);
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [subiendoPago, setSubiendoPago] = useState(false);

  const loadClientes = async () => {
    const { data } = await supabase.from("clientes").select("id, codigo_erp, nombre_comercial").order("codigo_erp");
    setClientes(data ?? []);
  };

  const load = async () => {
    const { data } = await supabase
      .from("remisiones")
      .select("*, clientes(codigo_erp, nombre_comercial), profiles:vendedor_id(nombre_completo), motocarros(id, orden_armado, modelo, color, ns_chasis, chasis_asignado, estatus_armado, fecha_estimada_armado, fecha_real_armado, estatus_entrega, fecha_estimada_entrega, fecha_propuesta_entrega, propuesta_entrega_notas, confirmada_fabrica_at, confirmada_logistica_at)")
      .order("fecha_remision", { ascending: false, nullsFirst: false });
    setRows(data ?? []);
    // Tomar últimos folios del propio vendedor (o todos si admin/coordinador) para sugerir siguiente
    const propios = (data ?? []).filter((r: any) => role === "admin" || role === "coordinador" || r.vendedor_id === user?.id);
    setRecentFolios(propios.slice(0, 5).map((r: any) => r.folio_remision));
  };

  useEffect(() => { load(); loadClientes(); }, [user?.id, role]);

  const canCreate = role === "admin" || role === "ventas" || role === "coordinador";

  const abrirNueva = () => {
    setForm(f => ({ ...f, folio_remision: suggestNextFolio(recentFolios) }));
    setOpen(true);
  };

  const guardarNuevoCliente = async () => {
    if (!nuevoCliente.codigo_erp.trim()) return toast.error("El código ERP es obligatorio");
    const { data, error } = await supabase.from("clientes").insert(nuevoCliente).select("id, codigo_erp, nombre_comercial").single();
    if (error) return toast.error(error.message);
    toast.success("✓ Cliente creado");
    await loadClientes();
    setForm((f: any) => ({ ...f, cliente_id: data.id }));
    setNuevoCliente({ codigo_erp: "", nombre_comercial: "", telefono: "" });
    setCreandoCliente(false);
  };

  const crearRemision = async () => {
    if (!form.folio_remision || !form.cliente_id) { toast.error("Folio y cliente son obligatorios"); return; }
    if (recentFolios.includes(form.folio_remision.trim())) {
      toast.error("Ese folio ya existe en tus remisiones recientes"); return;
    }
    const payload = { ...form, folio_remision: form.folio_remision.trim(), vendedor_id: user?.id, total_unidades_solicitadas: Number(form.total_unidades_solicitadas) || 1 };
    const { data: nueva, error } = await supabase.from("remisiones").insert(payload).select("id").single();
    if (error) return toast.error(error.message);
    // Si hay archivo adjunto, subirlo
    if (formFile && nueva?.id) {
      const path = `${nueva.id}/${Date.now()}_${formFile.name}`;
      const { error: upErr } = await supabase.storage.from("remisiones-docs").upload(path, formFile);
      if (!upErr) await supabase.from("remisiones").update({ documento_url: path }).eq("id", nueva.id);
    }
    toast.success(t.remisiones.creada);
    setOpen(false);
    setFormFile(null);
    setForm({ folio_remision: "", cliente_id: "", total_unidades_solicitadas: 1, color_solicitado: "BLANCO", fecha_remision: new Date().toISOString().slice(0,10), notas: "", tipo_pago: "anticipado", pagado: true });
    load();
  };

  const asignarChasis = async (r: any) => {
    const cant = Number(prompt(`¿Cuántos chasis asignar a ${r.folio_remision}?`, String(r.total_unidades_solicitadas - (r.motocarros?.length ?? 0))));
    if (!cant || cant <= 0) return;
    const { data, error } = await supabase.rpc("asignar_chasis_remision", { _remision_id: r.id, _cantidad: cant, _color: r.color_solicitado || null });
    if (error) return toast.error(error.message);
    toast.success(`✓ ${data} chasis asignados`);
    load();
  };

  const subirPdf = async (r: any, file: File) => {
    const path = `${r.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("remisiones-docs").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    await supabase.from("remisiones").update({ documento_url: path }).eq("id", r.id);
    toast.success("✓ PDF subido"); load();
  };

  const verPdf = async (path: string) => {
    const { data } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const confirmarPago = async () => {
    if (!pagoDialog) return;
    if (!comprobanteFile) { toast.error(t.pago.sinComprobante); return; }
    setSubiendoPago(true);
    const path = `${pagoDialog.id}/comprobante_${Date.now()}_${comprobanteFile.name}`;
    const { error: upErr } = await supabase.storage.from("remisiones-docs").upload(path, comprobanteFile);
    if (upErr) { setSubiendoPago(false); return toast.error(upErr.message); }
    const { error } = await supabase.from("remisiones").update({ pagado: true, comprobante_pago_url: path }).eq("id", pagoDialog.id);
    setSubiendoPago(false);
    if (error) return toast.error(error.message);
    toast.success(t.pago.confirmadoOk);
    setPagoDialog(null);
    setComprobanteFile(null);
    load();
  };

  const verComprobante = async (path: string) => {
    const { data } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>{t.remisiones.title}</h1>
          <p className="text-muted-foreground text-base mt-1">{t.remisiones.subtitle(rows.length)} {role === "ventas" ? "(solo las tuyas)" : ""}</p>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm((f: any) => ({ ...f, folio_remision: f.folio_remision || suggestNextFolio(recentFolios) })); }}>
            <DialogTrigger asChild>
              <Button onClick={abrirNueva} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
                <Plus className="h-5 w-5 mr-2" /> {t.remisiones.nueva}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{t.remisiones.crearTitulo}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-base">{t.remisiones.folioRemision}</Label>
                  <Input value={form.folio_remision} onChange={e => setForm({ ...form, folio_remision: e.target.value })} placeholder={t.remisiones.folioPlaceholder} className="h-12 text-base font-mono" />
                  {recentFolios.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-muted-foreground mb-1">Últimas remisiones (toca para basar el siguiente folio):</div>
                      <div className="flex flex-wrap gap-1.5">
                        {recentFolios.map(f => (
                          <button key={f} type="button" onClick={() => setForm((s: any) => ({ ...s, folio_remision: suggestNextFolio([f]) }))} className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-[#DBEAFE] text-xs font-mono text-[#1F3864] border" title={`Sugerir ${suggestNextFolio([f])}`}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Cliente</Label>
                    <button type="button" onClick={() => setCreandoCliente(s => !s)} className="inline-flex items-center gap-1 text-xs text-[#2E75B6] hover:underline font-medium">
                      <UserPlus className="h-3.5 w-3.5" /> {creandoCliente ? "Cancelar" : "Nuevo cliente"}
                    </button>
                  </div>
                  {!creandoCliente ? (
                    <Select value={form.cliente_id} onValueChange={v => setForm({ ...form, cliente_id: v })}>
                      <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                      <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.codigo_erp}{c.nombre_comercial ? ` — ${c.nombre_comercial}` : ""}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <div className="border-2 border-dashed border-[#2E75B6]/40 rounded-md p-3 space-y-2 bg-[#DBEAFE]/30">
                      <Input placeholder="Código ERP *" value={nuevoCliente.codigo_erp} onChange={e => setNuevoCliente({ ...nuevoCliente, codigo_erp: e.target.value })} className="h-11" />
                      <Input placeholder="Nombre comercial" value={nuevoCliente.nombre_comercial} onChange={e => setNuevoCliente({ ...nuevoCliente, nombre_comercial: e.target.value })} className="h-11" />
                      <Input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={e => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} className="h-11" />
                      <Button type="button" onClick={guardarNuevoCliente} className="w-full h-11 bg-[#2E75B6] hover:bg-[#246094]">Guardar cliente</Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t.remisiones.cantMotocarros}</Label><Input type="number" min={1} value={form.total_unidades_solicitadas} onChange={e => setForm({ ...form, total_unidades_solicitadas: e.target.value })} className="h-12 text-base" /></div>
                  <div><Label>Color</Label>
                    <Select value={form.color_solicitado} onValueChange={v => setForm({ ...form, color_solicitado: v })}>
                      <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="BLANCO">Blanco</SelectItem><SelectItem value="AZUL">Azul</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Fecha</Label><Input type="date" value={form.fecha_remision} onChange={e => setForm({ ...form, fecha_remision: e.target.value })} className="h-12 text-base" /></div>
                <div>
                  <Label>{t.pago.tipo}</Label>
                  <Select value={form.tipo_pago} onValueChange={v => setForm({ ...form, tipo_pago: v, pagado: v === "anticipado" })}>
                    <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anticipado">{t.remisiones.anticipado}</SelectItem>
                      <SelectItem value="contra_entrega">{t.remisiones.contraEntrega}</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.tipo_pago === "contra_entrega" && (
                    <p className="text-xs text-amber-600 mt-1">⚠ Logística no podrá programar la entrega hasta que se confirme el pago.</p>
                  )}
                </div>
                <div><Label>Notas</Label><Input value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} className="h-12 text-base" /></div>
                <div>
                  <Label>{t.remisiones.subirRemision}</Label>
                  <label className="mt-1 flex items-center justify-center cursor-pointer h-12 rounded-md border-2 border-dashed border-slate-300 hover:border-[#2E75B6] hover:bg-[#DBEAFE]/30 text-sm text-muted-foreground gap-2">
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setFormFile(e.target.files?.[0] ?? null)} />
                    <ImageIcon className="h-4 w-4" />
                    {formFile ? <span className="text-[#1F3864] font-medium truncate max-w-[200px]">{formFile.name}</span> : "Subir foto o PDF"}
                  </label>
                </div>
              </div>
              <DialogFooter><Button onClick={crearRemision} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">{t.remisiones.crearBtn}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map(r => {
          const motos = r.motocarros ?? [];
          const asignadas = motos.length;
          const listas = motos.filter((m: any) => ["ARMADO","LISTO"].includes(m.estatus_armado)).length;
          const total = r.total_unidades_solicitadas || asignadas || 1;
          const pct = Math.round((listas / total) * 100);
          const pctColor = pct === 100 ? "#065F46" : pct >= 50 ? "#92400E" : "#991B1B";
          const isOwner = r.vendedor_id === user?.id;
          const canAssign = role === "admin" || role === "coordinador" || (role === "ventas" && isOwner);
          const canUpload = role === "admin" || role === "coordinador" || (role === "ventas" && isOwner);
          const canPropose = role === "admin" || role === "coordinador" || (role === "ventas" && isOwner);
          const vendedor = r.profiles?.nombre_completo || (r.notas?.replace("Vendedor original: ", "")) || "—";
          const initials = vendedor.split(" ").map((s: string) => s[0]).slice(0,2).join("").toUpperCase();

          return (
            <Card key={r.id} className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t.fields.folio}</div>
                  <div className="text-2xl font-bold text-[#1F3864] leading-tight">{r.folio_remision}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(r.fecha_remision)}</div>
                </div>
                <EstatusBadge estatus={r.estatus} size="md" />
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#DBEAFE] text-[#1E40AF] text-xs font-medium">
                  <span className="w-5 h-5 rounded-full bg-[#2E75B6] text-white flex items-center justify-center text-[10px] font-bold">{initials}</span>
                  {vendedor.split(" ")[0]}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                  👤 {r.clientes?.codigo_erp || "—"}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                  🎨 {r.color_solicitado || "—"}
                </span>
                {r.tipo_pago === "contra_entrega" && !r.pagado ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-semibold">
                    {t.pago.pendiente}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-semibold">
                    <DollarSign className="h-3 w-3" /> {r.tipo_pago === "contra_entrega" ? t.pago.contra_entrega : t.pago.anticipado}
                  </span>
                )}
              </div>

              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span>{listas} de {total} chasis listos</span>
                  <span style={{ color: pctColor }} className="font-bold">{pct}%</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: pctColor }} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{asignadas} asignados de {total} solicitados</div>
              </div>

              {motos.length > 0 && (
                <Collapsible open={!!expanded[r.id]} onOpenChange={(o) => setExpanded(s => ({ ...s, [r.id]: o }))}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-md bg-slate-50 hover:bg-slate-100 text-sm font-medium">
                    Ver chasis y entregas ({motos.length})
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded[r.id] ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {motos.map((m: any) => (
                      <MotoRow key={m.id} m={m} canPropose={canPropose} role={role} onChange={load} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="flex gap-2 mt-auto pt-2 border-t">
                {canAssign && asignadas < total && (
                  <Button onClick={() => asignarChasis(r)} className="flex-1 h-12 bg-[#2E75B6] hover:bg-[#246094] text-base">
                    <Wand2 className="h-5 w-5 mr-2" /> Asignar
                  </Button>
                )}
                {r.documento_url ? (
                  <Button variant="outline" onClick={() => verPdf(r.documento_url)} className="flex-1 h-12 text-base">
                    <FileDown className="h-5 w-5 mr-2" /> Ver PDF
                  </Button>
                ) : canUpload ? (
                  <label className="flex-1">
                    <input type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) subirPdf(r, f); }} />
                    <span className="flex items-center justify-center cursor-pointer h-12 rounded-md border-2 border-dashed border-[#2E75B6]/40 text-[#1F3864] font-medium hover:bg-[#DBEAFE] text-base">
                      <Upload className="h-5 w-5 mr-2" /> Subir PDF
                    </span>
                  </label>
                ) : (
                  <div className="flex-1 h-12 flex items-center justify-center text-muted-foreground text-sm">
                    <FileText className="h-5 w-5 mr-2 opacity-40" /> Sin PDF
                  </div>
                )}
                {r.tipo_pago === "contra_entrega" && !r.pagado && (role === "admin" || role === "coordinador" || (role === "ventas" && r.vendedor_id === user?.id)) && (
                  <Button onClick={() => { setPagoDialog(r); setComprobanteFile(null); }} className="flex-1 h-12 text-base bg-emerald-600 hover:bg-emerald-700">
                    <DollarSign className="h-5 w-5 mr-2" /> {t.pago.confirmar}
                  </Button>
                )}
                {r.tipo_pago === "contra_entrega" && r.pagado && r.comprobante_pago_url && (
                  <Button variant="outline" onClick={() => verComprobante(r.comprobante_pago_url)} className="flex-1 h-12 text-base">
                    <FileDown className="h-5 w-5 mr-2" /> {t.pago.verComprobante}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
        {!rows.length && <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin remisiones</div>}
      </div>

      {/* Dialog: confirmar pago con comprobante */}
      <Dialog open={!!pagoDialog} onOpenChange={o => { if (!o) { setPagoDialog(null); setComprobanteFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t.pago.confirmar} — {pagoDialog?.folio_remision}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {t.pago.confirmarDesc}
            </p>
            <label className="flex flex-col items-center justify-center cursor-pointer h-28 rounded-md border-2 border-dashed border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50 gap-2 text-sm text-muted-foreground">
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => setComprobanteFile(e.target.files?.[0] ?? null)} />
              <ImageIcon className="h-8 w-8 text-emerald-400" />
              {comprobanteFile
                ? <span className="text-emerald-700 font-medium truncate max-w-[220px]">{comprobanteFile.name}</span>
                : <span>{t.pago.subirComprobante}</span>}
            </label>
            {comprobanteFile && <p className="text-xs text-emerald-600 font-medium text-center">{t.pago.archivoListo}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPagoDialog(null); setComprobanteFile(null); }}>{t.actions.cancel}</Button>
            <Button onClick={confirmarPago} disabled={!comprobanteFile || subiendoPago} className="bg-emerald-600 hover:bg-emerald-700">
              <DollarSign className="h-4 w-4 mr-2" />
              {subiendoPago ? t.actions.uploading : t.pago.confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MotoRow({ m, canPropose, role, onChange }: { m: any; canPropose: boolean; role: string | null; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [fecha, setFecha] = useState<string>(m.fecha_propuesta_entrega || "");
  const [notas, setNotas] = useState<string>(m.propuesta_entrega_notas || "");
  const proponer = async () => {
    if (!fecha) return toast.error("Selecciona una fecha");
    const { error } = await supabase.rpc("proponer_fecha_entrega", { _motocarro_id: m.id, _fecha: fecha, _notas: notas || null });
    if (error) return toast.error(error.message);
    toast.success("✓ Fecha propuesta enviada a fábrica y logística");
    setEditing(false); onChange();
  };
  const confirmar = async (area: "fabrica" | "logistica") => {
    const { error } = await supabase.rpc("confirmar_fecha_entrega", { _motocarro_id: m.id, _area: area });
    if (error) return toast.error(error.message);
    toast.success(`✓ Confirmado por ${area}`); onChange();
  };
  const canConfirmFab = role === "admin" || role === "fabrica";
  const canConfirmLog = role === "admin" || role === "logistica";
  const tieneFab = !!m.confirmada_fabrica_at;
  const tieneLog = !!m.confirmada_logistica_at;

  return (
    <div className="rounded-md border bg-white text-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[#1F3864]">#{m.orden_armado}</span>
          <span className="text-xs font-mono text-muted-foreground truncate">{m.ns_chasis || m.chasis_asignado || "—"}</span>
        </div>
        <EstatusBadge estatus={m.estatus_entrega === "ENTREGADA" ? "ENTREGADA" : effEstatusArmado(m)} size="sm" />
      </div>
      <div className="px-3 pb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-muted-foreground">Estim. armado:</div>
        <div className="text-right font-medium">{fmtDate(m.fecha_estimada_armado)}</div>
        <div className="text-muted-foreground">Estim. entrega:</div>
        <div className="text-right font-medium">{fmtDate(m.fecha_estimada_entrega || m.fecha_propuesta_entrega)}</div>
      </div>

      {!editing ? (
        <div className="px-3 pb-3 flex flex-wrap items-center gap-2">
          {m.fecha_propuesta_entrega ? (
            <div className="flex-1 min-w-0 text-xs">
              <div className="font-medium text-[#1F3864] flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> Propuesta: {fmtDate(m.fecha_propuesta_entrega)}
              </div>
              {m.propuesta_entrega_notas && <div className="text-muted-foreground truncate">{m.propuesta_entrega_notas}</div>}
              <div className="flex gap-1.5 mt-1">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${tieneFab ? "bg-[#D1FAE5] text-[#065F46]" : "bg-slate-100 text-slate-500"}`}>
                  <Factory className="h-3 w-3" /> {tieneFab ? "Fábrica ✓" : "Fábrica pendiente"}
                </span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${tieneLog ? "bg-[#D1FAE5] text-[#065F46]" : "bg-slate-100 text-slate-500"}`}>
                  <Truck className="h-3 w-3" /> {tieneLog ? "Logística ✓" : "Logística pendiente"}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex-1 text-xs text-muted-foreground italic">Sin fecha propuesta con cliente</div>
          )}
          <div className="flex gap-1.5 ml-auto">
            {canPropose && m.estatus_entrega !== "ENTREGADA" && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditing(true)}>
                <CalendarClock className="h-3.5 w-3.5 mr-1" />{m.fecha_propuesta_entrega ? "Cambiar" : "Proponer"}
              </Button>
            )}
            {m.fecha_propuesta_entrega && canConfirmFab && !tieneFab && (
              <Button size="sm" className="h-8 text-xs bg-[#065F46] hover:bg-[#04432f]" onClick={() => confirmar("fabrica")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Confirmar fábrica
              </Button>
            )}
            {m.fecha_propuesta_entrega && canConfirmLog && !tieneLog && (
              <Button size="sm" className="h-8 text-xs bg-[#065F46] hover:bg-[#04432f]" onClick={() => confirmar("logistica")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Confirmar logística
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="px-3 pb-3 space-y-2 bg-[#DBEAFE]/30">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Fecha pactada con cliente</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Hora / contacto</Label>
              <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: 10am, llamar al chofer" className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-9 bg-[#1F3864] hover:bg-[#162a4d]" onClick={proponer}>Enviar propuesta</Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
