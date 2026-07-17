import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, User, Building2, TrendingUp, DollarSign, Calendar, AlertTriangle, BookOpen } from "lucide-react";

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
    fecha: "",
    resultado: "",
    proxima_accion: "",
    fecha_proxima: "",
    notas: ""
  });

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
      supabase.from("crm_actividades").select("*").eq("oportunidad_id", id).order("fecha", { ascending: false })
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
      fecha: activityForm.fecha || new Date().toISOString(),
      fecha_proxima: activityForm.fecha_proxima || null,
      vendedor_id: user?.id
    };

    const { error } = await supabase.from("crm_actividades").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Actividad registrada");
    setCreatingActivity(false);
    setActivityForm({ tipo: "visita", fecha: "", resultado: "", proxima_accion: "", fecha_proxima: "", notas: "" });
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
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium capitalize">{act.tipo}</span>
                      <span className="text-sm text-muted-foreground">· {new Date(act.fecha).toLocaleDateString()}</span>
                    </div>
                    {act.resultado && <div className="text-sm mt-1">{act.resultado}</div>}
                    {act.proxima_accion && (
                      <div className="text-sm text-muted-foreground mt-2">
                        <span className="font-medium">Próxima acción:</span> {act.proxima_accion}
                        {act.fecha_proxima && ` (${new Date(act.fecha_proxima).toLocaleDateString()})`}
                      </div>
                    )}
                    {act.notas && <div className="text-sm text-muted-foreground mt-2 line-clamp-2">{act.notas}</div>}
                  </div>
                </div>
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
                  <SelectItem value="nota">Nota</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={activityForm.fecha} onChange={e => setActivityForm({ ...activityForm, fecha: e.target.value })} />
            </div>
            <div>
              <Label>Resultado</Label>
              <Input value={activityForm.resultado} onChange={e => setActivityForm({ ...activityForm, resultado: e.target.value })} />
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
              <Input value={activityForm.notas} onChange={e => setActivityForm({ ...activityForm, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button onClick={saveActivity} className="bg-[#1F3864] hover:bg-[#162a4d]">Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
