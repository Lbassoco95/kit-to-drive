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
import { explicarError, fmtDate } from "@/lib/dazon";
import { Plus, Pencil, Search, MapPin, Calendar, User, Trash2, CheckCircle, Clock } from "lucide-react";
import { cargarClientes, porNombreComercial } from "@/lib/catalogoClientes";

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
    fecha_ruta: "",
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
    // La columna es `fecha_ruta`. Con `fecha` —que no existe— PostgREST
    // contestaba 400, `rs` llegaba null y la lista de rutas salía SIEMPRE
    // vacía, sin decir por qué: el error se tiraba a la basura.
    const [{ data: rs, error: eRutas }, { data: cs }, { data: vs }, { data: ps }] = await Promise.all([
      supabase.from("crm_rutas").select("*").order("fecha_ruta", { ascending: false }),
      // El catálogo pasa de mil clientes y PostgREST corta ahí: se lee
      // por tramos con cargarClientes(). Ver src/lib/paginar.ts.
      cargarClientes(),
      supabase.from("profiles").select("id, nombre_completo").eq("activo", true),
      supabase.from("crm_ruta_paradas").select("*")
    ]);
    // «Vacío» y «no se pudo leer» son dos cosas distintas y tienen que verse
    // distintas: si falla, se dice, en vez de fingir que no hay rutas.
    if (eRutas) toast.error(explicarError(eRutas, t.crm.rutas.errorCargar));
    setRutas(rs ?? []);
    setClientes([...(cs ?? [])].sort(porNombreComercial));
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
        r.fecha_ruta,
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
      fecha_ruta: form.fecha_ruta,
      vendedor_id: form.vendedor_id || user?.id
    };

    if (editing) {
      const { error } = await supabase.from("crm_rutas").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success(t.crm.rutas.actualizada); setEditing(null);
    } else {
      const { data: rutaData, error: rutaError } = await supabase.from("crm_rutas").insert(payload).select().single();
      if (rutaError) return toast.error(rutaError.message);
      
      // Insertar paradas
      if (paradasLocales.length > 0) {
        // `crm_ruta_paradas` no tiene descripcion/hora_estimada/notas: los
        // campos del formulario se guardan en las columnas que sí existen
        // (nombre_cliente, hora_llegada, objetivo). Antes el INSERT fallaba
        // completo y la ruta se creaba sin ninguna parada.
        const paradasPayload = paradasLocales.map(p => ({
          ruta_id: rutaData.id,
          orden: p.orden,
          cliente_id: p.cliente_id || null,
          nombre_cliente: p.descripcion || null,
          hora_llegada: p.hora_estimada || null,
          objetivo: p.notas || null,
        }));
        const { error: paradasError } = await supabase.from("crm_ruta_paradas").insert(paradasPayload);
        if (paradasError) return toast.error(paradasError.message);
      }
      
      toast.success(t.crm.rutas.creada); setCreating(false);
    }
    setForm({
      vendedor_id: "",
      fecha_ruta: "",
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
    if (!confirm(t.crm.rutas.confirmarEliminar)) return;
    const { error } = await supabase.from("crm_rutas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t.crm.rutas.eliminada);
    load();
  };

  const agregarParada = () => {
    if (!nuevaParada.cliente_id && !nuevaParada.descripcion) {
      return toast.error(t.crm.rutas.paradaRequerida);
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
          <h1>{t.crm.rutas.title}</h1>
          <p className="text-base text-muted-foreground mt-1">{t.crm.rutas.subtitle(filtered.length)}</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setForm({ vendedor_id: "", fecha_ruta: "", notas: "" }); setParadasLocales([]); setCreating(true); }}
            className="h-12 px-5 text-base bg-primary hover:bg-primary-hover">
            <Plus className="h-5 w-5 mr-2"/> {t.crm.rutas.nueva}
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder={t.crm.rutas.buscar} value={q} onChange={e => setQ(e.target.value)} />
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
                    <Calendar className="text-primary" size={20}/>
                    <div className="text-2xl font-bold text-primary">{fmtDate(r.fecha_ruta)}</div>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground mt-1">
                    <User size={16}/> <span>{vendedor?.nombre_completo || t.crm.sinVendedor}</span>
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
                  <div className="text-sm font-medium text-muted-foreground mb-2">{t.crm.rutas.paradasCount(rutaParadas.length)}</div>
                  {rutaParadas.map((p: any) => {
                    const cliente = clientes.find((c: any) => c.id === p.cliente_id);
                    return (
                      <div key={p.id} className={`flex items-start gap-3 p-3 rounded-lg border ${p.completada ? "bg-green-50 border-green-200" : "bg-gray-50"}`}>
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white font-bold text-sm shrink-0">
                          {p.orden}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{cliente?.nombre_comercial || p.nombre_cliente}</div>
                          {p.hora_llegada && (
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock size={14}/> {p.hora_llegada}
                            </div>
                          )}
                          {p.objetivo && (
                            <div className="text-sm text-muted-foreground mt-1">{p.objetivo}</div>
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
                <div className="text-sm text-muted-foreground">{t.crm.rutas.sinParadas}</div>
              )}

              {r.notas && (
                <div className="text-sm text-muted-foreground mt-3 pt-3 border-t">
                  {r.notas}
                </div>
              )}
            </Card>
          );
        })}
        {!filtered.length && <div className="text-center py-12 text-muted-foreground bg-card rounded-lg border">{t.crm.rutas.sinRutas}</div>}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t.crm.rutas.editar : t.crm.rutas.nueva}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t.crm.vendedor}</Label>
              <Select value={form.vendedor_id} onValueChange={(v) => setForm({ ...form, vendedor_id: v })}>
                <SelectTrigger><SelectValue placeholder={t.crm.seleccionarVendedor} /></SelectTrigger>
                <SelectContent>
                  {vendedores.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.nombre_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.crm.fecha}</Label>
              <Input type="date" value={form.fecha_ruta} onChange={e => setForm({ ...form, fecha_ruta: e.target.value })} />
            </div>
            <div>
              <Label>{t.crm.notas}</Label>
              <Input value={form.notas || ""} onChange={e => setForm({ ...form, notas: e.target.value })} />
            </div>

            {!editing && (
              <div className="border-t pt-4">
                <div className="font-medium mb-3">{t.crm.rutas.paradas}</div>
                
                <div className="space-y-2 mb-3">
                  {paradasLocales.map((p, idx) => {
                    const cliente = clientes.find((c: any) => c.id === p.cliente_id);
                    return (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
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
                    <Label className="text-sm">{t.crm.cliente}</Label>
                    <Select value={nuevaParada.cliente_id} onValueChange={(v) => setNuevaParada({ ...nuevaParada, cliente_id: v })}>
                      <SelectTrigger><SelectValue placeholder={t.crm.cliente} /></SelectTrigger>
                      <SelectContent>
                        {clientes.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.nombre_comercial || c.codigo_erp}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">{t.crm.rutas.horaEstimada}</Label>
                    <Input type="time" value={nuevaParada.hora_estimada} onChange={e => setNuevaParada({ ...nuevaParada, hora_estimada: e.target.value })} />
                  </div>
                </div>
                <div className="mb-2">
                  <Label className="text-sm">{t.crm.rutas.descripcionParada}</Label>
                  <Input value={nuevaParada.descripcion} onChange={e => setNuevaParada({ ...nuevaParada, descripcion: e.target.value })} />
                </div>
                <div className="mb-2">
                  <Label className="text-sm">{t.crm.rutas.notasParada}</Label>
                  <Input value={nuevaParada.notas} onChange={e => setNuevaParada({ ...nuevaParada, notas: e.target.value })} />
                </div>
                <Button onClick={agregarParada} variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> {t.crm.rutas.agregarParada}
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
