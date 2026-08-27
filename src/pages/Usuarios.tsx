import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { Plus, Pencil, Search, UserCheck, UserX, ShieldCheck } from "lucide-react";

type AppRole = "admin" | "fabrica" | "logistica" | "ventas" | "coordinador" | "director_ventas" | "coordinador_ventas" | "auxiliar_ventas";

interface Usuario {
  id: string;
  nombre_completo: string | null;
  email: string | null;
  codigo_vendedor: string | null;
  activo: boolean;
  role: AppRole | null;
}

const ROLE_COLORS: Record<AppRole, string> = {
  admin:             "bg-red-100 text-red-700 border-red-200",
  fabrica:           "bg-amber-100 text-amber-700 border-amber-200",
  logistica:         "bg-indigo-100 text-indigo-700 border-indigo-200",
  ventas:            "bg-emerald-100 text-emerald-700 border-emerald-200",
  coordinador:       "bg-purple-100 text-purple-700 border-purple-200",
  director_ventas:   "bg-rose-100 text-rose-700 border-rose-200",
  coordinador_ventas: "bg-orange-100 text-orange-700 border-orange-200",
  auxiliar_ventas:    "bg-yellow-100 text-yellow-700 border-yellow-200",
};

const EMPTY_NEW = { email: "", password: "", nombre_completo: "", role: "ventas" as AppRole, codigo_vendedor: "" };

