import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { fmtDate, effEstatusArmado } from "@/lib/dazon";
import { useLang } from "@/contexts/LangContext";
import { EstatusBadge } from "@/components/EstatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Plus, Upload, Wand2, FileDown, FileText, ChevronDown,
  UserPlus, CalendarClock, CheckCircle2, Factory, Truck,
  DollarSign, Trash2, Package
} from "lucide-react";
import { FileOrCamera } from "@/components/FileOrCamera";

// ─── Catálogos ─────────────────────────────────────────────────────────────────
const MODELOS = ["200cc 2026", "300cc 2026"];
const COLORES = ["BLANCO", "AZUL", "ROJO", "NEGRO", "GRIS", "VERDE", "AMARILLO"];
const colorLabel = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();

const tipoBadgeClass: Record<string, string> = {
  motocarro:          "bg-[#1F3864]/10 text-[#1F3864] border-[#1F3864]/20",
  cabina:             "bg-violet-50 text-violet-700 border-violet-200",
  instalacion_cabina: "bg-purple-50 text-purple-700 border-purple-200",
  activacion:         "bg-amber-50 text-amber-700 border-amber-200",
  flete:              "bg-blue-50 text-blue-700 border-blue-200",
};

const tipoIcon: Record<string, string> = {
  motocarro: "🏍️", cabina: "🛖", instalacion_cabina: "🔧", activacion: "⚡", flete: "🚛",
};

// ─── Types ─────────────────────────────────────────────────────────────────────
interface MotoItem {
  _key: string;
  modelo: string;
  color: string;
  cantidad: number;
  con_caja: boolean;
  // Servicios adicionales por este motocarro
  con_cabina: boolean;
  con_instalacion: boolean;
  con_activacion: boolean;
}

const defaultMoto = (): MotoItem => ({
  _key: crypto.randomUUID(),
  modelo: "200cc 2026",
  color: "BLANCO",
  cantidad: 1,
  con_caja: false,
  con_cabina: false,
  con_instalacion: false,
  con_activacion: false,
});

