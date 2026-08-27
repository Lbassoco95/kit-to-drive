import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Plus, Pencil, Search, TrendingUp, DollarSign, Calendar, User, Building2, AlertTriangle } from "lucide-react";

export default function CrmOportunidades() {
  const { role, user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [selectedEtapa, setSelectedEtapa] = useState<string>("all");

  const etapas = ["prospecto", "contacto", "cotizacion", "negociacion", "ganado", "perdido"];
  const [form, setForm] = useState<any>({
    cliente_id: "",
    vendedor_id: "",
    tipo_venta: "motocarro",
    cantidad_estimada: "",
    monto_estimado: "",
    etapa: "prospecto",
    fecha_cierre_estimada: "",
    notas: ""
  });

  const load = async () => {
    const [{ data: ops }, { data: cs }, { data: vs }] = await Promise.all([
      supabase.from("crm_oportunidades").select("*").order("created_at", { ascending: false }),
      supabase.from("clientes").select("*").order("nombre_comercial"),
      supabase.from("profiles").select("id, nombre_completo").eq("activo", true)
    ]);
    setOportunidades(ops ?? []);
    setClientes(cs ?? []);
    setVendedores(vs ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let filtered = oportunidades;
    
    // Filter by stage
    if (selectedEtapa !== "all") {
      filtered = filtered.filter((o: any) => o.etapa === selectedEtapa);
    }
    
    // Filter by search
    if (q) {
      const qLower = q.toLowerCase();
      filtered = filtered.filter((o: any) => {
        const cliente = clientes.find((c: any) => c.id === o.cliente_id);
        const vendedor = vendedores.find((v: any) => v.id === o.vendedor_id);
        const searchable = [
          o.tipo_venta,
          o.etapa,
          cliente?.nombre_comercial,
          cliente?.codigo_erp,
          vendedor?.nombre_completo,
          o.notas
        ].filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(qLower);
      });
    }
    
    return filtered;
  }, [oportunidades, clientes, vendedores, q, selectedEtapa]);

  const canEdit = role === "admin" || role === "coordinador_ventas" || role === "director_ventas" || role === "auxiliar_ventas";
  const canCreate = role === "admin" || role === "ventas" || role === "coordinador_ventas" || role === "director_ventas" || role === "auxiliar_ventas";
  const canDelete = role === "admin" || role === "coordinador_ventas";

  const save = async () => {
    const payload = {
      ...form,
      cantidad_estimada: form.cantidad_estimada ? parseInt(form.cantidad_estimada) : null,
      monto_estimado: form.monto_estimado ? parseFloat(form.monto_estimado) : null,
      fecha_cierre_estimada: form.fecha_cierre_estimada || null,
      vendedor_id: form.vendedor_id || user?.id
    };

    if (editing) {
      const { error } = await supabase.from("crm_oportunidades").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Oportunidad actualizada"); setEditing(null);
    } else {
      const { data, error } = await supabase.from("crm_oportunidades").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      toast.success("Oportunidad creada"); setCreating(false);
      if (data?.id) {
        navigate(`/crm/oportunidades/${data.id}`);
        return;
      }
    }
    setForm({
      cliente_id: "",
      vendedor_id: "",
      tipo_venta: "motocarro",
      cantidad_estimada: "",
      monto_estimado: "",
      etapa: "prospecto",
      fecha_cierre_estimada: "",
      notas: ""
    });
    load();
  };

  const deleteOportunidad = async (id: string) => {
    if (!confirm("¿Eliminar esta oportunidad?")) return;
    const { error } = await supabase.from("crm_oportunidades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Oportunidad eliminada");
    load();
  };

  const etapaColors: Record<string, string> = {
    prospecto: "bg-gray-100 text-gray-700",
    contacto: "bg-blue-100 text-blue-700",
    cotizacion: "bg-yellow-100 text-yellow-700",
    negociacion: "bg-orange-100 text-orange-700",
    ganado: "bg-green-100 text-green-700",
    perdido: "bg-red-100 text-red-700"
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1>Oportunidades</h1>
          <p className="text-base text-muted-foreground mt-1">{filtered.length} oportunidades registradas</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setForm({ cliente_id: "", vendedor_id: "", tipo_venta: "motocarro", cantidad_estimada: "", monto_estimado: "", etapa: "prospecto", fecha_cierre_estimada: "", notas: "" }); setCreating(true); }}
            className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2"/> Nueva oportunidad
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder="Buscar por cliente, vendedor, etapa..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      {/* Pipeline Stage Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedEtapa("all")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedEtapa === "all"
              ? "bg-[#1F3864] text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Todas ({oportunidades.length})
        </button>
        {etapas.map((etapa) => {
          const count = oportunidades.filter((o: any) => o.etapa === etapa).length;
          return (
            <button
              key={etapa}
              onClick={() => setSelectedEtapa(etapa)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedEtapa === etapa
                  ? etapaColors[etapa]
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {etapa.charAt(0).toUpperCase() + etapa.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((o: any) => {
          const cliente = clientes.find((c: any) => c.id === o.cliente_id);
          const vendedor = vendedores.find((v: any) => v.id === o.vendedor_id);
          const isVencida = o.fecha_cierre_estimada && new Date(o.fecha_cierre_estimada) < new Date();
          return (
            <Card key={o.id} className="p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase text-muted-foreground tracking-wide font-medium">
                    {cliente?.nombre_comercial || "Sin cliente"} {cliente?.codigo_erp && `(${cliente.codigo_erp})`}
                  </div>
                  <div className="text-lg font-bold text-[#1F3864] truncate capitalize">{o.tipo_venta}</div>
                  <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${etapaColors[o.etapa]}`}>
                    {o.etapa}
                  </div>
                </div>
                <div className="flex gap-1">
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => { setForm(o); setEditing(o); }} className="h-8 w-8">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="icon" variant="ghost" onClick={() => deleteOportunidad(o.id)} className="h-8 w-8 text-red-600 hover:text-red-700">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User size={16}/> <span>{vendedor?.nombre_completo || "Sin vendedor"}</span>
                </div>
                {o.cantidad_estimada && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp size={16}/> <span>{o.cantidad_estimada} unidades</span>
                  </div>
                )}
                {o.monto_estimado && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign size={16}/> <span>${o.monto_estimado.toLocaleString()}</span>
                  </div>
                )}
                {o.fecha_cierre_estimada && (
                  <div className={`flex items-center gap-2 ${isVencida ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                    <Calendar size={16}/> <span>{new Date(o.fecha_cierre_estimada).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {/* Limitantes Chips */}
              {(o.limitante_descuento || o.limitante_flete || o.limitante_precio) && (
                <div className="flex flex-wrap gap-1.5">
                  {o.limitante_descuento && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                      <AlertTriangle className="h-3 w-3" /> Descuento
                    </span>
                  )}
                  {o.limitante_flete && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                      <AlertTriangle className="h-3 w-3" /> Flete
                    </span>
                  )}
                  {o.limitante_precio && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                      <AlertTriangle className="h-3 w-3" /> Precio
                    </span>
                  )}
                </div>
              )}

              {o.notas && (
                <div className="text-sm text-muted-foreground line-clamp-2 mt-2 pt-2 border-t">
                  {o.notas}
                </div>
              )}
            </Card>
          );
        })}
        {!filtered.length && <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin oportunidades</div>}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar oportunidad" : "Nueva oportunidad"}</DialogTitle></DialogHeader>
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
              <Label>Tipo</Label>
              <Select value={form.tipo_venta} onValueChange={(v) => setForm({ ...form, tipo_venta: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="motocarro">Motocarro</SelectItem>
                  <SelectItem value="refaccion">Refacción</SelectItem>
                  <SelectItem value="servicio">Servicio</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Etapa</Label>
              <Select value={form.etapa} onValueChange={(v) => setForm({ ...form, etapa: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospecto">Prospecto</SelectItem>
                  <SelectItem value="contacto">Contacto</SelectItem>
                  <SelectItem value="cotizacion">Cotización</SelectItem>
                  <SelectItem value="negociacion">Negociación</SelectItem>
                  <SelectItem value="ganado">Ganado</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cantidad estimada</Label>
              <Input type="number" value={form.cantidad_estimada} onChange={e => setForm({ ...form, cantidad_estimada: e.target.value })} />
            </div>
            <div>
              <Label>Monto estimado</Label>
              <Input type="number" step="0.01" value={form.monto_estimado} onChange={e => setForm({ ...form, monto_estimado: e.target.value })} />
            </div>
            <div>
              <Label>Fecha estimada de cierre</Label>
              <Input type="date" value={form.fecha_cierre_estimada} onChange={e => setForm({ ...form, fecha_cierre_estimada: e.target.value })} />
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={form.notas || ""} onChange={e => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="h-12 px-5 text-base">{t.actions.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
