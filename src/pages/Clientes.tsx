import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Pencil, Search, Phone, MapPin, Bike, Truck } from "lucide-react";

export default function Clientes() {
  const { role } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [motos, setMotos] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<any>({ codigo_erp: "", nombre_comercial: "", telefono: "", direccion: "", activo: true });

  const load = async () => {
    const [{ data: cs }, { data: ms }] = await Promise.all([
      supabase.from("clientes").select("*").order("codigo_erp"),
      supabase.from("motocarros").select("id, estatus_entrega, remisiones!inner(cliente_id)"),
    ]);
    setRows(cs ?? []); setMotos(ms ?? []);
  };
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const m: Record<string, { total: number; entregados: number }> = {};
    motos.forEach((x: any) => {
      const cid = x.remisiones?.cliente_id;
      if (!cid) return;
      if (!m[cid]) m[cid] = { total: 0, entregados: 0 };
      m[cid].total++;
      if (x.estatus_entrega === "ENTREGADA") m[cid].entregados++;
    });
    return m;
  }, [motos]);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const t = q.toLowerCase();
    return rows.filter(c => [c.codigo_erp, c.nombre_comercial, c.telefono].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [rows, q]);

  const canEdit = role === "admin" || role === "fabrica";
  const canCreate = role === "admin" || role === "fabrica" || role === "ventas";

  const save = async () => {
    if (editing) {
      const { error } = await supabase.from("clientes").update(form).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("✓ Cliente actualizado"); setEditing(null);
    } else {
      const { error } = await supabase.from("clientes").insert(form);
      if (error) return toast.error(error.message);
      toast.success("✓ Cliente creado"); setCreating(false);
    }
    setForm({ codigo_erp: "", nombre_comercial: "", telefono: "", direccion: "", activo: true }); load();
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div><h1>Clientes</h1><p className="text-base text-muted-foreground mt-1">{filtered.length} de {rows.length} clientes</p></div>
        {canCreate && (
          <Button onClick={() => { setForm({ codigo_erp: "", nombre_comercial: "", telefono: "", direccion: "", activo: true }); setCreating(true); }}
            className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2"/> Nuevo cliente
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder="Buscar por código, nombre o teléfono…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(c => {
          const s = stats[c.id] || { total: 0, entregados: 0 };
          const activos = s.total - s.entregados;
          return (
            <Card key={c.id} className="p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase text-muted-foreground tracking-wide font-medium">Código ERP</div>
                  <div className="text-2xl font-bold text-[#1F3864] truncate">{c.codigo_erp}</div>
                  <div className="text-sm text-muted-foreground truncate mt-0.5">{c.nombre_comercial || <em>Sin nombre comercial</em>}</div>
                </div>
                {canEdit && (
                  <Button size="icon" variant="ghost" onClick={() => { setForm(c); setEditing(c); }} className="h-10 w-10">
                    <Pencil className="h-5 w-5" />
                  </Button>
                )}
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone size={16}/> <span>{c.telefono || "—"}</span>
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin size={16} className="mt-0.5 shrink-0"/> <span className="line-clamp-2">{c.direccion || "—"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-auto pt-3 border-t">
                <div className="text-center p-2 rounded-md bg-[#DBEAFE]">
                  <Bike className="mx-auto mb-1 text-[#1E40AF]" size={20}/>
                  <div className="text-xl font-bold text-[#1E40AF]">{activos}</div>
                  <div className="text-[11px] text-[#1E40AF] font-medium">Activos</div>
                </div>
                <div className="text-center p-2 rounded-md bg-[#EDE9FE]">
                  <Truck className="mx-auto mb-1 text-[#5B21B6]" size={20}/>
                  <div className="text-xl font-bold text-[#5B21B6]">{s.entregados}</div>
                  <div className="text-[11px] text-[#5B21B6] font-medium">Entregados</div>
                </div>
              </div>
            </Card>
          );
        })}
        {!filtered.length && <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin resultados</div>}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Código ERP</Label><Input value={form.codigo_erp} onChange={e => setForm({ ...form, codigo_erp: e.target.value })} /></div>
            <div><Label>Nombre comercial</Label><Input value={form.nombre_comercial || ""} onChange={e => setForm({ ...form, nombre_comercial: e.target.value })} /></div>
            <div><Label>Teléfono</Label><Input value={form.telefono || ""} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
            <div><Label>Dirección</Label><Input value={form.direccion || ""} onChange={e => setForm({ ...form, direccion: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={save} className="h-12 px-5 text-base">Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
