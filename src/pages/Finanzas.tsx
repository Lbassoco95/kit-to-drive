import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Wallet, FileText, ExternalLink, Upload, X } from "lucide-react";

interface Pago {
  id: string;
  nombre_pago: string;
  beneficiario: string;
  monto: number;
  moneda: string;
  tiene_factura: boolean;
  factura_url: string | null;
  aprobado_por: string | null;
  descripcion: string | null;
  created_by: string | null;
  created_at: string;
}

const MONEDAS = ["MXN", "USD", "EUR", "CNY"];

const EMPTY_FORM = {
  nombre_pago: "",
  beneficiario: "",
  monto: "",
  moneda: "MXN",
  tiene_factura: false,
  aprobado_por: "",
  descripcion: "",
};

const fmt = (n: number, moneda: string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda, minimumFractionDigits: 2 }).format(n);

export default function Finanzas() {
  const { user, role } = useAuth();
  const [rows, setRows] = useState<Pago[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Pago | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Pago | null>(null);

  // forms
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canDelete = role === "admin" || role === "admin_financiero";
  const canEdit = role === "admin" || role === "admin_financiero" || role === "finanzas";

  // ── Load ──────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pagos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter(p => {
    if (!q) return true;
    const blob = [p.nombre_pago, p.beneficiario, p.aprobado_por, p.descripcion, p.moneda]
      .filter(Boolean).join(" ").toLowerCase();
    return blob.includes(q.toLowerCase());
  });

  // ── File upload ───────────────────────────────────────────────────────
  const uploadFactura = async (file: File): Promise<string | null> => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user?.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("facturas").upload(path, file, { upsert: false });
    setUploading(false);
    if (error) { toast.error("Error al subir factura: " + error.message); return null; }
    const { data: signedData } = await supabase.storage.from("facturas").createSignedUrl(path, 60 * 60 * 24 * 365);
    return path; // store path, generate signed URL on demand
  };

  const verFactura = async (facturaUrl: string) => {
    // facturaUrl is a storage path
    const { data, error } = await supabase.storage.from("facturas").createSignedUrl(facturaUrl, 3600);
    if (error || !data?.signedUrl) { toast.error("No se pudo abrir la factura"); return; }
    window.open(data.signedUrl, "_blank");
  };

  // ── Create ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setFacturaFile(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!form.nombre_pago.trim() || !form.beneficiario.trim() || !form.monto) {
      toast.error("Nombre del pago, beneficiario y monto son obligatorios"); return;
    }
    const montoNum = parseFloat(form.monto);
    if (isNaN(montoNum) || montoNum < 0) { toast.error("Monto inválido"); return; }

    setSaving(true);
    let facturaPath: string | null = null;
    if (form.tiene_factura && facturaFile) {
      facturaPath = await uploadFactura(facturaFile);
      if (!facturaPath) { setSaving(false); return; }
    }

    const { error } = await supabase.from("pagos").insert({
      nombre_pago: form.nombre_pago.trim(),
      beneficiario: form.beneficiario.trim(),
      monto: montoNum,
      moneda: form.moneda,
      tiene_factura: form.tiene_factura,
      factura_url: facturaPath,
      aprobado_por: form.aprobado_por.trim() || null,
      descripcion: form.descripcion.trim() || null,
      created_by: user?.id,
    });

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("✓ Pago registrado");
    setCreateOpen(false);
    load();
  };

  // ── Edit ──────────────────────────────────────────────────────────────
  const openEdit = (p: Pago) => {
    setEditTarget(p);
    setForm({
      nombre_pago: p.nombre_pago,
      beneficiario: p.beneficiario,
      monto: String(p.monto),
      moneda: p.moneda,
      tiene_factura: p.tiene_factura,
      aprobado_por: p.aprobado_por ?? "",
      descripcion: p.descripcion ?? "",
    });
    setFacturaFile(null);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (!form.nombre_pago.trim() || !form.beneficiario.trim() || !form.monto) {
      toast.error("Nombre del pago, beneficiario y monto son obligatorios"); return;
    }
    const montoNum = parseFloat(form.monto);
    if (isNaN(montoNum) || montoNum < 0) { toast.error("Monto inválido"); return; }

    setSaving(true);
    let facturaPath = editTarget.factura_url;
    if (form.tiene_factura && facturaFile) {
      const newPath = await uploadFactura(facturaFile);
      if (!newPath) { setSaving(false); return; }
      facturaPath = newPath;
    }
    if (!form.tiene_factura) facturaPath = null;

    const { error } = await supabase.from("pagos").update({
      nombre_pago: form.nombre_pago.trim(),
      beneficiario: form.beneficiario.trim(),
      monto: montoNum,
      moneda: form.moneda,
      tiene_factura: form.tiene_factura,
      factura_url: facturaPath,
      aprobado_por: form.aprobado_por.trim() || null,
      descripcion: form.descripcion.trim() || null,
    }).eq("id", editTarget.id);

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("✓ Pago actualizado");
    setEditTarget(null);
    load();
  };

  // ── Delete ────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("pagos").delete().eq("id", deleteTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pago eliminado");
    setDeleteTarget(null);
    load();
  };

  // ── Summary ───────────────────────────────────────────────────────────
  const totalMXN = rows.filter(p => p.moneda === "MXN").reduce((s, p) => s + p.monto, 0);
  const totalUSD = rows.filter(p => p.moneda === "USD").reduce((s, p) => s + p.monto, 0);

  // ── Form shared component ─────────────────────────────────────────────
  const FormFields = () => (
    <div className="space-y-3">
      <div>
        <Label>Nombre del pago *</Label>
        <Input value={form.nombre_pago} onChange={e => setForm({ ...form, nombre_pago: e.target.value })} className="h-11" placeholder="ej. Pago proveedor acero" />
      </div>
      <div>
        <Label>Beneficiario *</Label>
        <Input value={form.beneficiario} onChange={e => setForm({ ...form, beneficiario: e.target.value })} className="h-11" placeholder="A quién se realiza el pago" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Monto *</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.monto}
            onChange={e => setForm({ ...form, monto: e.target.value })}
            className="h-11"
            placeholder="0.00"
          />
        </div>
        <div>
          <Label>Moneda</Label>
          <Select value={form.moneda} onValueChange={v => setForm({ ...form, moneda: v })}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONEDAS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Aprobado por</Label>
        <Input value={form.aprobado_por} onChange={e => setForm({ ...form, aprobado_por: e.target.value })} className="h-11" placeholder="Nombre de quien autorizó" />
      </div>
      <div>
        <Label>Descripción / notas</Label>
        <Textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={2} placeholder="Detalles adicionales (opcional)" />
      </div>

      {/* Factura toggle */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => setForm({ ...form, tiene_factura: !form.tiene_factura })}
          className={`relative w-11 h-6 rounded-full transition-colors ${form.tiene_factura ? "bg-emerald-500" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.tiene_factura ? "left-5" : "left-0.5"}`} />
        </button>
        <span className="text-sm font-medium">Tiene factura / invoice</span>
      </div>

      {/* File upload */}
      {form.tiene_factura && (
        <div>
          <Label>Archivo de factura (PDF o imagen)</Label>
          <div
            className="mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-[#1F3864] transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {facturaFile ? (
              <div className="flex items-center justify-center gap-2 text-emerald-600">
                <FileText size={20} />
                <span className="text-sm font-medium truncate max-w-[200px]">{facturaFile.name}</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setFacturaFile(null); }}
                  className="ml-1 text-red-400 hover:text-red-600"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <Upload size={24} className="mx-auto mb-1 opacity-50" />
                <p className="text-sm">Toca para seleccionar PDF o imagen</p>
                <p className="text-xs mt-0.5 opacity-60">PDF, JPG, PNG, WEBP — máx. 10 MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="hidden"
            onChange={e => setFacturaFile(e.target.files?.[0] ?? null)}
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <Wallet size={28} className="text-[#1F3864]" />
            Control Financiero
          </h1>
          <p className="text-base text-muted-foreground mt-1">
            {rows.length} registros
            {totalMXN > 0 && <span className="ml-3 font-semibold text-[#1F3864]">{fmt(totalMXN, "MXN")}</span>}
            {totalUSD > 0 && <span className="ml-2 font-semibold text-emerald-700">{fmt(totalUSD, "USD")}</span>}
          </p>
        </div>
        {canEdit && (
          <Button onClick={openCreate} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2" /> Nuevo registro
          </Button>
        )}
      </div>

      {/* Search */}
      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder="Buscar por pago, beneficiario, descripción…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-card rounded-lg border">
          {q ? "Sin resultados para esa búsqueda" : "Aún no hay registros. Crea el primero."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <Card key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-3 hover:shadow-md transition-shadow">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#1F3864] text-base truncate">{p.nombre_pago}</span>
                  <Badge variant="outline" className={
                    p.moneda === "MXN" ? "border-blue-200 bg-blue-50 text-blue-700" :
                    p.moneda === "USD" ? "border-green-200 bg-green-50 text-green-700" :
                    "border-slate-200 bg-slate-50 text-slate-700"
                  }>
                    {fmt(p.monto, p.moneda)}
                  </Badge>
                  {p.tiene_factura && (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
                      <FileText size={11} className="mr-1" /> Con factura
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Beneficiario:</span> {p.beneficiario}
                </div>
                {p.aprobado_por && (
                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Aprobado por:</span> {p.aprobado_por}
                  </div>
                )}
                {p.descripcion && (
                  <div className="text-sm text-muted-foreground">{p.descripcion}</div>
                )}
                <div className="text-xs text-muted-foreground/70">
                  {new Date(p.created_at).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>

              <div className="flex gap-1 shrink-0 self-start">
                {p.tiene_factura && p.factura_url && (
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => verFactura(p.factura_url!)} title="Ver factura">
                    <ExternalLink size={15} className="text-blue-600" />
                  </Button>
                )}
                {canEdit && (
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => openEdit(p)} title="Editar">
                    <Pencil size={15} />
                  </Button>
                )}
                {canDelete && (
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setDeleteTarget(p)} title="Eliminar">
                    <Trash2 size={15} className="text-red-400" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={o => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus size={18} /> Nuevo registro</DialogTitle></DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="h-11">Cancelar</Button>
            <Button onClick={submitCreate} disabled={saving || uploading} className="h-11 px-6 bg-[#1F3864] hover:bg-[#162a4d]">
              {saving || uploading ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={o => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar registro</DialogTitle></DialogHeader>
          {editTarget && (
            <>
              <FormFields />
              {editTarget.tiene_factura && editTarget.factura_url && !facturaFile && (
                <div className="text-sm text-muted-foreground flex items-center gap-2 -mt-1">
                  <FileText size={14} className="text-emerald-600" />
                  <span>Hay una factura guardada.</span>
                  <button
                    type="button"
                    className="text-blue-600 underline text-xs"
                    onClick={() => verFactura(editTarget.factura_url!)}
                  >
                    Ver actual
                  </button>
                  <span className="text-xs opacity-60">(selecciona un archivo nuevo para reemplazarla)</span>
                </div>
              )}
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} className="h-11">Cancelar</Button>
            <Button onClick={submitEdit} disabled={saving || uploading} className="h-11 px-6 bg-[#1F3864] hover:bg-[#162a4d]">
              {saving || uploading ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar registro?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se eliminará permanentemente <strong>{deleteTarget?.nombre_pago}</strong> — {deleteTarget ? fmt(deleteTarget.monto, deleteTarget.moneda) : ""}.
            Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="h-11">Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} className="h-11 px-6">Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
