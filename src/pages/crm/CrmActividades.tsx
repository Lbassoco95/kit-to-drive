import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { Plus, Pencil, Search, BookOpen, Calendar, User, Building2, CheckCircle, XCircle, AlertTriangle, Camera, ChevronRight, ChevronLeft, Expand } from "lucide-react";
import { FileOrCamera } from "@/components/FileOrCamera";

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
    canal_contacto: "",
    fecha_actividad: "",
    resultado: "",
    proxima_accion: "",
    fecha_proxima: "",
    limitante_descuento: false,
    limitante_flete: false,
    limitante_precio: false,
    limitante_notas: "",
    descripcion: "",
    // Step 2 fields
    region: "",
    municipio: "",
    codigo_cliente: "",
    tipo_cliente_nuevo: false,
    persona_contacto: "",
    telefono_contacto: "",
    tipo_negocio: "",
    escala_operacion: "",
    marcas_comercializa: "",
    top3_marcas: "",
    volumen_mensual_ventas: "",
    fecha_ultima_visita: "",
    asuntos_tratados: "",
    acuerdos_alcanzados: "",
    retroalimentacion_mercado: "",
    evidencia_url: ""
  });
  const [step, setStep] = useState(1);
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

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
    let evidenciaUrl = form.evidencia_url;
    
    // Upload evidence file if present
    if (evidenciaFile) {
      const fileExt = evidenciaFile.name.split('.').pop();
      const fileName = `${form.vendedor_id || user?.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('actividades-evidencia').upload(fileName, evidenciaFile);
      if (uploadError) {
        toast.error('Error al subir evidencia: ' + uploadError.message);
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('actividades-evidencia').getPublicUrl(fileName);
      evidenciaUrl = publicUrl;
    }

    const payload = {
      ...form,
      evidencia_url: evidenciaUrl,
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
    
    resetForm();
    load();
  };

  const resetForm = () => {
    setForm({
      vendedor_id: "",
      oportunidad_id: "",
      cliente_id: "",
      tipo: "visita",
      canal_contacto: "",
      fecha_actividad: "",
      resultado: "",
      proxima_accion: "",
      fecha_proxima: "",
      limitante_descuento: false,
      limitante_flete: false,
      limitante_precio: false,
      limitante_notas: "",
      descripcion: "",
      region: "",
      municipio: "",
      codigo_cliente: "",
      tipo_cliente_nuevo: false,
      persona_contacto: "",
      telefono_contacto: "",
      tipo_negocio: "",
      escala_operacion: "",
      marcas_comercializa: "",
      top3_marcas: "",
      volumen_mensual_ventas: "",
      fecha_ultima_visita: "",
      asuntos_tratados: "",
      acuerdos_alcanzados: "",
      retroalimentacion_mercado: "",
      evidencia_url: ""
    });
    setStep(1);
    setEvidenciaFile(null);
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
          <Button onClick={() => { resetForm(); setCreating(true); }}
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-xs uppercase text-muted-foreground tracking-wide font-medium">{cliente?.nombre_comercial || "Sin cliente"}</div>
                    {a.tipo === 'visita' && (
                      <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${tipoColors[a.tipo]}`}>
                        Visita
                      </div>
                    )}
                  </div>
                  <div className="text-lg font-bold text-[#1F3864] truncate capitalize">{a.tipo}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {a.evidencia_url && (
                      <img 
                        src={a.evidencia_url} 
                        alt="Evidencia" 
                        className="w-10 h-10 rounded object-cover cursor-pointer hover:opacity-80 border"
                        onClick={() => setImagePreview(a.evidencia_url)}
                      />
                    )}
                    {a.tipo_negocio && (
                      <span className="inline-block px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                        {a.tipo_negocio}
                      </span>
                    )}
                    {a.escala_operacion && (
                      <span className="inline-block px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-xs font-medium">
                        {a.escala_operacion}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  {a.tipo === 'visita' && (
                    <Button size="icon" variant="ghost" onClick={() => setExpandedActivity(expandedActivity === a.id ? null : a.id)} className="h-8 w-8">
                      <Expand className="h-4 w-4" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => { setForm(a); setEditing(a); setStep(a.tipo === 'visita' ? 1 : 1); }} className="h-8 w-8">
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

              {expandedActivity === a.id && a.tipo === 'visita' && (
                <div className="mt-3 pt-3 border-t space-y-3 text-sm">
                  <div className="font-medium text-[#1F3864]">Perfil del cliente visitado</div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {a.region && <div><span className="text-muted-foreground">Región:</span> {a.region}</div>}
                    {a.municipio && <div><span className="text-muted-foreground">Municipio:</span> {a.municipio}</div>}
                    {a.codigo_cliente && <div><span className="text-muted-foreground">Código:</span> {a.codigo_cliente}</div>}
                    {a.tipo_cliente_nuevo !== undefined && <div><span className="text-muted-foreground">Cliente nuevo:</span> {a.tipo_cliente_nuevo ? 'Sí' : 'No'}</div>}
                    {a.persona_contacto && <div><span className="text-muted-foreground">Contacto:</span> {a.persona_contacto}</div>}
                    {a.telefono_contacto && <div><span className="text-muted-foreground">Teléfono:</span> {a.telefono_contacto}</div>}
                  </div>

                  <div className="font-medium text-[#1F3864] mt-2">Operación del negocio</div>
                  <div className="grid grid-cols-2 gap-2">
                    {a.tipo_negocio && <div><span className="text-muted-foreground">Tipo:</span> {a.tipo_negocio}</div>}
                    {a.escala_operacion && <div><span className="text-muted-foreground">Escala:</span> {a.escala_operacion}</div>}
                    {a.marcas_comercializa && <div className="col-span-2"><span className="text-muted-foreground">Marcas:</span> {a.marcas_comercializa}</div>}
                    {a.top3_marcas && <div><span className="text-muted-foreground">Top 3:</span> {a.top3_marcas}</div>}
                    {a.volumen_mensual_ventas && <div><span className="text-muted-foreground">Volumen mensual:</span> ${a.volumen_mensual_ventas}</div>}
                    {a.fecha_ultima_visita && <div><span className="text-muted-foreground">Última visita:</span> {new Date(a.fecha_ultima_visita).toLocaleDateString()}</div>}
                  </div>

                  <div className="font-medium text-[#1F3864] mt-2">Reporte de la visita</div>
                  <div className="space-y-2">
                    {a.asuntos_tratados && <div><span className="text-muted-foreground">Asuntos tratados:</span> {a.asuntos_tratados}</div>}
                    {a.acuerdos_alcanzados && <div><span className="text-muted-foreground">Acuerdos:</span> {a.acuerdos_alcanzados}</div>}
                    {a.retroalimentacion_mercado && <div><span className="text-muted-foreground">Retroalimentación:</span> {a.retroalimentacion_mercado}</div>}
                    {a.evidencia_url && (
                      <div>
                        <span className="text-muted-foreground">Evidencia:</span>
                        <a href={a.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">Ver foto</a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {!filtered.length && <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin actividades</div>}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); setStep(1); setEvidenciaFile(null); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar actividad" : "Nueva actividad"}</DialogTitle>
            {form.tipo === 'visita' && (
              <div className="text-sm text-muted-foreground mt-1">
                Paso {step} de 2
              </div>
            )}
          </DialogHeader>
          
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <Label>Cliente *</Label>
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
                <Label>Vendedor *</Label>
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
                <Select value={form.tipo} onValueChange={(v) => { setForm({ ...form, tipo: v }); if (v !== 'visita') setStep(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="llamada">Llamada</SelectItem>
                    <SelectItem value="visita">Visita</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="videollamada">Videollamada</SelectItem>
                    <SelectItem value="demo">Demo</SelectItem>
                    <SelectItem value="nota">Nota</SelectItem>
                    <SelectItem value="seguimiento">Seguimiento</SelectItem>
                    <SelectItem value="cotizacion">Cotización</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Canal de contacto *</Label>
                <Select value={form.canal_contacto} onValueChange={(v) => setForm({ ...form, canal_contacto: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar canal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presencial">Presencial</SelectItem>
                    <SelectItem value="telefonico">Telefónico</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="videollamada">Videollamada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha y hora *</Label>
                <Input type="datetime-local" value={form.fecha_actividad} onChange={e => setForm({ ...form, fecha_actividad: e.target.value })} />
              </div>
              <div>
                <Label>Resultado / ¿Qué pasó?</Label>
                <Textarea value={form.resultado || ""} onChange={e => setForm({ ...form, resultado: e.target.value })} placeholder="Describe el resultado..." rows={3} />
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
                <Label className="text-sm font-medium">Limitantes</Label>
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
                <Textarea value={form.descripcion || ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Notas adicionales..." rows={2} />
              </div>
            </div>
          )}

          {step === 2 && form.tipo === 'visita' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="font-medium text-[#1F3864]">Datos del cliente</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Región / Estado</Label>
                    <Input value={form.region || ""} onChange={e => setForm({ ...form, region: e.target.value })} />
                  </div>
                  <div>
                    <Label>Municipio</Label>
                    <Input value={form.municipio || ""} onChange={e => setForm({ ...form, municipio: e.target.value })} />
                  </div>
                  <div>
                    <Label>Código de cliente</Label>
                    <Input value={form.codigo_cliente || ""} onChange={e => setForm({ ...form, codigo_cliente: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch 
                      checked={form.tipo_cliente_nuevo} 
                      onCheckedChange={(checked) => setForm({ ...form, tipo_cliente_nuevo: checked })} 
                    />
                    <Label className="cursor-pointer">¿Es cliente nuevo?</Label>
                  </div>
                  <div>
                    <Label>Persona de contacto</Label>
                    <Input value={form.persona_contacto || ""} onChange={e => setForm({ ...form, persona_contacto: e.target.value })} />
                  </div>
                  <div>
                    <Label>Teléfono de contacto</Label>
                    <Input type="tel" value={form.telefono_contacto || ""} onChange={e => setForm({ ...form, telefono_contacto: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <div className="font-medium text-[#1F3864]">Operación del negocio</div>
                <div>
                  <Label>Tipo de negocio *</Label>
                  <Select value={form.tipo_negocio} onValueChange={(v) => setForm({ ...form, tipo_negocio: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="refaccionaria">Refaccionaria</SelectItem>
                      <SelectItem value="distribuidor">Distribuidor</SelectItem>
                      <SelectItem value="taller">Taller</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Escala de operación</Label>
                  <Select value={form.escala_operacion} onValueChange={(v) => setForm({ ...form, escala_operacion: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar escala" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grande">Grande</SelectItem>
                      <SelectItem value="mediana">Mediana</SelectItem>
                      <SelectItem value="pequeña">Pequeña</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Marcas que comercializa</Label>
                  <Textarea value={form.marcas_comercializa || ""} onChange={e => setForm({ ...form, marcas_comercializa: e.target.value })} placeholder="Lista de marcas..." rows={2} />
                </div>
                <div>
                  <Label>Top 3 marcas más vendidas</Label>
                  <Input value={form.top3_marcas || ""} onChange={e => setForm({ ...form, top3_marcas: e.target.value })} placeholder="Ej: Toyota, Nissan, Honda" />
                </div>
                <div>
                  <Label>Volumen promedio mensual de ventas ($)</Label>
                  <Input type="number" value={form.volumen_mensual_ventas || ""} onChange={e => setForm({ ...form, volumen_mensual_ventas: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <Label>Fecha de última visita previa</Label>
                  <Input type="date" value={form.fecha_ultima_visita || ""} onChange={e => setForm({ ...form, fecha_ultima_visita: e.target.value })} />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <div className="font-medium text-[#1F3864]">Reporte de la visita</div>
                <div>
                  <Label>Asuntos tratados</Label>
                  <Textarea value={form.asuntos_tratados || ""} onChange={e => setForm({ ...form, asuntos_tratados: e.target.value })} placeholder="Temas discutidos..." rows={2} />
                </div>
                <div>
                  <Label>Acuerdos alcanzados</Label>
                  <Textarea value={form.acuerdos_alcanzados || ""} onChange={e => setForm({ ...form, acuerdos_alcanzados: e.target.value })} placeholder="Acuerdos..." rows={2} />
                </div>
                <div>
                  <Label>Retroalimentación de mercado</Label>
                  <Textarea value={form.retroalimentacion_mercado || ""} onChange={e => setForm({ ...form, retroalimentacion_mercado: e.target.value })} placeholder="Comentarios del mercado..." rows={2} />
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <div className="font-medium text-[#1F3864]">Evidencia fotográfica</div>
                <FileOrCamera 
                  value={evidenciaFile} 
                  onChange={setEvidenciaFile} 
                  imageOnly={true} 
                  label="Subir foto de evidencia (máx 10MB)"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {form.tipo === 'visita' && step === 2 && (
              <Button variant="outline" onClick={() => setStep(1)} className="h-12 px-5 text-base">
                <ChevronLeft className="h-4 w-4 mr-2" /> Atrás
              </Button>
            )}
            {form.tipo === 'visita' && step === 1 ? (
              <Button onClick={() => setStep(2)} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
                Siguiente <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={save} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
                {form.tipo === 'visita' ? '✓ Guardar visita' : t.actions.save}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Evidencia fotográfica</DialogTitle></DialogHeader>
          {imagePreview && (
            <img src={imagePreview} alt="Evidencia" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
