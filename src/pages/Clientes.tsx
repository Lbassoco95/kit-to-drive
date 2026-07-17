import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { Plus, Pencil, Search, Phone, MapPin, Bike, Truck, FileText, Upload, Eye, X } from "lucide-react";

export default function Clientes() {
  const { role, user } = useAuth();
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
    codigo_erp: "", nombre_comercial: "", telefono: "", direccion: "", activo: true,
    razon_social: "", rfc: "", email: "", email_cobranza: "",
    nombre_contacto: "", cargo_contacto: "", telefono_contacto: "",
    calle: "", num_exterior: "", num_interior: "", colonia: "",
    municipio: "", estado: "", codigo_postal: "", pais: "México",
    limite_credito: "", dias_credito: 0, moneda_credito: "MXN",
    vendedor_id: null, notas: ""
  });
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const load = async () => {
    const [{ data: cs }, { data: ms }] = await Promise.all([
      supabase.from("clientes").select("*").order("codigo_erp"),
      supabase.from("motocarros").select("id, estatus_entrega, remisiones!inner(cliente_id)"),
    ]);
    setRows(cs ?? []); setMotos(ms ?? []);
  };
  useEffect(() => { load(); }, []);

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
    if (!q) return rows;
    const qLower = q.toLowerCase();
    return rows.filter(c => [c.codigo_erp, c.nombre_comercial, c.telefono].filter(Boolean).join(" ").toLowerCase().includes(qLower));
  }, [rows, q]);

  const canEdit = role === "admin" || role === "director_ventas" || role === "coordinador_ventas";
  const canCreate = role === "admin" || role === "director_ventas" || role === "coordinador_ventas" || role === "ventas" || role === "auxiliar_ventas";
  const canViewOnly = role === "fabrica" || role === "finanzas";
  const isOwnCliente = (c: any) => c.vendedor_id === user?.id;
  const canEditCliente = (c: any) => {
    if (canEdit) return true;
    if ((role === "ventas" || role === "auxiliar_ventas") && isOwnCliente(c)) return true;
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

  const save = async () => {
    if (form.rfc && !validateRFC(form.rfc)) {
      return toast.error(t.clientes.rfcInvalido);
    }
    
    const payload = { ...form };
    if (payload.limite_credito) payload.limite_credito = parseFloat(payload.limite_credito);
    else delete payload.limite_credito;
    
    if (editing) {
      const { error } = await supabase.from("clientes").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success(t.clientes.actualizado); setEditing(null);
    } else {
      const { error } = await supabase.from("clientes").insert(payload);
      if (error) return toast.error(error.message);
      toast.success(t.clientes.creado); setCreating(false);
    }
    resetForm(); load();
  };

  const resetForm = () => {
    setForm({ 
      codigo_erp: "", nombre_comercial: "", telefono: "", direccion: "", activo: true,
      razon_social: "", rfc: "", email: "", email_cobranza: "",
      nombre_contacto: "", cargo_contacto: "", telefono_contacto: "",
      calle: "", num_exterior: "", num_interior: "", colonia: "",
      municipio: "", estado: "", codigo_postal: "", pais: "México",
      limite_credito: "", dias_credito: 0, moneda_credito: "MXN",
      vendedor_id: (role === "ventas" || role === "director_ventas" || role === "coordinador_ventas") ? user?.id : null,
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

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div><h1>{t.clientes.title}</h1><p className="text-base text-muted-foreground mt-1">{t.clientes.subtitle(filtered.length, rows.length)}</p></div>
        {canCreate && (
          <Button onClick={() => { resetForm(); setForm(prev => ({ ...prev, codigo_erp: generateFolioSugerido() })); setCreating(true); }}
            className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2"/> {t.clientes.nuevo}
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder={t.clientes.buscar} value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(c => {
          const s = stats[c.id] || { total: 0, entregados: 0 };
          const activos = s.total - s.entregados;
          return (
            <Card key={c.id} className="p-5 hover:shadow-md transition-shadow flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <Badge className="mb-2 bg-[#1F3864]">{c.codigo_erp}</Badge>
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
        {!filtered.length && <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">{t.clientes.sinResultados}</div>}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t.clientes.editar : t.clientes.nuevo}</DialogTitle></DialogHeader>
          <Tabs defaultValue="datos" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="datos">{t.clientes.datosGenerales}</TabsTrigger>
              <TabsTrigger value="direccion">{t.clientes.direccionFiscal}</TabsTrigger>
              <TabsTrigger value="credito">{t.clientes.credito}</TabsTrigger>
            </TabsList>
            <TabsContent value="datos" className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t.clientes.codigoErp}</Label><Input value={form.codigo_erp} onChange={e => setForm({ ...form, codigo_erp: e.target.value })} placeholder={t.clientes.folioSugerido} /></div>
                <div><Label>{t.clientes.rfc}</Label><Input value={form.rfc || ""} onChange={e => setForm({ ...form, rfc: e.target.value.toUpperCase() })} maxLength={13} /></div>
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
                <div><Label>{t.clientes.pais}</Label><Input value={form.pais || "México"} onChange={e => setForm({ ...form, pais: e.target.value })} /></div>
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
            <DialogTitle>{t.clientes.expediente} — {selectedCliente?.codigo_erp}</DialogTitle>
          </DialogHeader>
          {selectedCliente && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="datos">{t.clientes.datosGenerales}</TabsTrigger>
                <TabsTrigger value="direccion">{t.clientes.direccionFiscal}</TabsTrigger>
                <TabsTrigger value="credito">{t.clientes.credito}</TabsTrigger>
                <TabsTrigger value="documentos">{t.clientes.documentos}</TabsTrigger>
              </TabsList>
              <TabsContent value="datos" className="space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t.clientes.codigoErp}</Label><Input value={selectedCliente.codigo_erp} disabled /></div>
                  <div><Label>{t.clientes.rfc}</Label><Input value={selectedCliente.rfc || ""} disabled /></div>
                </div>
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
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