// ─── Folio suggester ────────────────────────────────────────────────────────────
function suggestNextFolio(folios: string[]): string {
  if (!folios.length) return "REM-001";
  const parsed = folios
    .map(f => { const m = (f||"").match(/^(.*?)(\d+)\s*$/); return m ? { prefix: m[1], num: parseInt(m[2],10), pad: m[2].length } : null; })
    .filter(Boolean) as { prefix: string; num: number; pad: number }[];
  if (!parsed.length) return folios[0] + "-1";
  const last = parsed.sort((a,b) => b.num - a.num)[0];
  return `${last.prefix}${String(last.num+1).padStart(last.pad,"0")}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────────
export default function Remisiones() {
  const { role, user } = useAuth();
  const { t } = useLang();
  const [rows, setRows]             = useState<any[]>([]);
  const [clientes, setClientes]     = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [myProfile, setMyProfile]   = useState<{ nombre_completo: string } | null>(null);
  const [open, setOpen]             = useState(false);
  const [expanded, setExpanded]     = useState<Record<string,boolean>>({});
  const [recentFolios, setRecentFolios] = useState<string[]>([]);
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ codigo_erp:"", nombre_comercial:"", telefono:"" });

  const [form, setForm] = useState<any>({
    folio_remision:"", cliente_id:"", vendedor_asignado_id:"", nombre_vendedor:"",
    fecha_remision: new Date().toISOString().slice(0,10),
    notas:"", tipo_pago:"anticipado", pagado:true,
  });
  const [motos, setMotos]     = useState<MotoItem[]>([defaultMoto()]);
  const [conFlete, setConFlete] = useState(false);
  const [formFile, setFormFile] = useState<File|null>(null);

  const [pagoDialog, setPagoDialog]           = useState<any|null>(null);
  const [comprobanteFile, setComprobanteFile] = useState<File|null>(null);
  const [subiendoPago, setSubiendoPago]       = useState(false);

  const canAssignVendedor = role === "admin" || role === "coordinador";
  const totalUnidades = motos.reduce((s,m) => s + Number(m.cantidad||0), 0);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadClientes = async () => {
    const { data } = await supabase.from("clientes").select("id,codigo_erp,nombre_comercial").order("codigo_erp");
    setClientes(data ?? []);
  };
  const loadVendedores = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id,role").in("role",["ventas","coordinador"]);
    if (!roles?.length) return;
    const { data } = await supabase.from("profiles").select("id,nombre_completo,codigo_vendedor,activo").in("id", roles.map(r=>r.user_id)).eq("activo",true).order("nombre_completo");
    setVendedores(data ?? []);
  };
  const load = async () => {
    const { data } = await supabase
      .from("remisiones")
      .select("*, clientes(codigo_erp,nombre_comercial), profiles:vendedor_id(nombre_completo), remision_items(id,tipo_servicio,modelo,color,cantidad,con_caja), motocarros(id,orden_armado,modelo,color,ns_chasis,chasis_asignado,estatus_armado,fecha_estimada_armado,fecha_real_armado,estatus_entrega,fecha_estimada_entrega,fecha_propuesta_entrega,propuesta_entrega_notas,confirmada_fabrica_at,confirmada_logistica_at)")
      .order("fecha_remision", { ascending:false, nullsFirst:false });
    setRows(data ?? []);
    const propios = (data??[]).filter((r:any) => role==="admin"||role==="coordinador"||r.vendedor_id===user?.id);
    setRecentFolios(propios.slice(0,5).map((r:any)=>r.folio_remision));
  };

  useEffect(() => { load(); loadClientes(); loadVendedores(); }, [user?.id, role]);
  useEffect(() => {
    if (user?.id) supabase.from("profiles").select("nombre_completo").eq("id",user.id).single().then(({data})=>{ if(data) setMyProfile(data); });
  }, [user?.id]);

  const canCreate = role==="admin"||role==="ventas"||role==="coordinador";

  // ── Moto helpers ────────────────────────────────────────────────────────────
  const addMoto   = () => setMotos(m => [...m, defaultMoto()]);
  const removeMoto = (idx:number) => setMotos(m => m.filter((_,i)=>i!==idx));
  const updateMoto = (idx:number, field:keyof MotoItem, val:any) =>
    setMotos(m => m.map((item,i) => {
      if (i !== idx) return item;
      const next = { ...item, [field]: val };
      // Instalación de cabina implica caja montada
      if (field === "con_instalacion" && val === true)  next.con_caja = true;
      if (field === "con_instalacion" && val === false) next.con_caja = false;
      // Si marcan caja pero tienen instalación activa, no dejar desmarcar la caja
      if (field === "con_caja" && val === false && item.con_instalacion) next.con_caja = true;
      return next;
    }));

  // ── Dialog open/reset ───────────────────────────────────────────────────────
  const abrirNueva = () => {
    setForm((f:any)=>({ ...f, folio_remision: suggestNextFolio(recentFolios), nombre_vendedor: role==="ventas"?(myProfile?.nombre_completo||""):"" }));
    setMotos([defaultMoto()]); setConFlete(false); setFormFile(null); setOpen(true);
  };
  const resetForm = () => {
    setForm({ folio_remision:"",cliente_id:"",vendedor_asignado_id:"",nombre_vendedor:"",
      fecha_remision:new Date().toISOString().slice(0,10),notas:"",tipo_pago:"anticipado",pagado:true });
    setMotos([defaultMoto()]); setConFlete(false); setFormFile(null);
  };

  // ── Nuevo cliente ───────────────────────────────────────────────────────────
  const guardarNuevoCliente = async () => {
    if (!nuevoCliente.codigo_erp.trim()) return toast.error("El código ERP es obligatorio");
    const { data, error } = await supabase.from("clientes").insert(nuevoCliente).select("id,codigo_erp,nombre_comercial").single();
    if (error) return toast.error(error.message);
    toast.success("✓ Cliente creado"); await loadClientes();
    setForm((f:any)=>({...f, cliente_id: data.id}));
    setNuevoCliente({codigo_erp:"",nombre_comercial:"",telefono:""}); setCreandoCliente(false);
  };

  // ── Create remisión ─────────────────────────────────────────────────────────
  const crearRemision = async () => {
    if (!form.folio_remision||!form.cliente_id) { toast.error("Folio y cliente son obligatorios"); return; }
    if (recentFolios.includes(form.folio_remision.trim())) { toast.error("Ese folio ya existe"); return; }
    if (totalUnidades===0) { toast.error("Agrega al menos un motocarro"); return; }

    const vendedor_id = canAssignVendedor&&form.vendedor_asignado_id ? form.vendedor_asignado_id : user?.id;
    const payload:any = {
      folio_remision: form.folio_remision.trim(), cliente_id: form.cliente_id, vendedor_id,
      nombre_vendedor: form.nombre_vendedor||null, fecha_remision: form.fecha_remision,
      notas: form.notas||null, tipo_pago: form.tipo_pago, pagado: form.tipo_pago==="anticipado",
      color_solicitado: motos[0]?.color||"BLANCO", total_unidades_solicitadas: totalUnidades,
    };

    const { data: nueva, error } = await supabase.from("remisiones").insert(payload).select("id").single();
    if (error) return toast.error(error.message);

    // Build remision_items
    if (nueva?.id) {
      const items:any[] = [];
      for (const moto of motos) {
        const cant = Number(moto.cantidad)||1;
        items.push({ remision_id:nueva.id, tipo_servicio:"motocarro", modelo:moto.modelo, color:moto.color, cantidad:cant, con_caja:moto.con_caja });
        if (moto.con_cabina)      items.push({ remision_id:nueva.id, tipo_servicio:"cabina",             modelo:moto.modelo, color:null, cantidad:cant, con_caja:false });
        if (moto.con_instalacion) items.push({ remision_id:nueva.id, tipo_servicio:"instalacion_cabina", modelo:null,        color:null, cantidad:cant, con_caja:false });
        if (moto.con_activacion)  items.push({ remision_id:nueva.id, tipo_servicio:"activacion",         modelo:null,        color:null, cantidad:cant, con_caja:false });
      }
      if (conFlete) items.push({ remision_id:nueva.id, tipo_servicio:"flete", modelo:null, color:null, cantidad:1, con_caja:false });
      const { error: err } = await supabase.from("remision_items").insert(items);
      if (err) console.error("Items:", err.message);
    }

    if (formFile&&nueva?.id) {
      const path=`${nueva.id}/${Date.now()}_${formFile.name}`;
      const { error:upErr } = await supabase.storage.from("remisiones-docs").upload(path, formFile);
      if (!upErr) await supabase.from("remisiones").update({ documento_url:path }).eq("id",nueva.id);
    }

    toast.success(t.remisiones.creada); setOpen(false); resetForm(); load();
  };

  // ── Assign chasis ──────────────────────────────────────────────────────────
  const asignarChasis = async (r:any) => {
    const items:any[] = (r.remision_items??[]).filter((i:any)=>i.tipo_servicio==="motocarro");
    const motos_:any[] = r.motocarros??[];
    if (!items.length) {
      const cant = (r.total_unidades_solicitadas||1) - motos_.length;
      if (cant<=0) { toast.info("Ya están todos asignados"); return; }
      const { data, error } = await supabase.rpc("asignar_chasis_remision",{_remision_id:r.id,_cantidad:cant,_color:r.color_solicitado||null});
      if (error) return toast.error(error.message);
      toast.success(`✓ ${data} chasis asignados`);
    } else {
      let total=0;
      for (const item of items) {
        const ya = motos_.filter((m:any)=>(m.color||"").toUpperCase()===item.color?.toUpperCase()).length;
        const rest = item.cantidad-ya; if (rest<=0) continue;
        const { data, error } = await supabase.rpc("asignar_chasis_remision",{_remision_id:r.id,_cantidad:rest,_color:item.color});
        if (error) { console.error(error.message); continue; }
        total += (data||0);
      }
      if (total>0) toast.success(`✓ ${total} chasis asignados`);
      else toast.info("No hay inventario con esos colores");
    }
    load();
  };

  const subirPdf = async (r:any, file:File) => {
    const path=`${r.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("remisiones-docs").upload(path,file);
    if (error) return toast.error(error.message);
    await supabase.from("remisiones").update({documento_url:path}).eq("id",r.id);
    toast.success("✓ PDF subido"); load();
  };
  const verPdf = async (path:string) => {
    const { data } = await supabase.storage.from("remisiones-docs").createSignedUrl(path,60);
    if (data?.signedUrl) window.open(data.signedUrl,"_blank");
  };
  const confirmarPago = async () => {
    if (!pagoDialog||!comprobanteFile) { toast.error(t.pago.sinComprobante); return; }
    setSubiendoPago(true);
    const path=`${pagoDialog.id}/comprobante_${Date.now()}_${comprobanteFile.name}`;
    const { error:upErr } = await supabase.storage.from("remisiones-docs").upload(path,comprobanteFile);
    if (upErr) { setSubiendoPago(false); return toast.error(upErr.message); }
    const { error } = await supabase.from("remisiones").update({pagado:true,comprobante_pago_url:path}).eq("id",pagoDialog.id);
    setSubiendoPago(false); if (error) return toast.error(error.message);
    toast.success(t.pago.confirmadoOk); setPagoDialog(null); setComprobanteFile(null); load();
  };
  const verComprobante = async (path:string) => {
    const { data } = await supabase.storage.from("remisiones-docs").createSignedUrl(path,60);
    if (data?.signedUrl) window.open(data.signedUrl,"_blank");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>{t.remisiones.title}</h1>
          <p className="text-muted-foreground text-base mt-1">
            {t.remisiones.subtitle(rows.length)} {role==="ventas"?"(solo las tuyas)":""}
          </p>
        </div>

        {canCreate && (
          <Dialog open={open} onOpenChange={o=>{ setOpen(o); if(o) abrirNueva(); }}>
            <DialogTrigger asChild>
              <Button className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
                <Plus className="h-5 w-5 mr-2" /> {t.remisiones.nueva}
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t.remisiones.crearTitulo}</DialogTitle></DialogHeader>

              <div className="space-y-4">
                {/* Folio */}
                <div>
                  <Label className="text-base">{t.remisiones.folioRemision}</Label>
                  <Input value={form.folio_remision} onChange={e=>setForm({...form,folio_remision:e.target.value})} placeholder={t.remisiones.folioPlaceholder} className="h-12 text-base font-mono" />
                  {recentFolios.length>0&&(
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {recentFolios.map(f=>(
                        <button key={f} type="button" onClick={()=>setForm((s:any)=>({...s,folio_remision:suggestNextFolio([f])}))}
                          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-[#DBEAFE] text-xs font-mono text-[#1F3864] border">{f}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cliente */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Cliente</Label>
                    <button type="button" onClick={()=>setCreandoCliente(s=>!s)} className="inline-flex items-center gap-1 text-xs text-[#2E75B6] hover:underline font-medium">
                      <UserPlus className="h-3.5 w-3.5" /> {creandoCliente?"Cancelar":"Nuevo cliente"}
                    </button>
                  </div>
                  {!creandoCliente ? (
                    <Select value={form.cliente_id} onValueChange={v=>setForm({...form,cliente_id:v})}>
                      <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Selecciona cliente"/></SelectTrigger>
                      <SelectContent>{clientes.map(c=><SelectItem key={c.id} value={c.id}>{c.codigo_erp}{c.nombre_comercial?` — ${c.nombre_comercial}`:""}</SelectItem>)}</SelectContent>
                    </Select>
                  ):(
                    <div className="border-2 border-dashed border-[#2E75B6]/40 rounded-md p-3 space-y-2 bg-[#DBEAFE]/30">
                      <Input placeholder="Código ERP *" value={nuevoCliente.codigo_erp} onChange={e=>setNuevoCliente({...nuevoCliente,codigo_erp:e.target.value})} className="h-11"/>
                      <Input placeholder="Nombre comercial" value={nuevoCliente.nombre_comercial} onChange={e=>setNuevoCliente({...nuevoCliente,nombre_comercial:e.target.value})} className="h-11"/>
                      <Input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={e=>setNuevoCliente({...nuevoCliente,telefono:e.target.value})} className="h-11"/>
                      <Button type="button" onClick={guardarNuevoCliente} className="w-full h-11 bg-[#2E75B6] hover:bg-[#246094]">Guardar cliente</Button>
                    </div>
                  )}
                </div>

                {/* Vendedor selector (admin/coord) */}
                {canAssignVendedor&&(
                  <div>
                    <Label className="text-base">Asignar a vendedor</Label>
                    <Select value={form.vendedor_asignado_id} onValueChange={v=>{
                      const vend=vendedores.find(x=>x.id===v);
                      setForm({...form,vendedor_asignado_id:v,nombre_vendedor:vend?.nombre_completo||form.nombre_vendedor});
                    }}>
                      <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Vendedor (opcional)"/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— Asignar a mí mismo —</SelectItem>
                        {vendedores.map(v=><SelectItem key={v.id} value={v.id}>{v.nombre_completo}{v.codigo_vendedor?` (${v.codigo_vendedor})`:""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Nombre vendedor — todos */}
                <div>
                  <Label className="text-base">Nombre del vendedor{role==="ventas"&&<span className="ml-1 text-xs text-muted-foreground font-normal">(tu nombre)</span>}</Label>
                  <Input value={form.nombre_vendedor} onChange={e=>setForm({...form,nombre_vendedor:e.target.value})} placeholder="Nombre completo del vendedor" className="h-12 text-base"/>
                </div>

                {/* ── MOTOCARROS ──────────────────────────────────── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Motocarros</Label>
                    <span className="text-sm font-semibold text-[#1F3864]">{totalUnidades} unidades</span>
                  </div>

                  {motos.map((moto, idx) => (
                    <div key={moto._key} className="border rounded-xl overflow-hidden">
                      {/* Header motocarro */}
                      <div className="flex items-center justify-between px-3 py-2 bg-[#1F3864]/5 border-b">
                        <span className="text-xs font-bold text-[#1F3864] uppercase tracking-wide">🏍️ Motocarro {idx+1}</span>
                        {motos.length>1&&(
                          <button type="button" onClick={()=>removeMoto(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button>
                        )}
                      </div>

                      {/* Modelo / color / cantidad / caja */}
                      <div className="p-3 space-y-2 bg-slate-50">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Modelo</Label>
                            <Select value={moto.modelo} onValueChange={v=>updateMoto(idx,"modelo",v)}>
                              <SelectTrigger className="h-10 text-sm"><SelectValue/></SelectTrigger>
                              <SelectContent>{MODELOS.map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Color</Label>
                            <Select value={moto.color} onValueChange={v=>updateMoto(idx,"color",v)}>
                              <SelectTrigger className="h-10 text-sm"><SelectValue/></SelectTrigger>
                              <SelectContent>{COLORES.map(c=><SelectItem key={c} value={c}>{colorLabel(c)}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-28">
                            <Label className="text-xs text-muted-foreground">Cantidad</Label>
                            <Input type="number" min={1} value={moto.cantidad}
                              onChange={e=>updateMoto(idx,"cantidad",Math.max(1,parseInt(e.target.value)||1))}
                              className="h-10 text-sm"/>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer pt-5 flex-1">
                            <input type="checkbox" checked={moto.con_caja} onChange={e=>updateMoto(idx,"con_caja",e.target.checked)} className="w-4 h-4 accent-[#1F3864]"/>
                            <span className="text-sm font-medium flex items-center gap-1.5"><Package size={14} className="text-[#1F3864]"/> Con caja montada</span>
                          </label>
                        </div>
                      </div>

                      {/* Servicios adicionales por motocarro */}
                      <div className="px-3 py-2.5 bg-white border-t space-y-1.5">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Servicios adicionales</div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={moto.con_cabina} onChange={e=>updateMoto(idx,"con_cabina",e.target.checked)} className="w-3.5 h-3.5 accent-violet-600"/>
                          <span className="text-sm">🛖 Cabina</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={moto.con_instalacion} onChange={e=>updateMoto(idx,"con_instalacion",e.target.checked)} className="w-3.5 h-3.5 accent-purple-600"/>
                          <span className="text-sm">🔧 Instalación de cabina</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={moto.con_activacion} onChange={e=>updateMoto(idx,"con_activacion",e.target.checked)} className="w-3.5 h-3.5 accent-amber-500"/>
                          <span className="text-sm">⚡ Activación</span>
                        </label>
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" onClick={addMoto}
                    className="w-full h-10 border-dashed border-[#2E75B6]/50 text-[#2E75B6] hover:bg-[#DBEAFE]/30">
                    <Plus className="h-4 w-4 mr-2"/> Agregar motocarro
                  </Button>
                </div>

                {/* ── FLETE — toda la orden ──────────────────────── */}
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 px-3 py-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={conFlete} onChange={e=>setConFlete(e.target.checked)} className="w-4 h-4 accent-blue-600"/>
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      🚛 Flete <span className="text-xs text-muted-foreground font-normal">(servicio para toda la orden)</span>
                    </span>
                  </label>
                </div>

                {/* Fecha */}
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={form.fecha_remision} onChange={e=>setForm({...form,fecha_remision:e.target.value})} className="h-12 text-base"/>
                </div>

                {/* Tipo de pago */}
                <div>
                  <Label>{t.pago.tipo}</Label>
                  <Select value={form.tipo_pago} onValueChange={v=>setForm({...form,tipo_pago:v,pagado:v==="anticipado"})}>
                    <SelectTrigger className="h-12 text-base"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anticipado">{t.remisiones.anticipado}</SelectItem>
                      <SelectItem value="contra_entrega">{t.remisiones.contraEntrega}</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.tipo_pago==="contra_entrega"&&<p className="text-xs text-amber-600 mt-1">⚠ Logística no podrá programar hasta confirmar el pago.</p>}
                </div>

                {/* Notas */}
                <div>
                  <Label>Notas</Label>
                  <Input value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} className="h-12 text-base"/>
                </div>

                {/* Doc */}
                <div>
                  <Label>{t.remisiones.subirRemision}</Label>
                  <FileOrCamera value={formFile} onChange={setFormFile} label="Toma foto o sube el PDF" className="mt-1"/>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={crearRemision} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">{t.remisiones.crearBtn}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map(r => {
          const motos_   = r.motocarros??[];
          const items:any[] = r.remision_items??[];
          const motoItems  = items.filter((i:any)=>i.tipo_servicio==="motocarro");
          const asignadas  = motos_.length;
          const listas     = motos_.filter((m:any)=>["ARMADO","LISTO"].includes(m.estatus_armado)).length;
          const total      = r.total_unidades_solicitadas||asignadas||1;
          const pct        = Math.round((listas/total)*100);
          const pctColor   = pct===100?"#065F46":pct>=50?"#92400E":"#991B1B";
          const isOwner    = r.vendedor_id===user?.id;
          const canAssign  = role==="admin"||role==="coordinador"||(role==="ventas"&&isOwner);
          const canUpload  = role==="admin"||role==="coordinador"||(role==="ventas"&&isOwner);
          const canPropose = role==="admin"||role==="coordinador"||(role==="ventas"&&isOwner);
          const vendedorNombre = r.nombre_vendedor||r.profiles?.nombre_completo||"—";
          const initials = vendedorNombre.split(" ").map((s:string)=>s[0]).slice(0,2).join("").toUpperCase();

          return (
            <Card key={r.id} className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t.fields.folio}</div>
                  <div className="text-2xl font-bold text-[#1F3864] leading-tight">{r.folio_remision}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(r.fecha_remision)}</div>
                </div>
                <EstatusBadge estatus={r.estatus} size="md"/>
              </div>

              {/* Vendedor + cliente + pago */}
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#DBEAFE] text-[#1E40AF] text-xs font-medium">
                  <span className="w-5 h-5 rounded-full bg-[#2E75B6] text-white flex items-center justify-center text-[10px] font-bold shrink-0">{initials||"?"}</span>
                  {vendedorNombre.split(" ")[0]}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                  👤 {r.clientes?.codigo_erp||"—"}
                </span>
                {r.tipo_pago==="contra_entrega"&&!r.pagado ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-semibold">{t.pago.pendiente}</span>
                ):(
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-semibold">
                    <DollarSign className="h-3 w-3"/> {r.tipo_pago==="contra_entrega"?t.pago.contra_entrega:t.pago.anticipado}
                  </span>
                )}
              </div>

              {/* Items summary — grouped by motocarro */}
              {motoItems.length>0&&(
                <div className="space-y-1">
                  {motoItems.map((moto:any, idx:number)=>{
                    // Find services that came after this moto in the item list (by position)
                    const motoPos = items.indexOf(moto);
                    const nextMotoPos = items.findIndex((it:any,i:number)=>i>motoPos&&it.tipo_servicio==="motocarro");
                    const services = items.slice(motoPos+1, nextMotoPos===-1?undefined:nextMotoPos).filter((it:any)=>it.tipo_servicio!=="flete");
                    return (
                      <div key={moto.id} className="flex flex-wrap items-center gap-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${tipoBadgeClass.motocarro}`}>
                          {moto.cantidad>1&&<span>{moto.cantidad}×</span>}
                          🏍️ {moto.modelo} {colorLabel(moto.color)}
                          {moto.con_caja&&<Package size={9}/>}
                        </span>
                        {services.map((s:any)=>(
                          <span key={s.id} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${tipoBadgeClass[s.tipo_servicio]??""}`}>
                            {tipoIcon[s.tipo_servicio]}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                  {items.find((i:any)=>i.tipo_servicio==="flete")&&(
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tipoBadgeClass.flete}`}>🚛 Flete</span>
                  )}
                </div>
              )}

              {/* Progress */}
              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span>{listas} de {total} listos</span>
                  <span style={{color:pctColor}} className="font-bold">{pct}%</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full transition-all" style={{width:`${Math.min(pct,100)}%`,backgroundColor:pctColor}}/>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{asignadas} chasis asignados de {total}</div>
              </div>

              {/* Moto list */}
              {motos_.length>0&&(
                <Collapsible open={!!expanded[r.id]} onOpenChange={o=>setExpanded(s=>({...s,[r.id]:o}))}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-md bg-slate-50 hover:bg-slate-100 text-sm font-medium">
                    Ver chasis y entregas ({motos_.length})
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded[r.id]?"rotate-180":""}`}/>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {motos_.map((m:any)=><MotoRow key={m.id} m={m} canPropose={canPropose} role={role} onChange={load}/>)}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-auto pt-2 border-t flex-wrap">
                {canAssign&&asignadas<total&&(
                  <Button onClick={()=>asignarChasis(r)} className="flex-1 h-12 bg-[#2E75B6] hover:bg-[#246094] text-base min-w-[100px]">
                    <Wand2 className="h-5 w-5 mr-2"/> Asignar
                  </Button>
                )}
                {r.documento_url?(
                  <Button variant="outline" onClick={()=>verPdf(r.documento_url)} className="flex-1 h-12 text-base min-w-[100px]">
                    <FileDown className="h-5 w-5 mr-2"/> Ver PDF
                  </Button>
                ):canUpload?(
                  <label className="flex-1 min-w-[100px]">
                    <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)subirPdf(r,f);}}/>
                    <span className="flex items-center justify-center cursor-pointer h-12 rounded-md border-2 border-dashed border-[#2E75B6]/40 text-[#1F3864] font-medium hover:bg-[#DBEAFE] text-base">
                      <Upload className="h-5 w-5 mr-2"/> Subir PDF
                    </span>
                  </label>
                ):(
                  <div className="flex-1 h-12 flex items-center justify-center text-muted-foreground text-sm min-w-[100px]">
                    <FileText className="h-5 w-5 mr-2 opacity-40"/> Sin PDF
                  </div>
                )}
                {r.tipo_pago==="contra_entrega"&&!r.pagado&&(role==="admin"||role==="coordinador"||(role==="ventas"&&isOwner))&&(
                  <Button onClick={()=>{setPagoDialog(r);setComprobanteFile(null);}} className="flex-1 h-12 text-base bg-emerald-600 hover:bg-emerald-700 min-w-[100px]">
                    <DollarSign className="h-5 w-5 mr-2"/> {t.pago.confirmar}
                  </Button>
                )}
                {r.tipo_pago==="contra_entrega"&&r.pagado&&r.comprobante_pago_url&&(
                  <Button variant="outline" onClick={()=>verComprobante(r.comprobante_pago_url)} className="flex-1 h-12 text-base min-w-[100px]">
                    <FileDown className="h-5 w-5 mr-2"/> {t.pago.verComprobante}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
        {!rows.length&&<div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin remisiones</div>}
      </div>

      {/* Pago dialog */}
      <Dialog open={!!pagoDialog} onOpenChange={o=>{if(!o){setPagoDialog(null);setComprobanteFile(null);}}}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t.pago.confirmar} — {pagoDialog?.folio_remision}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t.pago.confirmarDesc}</p>
            <FileOrCamera value={comprobanteFile} onChange={setComprobanteFile} label={t.pago.subirComprobante}/>
            {comprobanteFile&&<p className="text-xs text-emerald-600 font-medium text-center">{t.pago.archivoListo}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={()=>{setPagoDialog(null);setComprobanteFile(null);}}>{t.actions.cancel}</Button>
            <Button onClick={confirmarPago} disabled={!comprobanteFile||subiendoPago} className="bg-emerald-600 hover:bg-emerald-700">
              <DollarSign className="h-4 w-4 mr-2"/>{subiendoPago?t.actions.uploading:t.pago.confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MotoRow ──────────────────────────────────────────────────────────────────
function MotoRow({ m, canPropose, role, onChange }:{m:any;canPropose:boolean;role:string|null;onChange:()=>void}) {
  const [editing, setEditing] = useState(false);
  const [fecha, setFecha]     = useState<string>(m.fecha_propuesta_entrega||"");
  const [notas, setNotas]     = useState<string>(m.propuesta_entrega_notas||"");

  const proponer = async () => {
    if (!fecha) return toast.error("Selecciona una fecha");
    const { error } = await supabase.rpc("proponer_fecha_entrega",{_motocarro_id:m.id,_fecha:fecha,_notas:notas||null});
    if (error) return toast.error(error.message);
    toast.success("✓ Fecha propuesta enviada"); setEditing(false); onChange();
  };
  const confirmar = async (area:"fabrica"|"logistica") => {
    const { error } = await supabase.rpc("confirmar_fecha_entrega",{_motocarro_id:m.id,_area:area});
    if (error) return toast.error(error.message);
    toast.success(`✓ Confirmado por ${area}`); onChange();
  };

  const canConfirmFab = role==="admin"||role==="fabrica";
  const canConfirmLog = role==="admin"||role==="logistica";
  const tieneFab = !!m.confirmada_fabrica_at;
  const tieneLog = !!m.confirmada_logistica_at;

  return (
    <div className="rounded-md border bg-white text-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[#1F3864]">#{m.orden_armado}</span>
          <span className="text-xs font-mono text-muted-foreground truncate">{m.ns_chasis||m.chasis_asignado||"—"}</span>
        </div>
        <EstatusBadge estatus={m.estatus_entrega==="ENTREGADA"?"ENTREGADA":effEstatusArmado(m)} size="sm"/>
      </div>
      <div className="px-3 pb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-muted-foreground">Estim. armado:</div><div className="text-right font-medium">{fmtDate(m.fecha_estimada_armado)}</div>
        <div className="text-muted-foreground">Estim. entrega:</div><div className="text-right font-medium">{fmtDate(m.fecha_estimada_entrega||m.fecha_propuesta_entrega)}</div>
      </div>
      {!editing?(
        <div className="px-3 pb-3 flex flex-wrap items-center gap-2">
          {m.fecha_propuesta_entrega?(
            <div className="flex-1 min-w-0 text-xs">
              <div className="font-medium text-[#1F3864] flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5"/> Propuesta: {fmtDate(m.fecha_propuesta_entrega)}</div>
              {m.propuesta_entrega_notas&&<div className="text-muted-foreground truncate">{m.propuesta_entrega_notas}</div>}
              <div className="flex gap-1.5 mt-1">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${tieneFab?"bg-[#D1FAE5] text-[#065F46]":"bg-slate-100 text-slate-500"}`}>
                  <Factory className="h-3 w-3"/> {tieneFab?"Fábrica ✓":"Fábrica pendiente"}
                </span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${tieneLog?"bg-[#D1FAE5] text-[#065F46]":"bg-slate-100 text-slate-500"}`}>
                  <Truck className="h-3 w-3"/> {tieneLog?"Logística ✓":"Logística pendiente"}
                </span>
              </div>
            </div>
          ):<div className="flex-1 text-xs text-muted-foreground italic">Sin fecha propuesta</div>}
          <div className="flex gap-1.5 ml-auto">
            {canPropose&&m.estatus_entrega!=="ENTREGADA"&&(
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={()=>setEditing(true)}>
                <CalendarClock className="h-3.5 w-3.5 mr-1"/>{m.fecha_propuesta_entrega?"Cambiar":"Proponer"}
              </Button>
            )}
            {m.fecha_propuesta_entrega&&canConfirmFab&&!tieneFab&&(
              <Button size="sm" className="h-8 text-xs bg-[#065F46] hover:bg-[#04432f]" onClick={()=>confirmar("fabrica")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Confirmar fábrica
              </Button>
            )}
            {m.fecha_propuesta_entrega&&canConfirmLog&&!tieneLog&&(
              <Button size="sm" className="h-8 text-xs bg-[#065F46] hover:bg-[#04432f]" onClick={()=>confirmar("logistica")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1"/>Confirmar logística
              </Button>
            )}
          </div>
        </div>
      ):(
        <div className="px-3 pb-3 space-y-2 bg-[#DBEAFE]/30">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Fecha pactada</Label><Input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} className="h-9 text-sm"/></div>
            <div><Label className="text-xs">Hora / contacto</Label><Input value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Ej: 10am" className="h-9 text-sm"/></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-9 bg-[#1F3864] hover:bg-[#162a4d]" onClick={proponer}>Enviar propuesta</Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={()=>setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
