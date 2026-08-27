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
  const { perms, user } = useAuth();
  const { t } = useLang();
  const [actividades, setActividades] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<any | null>(null);
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
  const [programarForm, setProgramarForm] = useState<any>({
    vendedor_id: user?.id || "",
    oportunidad_id: "",
    cliente_id: "",
    tipo: "visita",
    fecha_actividad: "",
    objetivo_visita: ""
  });
  const [completarForm, setCompletarForm] = useState<any>({
    resultado: "",
    asuntos_tratados: "",
    acuerdos_alcanzados: "",
    retroalimentacion_mercado: "",
    proxima_accion: "",
    fecha_proxima: "",
    limitante_descuento: false,
    limitante_flete: false,
    limitante_precio: false,
    limitante_notas: "",
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
    fecha_ultima_visita: ""
  });
  const [marcasCheckboxes, setMarcasCheckboxes] = useState<Record<string, boolean>>({
    alessia: false,
    wimex: false,
    nazaki: false,
    dav: false,
    mttc: false,
    motocorp: false,
    wapemex: false,
    otro: false
  });
  const [otraMarca, setOtraMarca] = useState("");

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

  const canEdit = perms.puedeEditar("crm");
  const canCreate = perms.puedeCrear("crm");
  const canDelete = perms.puedeEliminar("crm");

  const saveProgramar = async () => {
    const payload = {
      ...programarForm,
      estatus: 'programada',
      fecha_actividad: programarForm.fecha_actividad || new Date().toISOString(),
      vendedor_id: programarForm.vendedor_id || user?.id
    };

    const { error } = await supabase.from("crm_actividades").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Visita programada");
    setCreating(false);
    setProgramarForm({
      vendedor_id: user?.id || "",
      oportunidad_id: "",
      cliente_id: "",
      tipo: "visita",
      fecha_actividad: "",
      objetivo_visita: ""
    });
    load();
  };

  const saveCompletar = async () => {
    let evidenciaUrl = completing?.evidencia_url || "";
    
    // Upload evidence file if present
    if (evidenciaFile) {
      const fileExt = evidenciaFile.name.split('.').pop();
      const fileName = `${completing?.vendedor_id || user?.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('actividades-evidencia').upload(fileName, evidenciaFile);
      if (uploadError) {
        toast.error('Error al subir evidencia: ' + uploadError.message);
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('actividades-evidencia').getPublicUrl(fileName);
      evidenciaUrl = publicUrl;
    }

    // Build marcas string from checkboxes
    const marcasSeleccionadas = Object.entries(marcasCheckboxes)
      .filter(([_, checked]) => checked)
      .map(([marca]) => marca.charAt(0).toUpperCase() + marca.slice(1))
      .join(', ');
    const marcasFinal = marcasSeleccionadas + (otraMarca ? `, ${otraMarca}` : '');

    const payload = {
      ...completarForm,
      marcas_comercializa: marcasFinal || completarForm.marcas_comercializa,
      evidencia_url: evidenciaUrl,
      estatus: 'completada',
      fecha_proxima: completarForm.fecha_proxima || null
    };

    const { error } = await supabase.from("crm_actividades").update(payload).eq("id", completing.id);
    if (error) return toast.error(error.message);
    toast.success("Reporte de visita guardado");
    setCompleting(null);
    setEvidenciaFile(null);
    setMarcasCheckboxes({
      alessia: false,
      wimex: false,
      nazaki: false,
      dav: false,
      mttc: false,
      motocorp: false,
      wapemex: false,
      otro: false
    });
    setOtraMarca("");
    load();
  };

  /**
   * `<input type="datetime-local">` sólo entiende «YYYY-MM-DDTHH:mm». La fila
   * viene de Postgres como ISO con zona, así que sin convertirla el campo se
   * dibuja vacío y no se puede ver ni corregir la fecha.
   */
  const paraInputFecha = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /**
   * Guardar el diálogo «Editar actividad». Sólo manda los campos que ese
   * diálogo deja tocar: `form` trae la fila completa (viene de `setForm(a)`),
   * y devolverla entera reenviaría id, created_at y todo el reporte de la
   * visita, que aquí no se edita.
   */
  const guardarEdicion = async () => {
    if (!editing) return;
    const payload = {
      cliente_id:      form.cliente_id || null,
      vendedor_id:     form.vendedor_id || null,
      tipo:            form.tipo,
      fecha_actividad: form.fecha_actividad || editing.fecha_actividad,
      resultado:       form.resultado || null,
      descripcion:     form.descripcion || null,
    };
    const { error } = await supabase.from("crm_actividades").update(payload).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Actividad actualizada");
    setEditing(null);
    load();
  };

  const openCompletar = async (actividad: any) => {
    setCompleting(actividad);
    
    // Pre-load client data if exists
    const cliente = clientes.find((c: any) => c.id === actividad.cliente_id);
    if (cliente) {
      setCompletarForm({
        resultado: "",
        asuntos_tratados: "",
        acuerdos_alcanzados: "",
        retroalimentacion_mercado: "",
        proxima_accion: "",
        fecha_proxima: "",
        limitante_descuento: false,
        limitante_flete: false,
        limitante_precio: false,
        limitante_notas: "",
        region: cliente.estado || "",
        municipio: cliente.municipio || "",
        codigo_cliente: cliente.codigo_erp || "",
        tipo_cliente_nuevo: false,
        persona_contacto: "",
        telefono_contacto: cliente.telefono || "",
        tipo_negocio: "",
        escala_operacion: "",
        marcas_comercializa: "",
        top3_marcas: "",
        volumen_mensual_ventas: "",
        fecha_ultima_visita: ""
      });
    }
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

  const estatusColors: Record<string, string> = {
    programada: "bg-yellow-100 text-yellow-700",
    completada: "bg-green-100 text-green-700",
    cancelada: "bg-red-100 text-red-700"
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1>Actividades</h1>
          <p className="text-base text-muted-foreground mt-1">{filtered.length} actividades registradas</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setProgramarForm({ vendedor_id: user?.id || "", oportunidad_id: "", cliente_id: "", tipo: "visita", fecha_actividad: "", objetivo_visita: "" }); setCreating(true); }}
            className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2"/> Programar visita
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder="Buscar por cliente, vendedor, tipo..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="responsive-card-grid gap-4">
        {filtered.map((a: any) => {
          const cliente = clientes.find((c: any) => c.id === a.cliente_id);
          const vendedor = vendedores.find((v: any) => v.id === a.vendedor_id);
          const oportunidad = oportunidades.find((o: any) => o.id === a.oportunidad_id);
          return (
            <Card key={a.id} className="p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-xs uppercase text-muted-foreground tracking-wide font-medium">{cliente?.nombre_comercial || "Sin cliente"}</div>
                    {a.estatus && (
                      <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${estatusColors[a.estatus]}`}>
                        {a.estatus.charAt(0).toUpperCase() + a.estatus.slice(1)}
                      </div>
                    )}
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
                  {a.tipo === 'visita' && a.estatus === 'programada' && (
                    <Button size="sm" onClick={() => openCompletar(a)} className="h-8 px-3 bg-[#1F3864] hover:bg-[#162a4d] text-xs">
                      Completar visita →
                    </Button>
                  )}
                  {a.tipo === 'visita' && a.estatus === 'completada' && (
                    <Button size="icon" variant="ghost" onClick={() => setExpandedActivity(expandedActivity === a.id ? null : a.id)} className="h-8 w-8">
                      <Expand className="h-4 w-4" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button size="icon" variant="ghost" onClick={() => { setForm({ ...a, fecha_actividad: paraInputFecha(a.fecha_actividad) }); setEditing(a); setStep(1); }} className="h-8 w-8">
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
                {a.objetivo_visita && a.estatus === 'programada' && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle size={16}/> <span>Objetivo: {a.objetivo_visita}</span>
                  </div>
                )}
                {a.resultado && a.estatus === 'completada' && (
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

      {/* Programar Visita Dialog */}
      <Dialog open={creating} onOpenChange={(o) => { if (!o) { setCreating(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Programar visita</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cliente *</Label>
              <Select value={programarForm.cliente_id} onValueChange={(v) => setProgramarForm({ ...programarForm, cliente_id: v })}>
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
              <Select value={programarForm.vendedor_id} onValueChange={(v) => setProgramarForm({ ...programarForm, vendedor_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar vendedor" /></SelectTrigger>
                <SelectContent>
                  {vendedores.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.nombre_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={programarForm.tipo} onValueChange={(v) => setProgramarForm({ ...programarForm, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visita">Visita</SelectItem>
                  <SelectItem value="llamada">Llamada</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Oportunidad (opcional)</Label>
              <Select value={programarForm.oportunidad_id} onValueChange={(v) => setProgramarForm({ ...programarForm, oportunidad_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar oportunidad" /></SelectTrigger>
                <SelectContent>
                  {oportunidades.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>{o.tipo} - {o.etapa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha y hora programada *</Label>
              <Input type="datetime-local" value={programarForm.fecha_actividad} onChange={e => setProgramarForm({ ...programarForm, fecha_actividad: e.target.value })} />
            </div>
            <div>
              <Label>Objetivo de la visita</Label>
              <Textarea value={programarForm.objetivo_visita || ""} onChange={e => setProgramarForm({ ...programarForm, objetivo_visita: e.target.value })} placeholder="¿Para qué va?" rows={2} />
            </div>
          </div>
          <DialogFooter><Button onClick={saveProgramar} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">Programar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completar Visita Dialog */}
      <Dialog open={!!completing} onOpenChange={(o) => { if (!o) { setCompleting(null); setEvidenciaFile(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Reporte de visita</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="font-medium text-[#1F3864]">Datos del cliente visitado</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Código de cliente</Label>
                  <Input value={completarForm.codigo_cliente || ""} onChange={e => setCompletarForm({ ...completarForm, codigo_cliente: e.target.value })} />
                </div>
                <div>
                  <Label>Región / Estado</Label>
                  <Input value={completarForm.region || ""} onChange={e => setCompletarForm({ ...completarForm, region: e.target.value })} />
                </div>
                <div>
                  <Label>Municipio</Label>
                  <Input value={completarForm.municipio || ""} onChange={e => setCompletarForm({ ...completarForm, municipio: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch 
                    checked={completarForm.tipo_cliente_nuevo} 
                    onCheckedChange={(checked) => setCompletarForm({ ...completarForm, tipo_cliente_nuevo: checked })} 
                  />
                  <Label className="cursor-pointer">¿Es cliente nuevo?</Label>
                </div>
                <div>
                  <Label>Persona de contacto</Label>
                  <Input value={completarForm.persona_contacto || ""} onChange={e => setCompletarForm({ ...completarForm, persona_contacto: e.target.value })} />
                </div>
                <div>
                  <Label>Teléfono de contacto</Label>
                  <Input type="tel" value={completarForm.telefono_contacto || ""} onChange={e => setCompletarForm({ ...completarForm, telefono_contacto: e.target.value })} />
                </div>
                <div>
                  <Label>Tipo de negocio</Label>
                  <Select value={completarForm.tipo_negocio} onValueChange={(v) => setCompletarForm({ ...completarForm, tipo_negocio: v })}>
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
                  <Select value={completarForm.escala_operacion} onValueChange={(v) => setCompletarForm({ ...completarForm, escala_operacion: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar escala" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grande">Grande</SelectItem>
                      <SelectItem value="mediana">Mediana</SelectItem>
                      <SelectItem value="pequeña">Pequeña</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="font-medium text-[#1F3864]">Marcas que comercializa</div>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(marcasCheckboxes).map(([marca, checked]) => (
                  <label key={marca} className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={checked} 
                      onChange={e => setMarcasCheckboxes({ ...marcasCheckboxes, [marca]: e.target.checked })} 
                      className="rounded" 
                    />
                    <span className="text-sm capitalize">{marca === 'dav' ? 'DAV' : marca === 'mttc' ? 'MTTC' : marca}</span>
                  </label>
                ))}
              </div>
              {marcasCheckboxes.otro && (
                <div>
                  <Label>Otra marca</Label>
                  <Input value={otraMarca} onChange={e => setOtraMarca(e.target.value)} placeholder="Especificar..." />
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="font-medium text-[#1F3864]">Top 3 marcas más vendidas</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Marca 1</Label>
                  <Select value={completarForm.top3_marcas?.split(',')[0] || ""} onValueChange={(v) => {
                    const current = completarForm.top3_marcas?.split(',') || ["", "", ""];
                    setCompletarForm({ ...completarForm, top3_marcas: [v, current[1], current[2]].filter(Boolean).join(',') });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alessia">Alessia</SelectItem>
                      <SelectItem value="wimex">Wimex</SelectItem>
                      <SelectItem value="nazaki">Nazaki</SelectItem>
                      <SelectItem value="dav">DAV</SelectItem>
                      <SelectItem value="mttc">MTTC</SelectItem>
                      <SelectItem value="motocorp">Motocorp</SelectItem>
                      <SelectItem value="wapemex">Wapemex</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Marca 2</Label>
                  <Select value={completarForm.top3_marcas?.split(',')[1] || ""} onValueChange={(v) => {
                    const current = completarForm.top3_marcas?.split(',') || ["", "", ""];
                    setCompletarForm({ ...completarForm, top3_marcas: [current[0], v, current[2]].filter(Boolean).join(',') });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alessia">Alessia</SelectItem>
                      <SelectItem value="wimex">Wimex</SelectItem>
                      <SelectItem value="nazaki">Nazaki</SelectItem>
                      <SelectItem value="dav">DAV</SelectItem>
                      <SelectItem value="mttc">MTTC</SelectItem>
                      <SelectItem value="motocorp">Motocorp</SelectItem>
                      <SelectItem value="wapemex">Wapemex</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Marca 3</Label>
                  <Select value={completarForm.top3_marcas?.split(',')[2] || ""} onValueChange={(v) => {
                    const current = completarForm.top3_marcas?.split(',') || ["", "", ""];
                    setCompletarForm({ ...completarForm, top3_marcas: [current[0], current[1], v].filter(Boolean).join(',') });
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alessia">Alessia</SelectItem>
                      <SelectItem value="wimex">Wimex</SelectItem>
                      <SelectItem value="nazaki">Nazaki</SelectItem>
                      <SelectItem value="dav">DAV</SelectItem>
                      <SelectItem value="mttc">MTTC</SelectItem>
                      <SelectItem value="motocorp">Motocorp</SelectItem>
                      <SelectItem value="wapemex">Wapemex</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="font-medium text-[#1F3864]">Volumen y potencial</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Volumen promedio mensual de ventas ($)</Label>
                  <Input type="number" value={completarForm.volumen_mensual_ventas || ""} onChange={e => setCompletarForm({ ...completarForm, volumen_mensual_ventas: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <Label>Fecha de última visita previa</Label>
                  <Input type="date" value={completarForm.fecha_ultima_visita || ""} onChange={e => setCompletarForm({ ...completarForm, fecha_ultima_visita: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="font-medium text-[#1F3864]">Reporte de la visita</div>
              <div>
                <Label>Resultado / ¿Qué pasó?</Label>
                <Textarea value={completarForm.resultado || ""} onChange={e => setCompletarForm({ ...completarForm, resultado: e.target.value })} placeholder="Describe el resultado..." rows={3} />
              </div>
              <div>
                <Label>Asuntos tratados</Label>
                <Textarea value={completarForm.asuntos_tratados || ""} onChange={e => setCompletarForm({ ...completarForm, asuntos_tratados: e.target.value })} placeholder="Temas discutidos..." rows={2} />
              </div>
              <div>
                <Label>Acuerdos alcanzados</Label>
                <Textarea value={completarForm.acuerdos_alcanzados || ""} onChange={e => setCompletarForm({ ...completarForm, acuerdos_alcanzados: e.target.value })} placeholder="Acuerdos..." rows={2} />
              </div>
              <div>
                <Label>Retroalimentación de mercado</Label>
                <Textarea value={completarForm.retroalimentacion_mercado || ""} onChange={e => setCompletarForm({ ...completarForm, retroalimentacion_mercado: e.target.value })} placeholder="Comentarios del mercado..." rows={2} />
              </div>
              <div>
                <Label>Próxima acción</Label>
                <Input value={completarForm.proxima_accion || ""} onChange={e => setCompletarForm({ ...completarForm, proxima_accion: e.target.value })} placeholder="¿Qué sigue?" />
              </div>
              <div>
                <Label>Fecha próxima acción</Label>
                <Input type="date" value={completarForm.fecha_proxima || ""} onChange={e => setCompletarForm({ ...completarForm, fecha_proxima: e.target.value })} />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="font-medium text-[#1F3864]">Limitantes detectadas</div>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={completarForm.limitante_descuento} onChange={e => setCompletarForm({ ...completarForm, limitante_descuento: e.target.checked })} className="rounded" />
                  <span className="text-sm">Descuento</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={completarForm.limitante_flete} onChange={e => setCompletarForm({ ...completarForm, limitante_flete: e.target.checked })} className="rounded" />
                  <span className="text-sm">Flete</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={completarForm.limitante_precio} onChange={e => setCompletarForm({ ...completarForm, limitante_precio: e.target.checked })} className="rounded" />
                  <span className="text-sm">Precio</span>
                </label>
              </div>
              {(completarForm.limitante_descuento || completarForm.limitante_flete || completarForm.limitante_precio) && (
                <div>
                  <Label className="text-sm">Notas de limitantes</Label>
                  <Textarea value={completarForm.limitante_notas || ""} onChange={e => setCompletarForm({ ...completarForm, limitante_notas: e.target.value })} placeholder="Detalle de las limitantes..." rows={2} />
                </div>
              )}
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
          <DialogFooter><Button onClick={saveCompletar} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">Guardar reporte</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Activity Dialog (for non-visit activities or editing) */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar actividad</DialogTitle></DialogHeader>
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
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
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
              <Label>Fecha</Label>
              <Input type="datetime-local" value={form.fecha_actividad} onChange={e => setForm({ ...form, fecha_actividad: e.target.value })} />
            </div>
            <div>
              <Label>Resultado</Label>
              <Textarea value={form.resultado || ""} onChange={e => setForm({ ...form, resultado: e.target.value })} rows={3} />
            </div>
            <div>
              <Label>Notas generales</Label>
              <Textarea value={form.descripcion || ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter><Button onClick={guardarEdicion} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">Guardar</Button></DialogFooter>
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
