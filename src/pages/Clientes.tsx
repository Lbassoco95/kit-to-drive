import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { cargarClientes, displayCliente } from "@/lib/catalogoClientes";
import { explicarError } from "@/lib/dazon";
import { Plus, Pencil, Search, Phone, MapPin, Bike, Truck, FileText, Upload, Eye, X, Archive, RotateCcw, MessageSquare, History, AlertTriangle, RefreshCw } from "lucide-react";

export default function Clientes() {
  const { perms, area, user } = useAuth();
  const { t } = useLang();
  const [rows, setRows] = useState<any[]>([]);
  const [motos, setMotos] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [expedienteOpen, setExpedienteOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState("datos");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<any>({
    codigo_erp: "", folio_interno: "", nombre_comercial: "", telefono: "", direccion: "", activo: true,
    razon_social: "", rfc: "", email: "", email_cobranza: "",
    nombre_contacto: "", cargo_contacto: "", telefono_contacto: "",
    calle: "", num_exterior: "", num_interior: "", colonia: "",
    municipio: "", estado: "", codigo_postal: "", pais: "México",
    limite_credito: "", dias_credito: 0, moneda_credito: "MXN",
    vendedor_id: null, notas: ""
  });
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<any | null>(null);
  const [archiveMotivo, setArchiveMotivo] = useState("");
  const [archiveMotivoSelect, setArchiveMotivoSelect] = useState("");
  const [reactivateConfirm, setReactivateConfirm] = useState<any | null>(null);
  const [reactivateMotivo, setReactivateMotivo] = useState("");
  const [reactivateMotivoSelect, setReactivateMotivoSelect] = useState("");
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [bitacora, setBitacora] = useState<any[]>([]);
  const [saveMotivoDialog, setSaveMotivoDialog] = useState(false);
  const [saveMotivoSelect, setSaveMotivoSelect] = useState("");
  const [saveMotivoOther, setSaveMotivoOther] = useState("");
  const [listTab, setListTab] = useState<"activos" | "archivados">("activos");
  /** Por qué no se pudo leer el catálogo. `null` = se leyó bien. */
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  /**
   * Carga la lista de clientes y, aparte, las estadísticas de unidades.
   *
   * Las unidades entregadas son un adorno de la tarjeta; los clientes son la
   * pantalla. Van en consultas separadas y sólo la del catálogo decide si se
   * avisa: antes las dos iban en un `Promise.all` que descartaba los dos
   * `error` y se quedaba con `data ?? []`, así que cualquier falla dejaba la
   * pantalla diciendo «Sin resultados» — lo mismo que se ve cuando de verdad
   * no hay clientes. Por eso el incidente se leyó como «se perdieron los
   * clientes».
   *
   * `degradado` no es una falla: la base va atrás pero los clientes se ven.
   * Eso se avisa en consola, no en la cara del usuario.
   */
  const load = async () => {
    setCargando(true);
    const [cat, stats] = await Promise.all([
      cargarClientes(),
      supabase.from("motocarros").select("id, estatus_entrega, remisiones!inner(cliente_id)"),
    ]);

    if (cat.error && !cat.degradado) {
      // La lista anterior no se borra: un error pasajero no debe dejar la
      // pantalla en blanco cuando ya había datos buenos en la mano.
      const aviso = explicarError(cat.error, t.clientes.errorCargar);
      setErrorCarga(aviso);
      toast.error(aviso);
    } else {
      setErrorCarga(null);
      setRows(cat.data ?? []);
      if (cat.degradado) console.warn("clientes leídos sin folio_interno:", cat.error?.message);
    }

    if (stats.error) console.warn("estadísticas de clientes no disponibles:", stats.error.message);
    setMotos(stats.data ?? []);
    setCargando(false);
  };
  useEffect(() => { load(); }, []);

  const loadComments = async (clienteId: string) => {
    const { data } = await supabase
      .from("clientes_comentarios")
      .select("*, profiles(nombre_completo)")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false });
    setComments(data || []);
  };

  const loadBitacora = async (clienteId: string) => {
    const { data } = await supabase
      .from("clientes_bitacora")
      .select("*, profiles(nombre_completo)")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false });
    setBitacora(data || []);
  };

  const stats = useMemo(() => {
    const m: Record<string, { total: number; entregados: number }> = {};
    motos.forEach((x: any) => {
      const cid = x.remisiones?.cliente_id;
      if (!cid) return;
      if (!m[cid]) m[cid] = { total: 0, entregados: 0 };
      m[cid].total++;
      if (x.estatus_entrega === "ENTREGADA") m[cid].entregados++;
    });
    return m;
  }, [motos]);

  const filtered = useMemo(() => {
    let base = rows;
    if (listTab === "activos") {
      base = rows.filter(c => c.activo !== false);
    } else {
      base = rows.filter(c => c.activo === false);
    }
    
    if (!q) return base;
    const qLower = q.toLowerCase();
    return base.filter(c => c && [c.codigo_erp, c.folio_interno, c.nombre_comercial, c.telefono].filter(Boolean).join(" ").toLowerCase().includes(qLower));
  }, [rows, q, listTab]);

  const canEdit = perms.puedeEditar("clientes");
  const canCreate = perms.puedeCrear("clientes");
  const canViewOnly = perms.puedeVer("clientes") && !perms.puedeCrear("clientes");
  const isOwnCliente = (c: any) => c.vendedor_id === user?.id;
  const canEditCliente = (c: any) => {
    if (canEdit) return true;
    if (perms.soloPropios("clientes") && isOwnCliente(c)) return true;
    return false;
  };

  const validateRFC = (rfc: string) => {
    const clean = rfc.toUpperCase().trim();
    return clean.length === 12 || clean.length === 13;
  };

  const generateFolioSugerido = () => {
    const year = new Date().getFullYear();
    const seq = String(rows.length + 1).padStart(3, '0');
    return `CLI-${year}-${seq}`;
  };

  const clienteCodigoDisplay = (c: any) => displayCliente(c);
  const clienteEsMigrado = (c: any) => !!c?.codigo_erp;

  const save = async () => {
    // Show motive dialog instead of direct save
    setSaveMotivoDialog(true);
  };

  const resetForm = () => {
    setForm({
      codigo_erp: "", folio_interno: "", nombre_comercial: "", telefono: "", direccion: "", activo: true,
      razon_social: "", rfc: "", email: "", email_cobranza: "",
      nombre_contacto: "", cargo_contacto: "", telefono_contacto: "",
      calle: "", num_exterior: "", num_interior: "", colonia: "",
      municipio: "", estado: "", codigo_postal: "", pais: "México",
      limite_credito: "", dias_credito: 0, moneda_credito: "MXN",
      vendedor_id: area === "comercial" ? user?.id : null,
      notas: ""
    });
  };

  const openExpediente = (cliente: any) => {
    setSelectedCliente(cliente);
    setForm({ ...cliente });
    setExpedienteOpen(true);
    setActiveTab("datos");
  };

  const uploadDocumento = async (file: File, tipo: string) => {
    if (!selectedCliente) return;
    setUploadingDoc(tipo);
    try {
      const fileName = `${selectedCliente.id}/${tipo}_${Date.now()}`;
      const { error: uploadError } = await supabase.storage
        .from("clientes-docs")
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from("clientes-docs")
        .getPublicUrl(fileName);
      
      const urlField = `doc_${tipo}_url` as keyof any;
      const { error: updateError } = await supabase
        .from("clientes")
        .update({ [urlField]: publicUrl } as any)
        .eq("id", selectedCliente.id);
      
      if (updateError) throw updateError;
      
      toast.success(t.clientes.documentoSubido);
      setSelectedCliente(prev => ({ ...prev, [urlField]: publicUrl }));
      load();
    } catch (error: any) {
      toast.error(t.clientes.errorSubir + ": " + error.message);
    } finally {
      setUploadingDoc(null);
    }
  };

  const viewDocumento = (url: string) => {
    window.open(url, '_blank');
  };

  const archiveCliente = async (cliente: any) => {
    if (!archiveMotivoSelect) {
      toast.error(t.clientes.faltaMotivo);
      return;
    }
    
    const motivoFinal = archiveMotivoSelect === "Otro" ? archiveMotivo : archiveMotivoSelect;
    if (!motivoFinal || motivoFinal.trim().length < 3) {
      toast.error(t.clientes.motivoCorto);
      return;
    }

    // Get current data for audit
    const { data: currentData } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", cliente.id)
      .single();

    // Update cliente
    const { error: updateError } = await supabase
      .from("clientes")
      .update({ activo: false })
      .eq("id", cliente.id);

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    // Insert bitacora
    await supabase
      .from("clientes_bitacora")
      .insert({
        cliente_id: cliente.id,
        usuario_id: user?.id,
        tipo_cambio: "archivo",
        motivo: motivoFinal,
        datos_anteriores: currentData,
        datos_nuevos: { ...currentData, activo: false },
      });

    toast.success(t.clientes.archivado);
    setArchiveConfirm(null);
    setArchiveMotivo("");
    setArchiveMotivoSelect("");
    load();
  };

  const reactivateCliente = async (cliente: any) => {
    if (!reactivateMotivoSelect) {
      toast.error(t.clientes.faltaMotivo);
      return;
    }
    
    const motivoFinal = reactivateMotivoSelect === "Otro" ? reactivateMotivo : reactivateMotivoSelect;
    if (!motivoFinal || motivoFinal.trim().length < 3) {
      toast.error(t.clientes.motivoCorto);
      return;
    }

    // Get current data for audit
    const { data: currentData } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", cliente.id)
      .single();

    // Update cliente
    const { error: updateError } = await supabase
      .from("clientes")
      .update({ activo: true })
      .eq("id", cliente.id);

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    // Insert bitacora
    await supabase
      .from("clientes_bitacora")
      .insert({
        cliente_id: cliente.id,
        usuario_id: user?.id,
        tipo_cambio: "reactivacion",
        motivo: motivoFinal,
        datos_anteriores: currentData,
        datos_nuevos: { ...currentData, activo: true },
      });

    toast.success(t.clientes.reactivado);
    setReactivateConfirm(null);
    setReactivateMotivo("");
    setReactivateMotivoSelect("");
    load();
  };

  const addComment = async (clienteId: string) => {
    if (!newComment.trim()) {
      toast.error(t.clientes.comentarioVacio);
      return;
    }

    const { error } = await supabase
      .from("clientes_comentarios")
      .insert({
        cliente_id: clienteId,
        usuario_id: user?.id,
        comentario: newComment.trim(),
      });

    if (error) {
      toast.error(error.message);
      return;
    }

    // Insert bitacora
    await supabase
      .from("clientes_bitacora")
      .insert({
        cliente_id: clienteId,
        usuario_id: user?.id,
        tipo_cambio: "comentario",
        motivo: "Comentario agregado",
      });

    toast.success("Comentario agregado");
    setNewComment("");
    loadComments(clienteId);
  };

  const saveWithMotivo = async () => {
    if (!saveMotivoSelect) {
      toast.error(t.clientes.faltaMotivo);
      return;
    }
    
    const motivoFinal = saveMotivoSelect === "Otro" ? saveMotivoOther : saveMotivoSelect;
    if (!motivoFinal || motivoFinal.trim().length < 3) {
      toast.error(t.clientes.motivoCorto);
      return;
    }

    if (form.rfc && !validateRFC(form.rfc)) {
      return toast.error(t.clientes.rfcInvalido);
    }
    
    const payload = { ...form };
    if (payload.limite_credito) payload.limite_credito = parseFloat(payload.limite_credito);
    else delete payload.limite_credito;
    if (!payload.codigo_erp?.trim()) payload.codigo_erp = null;
    if (!payload.folio_interno?.trim()) payload.folio_interno = null;

    if (editing) {
      // Get current data for audit
      const { data: currentData } = await supabase
        .from("clientes")
        .select("*")
        .eq("id", editing.id)
        .single();

      const { error } = await supabase.from("clientes").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);

      // Insert bitacora
      await supabase
        .from("clientes_bitacora")
        .insert({
          cliente_id: editing.id,
          usuario_id: user?.id,
          tipo_cambio: "edicion",
          motivo: motivoFinal,
          datos_anteriores: currentData,
          datos_nuevos: payload,
        });

      toast.success(t.clientes.actualizado);
      setEditing(null);
    } else {
      const { data: created, error } = await supabase.from("clientes").insert(payload).select("*").single();
      if (error) return toast.error(error.message);

      await supabase.from("clientes_bitacora").insert({
        cliente_id: created.id,
        usuario_id: user?.id,
        tipo_cambio: "alta",
        motivo: motivoFinal,
        datos_nuevos: created,
      });

      toast.success(t.clientes.creado);
      setCreating(false);
    }
    
    setSaveMotivoDialog(false);
    setSaveMotivoSelect("");
    setSaveMotivoOther("");
    resetForm();
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div><h1>{t.clientes.title}</h1><p className="text-base text-muted-foreground mt-1">{t.clientes.subtitle(filtered.length, rows.length)}</p></div>
        {canCreate && (
          <Button onClick={() => { resetForm(); setCreating(true); }}
            className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2"/> {t.clientes.nuevo}
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input className="pl-10 h-12 text-base" placeholder={t.clientes.buscar} value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Tabs value={listTab} onValueChange={(v) => setListTab(v as "activos" | "archivados")} className="flex-1">
            <TabsList className="grid w-full grid-cols-2 h-12">
              <TabsTrigger value="activos">Activos</TabsTrigger>
              <TabsTrigger value="archivados">Archivados</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Card>

      {/*
        Cuando el catálogo no se pudo leer, la pantalla lo dice. Antes salía
        «Sin resultados», que es lo mismo que se ve cuando de verdad no hay
        clientes: por eso el incidente se leyó como «se perdieron los
        clientes» en lugar de «falta correr un script».
      */}
      {errorCarga && (
        <Card className="p-4 border-red-300 bg-red-50">
          <div className="flex items-start gap-3 flex-wrap">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-[16rem]">
              <div className="font-semibold text-red-800">{t.clientes.errorCargar}</div>
              <div className="text-sm text-red-700 mt-1 break-words">{errorCarga}</div>
            </div>
            <Button variant="outline" size="sm" className="h-10 shrink-0" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" /> {t.clientes.reintentar}
            </Button>
          </div>
        </Card>
      )}

      <div className="responsive-card-grid gap-4">
        {filtered.map(c => {
          const s = stats[c.id] || { total: 0, entregados: 0 };
          const activos = s.total - s.entregados;
          const isArchived = c.activo === false;
          return (
            <Card key={c.id} className={`p-5 hover:shadow-md transition-shadow flex flex-col gap-3 ${isArchived ? "bg-slate-50 opacity-75" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`bg-[#1F3864] ${isArchived ? "bg-slate-500" : ""}`}>{clienteCodigoDisplay(c)}</Badge>
                    {clienteEsMigrado(c) && <Badge variant="outline" className="text-xs">ERP</Badge>}
                    {isArchived && <Badge variant="outline" className="text-xs">Archivado</Badge>}
                  </div>
                  <div className="text-lg font-bold text-[#1F3864] truncate">{c.nombre_comercial || <em>{t.clientes.sinNombre}</em>}</div>
                  {c.razon_social && <div className="text-sm text-muted-foreground truncate">{c.razon_social}</div>}
                  {c.rfc && <div className="text-xs text-muted-foreground mt-0.5">RFC: {c.rfc}</div>}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openExpediente(c)} className="h-9 w-9" title={t.clientes.verExpediente}>
                    <FileText className="h-4 w-4" />
                  </Button>
                  {canEditCliente(c) && (
                    <Button size="icon" variant="ghost" onClick={() => { setForm(c); setEditing(c); }} className="h-9 w-9">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {perms.puedeEliminar("clientes") && !isArchived && (
                    <Button size="icon" variant="ghost" onClick={() => setArchiveConfirm(c)} className="h-9 w-9 text-amber-600 hover:text-amber-700" title={t.clientes.archivarCliente}>
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                  {isArchived && (
                    <Button size="icon" variant="ghost" onClick={() => setReactivateConfirm(c)} className="h-9 w-9 text-green-600 hover:text-green-700" title={t.clientes.reactivarCliente}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone size={16}/> <span>{c.telefono || "—"}</span>
                </div>
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin size={16} className="mt-0.5 shrink-0"/> <span className="line-clamp-2">{c.direccion || "—"}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-auto pt-3 border-t">
                <div className="text-center p-2 rounded-md bg-[#DBEAFE]">
                  <Bike className="mx-auto mb-1 text-[#1E40AF]" size={20}/>
                  <div className="text-xl font-bold text-[#1E40AF]">{activos}</div>
                  <div className="text-[11px] text-[#1E40AF] font-medium">{t.clientes.activos}</div>
                </div>
                <div className="text-center p-2 rounded-md bg-[#EDE9FE]">
                  <Truck className="mx-auto mb-1 text-[#5B21B6]" size={20}/>
                  <div className="text-xl font-bold text-[#5B21B6]">{s.entregados}</div>
                  <div className="text-[11px] text-[#5B21B6] font-medium">{t.clientes.entregados}</div>
                </div>
              </div>
            </Card>
          );
        })}
        {!filtered.length && !errorCarga && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">
            {cargando ? t.clientes.cargando : t.clientes.sinResultados}
          </div>
        )}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t.clientes.editar : t.clientes.nuevo}</DialogTitle></DialogHeader>
          <Tabs defaultValue="datos" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="datos">{t.clientes.datosGenerales}</TabsTrigger>
              <TabsTrigger value="direccion">{t.clientes.direccionFiscal}</TabsTrigger>
              <TabsTrigger value="credito">{t.clientes.credito}</TabsTrigger>
              {editing && <TabsTrigger value="comentarios">Comentarios</TabsTrigger>}
              {editing && <TabsTrigger value="bitacora">{t.clientes.bitacora}</TabsTrigger>}
            </TabsList>
            <TabsContent value="datos" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t.clientes.codigoErp} <span className="text-muted-foreground font-normal">({t.clientes.opcional})</span></Label>
                  <Input value={form.codigo_erp} onChange={e => setForm({ ...form, codigo_erp: e.target.value })} placeholder={t.clientes.codigoErpMigrado} />
                </div>
                <div>
                  <Label>{t.clientes.folioInterno}</Label>
                  <Input value={form.folio_interno || ""} disabled placeholder={editing ? "" : t.clientes.folioInternoAuto} />
                </div>
              </div>
              <div><Label>{t.clientes.nombreComercial}</Label><Input value={form.nombre_comercial || ""} onChange={e => setForm({ ...form, nombre_comercial: e.target.value })} /></div>
              <div><Label>{t.clientes.razonSocial}</Label><Input value={form.razon_social || ""} onChange={e => setForm({ ...form, razon_social: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t.clientes.email}</Label><Input type="email" value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>{t.clientes.emailCobranza}</Label><Input type="email" value={form.email_cobranza || ""} onChange={e => setForm({ ...form, email_cobranza: e.target.value })} /></div>
              </div>
              <div><Label>{t.clientes.telefono}</Label><Input value={form.telefono || ""} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t.clientes.nombreContacto}</Label><Input value={form.nombre_contacto || ""} onChange={e => setForm({ ...form, nombre_contacto: e.target.value })} /></div>
                <div><Label>{t.clientes.cargoContacto}</Label><Input value={form.cargo_contacto || ""} onChange={e => setForm({ ...form, cargo_contacto: e.target.value })} /></div>
              </div>
              <div><Label>{t.clientes.telefonoContacto}</Label><Input value={form.telefono_contacto || ""} onChange={e => setForm({ ...form, telefono_contacto: e.target.value })} /></div>
            </TabsContent>
            <TabsContent value="direccion" className="space-y-3 mt-4">
              <div><Label>{t.clientes.calle}</Label><Input value={form.calle || ""} onChange={e => setForm({ ...form, calle: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t.clientes.numExterior}</Label><Input value={form.num_exterior || ""} onChange={e => setForm({ ...form, num_exterior: e.target.value })} /></div>
                <div><Label>{t.clientes.numInterior}</Label><Input value={form.num_interior || ""} onChange={e => setForm({ ...form, num_interior: e.target.value })} /></div>
              </div>
              <div><Label>{t.clientes.colonia}</Label><Input value={form.colonia || ""} onChange={e => setForm({ ...form, colonia: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t.clientes.municipio}</Label><Input value={form.municipio || ""} onChange={e => setForm({ ...form, municipio: e.target.value })} /></div>
                <div><Label>{t.clientes.estado}</Label><Input value={form.estado || ""} onChange={e => setForm({ ...form, estado: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t.clientes.codigoPostal}</Label><Input value={form.codigo_postal || ""} onChange={e => setForm({ ...form, codigo_postal: e.target.value })} /></div>
                <div><Label>{t.clientes.pais}</Label><Input value={form.pais || t.clientes.paisDefault} onChange={e => setForm({ ...form, pais: e.target.value })} /></div>
              </div>
              <div><Label>{t.clientes.direccion}</Label><Input value={form.direccion || ""} onChange={e => setForm({ ...form, direccion: e.target.value })} placeholder="Dirección de entrega (diferente a fiscal)" /></div>
            </TabsContent>
            <TabsContent value="credito" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t.clientes.limiteCredito}</Label><Input type="number" step="0.01" value={form.limite_credito || ""} onChange={e => setForm({ ...form, limite_credito: e.target.value })} /></div>
                <div><Label>{t.clientes.diasCredito}</Label><Input type="number" value={form.dias_credito || 0} onChange={e => setForm({ ...form, dias_credito: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div><Label>{t.clientes.monedaCredito}</Label><Input value={form.moneda_credito || "MXN"} onChange={e => setForm({ ...form, moneda_credito: e.target.value })} /></div>
              <div><Label>{t.clientes.notas}</Label><Input value={form.notas || ""} onChange={e => setForm({ ...form, notas: e.target.value })} /></div>
            </TabsContent>
            {editing && (
              <TabsContent value="comentarios" className="space-y-3 mt-4">
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {comments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t.clientes.sinComentarios}</p>}
                  {comments.map((comment: any) => (
                    <div key={comment.id} className="bg-slate-50 p-3 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-full bg-[#1F3864] text-white flex items-center justify-center text-sm font-bold">
                          {comment.profiles?.nombre_completo?.charAt(0) || "U"}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{comment.profiles?.nombre_completo || t.clientes.usuario}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(comment.created_at).toLocaleDateString()} {new Date(comment.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm">{comment.comentario}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={t.clientes.agregarComentario}
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyPress={e => { if (e.key === 'Enter') addComment(editing.id); }}
                  />
                  <Button onClick={() => addComment(editing.id)} size="icon">
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>
            )}
            {editing && (
              <TabsContent value="bitacora" className="space-y-3 mt-4">
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {bitacora.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t.clientes.sinCambios}</p>}
                  {bitacora.map((entry: any) => {
                    const iconMap: Record<string, any> = {
                      edicion: <Pencil className="h-4 w-4" />,
                      archivo: <Archive className="h-4 w-4" />,
                      reactivacion: <RotateCcw className="h-4 w-4" />,
                      comentario: <MessageSquare className="h-4 w-4" />,
                    };
                    return (
                      <div key={entry.id} className="bg-slate-50 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-[#1F3864]">{iconMap[entry.tipo_cambio] || <History className="h-4 w-4" />}</div>
                          <div>
                            <div className="text-sm font-medium">{entry.profiles?.nombre_completo || t.clientes.usuario}</div>
                            <div className="text-xs text-muted-foreground">
                              {entry.tipo_cambio} • {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                          </div>
                        </div>
                        <p className="text-sm">{entry.motivo}</p>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            )}
          </Tabs>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setCreating(false); setEditing(null); resetForm(); }}>{t.clientes.cancelar}</Button>
            <Button onClick={save} className="h-12 px-5 text-base">{t.clientes.guardar}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={expedienteOpen} onOpenChange={(o) => { if (!o) { setExpedienteOpen(false); setSelectedCliente(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.clientes.expediente} — {clienteCodigoDisplay(selectedCliente)}</DialogTitle>
          </DialogHeader>
          {selectedCliente && (
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); if (v === "comentarios") loadComments(selectedCliente.id); if (v === "bitacora") loadBitacora(selectedCliente.id); }} className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="datos">{t.clientes.datosGenerales}</TabsTrigger>
                <TabsTrigger value="direccion">{t.clientes.direccionFiscal}</TabsTrigger>
                <TabsTrigger value="credito">{t.clientes.credito}</TabsTrigger>
                <TabsTrigger value="documentos">{t.clientes.documentos}</TabsTrigger>
                <TabsTrigger value="comentarios">Comentarios</TabsTrigger>
                <TabsTrigger value="bitacora">{t.clientes.bitacora}</TabsTrigger>
              </TabsList>
              <TabsContent value="datos" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t.clientes.folioInterno}</Label><Input value={selectedCliente.folio_interno || "—"} disabled /></div>
                  <div><Label>{t.clientes.codigoErp}</Label><Input value={selectedCliente.codigo_erp || "—"} disabled /></div>
                </div>
                <div><Label>{t.clientes.rfc}</Label><Input value={selectedCliente.rfc || ""} disabled /></div>
                <div><Label>{t.clientes.nombreComercial}</Label><Input value={selectedCliente.nombre_comercial || ""} disabled /></div>
                <div><Label>{t.clientes.razonSocial}</Label><Input value={selectedCliente.razon_social || ""} disabled /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t.clientes.email}</Label><Input value={selectedCliente.email || ""} disabled /></div>
                  <div><Label>{t.clientes.emailCobranza}</Label><Input value={selectedCliente.email_cobranza || ""} disabled /></div>
                </div>
                <div><Label>{t.clientes.telefono}</Label><Input value={selectedCliente.telefono || ""} disabled /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t.clientes.nombreContacto}</Label><Input value={selectedCliente.nombre_contacto || ""} disabled /></div>
                  <div><Label>{t.clientes.cargoContacto}</Label><Input value={selectedCliente.cargo_contacto || ""} disabled /></div>
                </div>
                <div><Label>{t.clientes.telefonoContacto}</Label><Input value={selectedCliente.telefono_contacto || ""} disabled /></div>
              </TabsContent>
              <TabsContent value="direccion" className="space-y-3 mt-4">
                <div><Label>{t.clientes.calle}</Label><Input value={selectedCliente.calle || ""} disabled /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t.clientes.numExterior}</Label><Input value={selectedCliente.num_exterior || ""} disabled /></div>
                  <div><Label>{t.clientes.numInterior}</Label><Input value={selectedCliente.num_interior || ""} disabled /></div>
                </div>
                <div><Label>{t.clientes.colonia}</Label><Input value={selectedCliente.colonia || ""} disabled /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t.clientes.municipio}</Label><Input value={selectedCliente.municipio || ""} disabled /></div>
                  <div><Label>{t.clientes.estado}</Label><Input value={selectedCliente.estado || ""} disabled /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t.clientes.codigoPostal}</Label><Input value={selectedCliente.codigo_postal || ""} disabled /></div>
                  <div><Label>{t.clientes.pais}</Label><Input value={selectedCliente.pais || ""} disabled /></div>
                </div>
              </TabsContent>
              <TabsContent value="credito" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t.clientes.limiteCredito}</Label><Input value={selectedCliente.limite_credito || ""} disabled /></div>
                  <div><Label>{t.clientes.diasCredito}</Label><Input value={selectedCliente.dias_credito || 0} disabled /></div>
                </div>
                <div><Label>{t.clientes.monedaCredito}</Label><Input value={selectedCliente.moneda_credito || ""} disabled /></div>
                <div><Label>{t.clientes.notas}</Label><Input value={selectedCliente.notas || ""} disabled /></div>
              </TabsContent>
              <TabsContent value="documentos" className="space-y-4 mt-4">
                {[
                  { key: 'constancia_sf', label: t.clientes.csfDoc },
                  { key: 'comprobante_domicilio', label: t.clientes.compDomicilio },
                  { key: 'ine_representante', label: t.clientes.ineRep },
                  { key: 'acta_constitutiva', label: t.clientes.actaConstitutiva },
                  { key: 'poder_notarial', label: t.clientes.poderNotarial },
                ].map(doc => {
                  const url = selectedCliente[`doc_${doc.key}_url`];
                  return (
                    <div key={doc.key} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{doc.label}</div>
                        {url && <div className="text-xs text-muted-foreground truncate">{url}</div>}
                      </div>
                      <div className="flex gap-2">
                        {url && (
                          <Button size="sm" variant="outline" onClick={() => viewDocumento(url)}>
                            <Eye className="h-4 w-4 mr-1" /> {t.clientes.verDocumento}
                          </Button>
                        )}
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadDocumento(file, doc.key);
                            }}
                            disabled={!!uploadingDoc}
                          />
                          <Button size="sm" disabled={!!uploadingDoc} asChild>
                            <span>
                              {uploadingDoc === doc.key ? (
                                <span><Upload className="h-4 w-4 mr-1 animate-spin" /> {t.clientes.subiendo}</span>
                              ) : url ? (
                                <span><Upload className="h-4 w-4 mr-1" /> {t.clientes.reemplazar}</span>
                              ) : (
                                <span><Upload className="h-4 w-4 mr-1" /> {t.clientes.subir}</span>
                              )}
                            </span>
                          </Button>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>
              <TabsContent value="comentarios" className="space-y-3 mt-4">
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {comments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t.clientes.sinComentarios}</p>}
                  {comments.map((comment: any) => (
                    <div key={comment.id} className="bg-slate-50 p-3 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-full bg-[#1F3864] text-white flex items-center justify-center text-sm font-bold">
                          {comment.profiles?.nombre_completo?.charAt(0) || "U"}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{comment.profiles?.nombre_completo || t.clientes.usuario}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(comment.created_at).toLocaleDateString()} {new Date(comment.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm">{comment.comentario}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={t.clientes.agregarComentario}
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyPress={e => { if (e.key === 'Enter') addComment(selectedCliente.id); }}
                  />
                  <Button onClick={() => addComment(selectedCliente.id)} size="icon">
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="bitacora" className="space-y-3 mt-4">
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {bitacora.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">{t.clientes.sinCambios}</p>}
                  {bitacora.map((entry: any) => {
                    const iconMap: Record<string, any> = {
                      edicion: <Pencil className="h-4 w-4" />,
                      archivo: <Archive className="h-4 w-4" />,
                      reactivacion: <RotateCcw className="h-4 w-4" />,
                      comentario: <MessageSquare className="h-4 w-4" />,
                    };
                    return (
                      <div key={entry.id} className="bg-slate-50 p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-[#1F3864]">{iconMap[entry.tipo_cambio] || <History className="h-4 w-4" />}</div>
                          <div>
                            <div className="text-sm font-medium">{entry.profiles?.nombre_completo || t.clientes.usuario}</div>
                            <div className="text-xs text-muted-foreground">
                              {entry.tipo_cambio} • {new Date(entry.created_at).toLocaleDateString()} {new Date(entry.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                          </div>
                        </div>
                        <p className="text-sm">{entry.motivo}</p>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
              <TabsContent value="documentos" className="space-y-4 mt-4">
                {[
                  { key: 'constancia_sf', label: t.clientes.csfDoc },
                  { key: 'comprobante_domicilio', label: t.clientes.compDomicilio },
                  { key: 'ine_representante', label: t.clientes.ineRep },
                  { key: 'acta_constitutiva', label: t.clientes.actaConstitutiva },
                  { key: 'poder_notarial', label: t.clientes.poderNotarial },
                ].map(doc => {
                  const url = selectedCliente[`doc_${doc.key}_url`];
                  return (
                    <div key={doc.key} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{doc.label}</div>
                        {url && <div className="text-xs text-muted-foreground truncate">{url}</div>}
                      </div>
                      <div className="flex gap-2">
                        {url && (
                          <Button size="sm" variant="outline" onClick={() => viewDocumento(url)}>
                            <Eye className="h-4 w-4 mr-1" /> {t.clientes.verDocumento}
                          </Button>
                        )}
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadDocumento(file, doc.key);
                            }}
                            disabled={!!uploadingDoc}
                          />
                          <Button size="sm" disabled={!!uploadingDoc} asChild>
                            <span>
                              {uploadingDoc === doc.key ? (
                                <span><Upload className="h-4 w-4 mr-1 animate-spin" /> {t.clientes.subiendo}</span>
                              ) : url ? (
                                <span><Upload className="h-4 w-4 mr-1" /> {t.clientes.reemplazar}</span>
                              ) : (
                                <span><Upload className="h-4 w-4 mr-1" /> {t.clientes.subir}</span>
                              )}
                            </span>
                          </Button>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Archive dialog */}
      <Dialog open={!!archiveConfirm} onOpenChange={(o) => { if (!o) { setArchiveConfirm(null); setArchiveMotivo(""); setArchiveMotivoSelect(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.clientes.archivarTitulo(archiveConfirm?.nombre_comercial ?? "")}</DialogTitle>
            <DialogDescription>{t.clientes.archivarDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t.clientes.motivoArchivo}</Label>
              <Select value={archiveMotivoSelect} onValueChange={setArchiveMotivoSelect}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder={t.clientes.seleccionarMotivo} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cliente inactivo / sin operaciones">{t.clientes.motivo("Cliente inactivo / sin operaciones")}</SelectItem>
                  <SelectItem value="Duplicado">{t.clientes.motivo("Duplicado")}</SelectItem>
                  <SelectItem value="Solicitud del cliente">{t.clientes.motivo("Solicitud del cliente")}</SelectItem>
                  <SelectItem value="Datos incorrectos">{t.clientes.motivo("Datos incorrectos")}</SelectItem>
                  <SelectItem value="Otro">{t.clientes.motivo("Otro")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {archiveMotivoSelect === "Otro" && (
              <div>
                <Label>{t.clientes.especificarMotivo}</Label>
                <Textarea
                  className="mt-2"
                  placeholder={t.clientes.especificarPlaceholder}
                  value={archiveMotivo}
                  onChange={e => setArchiveMotivo(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setArchiveConfirm(null); setArchiveMotivo(""); setArchiveMotivoSelect(""); }}>{t.actions.cancel}</Button>
            <Button onClick={() => archiveCliente(archiveConfirm)} className="bg-amber-600 hover:bg-amber-700">{t.clientes.archivar}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate dialog */}
      <Dialog open={!!reactivateConfirm} onOpenChange={(o) => { if (!o) { setReactivateConfirm(null); setReactivateMotivo(""); setReactivateMotivoSelect(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.clientes.reactivarTitulo(reactivateConfirm?.nombre_comercial ?? "")}</DialogTitle>
            <DialogDescription>{t.clientes.reactivarDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t.clientes.motivoReactivacion}</Label>
              <Select value={reactivateMotivoSelect} onValueChange={setReactivateMotivoSelect}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder={t.clientes.seleccionarMotivo} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cliente reactivado">{t.clientes.motivo("Cliente reactivado")}</SelectItem>
                  <SelectItem value="Nueva operación">{t.clientes.motivo("Nueva operación")}</SelectItem>
                  <SelectItem value="Error en archivo">{t.clientes.motivo("Error en archivo")}</SelectItem>
                  <SelectItem value="Solicitud del cliente">{t.clientes.motivo("Solicitud del cliente")}</SelectItem>
                  <SelectItem value="Otro">{t.clientes.motivo("Otro")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {reactivateMotivoSelect === "Otro" && (
              <div>
                <Label>{t.clientes.especificarMotivo}</Label>
                <Textarea
                  className="mt-2"
                  placeholder={t.clientes.especificarPlaceholder}
                  value={reactivateMotivo}
                  onChange={e => setReactivateMotivo(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReactivateConfirm(null); setReactivateMotivo(""); setReactivateMotivoSelect(""); }}>{t.actions.cancel}</Button>
            <Button onClick={() => reactivateCliente(reactivateConfirm)} className="bg-green-600 hover:bg-green-700">{t.clientes.reactivar}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save with motive dialog */}
      <Dialog open={saveMotivoDialog} onOpenChange={(o) => { if (!o) { setSaveMotivoDialog(false); setSaveMotivoSelect(""); setSaveMotivoOther(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.clientes.motivoCambio}</DialogTitle>
            <DialogDescription>{t.clientes.motivoCambioDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t.clientes.motivoReq}</Label>
              <Select value={saveMotivoSelect} onValueChange={setSaveMotivoSelect}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder={t.clientes.seleccionarMotivo} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Actualización de datos">{t.clientes.motivo("Actualización de datos")}</SelectItem>
                  <SelectItem value="Corrección de datos">{t.clientes.motivo("Corrección de datos")}</SelectItem>
                  <SelectItem value="Información de contacto">{t.clientes.motivo("Información de contacto")}</SelectItem>
                  <SelectItem value="Cambio de dirección">{t.clientes.motivo("Cambio de dirección")}</SelectItem>
                  <SelectItem value="Otro">{t.clientes.motivo("Otro")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {saveMotivoSelect === "Otro" && (
              <div>
                <Label>{t.clientes.especificarMotivo}</Label>
                <Textarea
                  className="mt-2"
                  placeholder={t.clientes.especificarPlaceholder}
                  value={saveMotivoOther}
                  onChange={e => setSaveMotivoOther(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSaveMotivoDialog(false); setSaveMotivoSelect(""); setSaveMotivoOther(""); }}>{t.actions.cancel}</Button>
            <Button onClick={saveWithMotivo}>{t.clientes.guardarCambios}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
