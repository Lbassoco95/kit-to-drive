import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { Plus, Pencil, Search, BookOpen, Calendar, User, Building2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function CrmActividades() {
  const { role, user } = useAuth();
  const { t } = useLang();
  const [actividades, setActividades] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<any>({
    vendedor_id: "",
    oportunidad_id: "",
    cliente_id: "",
    tipo: "visita",
    fecha_actividad: "",
    resultado: "",
    proxima_accion: "",
    fecha_proxima: "",
    limitante_descuento: false,
    limitante_flete: false,
    limitante_precio: false,
    limitante_notas: "",
    descripcion: ""
  });

  const load = async () => {
    const [{ data: acts }, { data: cs }, { data: vs }, { data: ops }] = await Promise.all([
      supabase.from("crm_actividades").select("*").order("fecha_actividad", { ascending: false }),
      supabase.from("clientes").select("*").order("nombre_comercial"),
      supabase.from("profiles").select("id, nombre_completo").eq("activo", true),
      supabase.from("crm_oportunidades").select("*")
    ]);
    setActividades(acts ?? []);
    setClientes(cs ?? []);
    setVendedores(vs ?? []);
    setOportunidades(ops ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!q) return actividades;
    const qLower = q.toLowerCase();
    return actividades.filter((a: any) => {
      const cliente = clientes.find((c: any) => c.id === a.cliente_id);
      const vendedor = vendedores.find((v: any) => v.id === a.vendedor_id);
      const oportunidad = oportunidades.find((o: any) => o.id === a.oportunidad_id);
      const searchable = [
        a.tipo,
        a.resultado,
        cliente?.nombre_comercial,
        cliente?.codigo_erp,
        vendedor?.nombre_completo,
        a.descripcion
      ].filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(qLower);
    });
  }, [actividades, clientes, vendedores, oportunidades, q]);

  const canEdit = role === "admin" || role === "coordinador_ventas" || role === "director_ventas" || role === "auxiliar_ventas";
  const canCreate = role === "admin" || role === "ventas" || role === "coordinador_ventas" || role === "director_ventas" || role === "auxiliar_ventas";
  const canDelete = role === "admin" || role === "coordinador_ventas";

  const save = async () => {
    const payload = {
      ...form,
      fecha_actividad: form.fecha_actividad || new Date().toISOString(),
      fecha_proxima: form.fecha_proxima || null,
      vendedor_id: form.vendedor_id || user?.id
    };

    if (editing) {
      const { error } = await supabase.from("crm_actividades").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Actividad actualizada"); setEditing(null);
    } else {
      const { error } = await supabase.from("crm_actividades").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Actividad creada"); setCreating(false);
    }
    
    // Update opportunity limitantes if activity has them
    if (form.oportunidad_id && (form.limitante_descuento || form.limitante_flete || form.limitante_precio)) {
      const updatePayload: any = {};
      if (form.limitante_descuento) updatePayload.limitante_descuento = true;
      if (form.limitante_flete) updatePayload.limitante_flete = true;
      if (form.limitante_precio) updatePayload.limitante_precio = true;
      if (form.limitante_notas) updatePayload.limitante_notas = form.limitante_notas;
      
      await supabase.from("crm_oportunidades").update(updatePayload).eq("id", form.oportunidad_id);
    }
    
    setForm({
      vendedor_id: "",
      oportunidad_id: "",
      cliente_id: "",
      tipo: "visita",
      fecha_actividad: "",
      resultado: "",
      proxima_accion: "",
      fecha_proxima: "",
      limitante_descuento: false,
      limitante_flete: false,
      limitante_precio: false,
      limitante_notas: "",
      descripcion: ""
    });
    load();
  };

  const deleteActividad = async (id: string) => {
    if (!confirm("¿Eliminar esta actividad?")) return;
    const { error } = await supabase.from("crm_actividades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Actividad eliminada");
    load();
  };

  const tipoColors: Record<string, string> = {
    visita: "bg-blue-100 text-blue-700",
    llamada: "bg-green-100 text-green-700",
    demo: "bg-purple-100 text-purple-700",
    seguimiento: "bg-yellow-100 text-yellow-700",
    cotizacion: "bg-orange-100 text-orange-700"
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1>Actividades</h1>
          <p className="text-base text-muted-foreground mt-1">{filtered.length} actividades registradas</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setForm({ vendedor_id: "", oportunidad_id: "", cliente_id: "", tipo: "visita", fecha_actividad: "", resultado: "", proxima_accion: "", fecha_proxima: "", limitante_descuento: false, limitante_flete: false, limitante_precio: false, limitante_notas: "", descripcion: "" }); setCreating(true); }}
            className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2"/> Nueva actividad
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder="Buscar por cliente, vendedor, tipo..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((a: any) => {
          const cliente = clientes.find((c: any) => c.id === a.cliente_id);
          const vendedor = vendedores.find((v: any) => v.id === a.vendedor_id);
          const oportunidad = oportunidades.find((o: any) => o.id === a.oportunidad_id);
          return (
            <Card key={a.id} className="p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase text-muted-foreground tracking-wide font-medium">{cliente?.nombre_comercial || "Sin cliente"}</div>
                  <div className="text-lg font-bold text-[#1F3864] truncate capitalize">{a.tipo}</div>
                  <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${tipoColors[a.tipo]}`}>
                    {a.tipo}
                  </div>
                </div>
                <div className="flex gap-1">
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => { setForm(a); setEditing(a); }} className="h-8 w-8">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="icon" variant="ghost" onClick={() => deleteActividad(a.id)} className="h-8 w-8 text-red-600 hover:text-red-700">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User size={16}/> <span>{vendedor?.nombre_completo || "Sin vendedor"}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar size={16}/> <span>{new Date(a.fecha_actividad).toLocaleString()}</span>
                </div>
                {a.resultado && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle size={16}/> <span>{a.resultado}</span>
                  </div>
                )}
                {oportunidad && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <BookOpen size={16}/> <span className="text-xs">Oportunidad: {oportunidad.tipo}</span>
                  </div>
                )}
              </div>

              {a.descripcion && (
                <div className="text-sm text-muted-foreground line-clamp-2 mt-2 pt-2 border-t">
                  {a.descripcion}
                </div>
              )}
            </Card>
          );
        })}
        {!filtered.length && <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin actividades</div>}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar actividad" : "Nueva actividad"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cliente</Label>
              <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre_comercial || c.codigo_erp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendedor</Label>
              <Select value={form.vendedor_id} onValueChange={(v) => setForm({ ...form, vendedor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar vendedor" /></SelectTrigger>
                <SelectContent>
                  {vendedores.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.nombre_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Oportunidad (opcional)</Label>
              <Select value={form.oportunidad_id} onValueChange={(v) => setForm({ ...form, oportunidad_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar oportunidad" /></SelectTrigger>
                <SelectContent>
                  {oportunidades.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>{o.tipo} - {o.etapa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="llamada">Llamada</SelectItem>
                  <SelectItem value="visita">Visita</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="demo">Demo</SelectItem>
                  <SelectItem value="nota">Nota</SelectItem>
                  <SelectItem value="seguimiento">Seguimiento</SelectItem>
                  <SelectItem value="cotizacion">Cotización</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="datetime-local" value={form.fecha_actividad} onChange={e => setForm({ ...form, fecha_actividad: e.target.value })} />
            </div>
            <div>
              <Label>Resultado</Label>
              <Input value={form.resultado || ""} onChange={e => setForm({ ...form, resultado: e.target.value })} placeholder="¿Qué pasó?" />
            </div>
            <div>
              <Label>Próxima acción</Label>
              <Input value={form.proxima_accion || ""} onChange={e => setForm({ ...form, proxima_accion: e.target.value })} placeholder="¿Qué sigue?" />
            </div>
            <div>
              <Label>Fecha próxima acción</Label>
              <Input type="date" value={form.fecha_proxima || ""} onChange={e => setForm({ ...form, fecha_proxima: e.target.value })} />
            </div>
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm font-medium">Limitantes (qué bloqueó esta venta)</Label>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.limitante_descuento} onChange={e => setForm({ ...form, limitante_descuento: e.target.checked })} className="rounded" />
                  <span className="text-sm">Descuento</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.limitante_flete} onChange={e => setForm({ ...form, limitante_flete: e.target.checked })} className="rounded" />
                  <span className="text-sm">Flete</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.limitante_precio} onChange={e => setForm({ ...form, limitante_precio: e.target.checked })} className="rounded" />
                  <span className="text-sm">Precio</span>
                </label>
              </div>
              {(form.limitante_descuento || form.limitante_flete || form.limitante_precio) && (
                <div>
                  <Label className="text-sm">Notas de limitante</Label>
                  <Input value={form.limitante_notas || ""} onChange={e => setForm({ ...form, limitante_notas: e.target.value })} placeholder="Detalle de la limitante..." />
                </div>
              )}
            </div>
            <div>
              <Label>Notas generales</Label>
              <Input value={form.descripcion || ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="h-12 px-5 text-base">{t.actions.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
