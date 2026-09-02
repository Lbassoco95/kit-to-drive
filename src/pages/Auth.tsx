import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Building2, Wrench, Truck, Briefcase, Wallet } from "lucide-react";

const DEMO_ROLES = [
  { email: "admin@dazon.demo",     pwd: "Dazon2026!", labelKey: "direccion" as const,  icon: Building2 },
  { email: "fabrica@dazon.demo",   pwd: "Dazon2026!", labelKey: "fabrica" as const,   icon: Wrench },
  { email: "logistica@dazon.demo", pwd: "Dazon2026!", labelKey: "logistica" as const, icon: Truck },
  { email: "ventas@dazon.demo",    pwd: "Dazon2026!", labelKey: "ventas" as const,     icon: Briefcase },
  { email: "finanzas@dazon.demo",  pwd: "Dazon123!$", labelKey: "finanzas" as const,  icon: Wallet },
];

export default function Auth() {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();
  const { t, toggleLang } = useLang();
  const devMode = useMemo(() => new URLSearchParams(window.location.search).get("dev") === "1", []);

  useEffect(() => { if (user) nav("/"); }, [user, nav]);

  const login = async (e?: any) => {
    e?.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setBusy(false);
    if (error) toast.error(error.message); else nav("/");
  };

  const quickLogin = async (em: string, p: string) => {
    setEmail(em); setPwd(p); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: em, password: p });
    setBusy(false);
    if (error) toast.error(t.auth.demoNotCreated);
    else nav("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1F3864] p-4">
      <Card className="w-full max-w-lg p-8 shadow-2xl relative">
        {/* Language toggle */}
        <button
          onClick={toggleLang}
          className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-500 hover:text-[#1F3864] hover:border-[#1F3864] transition-all text-sm font-medium"
        >
          🌐 {t.otherLang}
        </button>

        <div className="text-center mb-8">
          <h1 className="!text-4xl !text-[#1F3864]">{t.auth.title}</h1>
          <p className="text-muted-foreground text-base mt-2">{t.auth.subtitle}</p>
        </div>
        <form onSubmit={login} className="space-y-4">
          <div>
            <Label className="text-base">{t.auth.email}</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" />
          </div>
          <div>
            <Label className="text-base">{t.auth.password}</Label>
            <Input type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} className="h-12 text-base" />
          </div>
          <Button type="submit" disabled={busy} className="w-full h-12 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            {busy ? t.auth.signingIn : t.auth.signIn}
          </Button>
        </form>
        {devMode && <div className="mt-8 pt-6 border-t">
          <p className="text-sm text-muted-foreground mb-3 text-center">{t.auth.quickAccess}</p>
          <div className="grid grid-cols-3 gap-3">
            {DEMO_ROLES.map(d => (
              <button
                key={d.email}
                type="button"
                disabled={busy}
                onClick={() => quickLogin(d.email, d.pwd)}
                className="min-h-[80px] flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-[#2E75B6]/30 bg-white hover:bg-[#2E75B6]/10 hover:border-[#2E75B6] transition-all text-[#1F3864] font-semibold disabled:opacity-50"
              >
                <d.icon size={28} strokeWidth={2.2} />
                <span className="text-base">{t.roles[d.labelKey]}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-4 text-center">{t.auth.demoPassword}</p>
        </div>}
      </Card>
    </div>
  );
}
