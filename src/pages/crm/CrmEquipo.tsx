import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { Nivel, NIVELES, NIVEL_LABELS } from "@/lib/permissions";
import { useLang } from "@/contexts/LangContext";
import { toast } from "sonner";
import { Plus, User as UserIcon, Mail, Key, Shield, Trash2 } from "lucide-react";

export default function CrmEquipo() {
  const { perms } = useAuth();
  const { t } = useLang();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    nombre_completo: "",
    email: "",
    password: "",
    nivel: "operador" as Nivel,
  });

  const load = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*, user_roles!inner(nivel, area)")
      .eq("user_roles.area", "comercial");
    setUsuarios(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.nombre_completo || !form.email || !form.password || !form.nivel) {
      return toast.error("Todos los campos son obligatorios");
    }

    try {
      // Call the Edge Function to create user
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          nombre_completo: form.nombre_completo,
          area: "comercial",
          nivel: form.nivel,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Error al crear usuario");
      }

      toast.success("Usuario creado exitosamente");
      setCreating(false);
      setForm({ nombre_completo: "", email: "", password: "", nivel: "operador" });
      load();
    } catch (error: any) {
      toast.error(error.message || "Error al crear usuario");
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm("¿Eliminar este usuario? Esta acción no se puede deshacer.")) return;
    
    try {
      const { error } = await supabase.from("profiles").delete().eq("id", userId);
      if (error) throw error;
      
      // Also delete from user_roles
      await supabase.from("user_roles").delete().eq("user_id", userId);
      
      toast.success("Usuario eliminado");
      load();
    } catch (error: any) {
      toast.error(error.message || "Error al eliminar usuario");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h1>Equipo de Ventas</h1>
          <p className="text-base text-muted-foreground mt-1">{usuarios.length} miembros en el equipo</p>
        </div>
        {perms.gestionaUsuarios && (
          <Button onClick={() => setCreating(true)}
            className="h-12 px-5 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Plus className="h-5 w-5 mr-2"/> Agregar vendedor
          </Button>
        )}
      </div>

      <Card className="p-5">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-semibold">Nombre</th>
                <th className="text-left py-3 px-4 font-semibold">Email</th>
                <th className="text-left py-3 px-4 font-semibold">Tipo de usuario</th>
                <th className="text-left py-3 px-4 font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u: any) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[#1F3864] flex items-center justify-center text-white font-semibold">
                        {u.nombre_completo?.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{u.nombre_completo}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      <Shield size={12} />
                      {u.user_roles?.nivel ? NIVEL_LABELS[u.user_roles.nivel as Nivel] : "—"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {perms.gestionaUsuarios && (
                      <Button size="icon" variant="ghost" onClick={() => deleteUser(u.id)} className="h-8 w-8 text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!usuarios.length && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground">
                    Sin miembros en el equipo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Agregar vendedor</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="flex items-center gap-2">
                <UserIcon size={16} /> Nombre completo
              </Label>
              <Input 
                value={form.nombre_completo} 
                onChange={e => setForm({ ...form, nombre_completo: e.target.value })}
                placeholder="Juan Pérez"
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <Mail size={16} /> Email
              </Label>
              <Input 
                type="email"
                value={form.email} 
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="juan@ejemplo.com"
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <Key size={16} /> Contraseña
              </Label>
              <Input 
                type="password"
                value={form.password} 
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <Shield size={16} /> Tipo de usuario
              </Label>
              <Select value={form.nivel} onValueChange={(v) => setForm({ ...form, nivel: v as Nivel })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NIVELES.map(n => (
                    <SelectItem key={n} value={n}>{NIVEL_LABELS[n]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-[#1F3864] hover:bg-[#162a4d]">Crear usuario</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
