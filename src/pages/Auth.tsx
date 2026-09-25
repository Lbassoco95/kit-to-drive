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

const RESET_COOLDOWN_MS = 60_000;

function mapLoginError(message: string, auth: { invalidCredentials: string; emailNotConfirmed: string }): string {
  if (/invalid login credentials/i.test(message)) return auth.invalidCredentials;
  if (/email not confirmed/i.test(message)) return auth.emailNotConfirmed;
  return message;
}

export default function Auth() {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const nav = useNavigate();
  const { user, isPasswordRecovery } = useAuth();
  const { t, toggleLang } = useLang();

  useEffect(() => {
    if (user && isPasswordRecovery) {
      nav("/auth/reset-password", { replace: true });
      return;
    }
    if (user && !isPasswordRecovery) nav("/");
  }, [user, isPasswordRecovery, nav]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const login = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setBusy(false);
    if (error) toast.error(mapLoginError(error.message, t.auth));
    else nav("/");
  };

  const requestReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const now = Date.now();
    if (now < cooldownUntil) {
      toast.error(t.auth.resetCooldown);
      return;
    }
    setBusy(true);
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    setCooldownUntil(Date.now() + RESET_COOLDOWN_MS);

    // Mensaje genérico: no revelar si el correo existe.
    if (error && /rate|too many|exceed/i.test(error.message)) {
      toast.error(t.auth.resetRateLimited);
      return;
    }
    toast.success(t.auth.resetEmailSent);
  };

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1F3864] p-4">
      <Card className="w-full max-w-lg p-8 shadow-2xl relative">
        <button
          type="button"
          onClick={toggleLang}
          className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-500 hover:text-[#1F3864] hover:border-[#1F3864] transition-all text-sm font-medium"
        >
          🌐 {t.otherLang}
        </button>

        <div className="text-center mb-8">
          <h1 className="!text-4xl !text-[#1F3864]">{t.auth.title}</h1>
          <p className="text-muted-foreground text-base mt-2">
            {mode === "login" ? t.auth.subtitle : t.auth.forgotSubtitle}
          </p>
        </div>

        {mode === "login" ? (
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
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-[#1F3864] hover:underline"
                onClick={() => setMode("forgot")}
              >
                {t.auth.forgotPassword}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={requestReset} className="space-y-4">
            <div>
              <Label className="text-base">{t.auth.email}</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" autoFocus />
            </div>
            <Button
              type="submit"
              disabled={busy || cooldownLeft > 0}
              className="w-full h-12 text-base bg-[#1F3864] hover:bg-[#162a4d]"
            >
              {busy
                ? t.auth.sendingReset
                : cooldownLeft > 0
                  ? `${t.auth.sendResetLink} (${cooldownLeft}s)`
                  : t.auth.sendResetLink}
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-[#1F3864] hover:underline"
                onClick={() => setMode("login")}
              >
                {t.auth.backToLogin}
              </button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
