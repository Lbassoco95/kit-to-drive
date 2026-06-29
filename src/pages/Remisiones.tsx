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
import { Plus, Upload, Wand2, FileDown, FileText, ChevronDown, UserPlus, CalendarClock, CheckCircle2, Factory, Truck, DollarSign, Trash2, Package, Zap } from "lucide-react";
import { FileOrCamera } from "@/components/FileOrCamera";

// ─── Constants ───────────────────────────────────────────────────────────────
const MODELOS = ["200cc 2026", "300cc 2026"];
const COLORES = ["BLANCO", "AZUL", "ROJO", "NEGRO", "GRIS", "VERDE", "AMARILLO"];
const colorLabel = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();

// ─── Types ────────────────────────────────────────────────────────────────────
interface LineaItem {
  _key: string;
  modelo: string;
  color: string;
  cantidad: number;
  con_caja: boolean;
}

const defaultLinea = (): LineaItem => ({
  _key: crypto.randomUUID(),
  modelo: "200cc 2026",
  color: "BLANCO",
  cantidad: 1,
  con_caja: false,
});

// ─── Folio suggester ──────────────────────────────────────────────────────────
function suggestNextFolio(folios: string[]): string {
  if (!folios.length) return "REM-001";
  const parsed = folios
    .map(f => {
      const m = (f || "").match(/^(.*?)(\d+)\s*$/);
      return m ? { prefix: m[1], num: parseInt(m[2], 10), pad: m[2].length } : null;
    })
    .filter(Boolean) as { prefix: string; num: number; pad: number }[];
  if (!parsed.length) return folios[0] + "-1";
  const last = parsed.sort((a, b) => b.num - a.num)[0];
  return `${last.prefix}${String(last.num + 1).padStart(last.pad, "0")}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Remisiones() {
  const { role, user } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [myProfile, setMyProfile] = useState<{ nombre_completo: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [recentFolios, setRecentFolios] = useState<string[]>([]);
  const [creandoCliente, setCreandoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ codigo_erp: "", nombre_comercial: "", telefono: "" });

  // Form state
  const [form, setForm] = useState<any>({
    folio_remision: "",
    cliente_id: "",
    vendedor_asignado_id: "",
    nombre_vendedor: "",
    fecha_remision: new Date().toISOString().slice(0, 10),
    notas: "",
    tipo_pago: "anticipado",
    pagado: true,
    tipo_remision: "cabina",
  });
  const [lineas, setLineas] = useState<LineaItem[]>([defaultLinea()]);
  const [formFile, setFormFile] = useState<File | null>(null);

  // Pago dialog
  const [pagoDialog, setPagoDialog] = useState<any | null>(null);
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null);
  const [subiendoPago, setSubiendoPago] = useState(false);

  const canAssignVendedor = role === "admin" || role === "coordinador";
  const totalLineas = lineas.reduce((s, l) => s + Number(l.cantidad || 0), 0);

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadClientes = async () => {
    const { data } = await supabase.from("clientes").select("id, codigo_erp, nombre_comercial").order("codigo_erp");
    setClientes(data ?? []);
  };

  const loadVendedores = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ["ventas", "coordinador"]);
    if (!roles?.length) return;
    const ids = roles.map(r => r.user_id);
    const { data: profs } = await supabase.from("profiles").select("id, nombre_completo, codigo_vendedor, activo").in("id", ids).eq("activo", true).order("nombre_completo");
    setVendedores(profs ?? []);
  };

  const load = async () => {
    const { data } = await supabase
      .from("remisiones")
      .select("*, clientes(codigo_erp, nombre_comercial), profiles:vendedor_id(nombre_completo), remision_items(id, modelo, color, cantidad, con_caja), motocarros(id, orden_armado, modelo, color, ns_chasis, chasis_asignado, estatus_armado, fecha_estimada_armado, fecha_real_armado, estatus_entrega, fecha_estimada_entrega, fecha_propuesta_entrega, propuesta_entrega_notas, confirmada_fabrica_at, confirmada_logistica_at)")
      .order("fecha_remision", { ascending: false, nullsFirst: false });
    setRows(data ?? []);
    const propios = (data ?? []).filter((r: any) => role === "admin" || role === "coordinador" || r.vendedor_id === user?.id);
    setRecentFolios(propios.slice(0, 5).map((r: any) => r.folio_remision));
  };

  useEffect(() => {
    load(); loadClientes(); loadVendedores();
  }, [user?.id, role]);

  useEffect(() => {
    if (user?.id) {
      supabase.from("profiles").select("nombre_completo").eq("id", user.id).single()
        .then(({ data }) => { if (data) setMyProfile(data); });
    }
  }, [user?.id]);

  const canCreate = role === "admin" || role === "ventas" || role === "coordinador";

  // ── Line item helpers ────────────────────────────────────────────────────────
  const addLinea = () => setLineas(l => [...l, defaultLinea()]);
  const removeLinea = (idx: number) => setLineas(l => l.filter((_, i) => i !== idx));
  const updateLinea = (idx: number, field: keyof LineaItem, value: any) =>
    setLineas(l => l.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  // ── Open dialog ─────────────────────────────────────────────────────────────
  const abrirNueva = () => {
    setForm((f: any) => ({
      ...f,
      folio_remision: suggestNextFolio(recentFolios),
      nombre_vendedor: role === "ventas" ? (myProfile?.nombre_completo || "") : "",
      tipo_remision: "cabina",
    }));
    setLineas([defaultLinea()]);
    setFormFile(null);
    setOpen(true);
  };

  const resetForm = () => {
    setForm({
      folio_remision: "",
      cliente_id: "",
      vendedor_asignado_id: "",
      nombre_vendedor: "",
      fecha_remision: new Date().toISOString().slice(0, 10),
      notas: "",
      tipo_pago: "anticipado",
      pagado: true,
      tipo_remision: "cabina",
    });
    setLineas([defaultLinea()]);
    setFormFile(null);
  };

  // ── Save nuevo cliente ───────────────────────────────────────────────────────
  const guardarNuevoCliente = async () => {
    if (!nuevoCliente.codigo_erp.trim()) return toast.error("El código ERP es obligatorio");
    const { data, error } = await supabase.from("clientes").insert(nuevoCliente).select("id, codigo_erp, nombre_comercial").single();
    if (error) return toast.error(error.message);
    toast.success("✓ Cliente creado");
    await loadClientes();
    setForm((f: any) => ({ ...f, cliente_id: data.id }));
    setNuevoCliente({ codigo_erp: "", nombre_comercial: "", telefono: "" });
    setCreandoCliente(false);
  };

  // ── Create remisión ──────────────────────────────────────────────────────────
  const crearRemision = async () => {
    if (!form.folio_remision || !form.cliente_id) {
      toast.error("Folio y cliente son obligatorios"); return;
    }
    if (recentFolios.includes(form.folio_remision.trim())) {
      toast.error("Ese folio ya existe en tus remisiones recientes"); return;
    }
    if (lineas.length === 0 || totalLineas === 0) {
      toast.error("Agrega al menos una línea con unidades"); return;
    }

    const vendedor_id = canAssignVendedor && form.vendedor_asignado_id
      ? form.vendedor_asignado_id
      : user?.id;

    const payload: any = {
      folio_remision: form.folio_remision.trim(),
      cliente_id: form.cliente_id,
      vendedor_id,
      nombre_vendedor: form.nombre_vendedor || null,
      fecha_remision: form.fecha_remision,
      notas: form.notas || null,
      tipo_pago: form.tipo_pago,
      pagado: form.tipo_pago === "anticipado",
      tipo_remision: form.tipo_remision,
      // Backward compat: first line's color as main color_solicitado
      color_solicitado: lineas[0]?.color || "BLANCO",
      total_unidades_solicitadas: totalLineas,
    };

    const { data: nueva, error } = await supabase.from("remisiones").insert(payload).select("id").single();
    if (error) return toast.error(error.message);

    // Insert line items
    if (nueva?.id && lineas.length > 0) {
      const items = lineas.map(l => ({
        remision_id: nueva.id,
        modelo: l.modelo,
        color: l.color,
        cantidad: Number(l.cantidad) || 1,
        con_caja: l.con_caja,
      }));
      const { error: itemsErr } = await supabase.from("remision_items").insert(items);
      if (itemsErr) console.error("Error al guardar líneas:", itemsErr.message);
    }

    // Upload document if any
    if (formFile && nueva?.id) {
      const path = `${nueva.id}/${Date.now()}_${formFile.name}`;
      const { error: upErr } = await supabase.storage.from("remisiones-docs").upload(path, formFile);
      if (!upErr) await supabase.from("remisiones").update({ documento_url: path }).eq("id", nueva.id);
    }

    toast.success(t.remisiones.creada);
    setOpen(false);
    resetForm();
    load();
  };

  // ── Assign chasis ────────────────────────────────────────────────────────────
  const asignarChasis = async (r: any) => {
    const items: any[] = r.remision_items || [];
    const motos: any[] = r.motocarros || [];

    if (!items.length) {
      // Fallback: assign by total remaining (old behavior)
      const cant = (r.total_unidades_solicitadas || 1) - motos.length;
      if (cant <= 0) { toast.info("Ya están todos los chasis asignados"); return; }
      const { data, error } = await supabase.rpc("asignar_chasis_remision", {
        _remision_id: r.id, _cantidad: cant, _color: r.color_solicitado || null
      });
      if (error) return toast.error(error.message);
      toast.success(`✓ ${data} chasis asignados`);
    } else {
      // Assign per line item, matching by color
      let totalAsignados = 0;
      for (const item of items) {
        const yaAsignados = motos.filter((m: any) =>
          (m.color || "").toUpperCase() === item.color.toUpperCase()
        ).length;
        const restantes = item.cantidad - yaAsignados;
        if (restantes <= 0) continue;
        const { data, error } = await supabase.rpc("asignar_chasis_remision", {
          _remision_id: r.id, _cantidad: restantes, _color: item.color
        });
        if (error) { console.error(`Error asignando ${item.color}:`, error.message); continue; }
        totalAsignados += (data || 0);
      }
      if (totalAsignados > 0) toast.success(`✓ ${totalAsignados} chasis asignados`);
      else toast.info("No hay unidades disponibles en inventario con los colores solicitados");
    }
    load();
  };

  // ── Upload PDF ───────────────────────────────────────────────────────────────
  const subirPdf = async (r: any, file: File) => {
    const path = `${r.id}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from("remisiones-docs").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    await supabase.from("remisiones").update({ documento_url: path }).eq("id", r.id);
    toast.success("✓ PDF subido"); load();
  };

  const verPdf = async (path: string) => {
    const { data } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  // ── Confirm pago ─────────────────────────────────────────────────────────────
  const confirmarPago = async () => {
    if (!pagoDialog) return;
    if (!comprobanteFile) { toast.error(t.pago.sinComprobante); return; }
    setSubiendoPago(true);
    const path = `${pagoDialog.id}/comprobante_${Date.now()}_${comprobanteFile.name}`;
    const { error: upErr } = await supabase.storage.from("remisiones-docs").upload(path, comprobanteFile);
    if (upErr) { setSubiendoPago(false); return toast.error(upErr.message); }
    const { error } = await supabase.from("remisiones").update({ pagado: true, comprobante_pago_url: path }).eq("id", pagoDialog.id);
    setSubiendoPago(false);
    if (error) return toast.error(error.message);
    toast.success(t.pago.confirmadoOk);
    setPagoDialog(null); setComprobanteFile(null); load();
  };

  const verComprobante = async (path: string) => {
    const { data } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>{t.remisiones.title}</h1>
          <p className="text-muted-foreground text-base mt-1">
            {t.remisiones.subtitle(rows.length)} {role === "ventas" ? "(solo las tuyas)" : ""}
          </p>
        </div>

        {canCreate && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) abrirNueva(); }}>
            <DialogTrigger asChild>
              <Button className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
                <Plus className="h-5 w-5 mr-2" /> {t.remisiones.nueva}
              </Button>
            </DialogTrigger>

            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t.remisiones.crearTitulo}</DialogTitle></DialogHeader>

              <div className="space-y-4">
                {/* Tipo de remisión */}
                <div>
                  <Label className="text-base">Tipo de remisión</Label>
                  <Select value={form.tipo_remision} onValueChange={v => setForm({ ...form, tipo_remision: v })}>
                    <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cabina">🏍️ Cabina (unidad)</SelectItem>
                      <SelectItem value="activacion">⚡ Activación</SelectItem>
                      <SelectItem value="flete">🚛 Flete</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.tipo_remision === "activacion" && (
                    <p className="text-xs text-amber-600 mt-1.5 bg-amber-50 rounded-md px-3 py-2 border border-amber-200">
                      ⚡ Documenta el servicio de activación (batería, gasolina, ajustes). Anota el folio de la cabina en las notas.
                    </p>
                  )}
                  {form.tipo_remision === "flete" && (
                    <p className="text-xs text-blue-600 mt-1.5 bg-blue-50 rounded-md px-3 py-2 border border-blue-200">
                      🚛 Documenta el costo de envío/flete. Anota el folio de la cabina en las notas.
                    </p>
                  )}
                </div>

                {/* Folio */}
                <div>
                  <Label className="text-base">{t.remisiones.folioRemision}</Label>
                  <Input
                    value={form.folio_remision}
                    onChange={e => setForm({ ...form, folio_remision: e.target.value })}
                    placeholder={t.remisiones.folioPlaceholder}
                    className="h-12 text-base font-mono"
                  />
                  {recentFolios.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-muted-foreground mb-1">Últimas remisiones:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {recentFolios.map(f => (
                          <button key={f} type="button"
                            onClick={() => setForm((s: any) => ({ ...s, folio_remision: suggestNextFolio([f]) }))}
                            className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-[#DBEAFE] text-xs font-mono text-[#1F3864] border">
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Cliente */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Cliente</Label>
                    <button type="button" onClick={() => setCreandoCliente(s => !s)}
                      className="inline-flex items-center gap-1 text-xs text-[#2E75B6] hover:underline font-medium">
                      <UserPlus className="h-3.5 w-3.5" /> {creandoCliente ? "Cancelar" : "Nuevo cliente"}
                    </button>
                  </div>
                  {!creandoCliente ? (
                    <Select value={form.cliente_id} onValueChange={v => setForm({ ...form, cliente_id: v })}>
                      <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                      <SelectContent>
                        {clientes.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.codigo_erp}{c.nombre_comercial ? ` — ${c.nombre_comercial}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="border-2 border-dashed border-[#2E75B6]/40 rounded-md p-3 space-y-2 bg-[#DBEAFE]/30">
                      <Input placeholder="Código ERP *" value={nuevoCliente.codigo_erp} onChange={e => setNuevoCliente({ ...nuevoCliente, codigo_erp: e.target.value })} className="h-11" />
                      <Input placeholder="Nombre comercial" value={nuevoCliente.nombre_comercial} onChange={e => setNuevoCliente({ ...nuevoCliente, nombre_comercial: e.target.value })} className="h-11" />
                      <Input placeholder="Teléfono" value={nuevoCliente.telefono} onChange={e => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} className="h-11" />
                      <Button type="button" onClick={guardarNuevoCliente} className="w-full h-11 bg-[#2E75B6] hover:bg-[#246094]">Guardar cliente</Button>
                    </div>
                  )}
                </div>

                {/* Vendedor — selector para admin/coordinador, campo de nombre para todos */}
                {canAssignVendedor && (
                  <div>
                    <Label className="text-base">Asignar a vendedor</Label>
                    <Select
                      value={form.vendedor_asignado_id}
                      onValueChange={v => {
                        const vend = vendedores.find(x => x.id === v);
                        setForm({ ...form, vendedor_asignado_id: v, nombre_vendedor: vend?.nombre_completo || form.nombre_vendedor });
                      }}
                    >
                      <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Vendedor (opcional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— Asignar a mí mismo —</SelectItem>
                        {vendedores.map(v => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.nombre_completo}{v.codigo_vendedor ? ` (${v.codigo_vendedor})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Nombre del vendedor — visible para TODOS */}
                <div>
                  <Label className="text-base">
                    Nombre del vendedor
                    {role === "ventas" && <span className="ml-1 text-xs text-muted-foreground font-normal">(tu nombre)</span>}
                  </Label>
                  <Input
                    value={form.nombre_vendedor}
                    onChange={e => setForm({ ...form, nombre_vendedor: e.target.value })}
                    placeholder="Nombre completo del vendedor responsable"
                    className="h-12 text-base"
                  />
                </div>

                {/* LINE ITEMS — modelos/colores/cantidades */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Motocarros solicitados</Label>
                    <span className="text-sm font-semibold text-[#1F3864]">Total: {totalLineas} unidades</span>
                  </div>

                  {lineas.map((linea, idx) => (
                    <div key={linea._key} className="border rounded-xl p-3 bg-slate-50 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Modelo</Label>
                          <Select value={linea.modelo} onValueChange={v => updateLinea(idx, "modelo", v)}>
                            <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {MODELOS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Color</Label>
                          <Select value={linea.color} onValueChange={v => updateLinea(idx, "color", v)}>
                            <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {COLORES.map(c => <SelectItem key={c} value={c}>{colorLabel(c)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="w-28">
                          <Label className="text-xs text-muted-foreground">Cantidad</Label>
                          <Input
                            type="number" min={1}
                            value={linea.cantidad}
                            onChange={e => updateLinea(idx, "cantidad", Math.max(1, parseInt(e.target.value) || 1))}
                            className="h-10 text-sm"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer pt-5 flex-1">
                          <input
                            type="checkbox"
                            checked={linea.con_caja}
                            onChange={e => updateLinea(idx, "con_caja", e.target.checked)}
                            className="w-4 h-4 accent-[#1F3864]"
                          />
                          <span className="text-sm font-medium flex items-center gap-1">
                            <Package size={14} className="text-[#1F3864]" /> Con caja de carga
                          </span>
                        </label>
                        {lineas.length > 1 && (
                          <button type="button" onClick={() => removeLinea(idx)} className="pt-5 text-red-400 hover:text-red-600" title="Quitar línea">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" onClick={addLinea} className="w-full h-10 border-dashed border-[#2E75B6]/50 text-[#2E75B6] hover:bg-[#DBEAFE]/30">
                    <Plus className="h-4 w-4 mr-2" /> Agregar otra configuración
                  </Button>
                </div>

                {/* Fecha */}
                <div>
                  <Label>Fecha</Label>
                  <Input type="date" value={form.fecha_remision} onChange={e => setForm({ ...form, fecha_remision: e.target.value })} className="h-12 text-base" />
                </div>

                {/* Tipo de pago */}
                <div>
                  <Label>{t.pago.tipo}</Label>
                  <Select value={form.tipo_pago} onValueChange={v => setForm({ ...form, tipo_pago: v, pagado: v === "anticipado" })}>
                    <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anticipado">{t.remisiones.anticipado}</SelectItem>
                      <SelectItem value="contra_entrega">{t.remisiones.contraEntrega}</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.tipo_pago === "contra_entrega" && (
                    <p className="text-xs text-amber-600 mt-1">⚠ Logística no podrá programar la entrega hasta que se confirme el pago.</p>
                  )}
                </div>

                {/* Notas */}
                <div>
                  <Label>Notas</Label>
                  <Input value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder={form.tipo_remision === "activacion" ? "Referencia el folio de venta, ej: REM-001" : ""} className="h-12 text-base" />
                </div>

                {/* Doc upload */}
                <div>
                  <Label>{t.remisiones.subirRemision}</Label>
                  <FileOrCamera value={formFile} onChange={setFormFile} label="Toma foto de la remisión física o sube el PDF" className="mt-1" />
                </div>
              </div>

              <DialogFooter>
                <Button onClick={crearRemision} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
                  {t.remisiones.crearBtn}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Card grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map(r => {
          const motos = r.motocarros ?? [];
          const items: any[] = r.remision_items ?? [];
          const asignadas = motos.length;
          const listas = motos.filter((m: any) => ["ARMADO","LISTO"].includes(m.estatus_armado)).length;
          const total = r.total_unidades_solicitadas || asignadas || 1;
          const pct = Math.round((listas / total) * 100);
          const pctColor = pct === 100 ? "#065F46" : pct >= 50 ? "#92400E" : "#991B1B";
          const isOwner = r.vendedor_id === user?.id;
          const canAssign = role === "admin" || role === "coordinador" || (role === "ventas" && isOwner);
          const canUpload = role === "admin" || role === "coordinador" || (role === "ventas" && isOwner);
          const canPropose = role === "admin" || role === "coordinador" || (role === "ventas" && isOwner);

          // Vendor display name: prefer nombre_vendedor, fallback to FK profile, fallback to notas
          const vendedorNombre = r.nombre_vendedor || r.profiles?.nombre_completo || (r.notas?.replace("Vendedor original: ", "")) || "—";
          const initials = vendedorNombre.split(" ").map((s: string) => s[0]).slice(0,2).join("").toUpperCase();

          return (
            <Card key={r.id} className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{t.fields.folio}</div>
                    {r.tipo_remision === "activacion" && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                        <Zap size={10} /> Activación
                      </span>
                    )}
                    {r.tipo_remision === "flete" && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                        🚛 Flete
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-[#1F3864] leading-tight">{r.folio_remision}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{fmtDate(r.fecha_remision)}</div>
                </div>
                <EstatusBadge estatus={r.estatus} size="md" />
              </div>

              {/* Badges: vendedor + cliente + pago */}
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#DBEAFE] text-[#1E40AF] text-xs font-medium">
                  <span className="w-5 h-5 rounded-full bg-[#2E75B6] text-white flex items-center justify-center text-[10px] font-bold shrink-0">{initials || "?"}</span>
                  {vendedorNombre.split(" ")[0]}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                  👤 {r.clientes?.codigo_erp || "—"}
                </span>
                {r.tipo_pago === "contra_entrega" && !r.pagado ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-semibold">
                    {t.pago.pendiente}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-semibold">
                    <DollarSign className="h-3 w-3" /> {r.tipo_pago === "contra_entrega" ? t.pago.contra_entrega : t.pago.anticipado}
                  </span>
                )}
              </div>

              {/* Line items summary */}
              {items.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {items.map((item: any) => (
                    <span key={item.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#1F3864]/5 text-[#1F3864] border border-[#1F3864]/15">
                      {item.cantidad}× {item.modelo} <span className="text-muted-foreground">{colorLabel(item.color)}</span>
                      {item.con_caja && <Package size={10} className="text-[#1F3864]" />}
                    </span>
                  ))}
                </div>
              )}

              {/* Progress */}
              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span>{listas} de {total} chasis listos</span>
                  <span style={{ color: pctColor }} className="font-bold">{pct}%</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: pctColor }} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">{asignadas} asignados de {total} solicitados</div>
              </div>

              {/* Moto list */}
              {motos.length > 0 && (
                <Collapsible open={!!expanded[r.id]} onOpenChange={(o) => setExpanded(s => ({ ...s, [r.id]: o }))}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 rounded-md bg-slate-50 hover:bg-slate-100 text-sm font-medium">
                    Ver chasis y entregas ({motos.length})
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded[r.id] ? "rotate-180" : ""}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2">
                    {motos.map((m: any) => (
                      <MotoRow key={m.id} m={m} canPropose={canPropose} role={role} onChange={load} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-auto pt-2 border-t flex-wrap">
                {canAssign && asignadas < total && (
                  <Button onClick={() => asignarChasis(r)} className="flex-1 h-12 bg-[#2E75B6] hover:bg-[#246094] text-base min-w-[100px]">
                    <Wand2 className="h-5 w-5 mr-2" /> Asignar
                  </Button>
                )}
                {r.documento_url ? (
                  <Button variant="outline" onClick={() => verPdf(r.documento_url)} className="flex-1 h-12 text-base min-w-[100px]">
                    <FileDown className="h-5 w-5 mr-2" /> Ver PDF
                  </Button>
                ) : canUpload ? (
                  <label className="flex-1 min-w-[100px]">
                    <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) subirPdf(r, f); }} />
                    <span className="flex items-center justify-center cursor-pointer h-12 rounded-md border-2 border-dashed border-[#2E75B6]/40 text-[#1F3864] font-medium hover:bg-[#DBEAFE] text-base">
                      <Upload className="h-5 w-5 mr-2" /> Subir PDF
                    </span>
                  </label>
                ) : (
                  <div className="flex-1 h-12 flex items-center justify-center text-muted-foreground text-sm min-w-[100px]">
                    <FileText className="h-5 w-5 mr-2 opacity-40" /> Sin PDF
                  </div>
                )}
                {r.tipo_pago === "contra_entrega" && !r.pagado && (role === "admin" || role === "coordinador" || (role === "ventas" && r.vendedor_id === user?.id)) && (
                  <Button onClick={() => { setPagoDialog(r); setComprobanteFile(null); }} className="flex-1 h-12 text-base bg-emerald-600 hover:bg-emerald-700 min-w-[100px]">
                    <DollarSign className="h-5 w-5 mr-2" /> {t.pago.confirmar}
                  </Button>
                )}
                {r.tipo_pago === "contra_entrega" && r.pagado && r.comprobante_pago_url && (
                  <Button variant="outline" onClick={() => verComprobante(r.comprobante_pago_url)} className="flex-1 h-12 text-base min-w-[100px]">
                    <FileDown className="h-5 w-5 mr-2" /> {t.pago.verComprobante}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
        {!rows.length && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">Sin remisiones</div>
        )}
      </div>

      {/* Dialog: confirmar pago */}
      <Dialog open={!!pagoDialog} onOpenChange={o => { if (!o) { setPagoDialog(null); setComprobanteFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t.pago.confirmar} — {pagoDialog?.folio_remision}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t.pago.confirmarDesc}</p>
            <FileOrCamera value={comprobanteFile} onChange={setComprobanteFile} label={t.pago.subirComprobante} />
            {comprobanteFile && <p className="text-xs text-emerald-600 font-medium text-center">{t.pago.archivoListo}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPagoDialog(null); setComprobanteFile(null); }}>{t.actions.cancel}</Button>
            <Button onClick={confirmarPago} disabled={!comprobanteFile || subiendoPago} className="bg-emerald-600 hover:bg-emerald-700">
              <DollarSign className="h-4 w-4 mr-2" />
              {subiendoPago ? t.actions.uploading : t.pago.confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MotoRow (sub-component) ──────────────────────────────────────────────────
function MotoRow({ m, canPropose, role, onChange }: { m: any; canPropose: boolean; role: string | null; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [fecha, setFecha] = useState<string>(m.fecha_propuesta_entrega || "");
  const [notas, setNotas] = useState<string>(m.propuesta_entrega_notas || "");

  const proponer = async () => {
    if (!fecha) return toast.error("Selecciona una fecha");
    const { error } = await supabase.rpc("proponer_fecha_entrega", { _motocarro_id: m.id, _fecha: fecha, _notas: notas || null });
    if (error) return toast.error(error.message);
    toast.success("✓ Fecha propuesta enviada a fábrica y logística");
    setEditing(false); onChange();
  };

  const confirmar = async (area: "fabrica" | "logistica") => {
    const { error } = await supabase.rpc("confirmar_fecha_entrega", { _motocarro_id: m.id, _area: area });
    if (error) return toast.error(error.message);
    toast.success(`✓ Confirmado por ${area}`); onChange();
  };

  const canConfirmFab = role === "admin" || role === "fabrica";
  const canConfirmLog = role === "admin" || role === "logistica";
  const tieneFab = !!m.confirmada_fabrica_at;
  const tieneLog = !!m.confirmada_logistica_at;

  return (
    <div className="rounded-md border bg-white text-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[#1F3864]">#{m.orden_armado}</span>
          <span className="text-xs font-mono text-muted-foreground truncate">{m.ns_chasis || m.chasis_asignado || "—"}</span>
        </div>
        <EstatusBadge estatus={m.estatus_entrega === "ENTREGADA" ? "ENTREGADA" : effEstatusArmado(m)} size="sm" />
      </div>
      <div className="px-3 pb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-muted-foreground">Estim. armado:</div>
        <div className="text-right font-medium">{fmtDate(m.fecha_estimada_armado)}</div>
        <div className="text-muted-foreground">Estim. entrega:</div>
        <div className="text-right font-medium">{fmtDate(m.fecha_estimada_entrega || m.fecha_propuesta_entrega)}</div>
      </div>

      {!editing ? (
        <div className="px-3 pb-3 flex flex-wrap items-center gap-2">
          {m.fecha_propuesta_entrega ? (
            <div className="flex-1 min-w-0 text-xs">
              <div className="font-medium text-[#1F3864] flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> Propuesta: {fmtDate(m.fecha_propuesta_entrega)}
              </div>
              {m.propuesta_entrega_notas && <div className="text-muted-foreground truncate">{m.propuesta_entrega_notas}</div>}
              <div className="flex gap-1.5 mt-1">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${tieneFab ? "bg-[#D1FAE5] text-[#065F46]" : "bg-slate-100 text-slate-500"}`}>
                  <Factory className="h-3 w-3" /> {tieneFab ? "Fábrica ✓" : "Fábrica pendiente"}
                </span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${tieneLog ? "bg-[#D1FAE5] text-[#065F46]" : "bg-slate-100 text-slate-500"}`}>
                  <Truck className="h-3 w-3" /> {tieneLog ? "Logística ✓" : "Logística pendiente"}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex-1 text-xs text-muted-foreground italic">Sin fecha propuesta con cliente</div>
          )}
          <div className="flex gap-1.5 ml-auto">
            {canPropose && m.estatus_entrega !== "ENTREGADA" && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditing(true)}>
                <CalendarClock className="h-3.5 w-3.5 mr-1" />{m.fecha_propuesta_entrega ? "Cambiar" : "Proponer"}
              </Button>
            )}
            {m.fecha_propuesta_entrega && canConfirmFab && !tieneFab && (
              <Button size="sm" className="h-8 text-xs bg-[#065F46] hover:bg-[#04432f]" onClick={() => confirmar("fabrica")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Confirmar fábrica
              </Button>
            )}
            {m.fecha_propuesta_entrega && canConfirmLog && !tieneLog && (
              <Button size="sm" className="h-8 text-xs bg-[#065F46] hover:bg-[#04432f]" onClick={() => confirmar("logistica")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Confirmar logística
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="px-3 pb-3 space-y-2 bg-[#DBEAFE]/30">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Fecha pactada con cliente</Label>
              <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Hora / contacto</Label>
              <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Ej: 10am, llamar al chofer" className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-9 bg-[#1F3864] hover:bg-[#162a4d]" onClick={proponer}>Enviar propuesta</Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
