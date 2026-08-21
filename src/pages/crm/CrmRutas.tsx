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
import { Plus, Pencil, Search, MapPin, Calendar, User, Trash2, CheckCircle, Clock } from "lucide-react";

interface Parada {
  orden: number;
  cliente_id: string;
  descripcion: string;
  hora_estimada: string;
  notas: string;
}

export default function CrmRutas() {
  const { perms, user } = useAuth();
  const { t } = useLang();
  const [rutas, setRutas] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [paradas, setParadas] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<any>({
    vendedor_id: "",
    fecha: "",
    notas: ""
  });
  const [nuevaParada, setNuevaParada] = useState<Parada>({
    orden: 1,
    cliente_id: "",
    descripcion: "",
    hora_estimada: "",
    notas: ""
  });
  const [paradasLocales, setParadasLocales] = useState<Parada[]>([]);

  const load = async () => {
    const [{ data: rs }, { data: cs }, { data: vs }, { data: ps }] = await Promise.all([
      supabase.from("crm_rutas").select("*").order("fecha", { ascending: false }),
      supabase.from("clientes").select("*").order("nombre_comercial"),
      supabase.from("profiles").select("id, nombre_completo").eq("activo", true),
      supabase.from("crm_ruta_paradas").select("*")
    ]);
    setRutas(rs ?? []);
    setClientes(cs ?? []);
    setVendedores(vs ?? []);
    setParadas(ps ?? []);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!q) return rutas;
    const qLower = q.toLowerCase();
    return rutas.filter((r: any) => {
      const vendedor = vendedores.find((v: any) => v.id === r.vendedor_id);
      const searchable = [
        r.fecha,
        vendedor?.nombre_completo,
        r.notas
      ].filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(qLower);
    });
  }, [rutas, vendedores, q]);

  const getParadasForRuta = (rutaId: string) => {
    return paradas.filter((p: any) => p.ruta_id === rutaId).sort((a: any, b: any) => a.orden - b.orden);
  };

  const canEdit = perms.puedeEditar("crm");
  const canCreate = perms.puedeCrear("crm");
  const canDelete = perms.puedeEliminar("crm");

  const save = async () => {
    const payload = {
      ...form,
      fecha: form.fecha,
      vendedor_id: form.vendedor_id || user?.id
    };

    if (editing) {
      const { error } = await supabase.from("crm_rutas").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Ruta actualizada"); setEditing(null);
    } else {
      const { data: rutaData, error: rutaError } = await supabase.from("crm_rutas").insert(payload).select().single();
      if (rutaError) return toast.error(rutaError.message);
      
      // Insertar paradas
      if (paradasLocales.length > 0) {
        const paradasPayload = paradasLocales.map(p => ({
          ruta_id: rutaData.id,
          orden: p.orden,
          cliente_id: p.cliente_id || null,
          descripcion: p.descripcion,
          hora_estimada: p.hora_estimada || null,
          notas: p.notas
        }));
        const { error: paradasError } = await supabase.from("crm_ruta_paradas").insert(paradasPayload);
        if (paradasError) return toast.error(paradasError.message);
      }
      
      toast.success("Ruta creada"); setCreating(false);
    }
    setForm({
      vendedor_id: "",
      fecha: "",
      notas: ""
    });
    setParadasLocales([]);
    setNuevaParada({
      orden: 1,
      cliente_id: "",
      descripcion: "",
      hora_estimada: "",
      notas: ""
    });
    load();
  };

  const deleteRuta = async (id: string) => {
    if (!confirm("¿Eliminar esta ruta y todas sus paradas?")) return;
    const { error } = await supabase.from("crm_rutas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Ruta eliminada");
    load();
  };

  const agregarParada = () => {
    if (!nuevaParada.cliente_id && !nuevaParada.descripcion) {
      return toast.error("Debes seleccionar un cliente o agregar una descripción");
    }
    setParadasLocales([...paradasLocales, { ...nuevaParada, orden: paradasLocales.length + 1 }]);
    setNuevaParada({
      orden: paradasLocales.length + 2,
      cliente_id: "",
      descripcion: "",
      hora_estimada: "",
      notas: ""
    });
  };

  const eliminarParadaLocal = (index: number) => {
    const nuevas = paradasLocales.filter((_, i) => i !== index).map((p, i) => ({ ...p, orden: i + 1 }));
    setParadasLocales(nuevas);
    setNuevaParada({ ...nuevaParada, orden: nuevas.length + 1 });
  };

  const toggleParadaCompletada = async (paradaId: string, completada: boolean) => {
    const { error } = await supabase.from("crm_ruta_paradas").update({ completada }).eq("id", paradaId);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1>Rutas</h1>
          <p className="text-base text-muted-foreground mt-1">{filtered.length} rutas registradas</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setForm({ vendedor_id: "", fecha: "", notas: "" }); setParadasLocales([]); setCreating(true); }}
            className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2"/> Nueva ruta
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder="Buscar por fecha, vendedor..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {filtered.map((r: any) => {
          const vendedor = vendedores.find((v: any) => v.id === r.vendedor_id);
          const rutaParadas = getParadasForRuta(r.id);
          return (
            <Card key={r.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <Calendar className="text-[#1F3864]" size={20}/>
                    <div className="text-2xl font-bold text-[#1F3864]">{new Date(r.fecha).toLocaleDateString()}</div>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground mt-1">
                    <User size={16}/> <span>{vendedor?.nombre_completo || "Sin vendedor"}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => { setForm(r); setEditing(r); }} className="h-8 w-8">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="icon" variant="ghost" onClick={() => deleteRuta(r.id)} className="h-8 w-8 text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {rutaParadas.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Paradas ({rutaParadas.length})</div>
                  {rutaParadas.map((p: any) => {
                    const cliente = clientes.find((c: any) => c.id === p.cliente_id);
                    return (
                      <div key={p.id} className={`flex items-start gap-3 p-3 rounded-lg border ${p.completada ? "bg-green-50 border-green-200" : "bg-gray-50"}`}>
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#1F3864] text-white font-bold text-sm shrink-0">
                          {p.orden}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{cliente?.nombre_comercial || p.descripcion}</div>
                          {p.hora_estimada && (
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock size={14}/> {p.hora_estimada}
                            </div>
                          )}
                          {p.notas && (
                            <div className="text-sm text-muted-foreground mt-1">{p.notas}</div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleParadaCompletada(p.id, !p.completada)}
                          className={`h-8 w-8 ${p.completada ? "text-green-600" : "text-gray-400"}`}
                        >
                          <CheckCircle className="h-5 w-5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Sin paradas</div>
              )}

              {r.notas && (
                <div className="text-sm text-muted-foreground mt-3 pt-3 border-t">
                  {r.notas}
                </div>
              )}
            </Card>
          );
        })}
        {!filtered.length && <div className="text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin rutas</div>}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar ruta" : "Nueva ruta"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
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
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={form.notas || ""} onChange={e => setForm({ ...form, notas: e.target.value })} />
            </div>

            {!editing && (
              <div className="border-t pt-4">
                <div className="font-medium mb-3">Paradas</div>
                
                <div className="space-y-2 mb-3">
                  {paradasLocales.map((p, idx) => {
                    const cliente = clientes.find((c: any) => c.id === p.cliente_id);
                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-[#1F3864] text-white flex items-center justify-center text-xs font-bold">
                          {p.orden}
                        </div>
                        <div className="flex-1 text-sm">{cliente?.nombre_comercial || p.descripcion}</div>
                        <Button size="icon" variant="ghost" onClick={() => eliminarParadaLocal(idx)} className="h-6 w-6 text-red-600">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <Label className="text-sm">Cliente</Label>
                    <Select value={nuevaParada.cliente_id} onValueChange={(v) => setNuevaParada({ ...nuevaParada, cliente_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
                      <SelectContent>
                        {clientes.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.nombre_comercial || c.codigo_erp}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Hora estimada</Label>
                    <Input type="time" value={nuevaParada.hora_estimada} onChange={e => setNuevaParada({ ...nuevaParada, hora_estimada: e.target.value })} />
                  </div>
                </div>
                <div className="mb-2">
                  <Label className="text-sm">Descripción (si no hay cliente)</Label>
                  <Input value={nuevaParada.descripcion} onChange={e => setNuevaParada({ ...nuevaParada, descripcion: e.target.value })} />
                </div>
                <div className="mb-2">
                  <Label className="text-sm">Notas de parada</Label>
                  <Input value={nuevaParada.notas} onChange={e => setNuevaParada({ ...nuevaParada, notas: e.target.value })} />
                </div>
                <Button onClick={agregarParada} variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Agregar parada
                </Button>
              </div>
            )}
          </div>
          <DialogFooter><Button onClick={save} className="h-12 px-5 text-base">{t.actions.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
