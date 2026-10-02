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
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, User, Building2, TrendingUp, DollarSign, Calendar, AlertTriangle, BookOpen, Expand, Camera } from "lucide-react";

export default function CrmOportunidadDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { perms, user } = useAuth();
  const { t } = useLang();
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
    toast.success(t.crm.detalle.actividadRegistrada);
    setCreatingActivity(false);
    setActivityForm({ tipo: "visita", fecha_actividad: "", resultado: "", proxima_accion: "", fecha_proxima: "", descripcion: "" });
    load();
  };

  const canEdit = perms.puedeEditar("crm");
  const canCreateActivity = perms.puedeCrear("crm");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t.crm.cargando}</p>
      </div>
    );
  }

  if (!oportunidad) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t.crm.detalle.noEncontrada}</p>
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
          <h1 className="text-2xl font-bold text-primary">{oportunidad.titulo || t.crm.detalle.title}</h1>
          <p className="text-muted-foreground mt-1">{cliente?.nombre_comercial || t.crm.sinCliente}</p>
        </div>
        {canEdit && (
          <Button variant="outline" className="ml-auto" onClick={() => navigate(`/crm/oportunidades/${id}/edit`)}>
            <Pencil className="h-4 w-4 mr-2" /> {t.actions.edit}
          </Button>
        )}
      </div>

      {/* Opportunity Details */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <Label className="text-muted-foreground text-sm">{t.crm.cliente}</Label>
            <div className="flex items-center gap-2 mt-1">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{cliente?.nombre_comercial || t.crm.sinCliente}</span>
            </div>
            {cliente?.codigo_erp && <div className="text-sm text-muted-foreground mt-1">ERP: {cliente.codigo_erp}</div>}
          </div>
          
          <div>
            <Label className="text-muted-foreground text-sm">{t.crm.vendedor}</Label>
            <div className="flex items-center gap-2 mt-1">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{vendedor?.nombre_completo || t.crm.sinVendedor}</span>
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm">{t.crm.tipo}</Label>
            <div className="font-medium mt-1">{t.crm.tipoVenta(oportunidad.tipo_venta)}</div>
          </div>

          <div>
            <Label className="text-muted-foreground text-sm">{t.crm.oportunidades.etapaLabel}</Label>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-1 ${etapaColors[oportunidad.etapa]}`}>
              {t.crm.etapa(oportunidad.etapa)}
            </div>
          </div>

          {oportunidad.cantidad_estimada && (
            <div>
              <Label className="text-muted-foreground text-sm">{t.crm.oportunidades.cantidadEstimada}</Label>
              <div className="flex items-center gap-2 mt-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{t.crm.unidades(oportunidad.cantidad_estimada)}</span>
              </div>
            </div>
          )}

          {oportunidad.valor_estimado && (
            <div>
              <Label className="text-muted-foreground text-sm">{t.crm.oportunidades.montoEstimado}</Label>
              <div className="flex items-center gap-2 mt-1">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">${oportunidad.valor_estimado.toLocaleString()}</span>
              </div>
            </div>
          )}

          {oportunidad.fecha_cierre_estimada && (
            <div>
              <Label className="text-muted-foreground text-sm">{t.crm.oportunidades.fechaCierre}</Label>
              <div className={`flex items-center gap-2 mt-1 ${isVencida ? "text-red-600 font-medium" : ""}`}>
                <Calendar className="h-4 w-4" />
                <span className="font-medium">{new Date(oportunidad.fecha_cierre_estimada).toLocaleDateString()}</span>
                {isVencida && <span className="text-xs text-red-600">{t.crm.detalle.vencida}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Limitantes */}
        {(oportunidad.limitante_descuento || oportunidad.limitante_flete || oportunidad.limitante_precio) && (
          <div className="mt-6 pt-6 border-t">
            <Label className="text-muted-foreground text-sm mb-3 block">{t.crm.limitantes.title}</Label>
            <div className="flex flex-wrap gap-2">
              {oportunidad.limitante_descuento && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" /> {t.crm.limitantes.descuento}
                </span>
              )}
              {oportunidad.limitante_flete && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" /> {t.crm.limitantes.flete}
                </span>
              )}
              {oportunidad.limitante_precio && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" /> {t.crm.limitantes.precio}
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
            <Label className="text-muted-foreground text-sm mb-2 block">{t.crm.notas}</Label>
            <div className="text-sm bg-muted p-3 rounded-lg">{oportunidad.notas}</div>
          </div>
        )}
      </Card>

      {/* Activities */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {t.crm.detalle.actividades(actividades.length)}
          </h2>
          {canCreateActivity && (
            <Button onClick={() => setCreatingActivity(true)} className="bg-primary hover:bg-primary-hover">
              <Plus className="h-4 w-4 mr-2" /> {t.crm.detalle.agregarActividad}
            </Button>
          )}
        </div>

        {actividades.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-muted/30 rounded-lg">
            {t.crm.detalle.sinActividades}
          </div>
        ) : (
          <div className="space-y-3">
            {actividades.map((act) => (
              <Card key={act.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium">{t.crm.tipoActividad(act.tipo)}</span>
                      {act.tipo === 'visita' && (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                          {t.crm.detalle.visita}
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">· {new Date(act.fecha_actividad).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {act.evidencia_url && (
                        <img 
                          src={act.evidencia_url} 
                          alt={t.crm.perfilVisita.evidencia} 
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
                        <span className="font-medium">{t.crm.detalle.proximaAccion}:</span> {act.proxima_accion}
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
                    <div className="font-medium text-primary">{t.crm.perfilVisita.perfilCliente}</div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {act.region && <div><span className="text-muted-foreground">{t.crm.perfilVisita.region}:</span> {act.region}</div>}
                      {act.municipio && <div><span className="text-muted-foreground">{t.crm.perfilVisita.municipio}:</span> {act.municipio}</div>}
                      {act.codigo_cliente && <div><span className="text-muted-foreground">{t.crm.perfilVisita.codigo}:</span> {act.codigo_cliente}</div>}
                      {act.tipo_cliente_nuevo !== undefined && <div><span className="text-muted-foreground">{t.crm.perfilVisita.clienteNuevo}:</span> {act.tipo_cliente_nuevo ? t.crm.perfilVisita.si : t.crm.perfilVisita.no}</div>}
                      {act.persona_contacto && <div><span className="text-muted-foreground">{t.crm.perfilVisita.contacto}:</span> {act.persona_contacto}</div>}
                      {act.telefono_contacto && <div><span className="text-muted-foreground">{t.crm.perfilVisita.telefono}:</span> {act.telefono_contacto}</div>}
                    </div>

                    <div className="font-medium text-primary mt-2">{t.crm.perfilVisita.operacionNegocio}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {act.tipo_negocio && <div><span className="text-muted-foreground">{t.crm.perfilVisita.tipo}:</span> {act.tipo_negocio}</div>}
                      {act.escala_operacion && <div><span className="text-muted-foreground">{t.crm.perfilVisita.escala}:</span> {act.escala_operacion}</div>}
                      {act.marcas_comercializa && <div className="col-span-2"><span className="text-muted-foreground">{t.crm.perfilVisita.marcas}:</span> {act.marcas_comercializa}</div>}
                      {act.top3_marcas && <div><span className="text-muted-foreground">{t.crm.perfilVisita.top3}:</span> {act.top3_marcas}</div>}
                      {act.volumen_mensual_ventas && <div><span className="text-muted-foreground">{t.crm.perfilVisita.volumenMensual}:</span> ${act.volumen_mensual_ventas}</div>}
                      {act.fecha_ultima_visita && <div><span className="text-muted-foreground">{t.crm.perfilVisita.ultimaVisita}:</span> {new Date(act.fecha_ultima_visita).toLocaleDateString()}</div>}
                    </div>

                    <div className="font-medium text-primary mt-2">{t.crm.perfilVisita.reporteVisita}</div>
                    <div className="space-y-2">
                      {act.asuntos_tratados && <div><span className="text-muted-foreground">{t.crm.perfilVisita.asuntosTratados}:</span> {act.asuntos_tratados}</div>}
                      {act.acuerdos_alcanzados && <div><span className="text-muted-foreground">{t.crm.perfilVisita.acuerdos}:</span> {act.acuerdos_alcanzados}</div>}
                      {act.retroalimentacion_mercado && <div><span className="text-muted-foreground">{t.crm.perfilVisita.retroalimentacion}:</span> {act.retroalimentacion_mercado}</div>}
                      {act.evidencia_url && (
                        <div>
                          <span className="text-muted-foreground">{t.crm.perfilVisita.evidencia}:</span>
                          <a href={act.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">{t.crm.perfilVisita.verFoto}</a>
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
          <DialogHeader><DialogTitle>{t.crm.detalle.registrarActividad}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t.crm.tipo}</Label>
              <Select value={activityForm.tipo} onValueChange={(v) => setActivityForm({ ...activityForm, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visita">{t.crm.tipoActividad("visita")}</SelectItem>
                  <SelectItem value="llamada">{t.crm.tipoActividad("llamada")}</SelectItem>
                  <SelectItem value="email">{t.crm.tipoActividad("email")}</SelectItem>
                  <SelectItem value="whatsapp">{t.crm.tipoActividad("whatsapp")}</SelectItem>
                  <SelectItem value="videollamada">{t.crm.tipoActividad("videollamada")}</SelectItem>
                  <SelectItem value="nota">{t.crm.tipoActividad("nota")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.crm.detalle.canalContacto}</Label>
              <Select value={activityForm.canal_contacto} onValueChange={(v) => setActivityForm({ ...activityForm, canal_contacto: v })}>
                <SelectTrigger><SelectValue placeholder={t.crm.detalle.seleccionarCanal} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="presencial">{t.crm.canales.presencial}</SelectItem>
                  <SelectItem value="telefonico">{t.crm.canales.telefonico}</SelectItem>
                  <SelectItem value="whatsapp">{t.crm.tipoActividad("whatsapp")}</SelectItem>
                  <SelectItem value="email">{t.crm.tipoActividad("email")}</SelectItem>
                  <SelectItem value="videollamada">{t.crm.tipoActividad("videollamada")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.crm.fecha}</Label>
              <Input type="datetime-local" value={activityForm.fecha_actividad} onChange={e => setActivityForm({ ...activityForm, fecha_actividad: e.target.value })} />
            </div>
            <div>
              <Label>{t.crm.resultado}</Label>
              <Textarea value={activityForm.resultado} onChange={e => setActivityForm({ ...activityForm, resultado: e.target.value })} placeholder={t.crm.detalle.quePaso} rows={2} />
            </div>
            <div>
              <Label>{t.crm.detalle.proximaAccion}</Label>
              <Input value={activityForm.proxima_accion} onChange={e => setActivityForm({ ...activityForm, proxima_accion: e.target.value })} />
            </div>
            <div>
              <Label>{t.crm.detalle.fechaProxima}</Label>
              <Input type="date" value={activityForm.fecha_proxima} onChange={e => setActivityForm({ ...activityForm, fecha_proxima: e.target.value })} />
            </div>
            <div>
              <Label>{t.crm.notas}</Label>
              <Textarea value={activityForm.descripcion} onChange={e => setActivityForm({ ...activityForm, descripcion: e.target.value })} placeholder={t.crm.detalle.notasAdicionales} rows={2} />
            </div>
          </div>
          <DialogFooter><Button onClick={saveActivity} className="bg-primary hover:bg-primary-hover">{t.actions.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!imagePreview} onOpenChange={() => setImagePreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>{t.crm.detalle.evidenciaFotografica}</DialogTitle></DialogHeader>
          {imagePreview && (
            <img src={imagePreview} alt={t.crm.perfilVisita.evidencia} className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
