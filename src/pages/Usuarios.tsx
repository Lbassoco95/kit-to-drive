import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Area, Nivel, AREAS, NIVELES, AREA_COLORS, NIVEL_COLORS,
  rolLegacy, desdeRolLegacy,
} from "@/lib/permissions";
import { Plus, Pencil, Search, UserCheck, UserX, ShieldCheck, Info } from "lucide-react";

interface FormUsuario {
  nombre_completo: string;
  email: string;
  codigo_vendedor: string;
  activo: boolean;
  area: Area;
  nivel: Nivel;
}

interface Usuario {
  id: string;
  nombre_completo: string | null;
  email: string | null;
  codigo_vendedor: string | null;
  activo: boolean;
  nivel: Nivel | null;
  area: Area | null;
}

const EMPTY_NEW = {
  email: "", password: "", nombre_completo: "",
  area: "comercial" as Area, nivel: "operador" as Nivel, codigo_vendedor: "",
};

export default function Usuarios() {
  const { t } = useLang();
  const { perms, area: miArea } = useAuth();
  const [rows, setRows] = useState<Usuario[]>([]);
  const [q, setQ] = useState("");
  const [fArea, setFArea] = useState<Area | "todas">("todas");
  const [fNivel, setFNivel] = useState<Nivel | "todos">("todos");
  const [editTarget, setEditTarget] = useState<Usuario | null>(null);
  const [editForm, setEditForm] = useState<FormUsuario>({
    nombre_completo: "", email: "", codigo_vendedor: "", activo: true,
    area: "comercial", nivel: "operador",
  });
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({ ...EMPTY_NEW });
  const [saving, setSaving] = useState(false);

  // Un admin de área solo administra su propia área; el admin global, todas.
  const areasDisponibles: Area[] = perms.esAdminGlobal ? AREAS : (miArea ? [miArea] : []);

  const load = async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").order("nombre_completo"),
      supabase.from("user_roles").select("*"),
    ]);
    const merged: Usuario[] = (profiles ?? []).map(p => {
      const r = (roles ?? []).find(x => x.user_id === p.id);
      const fallback = r?.role ? desdeRolLegacy(r.role) : null;
      return {
        ...p,
        nivel: (r?.nivel as Nivel) ?? fallback?.nivel ?? null,
        area: (r?.area as Area) ?? fallback?.area ?? null,
      };
    });
    setRows(merged);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter(u => {
    if (fArea !== "todas" && u.area !== fArea) return false;
    if (fNivel !== "todos" && u.nivel !== fNivel) return false;
    if (!q) return true;
    const blob = [
      u.nombre_completo, u.email, u.codigo_vendedor,
      u.area ? t.areas[u.area] : "", u.nivel ? t.niveles[u.nivel] : "",
    ].filter(Boolean).join(" ").toLowerCase();
    return blob.includes(q.toLowerCase());
  });

  // ── Editar usuario existente ────────────────────────────────────────
  const openEdit = (u: Usuario) => {
    setEditTarget(u);
    setEditForm({
      nombre_completo: u.nombre_completo ?? "",
      email: u.email ?? "",
      codigo_vendedor: u.codigo_vendedor ?? "",
      activo: u.activo,
      area: u.area ?? areasDisponibles[0] ?? "comercial",
      nivel: u.nivel ?? "operador",
    });
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

    // Un usuario = un tipo de usuario en un área: se reemplaza la fila.
    await supabase.from("user_roles").delete().eq("user_id", editTarget.id);
    const { error: rolErr } = await supabase.from("user_roles").insert({
      user_id: editTarget.id,
      area: editForm.area,
      nivel: editForm.nivel,
      role: rolLegacy(editForm.area, editForm.nivel),
    });
    if (rolErr) { toast.error(rolErr.message); setSaving(false); return; }

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

  // ── Crear usuario (Edge Function) ──────────────────────────────────
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
        area: newForm.area,
        nivel: newForm.nivel,
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
    setNewForm({ ...EMPTY_NEW, area: areasDisponibles[0] ?? "comercial" });
    load();
  };

  const esComercial = (a: Area) => a === "comercial";

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
        {perms.gestionaUsuarios && (
          <Button
            onClick={() => { setNewForm({ ...EMPTY_NEW, area: areasDisponibles[0] ?? "comercial" }); setNewOpen(true); }}
            className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]"
          >
            <Plus className="h-5 w-5 mr-2" /> Nuevo usuario
          </Button>
        )}
      </div>

      {/* Los tres tipos de usuario */}
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#1F3864] mb-3">
          <Info size={16} /> Tipos de usuario
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {NIVELES.map(n => (
            <div key={n} className="rounded-lg border p-3">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${NIVEL_COLORS[n]}`}>
                {t.niveles[n]}
              </span>
              <p className="text-xs text-muted-foreground mt-2 leading-snug">{t.nivelDesc[n]}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          El <strong>área</strong> define qué módulos ve el usuario ({AREAS.map(a => t.areas[a]).join(" · ")}).
          El <strong>tipo de usuario</strong> define qué puede hacer dentro de ellos.
        </p>
      </Card>

      {/* Búsqueda y filtros */}
      <Card className="p-3 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
          <Input className="pl-10 h-12 text-base" placeholder="Buscar por nombre, email, área…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={fArea} onValueChange={v => setFArea(v as Area | "todas")}>
          <SelectTrigger className="h-12 md:w-56"><SelectValue placeholder="Área" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las áreas</SelectItem>
            {AREAS.map(a => <SelectItem key={a} value={a}>{t.areas[a]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fNivel} onValueChange={v => setFNivel(v as Nivel | "todos")}>
          <SelectTrigger className="h-12 md:w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {NIVELES.map(n => <SelectItem key={n} value={n}>{t.niveles[n]}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {/* Usuarios */}
      <div className="responsive-card-grid gap-4">
        {filtered.map(u => {
          const editable = perms.gestionaUsuarios && (perms.esAdminGlobal || (!!u.area && u.area === miArea));
          return (
            <Card key={u.id} className={`p-5 flex flex-col gap-3 transition-shadow hover:shadow-md ${!u.activo ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#1F3864] text-lg truncate">{u.nombre_completo || "—"}</div>
                  <div className="text-sm text-muted-foreground truncate">{u.email || <em className="text-xs">Sin email registrado</em>}</div>
                </div>
                {editable && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => openEdit(u)} title="Editar">
                      <Pencil size={15} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => toggleActivo(u)} title={u.activo ? "Desactivar" : "Activar"}>
                      {u.activo ? <UserX size={15} className="text-red-400" /> : <UserCheck size={15} className="text-emerald-500" />}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                {u.area && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${AREA_COLORS[u.area]}`}>
                    {t.areas[u.area]}
                  </span>
                )}
                {u.nivel && (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${NIVEL_COLORS[u.nivel]}`}>
                    {t.niveles[u.nivel]}
                  </span>
                )}
                {!u.area && !u.nivel && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border text-xs">
                    Sin asignar
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
          );
        })}
        {!filtered.length && (
          <div className="col-span-full text-center py-12 text-muted-foreground bg-card rounded-lg border">
            No se encontraron usuarios
          </div>
        )}
      </div>

      {/* ── Editar ── */}
      <Dialog open={!!editTarget} onOpenChange={o => { if (!o) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar usuario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre completo</Label>
              <Input value={editForm.nombre_completo} onChange={e => setEditForm({ ...editForm, nombre_completo: e.target.value })} className="h-11" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="h-11" placeholder="correo@ejemplo.com" />
            </div>
            <div>
              <Label>Área *</Label>
              <Select value={editForm.area} onValueChange={v => setEditForm({ ...editForm, area: v as Area })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {areasDisponibles.map(a => <SelectItem key={a} value={a}>{t.areas[a]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de usuario *</Label>
              <Select value={editForm.nivel} onValueChange={v => setEditForm({ ...editForm, nivel: v as Nivel })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NIVELES.map(n => <SelectItem key={n} value={n}>{t.niveles[n]}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{t.nivelDesc[editForm.nivel]}</p>
            </div>
            {esComercial(editForm.area) && (
              <div>
                <Label>{t.usuarios.codigoVendedor}</Label>
                <Input value={editForm.codigo_vendedor} onChange={e => setEditForm({ ...editForm, codigo_vendedor: e.target.value })} className="h-11 font-mono" placeholder="ej. VEN001" />
              </div>
            )}
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

      {/* ── Nuevo usuario ── */}
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
              <Label>Área *</Label>
              <Select value={newForm.area} onValueChange={v => setNewForm({ ...newForm, area: v as Area })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {areasDisponibles.map(a => <SelectItem key={a} value={a}>{t.areas[a]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de usuario *</Label>
              <Select value={newForm.nivel} onValueChange={v => setNewForm({ ...newForm, nivel: v as Nivel })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NIVELES.map(n => <SelectItem key={n} value={n}>{t.niveles[n]}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{t.nivelDesc[newForm.nivel]}</p>
            </div>
            {esComercial(newForm.area) && (
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
