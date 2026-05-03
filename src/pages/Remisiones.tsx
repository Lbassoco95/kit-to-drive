import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ESTATUS_REMISION_COLOR, fmtDate } from "@/lib/dazon";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Upload, Wand2, FileDown } from "lucide-react";

export default function Remisiones() {
  const { role, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ folio_remision: "", cliente_id: "", total_unidades_solicitadas: 1, color_solicitado: "BLANCO", fecha_remision: new Date().toISOString().slice(0,10), notas: "" });

  const load = async () => {
    const { data } = await supabase
      .from("remisiones")
      .select("*, clientes(codigo_erp, nombre_comercial), profiles:vendedor_id(nombre_completo), motocarros(id, estatus_armado)")
      .order("fecha_remision", { ascending: false, nullsFirst: false });
    setRows(data ?? []);
  };

  useEffect(() => { load(); supabase.from("clientes").select("id, codigo_erp, nombre_comercial").order("codigo_erp").then(({ data }) => setClientes(data ?? [])); }, []);

  const canCreate = role === "admin" || role === "ventas";

  const crearRemision = async () => {
    if (!form.folio_remision || !form.cliente_id) { toast.error("Folio y cliente son obligatorios"); return; }
    const payload = { ...form, vendedor_id: user?.id, total_unidades_solicitadas: Number(form.total_unidades_solicitadas) || 1 };
    const { error } = await supabase.from("remisiones").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Remisión creada");
    setOpen(false);
    setForm({ folio_remision: "", cliente_id: "", total_unidades_solicitadas: 1, color_solicitado: "BLANCO", fecha_remision: new Date().toISOString().slice(0,10), notas: "" });
    load();
  };

  const asignarChasis = async (r: any) => {
    const cant = Number(prompt(`¿Cuántos chasis asignar a ${r.folio_remision}? (Solicitadas: ${r.total_unidades_solicitadas}, asignadas: ${r.motocarros?.length ?? 0})`, String(r.total_unidades_solicitadas - (r.motocarros?.length ?? 0))));
    if (!cant || cant <= 0) return;
    const { data, error } = await supabase.rpc("asignar_chasis_remision", {
      _remision_id: r.id, _cantidad: cant, _color: r.color_solicitado || null,
    });
    if (error) return toast.error(error.message);
    toast.success(`${data} chasis asignados`);
    load();
  };

  const subirPdf = async (r: any, file: File) => {
    const path = `${r.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("remisiones-docs").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { error } = await supabase.from("remisiones").update({ documento_url: path }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("PDF subido"); load();
  };

  const verPdf = async (path: string) => {
    const { data } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Remisiones</h1>
          <p className="text-muted-foreground text-sm">{rows.length} remisiones {role === "ventas" ? "(solo las tuyas)" : ""}</p>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nueva remisión</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva remisión</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Folio</Label><Input value={form.folio_remision} onChange={e => setForm({ ...form, folio_remision: e.target.value })} placeholder="REM-001" /></div>
                <div><Label>Cliente</Label>
                  <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                    <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.codigo_erp}{c.nombre_comercial ? ` — ${c.nombre_comercial}` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Unidades</Label><Input type="number" min={1} value={form.total_unidades_solicitadas} onChange={e => setForm({ ...form, total_unidades_solicitadas: e.target.value })} /></div>
                  <div><Label>Color</Label>
                    <Select value={form.color_solicitado} onValueChange={(v) => setForm({ ...form, color_solicitado: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="BLANCO">Blanco</SelectItem><SelectItem value="AZUL">Azul</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Fecha</Label><Input type="date" value={form.fecha_remision} onChange={e => setForm({ ...form, fecha_remision: e.target.value })} /></div>
                <div><Label>Notas</Label><Input value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={crearRemision}>Crear</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr>
              <th>Folio</th><th>Vendedor</th><th>Cliente</th><th>Fecha</th>
              <th>Solicitadas</th><th>Asignadas</th><th>% Avance</th><th>Estatus</th><th>PDF</th><th>Acciones</th>
            </tr></thead>
            <tbody>
              {rows.map(r => {
                const asignadas = r.motocarros?.length ?? 0;
                const pct = r.total_unidades_solicitadas ? Math.round((asignadas / r.total_unidades_solicitadas) * 100) : 0;
                const isOwner = r.vendedor_id === user?.id;
                const canAssign = role === "admin" || (role === "ventas" && isOwner);
                const canUpload = role === "admin" || (role === "ventas" && isOwner);
                return (
                  <tr key={r.id}>
                    <td className="font-semibold">{r.folio_remision}</td>
                    <td>{r.profiles?.nombre_completo || (r.notas?.replace("Vendedor original: ", "")) || "—"}</td>
                    <td>{r.clientes?.codigo_erp || "—"}</td>
                    <td>{fmtDate(r.fecha_remision)}</td>
                    <td>{r.total_unidades_solicitadas}</td>
                    <td>{asignadas}</td>
                    <td>
                      <div className="w-24 bg-muted rounded-full h-2">
                        <div className="h-2 rounded-full bg-secondary" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{pct}%</span>
                    </td>
                    <td><span className={`px-2 py-0.5 rounded text-xs ${ESTATUS_REMISION_COLOR[r.estatus]}`}>{r.estatus}</span></td>
                    <td>
                      {r.documento_url ? (
                        <Button size="sm" variant="ghost" onClick={() => verPdf(r.documento_url)}><FileDown className="h-4 w-4" /></Button>
                      ) : "—"}
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {canAssign && asignadas < r.total_unidades_solicitadas && (
                          <Button size="sm" variant="outline" onClick={() => asignarChasis(r)}><Wand2 className="h-3 w-3 mr-1" />Asignar</Button>
                        )}
                        {canUpload && (
                          <label className="cursor-pointer">
                            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirPdf(r, f); }} />
                            <span className="inline-flex items-center px-2 py-1 text-xs border rounded hover:bg-accent"><Upload className="h-3 w-3 mr-1" />PDF</span>
                          </label>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">Sin remisiones</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