export default function Usuarios() {
  const { t } = useLang();
  const [rows, setRows] = useState<Usuario[]>([]);
  const [q, setQ] = useState("");
  const [editTarget, setEditTarget] = useState<Usuario | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ ...EMPTY_NEW });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").order("nombre_completo"),
      supabase.from("user_roles").select("*"),
    ]);
    const merged: Usuario[] = (profiles ?? []).map(p => ({
      ...p,
      role: (roles ?? []).find(r => r.user_id === p.id)?.role ?? null,
    }));
    setRows(merged);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter(u => {
    if (!q) return true;
    const blob = [u.nombre_completo, u.email, u.codigo_vendedor, u.role].filter(Boolean).join(" ").toLowerCase();
    return blob.includes(q.toLowerCase());
  });

  // ── Edit existing user ──────────────────────────────────────────────
  const openEdit = (u: Usuario) => {
    setEditTarget(u);
    setEditForm({ nombre_completo: u.nombre_completo ?? "", email: u.email ?? "", codigo_vendedor: u.codigo_vendedor ?? "", activo: u.activo, role: u.role ?? "ventas" });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    const { error: profErr } = await supabase.from("profiles").update({
      nombre_completo: editForm.nombre_completo.trim(),
      email: editForm.email.trim() || null,
      codigo_vendedor: editForm.codigo_vendedor.trim() || null,
      activo: editForm.activo,
    }).eq("id", editTarget.id);

    if (profErr) { toast.error(profErr.message); setSaving(false); return; }

    // Update role: delete + insert (avoid unique constraint issues)
    await supabase.from("user_roles").delete().eq("user_id", editTarget.id);
    await supabase.from("user_roles").insert({ user_id: editTarget.id, role: editForm.role });

    toast.success("✓ Usuario actualizado");
    setSaving(false);
    setEditTarget(null);
    load();
  };

  const toggleActivo = async (u: Usuario) => {
    const { error } = await supabase.from("profiles").update({ activo: !u.activo }).eq("id", u.id);
    if (error) toast.error(error.message);
    else { toast.success(u.activo ? "Usuario desactivado" : "Usuario activado"); load(); }
  };

  // ── Create new user (via Edge Function) ────────────────────────────
  const createUser = async () => {
    if (!newForm.email || !newForm.password || !newForm.nombre_completo) {
      toast.error("Email, contraseña y nombre son obligatorios"); return;
    }
    if (newForm.password.length < 8) {
      toast.error("La contraseña debe tener al menos 8 caracteres"); return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email: newForm.email.trim().toLowerCase(),
        password: newForm.password,
        nombre_completo: newForm.nombre_completo.trim(),
        role: newForm.role,
        codigo_vendedor: newForm.codigo_vendedor.trim() || null,
      },
    });
    setSaving(false);
    if (error || data?.error) {
      toast.error(data?.error ?? error?.message ?? "Error al crear usuario");
      return;
    }
    toast.success(`✓ Usuario ${newForm.email} creado`);
    setNewOpen(false);
    setNewForm({ ...EMPTY_NEW });
    load();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1 className="flex items-center gap-2">
            <ShieldCheck size={28} className="text-[#1F3864]" />
            {t.usuarios.title}
          </h1>
          <p className="text-base text-muted-foreground mt-1">{filtered.length} de {rows.length} usuarios</p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
          <Plus className="h-5 w-5 mr-2" /> Nuevo usuario
        </Button>
      </div>

      {/* Search */}
      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder="Buscar por nombre, email, rol…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      {/* Users grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(u => (
          <Card key={u.id} className={`p-5 flex flex-col gap-3 transition-shadow hover:shadow-md ${!u.activo ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[#1F3864] text-lg truncate">{u.nombre_completo || "—"}</div>
                <div className="text-sm text-muted-foreground truncate">{u.email || <em className="text-xs">Sin email registrado</em>}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => openEdit(u)} title="Editar">
                  <Pencil size={15} />
                </Button>
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => toggleActivo(u)} title={u.activo ? "Desactivar" : "Activar"}>
                  {u.activo ? <UserX size={15} className="text-red-400" /> : <UserCheck size={15} className="text-emerald-500" />}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {u.role && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${ROLE_COLORS[u.role]}`}>
                  {t.roles[u.role as keyof typeof t.roles]}
                </span>
              )}
              {u.codigo_vendedor && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border text-xs font-mono">
                  {u.codigo_vendedor}
                </span>
              )}
              {!u.activo && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border text-xs">
                  Inactivo
                </span>
              )}
            </div>
          </Card>
        ))}
        {!filtered.length && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">
            No se encontraron usuarios
          </div>
        )}
      </div>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={o => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar usuario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre completo</Label>
              <Input value={editForm.nombre_completo ?? ""} onChange={e => setEditForm({ ...editForm, nombre_completo: e.target.value })} className="h-11" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editForm.email ?? ""} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="h-11" placeholder="correo@ejemplo.com" />
            </div>
            <div>
              <Label>{t.usuarios.rol}</Label>
              <Select value={editForm.role} onValueChange={v => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["admin","fabrica","logistica","ventas","coordinador","director_ventas","coordinador_ventas","auxiliar_ventas"] as AppRole[]).map(r => (
                    <SelectItem key={r} value={r}>{t.roles[r as keyof typeof t.roles]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t.usuarios.codigoVendedor} <span className="text-muted-foreground text-xs">(solo ventas)</span></Label>
              <Input value={editForm.codigo_vendedor ?? ""} onChange={e => setEditForm({ ...editForm, codigo_vendedor: e.target.value })} className="h-11 font-mono" placeholder="ej. VEN001" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setEditForm({ ...editForm, activo: !editForm.activo })}
                className={`relative w-11 h-6 rounded-full transition-colors ${editForm.activo ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${editForm.activo ? "left-5" : "left-0.5"}`} />
              </button>
              <span className="text-sm font-medium">{editForm.activo ? "Activo" : "Inactivo"}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} className="h-11">Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving} className="h-11 px-6 bg-[#1F3864] hover:bg-[#162a4d]">
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create new user dialog ── */}
      <Dialog open={newOpen} onOpenChange={o => { if (!o) setNewOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus size={18}/> Nuevo usuario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email *</Label>
              <Input type="email" value={newForm.email} onChange={e => setNewForm({ ...newForm, email: e.target.value })} className="h-11" placeholder="correo@grupodalzon.com" />
            </div>
            <div>
              <Label>Contraseña temporal *</Label>
              <Input type="password" value={newForm.password} onChange={e => setNewForm({ ...newForm, password: e.target.value })} className="h-11" placeholder="Mínimo 8 caracteres" />
            </div>
            <div>
              <Label>Nombre completo *</Label>
              <Input value={newForm.nombre_completo} onChange={e => setNewForm({ ...newForm, nombre_completo: e.target.value })} className="h-11" placeholder="Nombre Apellido" />
            </div>
            <div>
              <Label>Rol *</Label>
              <Select value={newForm.role} onValueChange={v => setNewForm({ ...newForm, role: v as AppRole })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["admin","fabrica","logistica","ventas","coordinador","director_ventas","coordinador_ventas","auxiliar_ventas"] as AppRole[]).map(r => (
                    <SelectItem key={r} value={r}>{t.roles[r as keyof typeof t.roles]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(newForm.role === "ventas" || newForm.role === "coordinador") && (
              <div>
                <Label>{t.usuarios.codigoVendedor}</Label>
                <Input value={newForm.codigo_vendedor} onChange={e => setNewForm({ ...newForm, codigo_vendedor: e.target.value })} className="h-11 font-mono" placeholder="ej. VEN001" />
              </div>
            )}
            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-md p-2">
              ⚠ El usuario recibirá acceso inmediato. Comparte la contraseña temporal de forma segura y pídele que la cambie.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} className="h-11">Cancelar</Button>
            <Button onClick={createUser} disabled={saving} className="h-11 px-6 bg-[#1F3864] hover:bg-[#162a4d]">
              {saving ? "Creando…" : "Crear usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
