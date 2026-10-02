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
import { cargarClientes, porNombreComercial } from "@/lib/catalogoClientes";

/** Estaba escrito tres veces, y por eso las tres copias se separaron. */
const FORM_VACIO = {
  titulo: "",
  cliente_id: "",
  vendedor_id: "",
  tipo_venta: "motocarro",
  cantidad_estimada: "",
  valor_estimado: "",
  etapa: "prospecto",
  fecha_cierre_estimada: "",
  notas: "",
};

export default function CrmOportunidades() {
  const { perms, user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [selectedEtapa, setSelectedEtapa] = useState<string>("all");

  // Los valores que acepta `crm_oportunidades_etapa_check`. El alta usaba
  // «cotizacion», «ganado» y «perdido», que la base rechaza.
  const etapas = ["prospecto", "contacto", "propuesta", "negociacion", "ganada", "perdida"];
  const [form, setForm] = useState<any>(FORM_VACIO);

  const load = async () => {
    const [{ data: ops }, { data: cs }, { data: vs }] = await Promise.all([
      supabase.from("crm_oportunidades").select("*").order("created_at", { ascending: false }),
      // Más de mil clientes: PostgREST corta en 1000 y el selector se
      // quedaba sin los del final. cargarClientes() lee por tramos.
      cargarClientes(),
      supabase.from("profiles").select("id, nombre_completo").eq("activo", true)
    ]);
    setOportunidades(ops ?? []);
    setClientes([...(cs ?? [])].sort(porNombreComercial));
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

  const canEdit = perms.puedeEditar("crm");
  const canCreate = perms.puedeCrear("crm");
  const canDelete = perms.puedeEliminar("crm");

  const save = async () => {
    // `titulo` es NOT NULL en la base: sin esto el alta se rechazaba y el
    // mensaje que veía el usuario era el error crudo de Postgres.
    if (!form.titulo?.trim()) return toast.error(t.crm.oportunidades.tituloRequerido);

    const payload = {
      ...form,
      titulo: form.titulo.trim(),
      cantidad_estimada: form.cantidad_estimada ? parseInt(form.cantidad_estimada) : null,
      valor_estimado: form.valor_estimado ? parseFloat(form.valor_estimado) : null,
      fecha_cierre_estimada: form.fecha_cierre_estimada || null,
      vendedor_id: form.vendedor_id || user?.id
    };

    if (editing) {
      const { error } = await supabase.from("crm_oportunidades").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success(t.crm.oportunidades.actualizada); setEditing(null);
    } else {
      const { data, error } = await supabase.from("crm_oportunidades").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      toast.success(t.crm.oportunidades.creada); setCreating(false);
      if (data?.id) {
        navigate(`/crm/oportunidades/${data.id}`);
        return;
      }
    }
    setForm(FORM_VACIO);
    load();
  };

  const deleteOportunidad = async (id: string) => {
    if (!confirm(t.crm.oportunidades.confirmarEliminar)) return;
    const { error } = await supabase.from("crm_oportunidades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t.crm.oportunidades.eliminada);
    load();
  };

  const etapaColors: Record<string, string> = {
    prospecto: "bg-gray-100 text-gray-700",
    contacto: "bg-blue-100 text-blue-700",
    propuesta: "bg-yellow-100 text-yellow-700",
    negociacion: "bg-orange-100 text-orange-700",
    ganada: "bg-green-100 text-green-700",
    perdida: "bg-red-100 text-red-700"
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1>{t.crm.oportunidades.title}</h1>
          <p className="text-base text-muted-foreground mt-1">{t.crm.oportunidades.subtitle(filtered.length)}</p>
        </div>
        {canCreate && (
          <Button onClick={() => { setForm(FORM_VACIO); setCreating(true); }}
            className="h-12 px-5 text-base bg-primary hover:bg-primary-hover">
            <Plus className="h-5 w-5 mr-2"/> {t.crm.oportunidades.nueva}
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder={t.crm.oportunidades.buscar} value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      {/* Pipeline Stage Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedEtapa("all")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedEtapa === "all"
              ? "bg-primary text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {t.crm.oportunidades.todas} ({oportunidades.length})
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
              {t.crm.etapa(etapa)} ({count})
            </button>
          );
        })}
      </div>

      <div className="responsive-card-grid gap-4">
        {filtered.map((o: any) => {
          const cliente = clientes.find((c: any) => c.id === o.cliente_id);
          const vendedor = vendedores.find((v: any) => v.id === o.vendedor_id);
          const isVencida = o.fecha_cierre_estimada && new Date(o.fecha_cierre_estimada) < new Date();
          return (
            <Card key={o.id} className="p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-xs uppercase text-muted-foreground tracking-wide font-medium">
                    {cliente?.nombre_comercial || t.crm.sinCliente} {cliente?.codigo_erp && `(${cliente.codigo_erp})`}
                  </div>
                  {/* El título encabeza la tarjeta; antes iba el tipo de venta y
                      todas decían lo mismo. El respaldo es para las que se
                      crearon sin título. */}
                  <div className="text-lg font-bold text-primary truncate">{o.titulo || t.crm.tipoVenta(o.tipo_venta)}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${etapaColors[o.etapa]}`}>
                      {t.crm.etapa(o.etapa)}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.crm.tipoVenta(o.tipo_venta)}</span>
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
                  <User size={16}/> <span>{vendedor?.nombre_completo || t.crm.sinVendedor}</span>
                </div>
                {o.cantidad_estimada && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp size={16}/> <span>{t.crm.unidades(o.cantidad_estimada)}</span>
                  </div>
                )}
                {o.valor_estimado && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign size={16}/> <span>${o.valor_estimado.toLocaleString()}</span>
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
                      <AlertTriangle className="h-3 w-3" /> {t.crm.limitantes.descuento}
                    </span>
                  )}
                  {o.limitante_flete && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-medium">
                      <AlertTriangle className="h-3 w-3" /> {t.crm.limitantes.flete}
                    </span>
                  )}
                  {o.limitante_precio && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                      <AlertTriangle className="h-3 w-3" /> {t.crm.limitantes.precio}
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
        {!filtered.length && <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">{t.crm.oportunidades.sinOportunidades}</div>}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? t.crm.oportunidades.editar : t.crm.oportunidades.nueva}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t.crm.oportunidades.tituloLabel}</Label>
              <Input
                value={form.titulo}
                placeholder={t.crm.oportunidades.tituloPlaceholder}
                onChange={e => setForm({ ...form, titulo: e.target.value })}
              />
            </div>
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
              <Select value={form.tipo_venta} onValueChange={(v) => setForm({ ...form, tipo_venta: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="motocarro">{t.crm.tiposVenta.motocarro}</SelectItem>
                  <SelectItem value="refaccion">{t.crm.tiposVenta.refaccion}</SelectItem>
                  <SelectItem value="servicio">{t.crm.tiposVenta.servicio}</SelectItem>
                  <SelectItem value="otro">{t.crm.tiposVenta.otro}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.crm.oportunidades.etapaLabel}</Label>
              <Select value={form.etapa} onValueChange={(v) => setForm({ ...form, etapa: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                {/* Sale de `etapas`, la misma lista que filtra arriba: tener las
                    opciones escritas aparte fue lo que dejó que se separaran de
                    lo que acepta la base. */}
                <SelectContent>
                  {etapas.map(e => (
                    <SelectItem key={e} value={e}>{t.crm.etapa(e)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.crm.oportunidades.cantidadEstimada}</Label>
              <Input type="number" value={form.cantidad_estimada} onChange={e => setForm({ ...form, cantidad_estimada: e.target.value })} />
            </div>
            <div>
              <Label>{t.crm.oportunidades.montoEstimado}</Label>
              <Input type="number" step="0.01" value={form.valor_estimado} onChange={e => setForm({ ...form, valor_estimado: e.target.value })} />
            </div>
            <div>
              <Label>{t.crm.oportunidades.fechaCierre}</Label>
              <Input type="date" value={form.fecha_cierre_estimada} onChange={e => setForm({ ...form, fecha_cierre_estimada: e.target.value })} />
            </div>
            <div>
              <Label>{t.crm.notas}</Label>
              <Input value={form.notas || ""} onChange={e => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="h-12 px-5 text-base">{t.actions.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
