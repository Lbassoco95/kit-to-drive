import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, User, Building2, TrendingUp, DollarSign, Calendar, AlertTriangle, BookOpen, Expand, Camera } from "lucide-react";

export default function CrmOportunidadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const [oportunidad, setOportunidad] = useState<any>(null);
  const [cliente, setCliente] = useState<any>(null);
  const [vendedor, setVendedor] = useState<any>(null);
  const [actividades, setActividades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingActivity, setCreatingActivity] = useState(false);
  const [activityForm, setActivityForm] = useState<any>({
    tipo: "visita",
    canal_contacto: "",
    fecha_actividad: "",
    resultado: "",
    proxima_accion: "",
    fecha_proxima: "",
    descripcion: ""
  });
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const etapaColors: Record<string, string> = {
    prospecto: "bg-gray-100 text-gray-700",
    contacto: "bg-blue-100 text-blue-700",
    cotizacion: "bg-yellow-100 text-yellow-700",
    negociacion: "bg-orange-100 text-orange-700",
    ganado: "bg-green-100 text-green-700",
    perdido: "bg-red-100 text-red-700"
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: op }, { data: acts }] = await Promise.all([
      supabase.from("crm_oportunidades").select("*").eq("id", id).single(),
      supabase.from("crm_actividades").select("*").eq("oportunidad_id", id).order("fecha_actividad", { ascending: false })
    ]);
    
    if (op) {
      setOportunidad(op);
      const [cs, vs] = await Promise.all([
        supabase.from("clientes").select("*").eq("id", op.cliente_id).single(),
        supabase.from("profiles").select("*").eq("id", op.vendedor_id).single()
      ]);
      setCliente(cs.data);
      setVendedor(vs.data);
    }
    setActividades(acts ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const saveActivity = async () => {
    const payload = {
      ...activityForm,
      oportunidad_id: id,
      cliente_id: oportunidad?.cliente_id,
      fecha_actividad: activityForm.fecha_actividad || new Date().toISOString(),
      fecha_proxima: activityForm.fecha_proxima || null,
      vendedor_id: user?.id
    };

    const { error } = await supabase.from("crm_actividades").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Actividad registrada");
    setCreatingActivity(false);
    setActivityForm({ tipo: "visita", fecha_actividad: "", resultado: "", proxima_accion: "", fecha_proxima: "", descripcion: "" });
    load();
  };

  const canEdit = role === "admin" || role === "coordinador_ventas" || role === "director_ventas" || role === "auxiliar_ventas";
  const canCreateActivity = role === "admin" || role === "ventas" || role === "coordinador_ventas" || role === "director_ventas" || role === "auxiliar_ventas";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!oportunidad) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Oportunidad no encontrada</p>
      </div>
    );
  }

  const isVencida = oportunidad.fecha_cierre_estimada && new Date(oportunidad.fecha_cierre_estimada) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/crm/oportunidades")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-[#1F3864]">Detalle de Oportunidad</h1>
          <p className="text-muted-foreground mt-1">{cliente?.nombre_comercial || "Sin cliente"}</p>
        </div>
        {canEdit && (
          <Button variant="outline" className="ml-auto" onClick={() => navigate(`/crm/oportunidades/${id}/edit`)}>
            <Pencil className="h-4 w-4 mr-2" /> Editar
          </Button>
        )}
      </div>

      {/* Opportunity Details */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <Label className="text-muted-foreground text-sm">Cliente</Label>
            <div className="flex items-center gap-2 mt-1">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{cliente?.nombre_comercial || "Sin cliente"}</span>
            </div>
            {cliente?.codigo_erp && <div className="text-sm text-muted-foreground mt-1">ERP: {cliente.codigo_erp}</div>}
          </div>
          
          <div>
            <Label className="text-muted-foreground text-sm">Vendedor</Label>
            <div className="flex items-center gap-2 mt-1">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{vendedor?.nombre_completo || "Sin vendedor"}</span>
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm">Tipo</Label>
            <div className="capitalize font-medium mt-1">{oportunidad.tipo_venta}</div>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm">Etapa</Label>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-1 ${etapaColors[oportunidad.etapa]}`}>
              {oportunidad.etapa}
            </div>
          </div>

          {oportunidad.cantidad_estimada && (
            <div>
              <Label className="text-muted-foreground text-sm">Cantidad estimada</Label>
              <div className="flex items-center gap-2 mt-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{oportunidad.cantidad_estimada} unidades</span>
              </div>
            </div>
          )}

          {oportunidad.monto_estimado && (
            <div>
              <Label className="text-muted-foreground text-sm">Monto estimado</Label>
              <div className="flex items-center gap-2 mt-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">${oportunidad.monto_estimado.toLocaleString()}</span>
              </div>
            </div>
          )}

          {oportunidad.fecha_cierre_estimada && (
            <div>
              <Label className="text-muted-foreground text-sm">Fecha estimada de cierre</Label>
              <div className={`flex items-center gap-2 mt-1 ${isVencida ? "text-red-600 font-medium" : ""}`}>
                <Calendar className="h-4 w-4" />
                <span className="font-medium">{new Date(oportunidad.fecha_cierre_estimada).toLocaleDateString()}</span>
                {isVencida && <span className="text-xs text-red-600">(Vencida)</span>}
              </div>
            </div>
          )}
        </div>

        {/* Limitantes */}
        {(oportunidad.limitante_descuento || oportunidad.limitante_flete || oportunidad.limitante_precio) && (
          <div className="mt-6 pt-6 border-t">
            <Label className="text-muted-foreground text-sm mb-3 block">Limitantes activas</Label>
            <div className="flex flex-wrap gap-2">
              {oportunidad.limitante_descuento && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" /> Descuento
                </span>
              )}
              {oportunidad.limitante_flete && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" /> Flete
                </span>
              )}
              {oportunidad.limitante_precio && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" /> Precio
                </span>
              )}
            </div>
            {oportunidad.limitante_notas && (
              <div className="mt-3 text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                {oportunidad.limitante_notas}
              </div>
            )}
          </div>
        )}

        {oportunidad.notas && (
          <div className="mt-6 pt-6 border-t">
            <Label className="text-muted-foreground text-sm mb-2 block">Notas</Label>
            <div className="text-sm bg-muted p-3 rounded-lg">{oportunidad.notas}</div>
          </div>
        )}
      </Card>

      {/* Activities */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Actividades ({actividades.length})
          </h2>
          {canCreateActivity && (
            <Button onClick={() => setCreatingActivity(true)} className="bg-[#1F3864] hover:bg-[#162a4d]">
              <Plus className="h-4 w-4 mr-2" /> Agregar actividad
            </Button>
          )}
        </div>

        {actividades.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg">
            Sin actividades registradas
          </div>
        ) : (
          <div className="space-y-3">
            {actividades.map((act) => (
              <Card key={act.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium capitalize">{act.tipo}</span>
                      {act.tipo === 'visita' && (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                          Visita
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">· {new Date(act.fecha_actividad).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {act.evidencia_url && (
                        <img 
                          src={act.evidencia_url} 
                          alt="Evidencia" 
                          className="w-10 h-10 rounded object-cover cursor-pointer hover:opacity-80 border"
                          onClick={() => setImagePreview(act.evidencia_url)}
                        />
                      )}
                      {act.tipo_negocio && (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium">
                          {act.tipo_negocio}
                        </span>
                      )}
                      {act.escala_operacion && (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-xs font-medium">
                          {act.escala_operacion}
                        </span>
                      )}
                    </div>
                    {act.resultado && <div className="text-sm mt-1">{act.resultado}</div>}
                    {act.proxima_accion && (
                      <div className="text-sm text-muted-foreground mt-2">
                        <span className="font-medium">Próxima acción:</span> {act.proxima_accion}
                        {act.fecha_proxima && ` (${new Date(act.fecha_proxima).toLocaleDateString()})`}
                      </div>
                    )}
                    {act.descripcion && <div className="text-sm text-muted-foreground mt-2 line-clamp-2">{act.descripcion}</div>}
                  </div>
                  {act.tipo === 'visita' && (
                    <Button size="icon" variant="ghost" onClick={() => setExpandedActivity(expandedActivity === act.id ? null : act.id)} className="h-8 w-8 shrink-0">
                      <Expand className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {expandedActivity === act.id && act.tipo === 'visita' && (
                  <div className="mt-4 pt-4 border-t space-y-3 text-sm">
                    <div className="font-medium text-[#1F3864]">Perfil del cliente visitado</div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {act.region && <div><span className="text-muted-foreground">Región:</span> {act.region}</div>}
                      {act.municipio && <div><span className="text-muted-foreground">Municipio:</span> {act.municipio}</div>}
                      {act.codigo_cliente && <div><span className="text-muted-foreground">Código:</span> {act.codigo_cliente}</div>}
                      {act.tipo_cliente_nuevo !== undefined && <div><span className="text-muted-foreground">Cliente nuevo:</span> {act.tipo_cliente_nuevo ? 'Sí' : 'No'}</div>}
                      {act.persona_contacto && <div><span className="text-muted-foreground">Contacto:</span> {act.persona_contacto}</div>}
                      {act.telefono_contacto && <div><span className="text-muted-foreground">Teléfono:</span> {act.telefono_contacto}</div>}
                    </div>

                    <div className="font-medium text-[#1F3864] mt-2">Operación del negocio</div>
                    <div className="grid grid-cols-2 gap-2">
                      {act.tipo_negocio && <div><span className="text-muted-foreground">Tipo:</span> {act.tipo_negocio}</div>}
                      {act.escala_operacion && <div><span className="text-muted-foreground">Escala:</span> {act.escala_operacion}</div>}
                      {act.marcas_comercializa && <div className="col-span-2"><span className="text-muted-foreground">Marcas:</span> {act.marcas_comercializa}</div>}
                      {act.top3_marcas && <div><span className="text-muted-foreground">Top 3:</span> {act.top3_marcas}</div>}
                      {act.volumen_mensual_ventas && <div><span className="text-muted-foreground">Volumen mensual:</span> ${act.volumen_mensual_ventas}</div>}
                      {act.fecha_ultima_visita && <div><span className="text-muted-foreground">Última visita:</span> {new Date(act.fecha_ultima_visita).toLocaleDateString()}</div>}
                    </div>

                    <div className="font-medium text-[#1F3864] mt-2">Reporte de la visita</div>
                    <div className="space-y-2">
                      {act.asuntos_tratados && <div><span className="text-muted-foreground">Asuntos tratados:</span> {act.asuntos_tratados}</div>}
                      {act.acuerdos_alcanzados && <div><span className="text-muted-foreground">Acuerdos:</span> {act.acuerdos_alcanzados}</div>}
                      {act.retroalimentacion_mercado && <div><span className="text-muted-foreground">Retroalimentación:</span> {act.retroalimentacion_mercado}</div>}
                      {act.evidencia_url && (
                        <div>
                          <span className="text-muted-foreground">Evidencia:</span>
                          <a href={act.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">Ver foto</a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Create Activity Dialog */}
      <Dialog open={creatingActivity} onOpenChange={setCreatingActivity}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar actividad</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={activityForm.tipo} onValueChange={(v) => setActivityForm({ ...activityForm, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visita">Visita</SelectItem>
                  <SelectItem value="llamada">Llamada</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="videollamada">Videollamada</SelectItem>
                  <SelectItem value="nota">Nota</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Canal de contacto</Label>
              <Select value={activityForm.canal_contacto} onValueChange={(v) => setActivityForm({ ...activityForm, canal_contacto: v })}>
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
              <Label>Fecha</Label>
              <Input type="datetime-local" value={activityForm.fecha_actividad} onChange={e => setActivityForm({ ...activityForm, fecha_actividad: e.target.value })} />
            </div>
            <div>
              <Label>Resultado</Label>
              <Textarea value={activityForm.resultado} onChange={e => setActivityForm({ ...activityForm, resultado: e.target.value })} placeholder="¿Qué pasó?" rows={2} />
            </div>
            <div>
              <Label>Próxima acción</Label>
              <Input value={activityForm.proxima_accion} onChange={e => setActivityForm({ ...activityForm, proxima_accion: e.target.value })} />
            </div>
            <div>
              <Label>Fecha próxima acción</Label>
              <Input type="date" value={activityForm.fecha_proxima} onChange={e => setActivityForm({ ...activityForm, fecha_proxima: e.target.value })} />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea value={activityForm.descripcion} onChange={e => setActivityForm({ ...activityForm, descripcion: e.target.value })} placeholder="Notas adicionales..." rows={2} />
            </div>
          </div>
          <DialogFooter><Button onClick={saveActivity} className="bg-[#1F3864] hover:bg-[#162a4d]">Guardar</Button></DialogFooter>
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
