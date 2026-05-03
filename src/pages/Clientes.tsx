import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

export default function Clientes() {
  const { role } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>({ codigo_erp: "", nombre_comercial: "", telefono: "", direccion: "", activo: true });

  const load = () => supabase.from("clientes").select("*").order("codigo_erp").then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);

  const canEdit = role === "admin" || role === "fabrica";
  const canCreate = role === "admin" || role === "fabrica" || role === "ventas";

  const save = async () => {
    if (editing) {
      const { error } = await supabase.from("clientes").update(form).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Cliente actualizado"); setEditing(null); load();
    } else {
      const { error } = await supabase.from("clientes").insert(form);
      if (error) return toast.error(error.message);
      toast.success("Cliente creado"); setCreating(false); load();
    }
    setForm({ codigo_erp: "", nombre_comercial: "", telefono: "", direccion: "", activo: true });
  };

  const openEdit = (c: any) => { setForm(c); setEditing(c); };
  const openCreate = () => { setForm({ codigo_erp: "", nombre_comercial: "", telefono: "", direccion: "", activo: true }); setCreating(true); };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end">
        <div><h1>Clientes</h1><p className="text-sm text-muted-foreground">{rows.length} clientes</p></div>
        {canCreate && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Nuevo</Button>}
      </div>

      <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="data-table">
        <thead><tr><th>Código ERP</th><th>Nombre comercial</th><th>Teléfono</th><th>Dirección</th><th>Activo</th>{canEdit && <th></th>}</tr></thead>
        <tbody>
          {rows.map(c => <tr key={c.id}>
            <td className="font-semibold">{c.codigo_erp}</td>
            <td>{c.nombre_comercial || <em className="text-muted-foreground">Pendiente</em>}</td>
            <td>{c.telefono || "—"}</td>
            <td className="max-w-xs truncate">{c.direccion || "—"}</td>
            <td>{c.activo ? "Sí" : "No"}</td>
            {canEdit && <td><Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button></td>}
          </tr>)}
        </tbody>
      </table></div></Card>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Código ERP</Label><Input value={form.codigo_erp} onChange={e => setForm({ ...form, codigo_erp: e.target.value })} /></div>
            <div><Label>Nombre comercial</Label><Input value={form.nombre_comercial || ""} onChange={e => setForm({ ...form, nombre_comercial: e.target.value })} /></div>
            <div><Label>Teléfono</Label><Input value={form.telefono || ""} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
            <div><Label>Dirección</Label><Input value={form.direccion || ""} onChange={e => setForm({ ...form, direccion: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
