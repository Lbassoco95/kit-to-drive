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
    toast.success(t.crm.actividades.visitaProgramada);
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
        toast.error(t.crm.actividades.errorEvidencia + uploadError.message);
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
    toast.success(t.crm.actividades.reporteGuardado);
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
    toast.success(t.crm.actividades.actualizada);
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
    if (!confirm(t.crm.actividades.confirmarEliminar)) return;
    const { error } = await supabase.from("crm_actividades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t.crm.actividades.eliminada);
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
          <h1>{t.crm.actividades.title}</h1>
          <p className="text-base text-muted-foreground mt-1">{t.crm.actividades.subtitle(filtered.length)}</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setProgramarForm({ vendedor_id: user?.id || "", oportunidad_id: "", cliente_id: "", tipo: "visita", fecha_actividad: "", objetivo_visita: "" }); setCreating(true); }}
            className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2"/> {t.crm.actividades.programarVisita}
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder={t.crm.actividades.buscar} value={q} onChange={e => setQ(e.target.value)} />
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
                    <div className="text-xs uppercase text-muted-foreground tracking-wide font-medium">{cliente?.nombre_comercial || t.crm.sinCliente}</div>
                    {a.estatus && (
                      <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${estatusColors[a.estatus]}`}>
                        {t.crm.estatusActividad(a.estatus)}
                      </div>
                    )}
                    {a.tipo === 'visita' && (
                      <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${tipoColors[a.tipo]}`}>
                        {t.crm.actividades.visita}
                      </div>
                    )}
                  </div>
                  <div className="text-lg font-bold text-[#1F3864] truncate">{t.crm.tipoActividad(a.tipo)}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {a.evidencia_url && (
                      <img 
                        src={a.evidencia_url} 
                        alt={t.crm.perfilVisita.evidencia} 
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
                      {t.crm.actividades.completarVisita}
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
                  <User size={16}/> <span>{vendedor?.nombre_completo || t.crm.sinVendedor}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar size={16}/> <span>{new Date(a.fecha_actividad).toLocaleString()}</span>
                </div>
                {a.objetivo_visita && a.estatus === 'programada' && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle size={16}/> <span>{t.crm.actividades.objetivo}: {a.objetivo_visita}</span>
                  </div>
                )}
                {a.resultado && a.estatus === 'completada' && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle size={16}/> <span>{a.resultado}</span>
                  </div>
                )}
                {oportunidad && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <BookOpen size={16}/> <span className="text-xs">{t.crm.actividades.oportunidad}: {t.crm.tipoVenta(oportunidad.tipo)}</span>
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
                  <div className="font-medium text-[#1F3864]">{t.crm.perfilVisita.perfilCliente}</div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {a.region && <div><span className="text-muted-foreground">{t.crm.perfilVisita.region}:</span> {a.region}</div>}
                    {a.municipio && <div><span className="text-muted-foreground">{t.crm.perfilVisita.municipio}:</span> {a.municipio}</div>}
                    {a.codigo_cliente && <div><span className="text-muted-foreground">{t.crm.perfilVisita.codigo}:</span> {a.codigo_cliente}</div>}
                    {a.tipo_cliente_nuevo !== undefined && <div><span className="text-muted-foreground">{t.crm.perfilVisita.clienteNuevo}:</span> {a.tipo_cliente_nuevo ? t.crm.perfilVisita.si : t.crm.perfilVisita.no}</div>}
                    {a.persona_contacto && <div><span className="text-muted-foreground">{t.crm.perfilVisita.contacto}:</span> {a.persona_contacto}</div>}
                    {a.telefono_contacto && <div><span className="text-muted-foreground">{t.crm.perfilVisita.telefono}:</span> {a.telefono_contacto}</div>}
                  </div>

                  <div className="font-medium text-[#1F3864] mt-2">{t.crm.perfilVisita.operacionNegocio}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {a.tipo_negocio && <div><span className="text-muted-foreground">{t.crm.perfilVisita.tipo}:</span> {a.tipo_negocio}</div>}
                    {a.escala_operacion && <div><span className="text-muted-foreground">{t.crm.perfilVisita.escala}:</span> {a.escala_operacion}</div>}
                    {a.marcas_comercializa && <div className="col-span-2"><span className="text-muted-foreground">{t.crm.perfilVisita.marcas}:</span> {a.marcas_comercializa}</div>}
                    {a.top3_marcas && <div><span className="text-muted-foreground">{t.crm.perfilVisita.top3}:</span> {a.top3_marcas}</div>}
                    {a.volumen_mensual_ventas && <div><span className="text-muted-foreground">{t.crm.perfilVisita.volumenMensual}:</span> ${a.volumen_mensual_ventas}</div>}
                    {a.fecha_ultima_visita && <div><span className="text-muted-foreground">{t.crm.perfilVisita.ultimaVisita}:</span> {new Date(a.fecha_ultima_visita).toLocaleDateString()}</div>}
                  </div>

                  <div className="font-medium text-[#1F3864] mt-2">{t.crm.perfilVisita.reporteVisita}</div>
                  <div className="space-y-2">
                    {a.asuntos_tratados && <div><span className="text-muted-foreground">{t.crm.perfilVisita.asuntosTratados}:</span> {a.asuntos_tratados}</div>}
                    {a.acuerdos_alcanzados && <div><span className="text-muted-foreground">{t.crm.perfilVisita.acuerdos}:</span> {a.acuerdos_alcanzados}</div>}
                    {a.retroalimentacion_mercado && <div><span className="text-muted-foreground">{t.crm.perfilVisita.retroalimentacion}:</span> {a.retroalimentacion_mercado}</div>}
                    {a.evidencia_url && (
                      <div>
                        <span className="text-muted-foreground">{t.crm.perfilVisita.evidencia}:</span>
                        <a href={a.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">{t.crm.perfilVisita.verFoto}</a>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {!filtered.length && <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">{t.crm.actividades.sinActividades}</div>}
      </div>

      {/* Programar Visita Dialog */}
      <Dialog open={creating} onOpenChange={(o) => { if (!o) { setCreating(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t.crm.actividades.programarVisita}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t.crm.cliente} *</Label>
              <Select value={programarForm.cliente_id} onValueChange={(v) => setProgramarForm({ ...programarForm, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder={t.crm.seleccionarCliente} /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre_comercial || c.codigo_erp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.crm.vendedor} *</Label>
              <Select value={programarForm.vendedor_id} onValueChange={(v) => setProgramarForm({ ...programarForm, vendedor_id: v })}>
                <SelectTrigger><SelectValue placeholder={t.crm.seleccionarVendedor} /></SelectTrigger>
                <SelectContent>
                  {vendedores.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.nombre_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.crm.tipo} *</Label>
              <Select value={programarForm.tipo} onValueChange={(v) => setProgramarForm({ ...programarForm, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visita">{t.crm.tipoActividad("visita")}</SelectItem>
                  <SelectItem value="llamada">{t.crm.tipoActividad("llamada")}</SelectItem>
                  <SelectItem value="whatsapp">{t.crm.tipoActividad("whatsapp")}</SelectItem>
                  <SelectItem value="email">{t.crm.tipoActividad("email")}</SelectItem>
                  <SelectItem value="otro">{t.crm.tipoActividad("otro")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.crm.actividades.oportunidadOpcional}</Label>
              <Select value={programarForm.oportunidad_id} onValueChange={(v) => setProgramarForm({ ...programarForm, oportunidad_id: v })}>
                <SelectTrigger><SelectValue placeholder={t.crm.seleccionarOportunidad} /></SelectTrigger>
                <SelectContent>
                  {oportunidades.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>{t.crm.tipoVenta(o.tipo)} - {t.crm.etapa(o.etapa)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.crm.actividades.fechaHoraProgramada} *</Label>
              <Input type="datetime-local" value={programarForm.fecha_actividad} onChange={e => setProgramarForm({ ...programarForm, fecha_actividad: e.target.value })} />
            </div>
            <div>
              <Label>{t.crm.actividades.objetivoVisita}</Label>
              <Textarea value={programarForm.objetivo_visita || ""} onChange={e => setProgramarForm({ ...programarForm, objetivo_visita: e.target.value })} placeholder={t.crm.actividades.objetivoPlaceholder} rows={2} />
            </div>
          </div>
          <DialogFooter><Button onClick={saveProgramar} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">{t.crm.actividades.programar}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Completar Visita Dialog */}
      <Dialog open={!!completing} onOpenChange={(o) => { if (!o) { setCompleting(null); setEvidenciaFile(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t.crm.actividades.reporteVisita}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="font-medium text-[#1F3864]">{t.crm.actividades.datosCliente}</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t.crm.actividades.codigoCliente}</Label>
                  <Input value={completarForm.codigo_cliente || ""} onChange={e => setCompletarForm({ ...completarForm, codigo_cliente: e.target.value })} />
                </div>
                <div>
                  <Label>{t.crm.actividades.regionEstado}</Label>
                  <Input value={completarForm.region || ""} onChange={e => setCompletarForm({ ...completarForm, region: e.target.value })} />
                </div>
                <div>
                  <Label>{t.crm.actividades.municipio}</Label>
                  <Input value={completarForm.municipio || ""} onChange={e => setCompletarForm({ ...completarForm, municipio: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch 
                    checked={completarForm.tipo_cliente_nuevo} 
                    onCheckedChange={(checked) => setCompletarForm({ ...completarForm, tipo_cliente_nuevo: checked })} 
                  />
                  <Label className="cursor-pointer">{t.crm.actividades.esClienteNuevo}</Label>
                </div>
                <div>
                  <Label>{t.crm.actividades.personaContacto}</Label>
                  <Input value={completarForm.persona_contacto || ""} onChange={e => setCompletarForm({ ...completarForm, persona_contacto: e.target.value })} />
                </div>
                <div>
                  <Label>{t.crm.actividades.telefonoContacto}</Label>
                  <Input type="tel" value={completarForm.telefono_contacto || ""} onChange={e => setCompletarForm({ ...completarForm, telefono_contacto: e.target.value })} />
                </div>
                <div>
                  <Label>{t.crm.actividades.tipoNegocio}</Label>
                  <Select value={completarForm.tipo_negocio} onValueChange={(v) => setCompletarForm({ ...completarForm, tipo_negocio: v })}>
                    <SelectTrigger><SelectValue placeholder={t.crm.actividades.seleccionarTipo} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="refaccionaria">{t.crm.tiposNegocio.refaccionaria}</SelectItem>
                      <SelectItem value="distribuidor">{t.crm.tiposNegocio.distribuidor}</SelectItem>
                      <SelectItem value="taller">{t.crm.tiposNegocio.taller}</SelectItem>
                      <SelectItem value="otro">{t.crm.tipoActividad("otro")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t.crm.actividades.escalaOperacion}</Label>
                  <Select value={completarForm.escala_operacion} onValueChange={(v) => setCompletarForm({ ...completarForm, escala_operacion: v })}>
                    <SelectTrigger><SelectValue placeholder={t.crm.actividades.seleccionarEscala} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grande">{t.crm.escalas.grande}</SelectItem>
                      <SelectItem value="mediana">{t.crm.escalas.mediana}</SelectItem>
                      <SelectItem value="pequeña">{t.crm.escalas.pequena}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="font-medium text-[#1F3864]">{t.crm.actividades.marcasComercializa}</div>
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
                  <Label>{t.crm.actividades.otraMarca}</Label>
                  <Input value={otraMarca} onChange={e => setOtraMarca(e.target.value)} placeholder={t.crm.actividades.especificar} />
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="font-medium text-[#1F3864]">{t.crm.actividades.top3Title}</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>{t.crm.actividades.marcaN(1)}</Label>
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
                  <Label>{t.crm.actividades.marcaN(2)}</Label>
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
                  <Label>{t.crm.actividades.marcaN(3)}</Label>
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
              <div className="font-medium text-[#1F3864]">{t.crm.actividades.volumenPotencial}</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t.crm.actividades.volumenPromedio}</Label>
                  <Input type="number" value={completarForm.volumen_mensual_ventas || ""} onChange={e => setCompletarForm({ ...completarForm, volumen_mensual_ventas: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <Label>{t.crm.actividades.fechaUltimaVisita}</Label>
                  <Input type="date" value={completarForm.fecha_ultima_visita || ""} onChange={e => setCompletarForm({ ...completarForm, fecha_ultima_visita: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="font-medium text-[#1F3864]">{t.crm.perfilVisita.reporteVisita}</div>
              <div>
                <Label>{t.crm.actividades.resultadoQuePaso}</Label>
                <Textarea value={completarForm.resultado || ""} onChange={e => setCompletarForm({ ...completarForm, resultado: e.target.value })} placeholder={t.crm.actividades.describeResultado} rows={3} />
              </div>
              <div>
                <Label>{t.crm.actividades.asuntosTratados}</Label>
                <Textarea value={completarForm.asuntos_tratados || ""} onChange={e => setCompletarForm({ ...completarForm, asuntos_tratados: e.target.value })} placeholder={t.crm.actividades.temasDiscutidos} rows={2} />
              </div>
              <div>
                <Label>{t.crm.actividades.acuerdosAlcanzados}</Label>
                <Textarea value={completarForm.acuerdos_alcanzados || ""} onChange={e => setCompletarForm({ ...completarForm, acuerdos_alcanzados: e.target.value })} placeholder={t.crm.actividades.acuerdosPlaceholder} rows={2} />
              </div>
              <div>
                <Label>{t.crm.actividades.retroalimentacionMercado}</Label>
                <Textarea value={completarForm.retroalimentacion_mercado || ""} onChange={e => setCompletarForm({ ...completarForm, retroalimentacion_mercado: e.target.value })} placeholder={t.crm.actividades.comentariosMercado} rows={2} />
              </div>
              <div>
                <Label>{t.crm.actividades.proximaAccion}</Label>
                <Input value={completarForm.proxima_accion || ""} onChange={e => setCompletarForm({ ...completarForm, proxima_accion: e.target.value })} placeholder={t.crm.actividades.queSigue} />
              </div>
              <div>
                <Label>{t.crm.actividades.fechaProxima}</Label>
                <Input type="date" value={completarForm.fecha_proxima || ""} onChange={e => setCompletarForm({ ...completarForm, fecha_proxima: e.target.value })} />
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="font-medium text-[#1F3864]">{t.crm.limitantes.detectadas}</div>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={completarForm.limitante_descuento} onChange={e => setCompletarForm({ ...completarForm, limitante_descuento: e.target.checked })} className="rounded" />
                  <span className="text-sm">{t.crm.limitantes.descuento}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={completarForm.limitante_flete} onChange={e => setCompletarForm({ ...completarForm, limitante_flete: e.target.checked })} className="rounded" />
                  <span className="text-sm">{t.crm.limitantes.flete}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={completarForm.limitante_precio} onChange={e => setCompletarForm({ ...completarForm, limitante_precio: e.target.checked })} className="rounded" />
                  <span className="text-sm">{t.crm.limitantes.precio}</span>
                </label>
              </div>
              {(completarForm.limitante_descuento || completarForm.limitante_flete || completarForm.limitante_precio) && (
                <div>
                  <Label className="text-sm">{t.crm.limitantes.notas}</Label>
                  <Textarea value={completarForm.limitante_notas || ""} onChange={e => setCompletarForm({ ...completarForm, limitante_notas: e.target.value })} placeholder={t.crm.limitantes.notasPlaceholder} rows={2} />
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2 border-t">
              <div className="font-medium text-[#1F3864]">{t.crm.actividades.evidenciaFotografica}</div>
              <FileOrCamera 
                value={evidenciaFile} 
                onChange={setEvidenciaFile} 
                imageOnly={true} 
                label={t.crm.actividades.subirFoto}
              />
            </div>
          </div>
          <DialogFooter><Button onClick={saveCompletar} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">{t.crm.actividades.guardarReporte}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Activity Dialog (for non-visit activities or editing) */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t.crm.actividades.editarActividad}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t.crm.cliente}</Label>
              <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder={t.crm.seleccionarCliente} /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre_comercial || c.codigo_erp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Label>{t.crm.tipo}</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="llamada">{t.crm.tipoActividad("llamada")}</SelectItem>
                  <SelectItem value="visita">{t.crm.tipoActividad("visita")}</SelectItem>
                  <SelectItem value="email">{t.crm.tipoActividad("email")}</SelectItem>
                  <SelectItem value="whatsapp">{t.crm.tipoActividad("whatsapp")}</SelectItem>
                  <SelectItem value="videollamada">{t.crm.tipoActividad("videollamada")}</SelectItem>
                  <SelectItem value="demo">{t.crm.tipoActividad("demo")}</SelectItem>
                  <SelectItem value="nota">{t.crm.tipoActividad("nota")}</SelectItem>
                  <SelectItem value="seguimiento">{t.crm.tipoActividad("seguimiento")}</SelectItem>
                  <SelectItem value="cotizacion">{t.crm.tipoActividad("cotizacion")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.crm.fecha}</Label>
              <Input type="datetime-local" value={form.fecha_actividad} onChange={e => setForm({ ...form, fecha_actividad: e.target.value })} />
            </div>
            <div>
              <Label>{t.crm.resultado}</Label>
              <Textarea value={form.resultado || ""} onChange={e => setForm({ ...form, resultado: e.target.value })} rows={3} />
            </div>
            <div>
              <Label>{t.crm.actividades.notasGenerales}</Label>
              <Textarea value={form.descripcion || ""} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter><Button onClick={guardarEdicion} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">{t.actions.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{t.crm.actividades.evidenciaFotografica}</DialogTitle></DialogHeader>
          {imagePreview && (
            <img src={imagePreview} alt={t.crm.perfilVisita.evidencia} className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
