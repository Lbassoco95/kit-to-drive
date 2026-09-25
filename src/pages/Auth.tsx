import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { user } = useAuth();
  const { t, toggleLang } = useLang();

  useEffect(() => { if (user) nav("/"); }, [user, nav]);

  const login = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setBusy(false);
    if (error) toast.error(error.message); else nav("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1F3864] p-4">
      <Card className="w-full max-w-lg p-8 shadow-2xl relative">
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
      </Card>
    </div>
  );
}
