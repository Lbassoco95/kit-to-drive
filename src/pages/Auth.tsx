import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

const DEMO = [
  { email: "admin@dazon.demo",     pwd: "Dazon2026!", label: "Admin" },
  { email: "fabrica@dazon.demo",   pwd: "Dazon2026!", label: "Fábrica" },
  { email: "logistica@dazon.demo", pwd: "Dazon2026!", label: "Logística" },
  { email: "ventas@dazon.demo",    pwd: "Dazon2026!", label: "Ventas" },
];

export default function Auth() {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();

  useEffect(() => { if (user) nav("/"); }, [user, nav]);

  const login = async (e?: any) => {
    e?.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setBusy(false);
    if (error) toast.error(error.message);
    else nav("/");
  };

  const quickLogin = async (em: string, p: string) => {
    setEmail(em); setPwd(p); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: em, password: p });
    setBusy(false);
    if (error) toast.error("Usuario demo no creado todavía. Pídele al Admin que ejecute el seed.");
    else nav("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary p-4">
      <Card className="w-full max-w-md p-8 shadow-xl">
        <div className="text-center mb-6">
          <h1 className="!text-3xl">GRUPO DAZON</h1>
          <p className="text-muted-foreground text-sm mt-1">Sistema de Control de Producción</p>
        </div>
        <form onSubmit={login} className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Contraseña</Label>
            <Input type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Ingresando…" : "Iniciar sesión"}
          </Button>
        </form>
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2">Acceso rápido demo:</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO.map(d => (
              <Button key={d.email} type="button" variant="outline" size="sm" onClick={() => quickLogin(d.email, d.pwd)}>
                {d.label}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">Contraseña demo: <code>Dazon2026!</code></p>
        </div>
      </Card>
    </div>
  );
}
