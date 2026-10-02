import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, ExternalLink } from "lucide-react";
import { es } from "@/i18n/es";
import { zh } from "@/i18n/zh";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";

const MATI_URL = "https://www.yoltik.mx/productos/mati";
const RESET_COOLDOWN_MS = 60_000;
const LOGIN_LOCK_MS = 30_000;
const LOGIN_FAIL_THRESHOLD = 5;

function mapLoginError(
  message: string,
  auth: { invalidCredentials: string; emailNotConfirmed: string; loginRateLimited: string },
): string {
  if (/invalid login credentials/i.test(message)) return auth.invalidCredentials;
  if (/email not confirmed/i.test(message)) return auth.emailNotConfirmed;
  if (/rate|too many|exceed/i.test(message)) return auth.loginRateLimited;
  return message;
}

export default function Auth() {
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [loginLockUntil, setLoginLockUntil] = useState(0);
  const [loginFails, setLoginFails] = useState(0);
  const [now, setNow] = useState(Date.now());
  const nav = useNavigate();
  const { user, isPasswordRecovery } = useAuth();
  const { t, lang, toggleLang } = useLang();
  // Segunda lengua del titular: el personal mexicano y el chino ven los dos idiomas.
  const heroOtra = lang === "es" ? zh.auth.heroTitle : es.auth.heroTitle;

  useEffect(() => {
    if (user && isPasswordRecovery) {
      nav("/auth/reset-password", { replace: true });
      return;
    }
    if (user && !isPasswordRecovery) nav("/");
  }, [user, isPasswordRecovery, nav]);

  // Tras forzar/actualizar contraseña, el redirect llega con ?passwordUpdated=1
  // (aplica a usuarios actuales y nuevos; evita quedar atrapados con JWT viejo).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("passwordUpdated") !== "1") return;
      toast.success(t.auth.passwordUpdated);
      params.delete("passwordUpdated");
      const qs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    } catch {
      /* ignore */
    }
  }, [t.auth.passwordUpdated]);

  useEffect(() => {
    const until = Math.max(cooldownUntil, loginLockUntil);
    if (until <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil, loginLockUntil]);

  const login = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (Date.now() < loginLockUntil) {
      toast.error(t.auth.loginRateLimited);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setBusy(false);
    if (error) {
      const nextFails = loginFails + 1;
      setLoginFails(nextFails);
      if (nextFails >= LOGIN_FAIL_THRESHOLD) {
        setLoginLockUntil(Date.now() + LOGIN_LOCK_MS);
        setLoginFails(0);
        toast.error(t.auth.loginRateLimited);
      } else {
        toast.error(mapLoginError(error.message, t.auth));
      }
      return;
    }
    setLoginFails(0);
    setLoginLockUntil(0);
    nav("/");
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
  const loginLockLeft = Math.max(0, Math.ceil((loginLockUntil - now) / 1000));

  const modulos = t.auth.heroSub.split(" · ");

  return (
    <div className="relative min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-background overflow-hidden">
      <div className="ambient" aria-hidden="true"><i /><i /><i /></div>

      {/* Panel de marca: fluye en curvas, sin esquinas; el panda vive dentro de un orbe */}
      <aside className="relative m-3 lg:m-4 rounded-[2.5rem] lg:rounded-[3.5rem] bg-gradient-to-br from-[#032b62] via-[#03275a] to-[#03234d] text-primary-foreground overflow-hidden px-6 py-3 lg:px-12 lg:py-12 flex flex-col shadow-[0_30px_70px_-30px_hsl(214_94%_10%/0.7)]">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <span className="blob absolute -right-24 top-[28%] h-[26rem] w-[26rem] bg-[hsl(209_75%_48%/0.45)] blur-3xl" />
          <span className="blob hidden lg:block absolute -left-28 bottom-[-6rem] h-[24rem] w-[24rem] bg-[hsl(var(--dazon-gold)/0.30)] blur-3xl [animation-delay:-7s]" />
          <span className="blob hidden lg:block absolute right-[22%] bottom-[-8rem] h-[18rem] w-[18rem] bg-[hsl(168_65%_45%/0.28)] blur-3xl [animation-delay:-12s]" />
          <svg className="absolute -right-40 -bottom-40 h-[44rem] w-[44rem] text-white/10" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.6">
            <circle cx="100" cy="100" r="96" /><circle cx="100" cy="100" r="76" /><circle cx="100" cy="100" r="56" /><circle cx="100" cy="100" r="36" />
          </svg>
        </div>
        <img
          src="/brand/dazon-negativo.png"
          alt="Dazon Mex"
          className="relative w-40 lg:w-64 mix-blend-lighten self-center lg:self-start -mb-6 lg:mb-0 lg:-ml-5"
        />
        <div className="hidden lg:block mt-12 max-w-md relative z-10">
          <h2 className="!text-primary-foreground !text-[40px] !leading-[46px] !font-bold [text-wrap:balance] [word-break:keep-all]">{t.auth.heroTitle}</h2>
          <p lang={lang === "es" ? "zh-CN" : "es-MX"} className="mt-3 text-base leading-7 text-primary-foreground/90">
            {heroOtra}
          </p>
          <ul className="mt-7 flex flex-wrap gap-2" aria-label={t.auth.heroSub}>
            {modulos.map((m) => (
              <li key={m} className="rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur-md shadow-[inset_0_1px_0_hsl(0_0%_100%/0.25)]">
                {m}
              </li>
            ))}
          </ul>
        </div>
        <div
          className="hidden lg:block absolute right-10 bottom-10 h-[290px] w-[290px] xl:h-[330px] xl:w-[330px] rounded-full overflow-hidden border border-white/30 bg-white/10 backdrop-blur-xl shadow-[inset_0_2px_0_hsl(0_0%_100%/0.35),0_24px_50px_-20px_hsl(214_94%_6%/0.7)]"
          aria-hidden="true"
        >
          <img src="/brand/panda-saluda.png" alt="" className="absolute inset-0 m-auto h-[88%] w-auto max-w-[86%] object-contain drop-shadow-[0_10px_14px_hsl(214_94%_6%/0.45)]" />
        </div>
      </aside>

      {/* Panel de acceso */}
      <main className="relative flex items-center justify-center p-6 lg:p-12">
        <button
          type="button"
          onClick={toggleLang}
          className="glass-bar absolute top-5 right-5 flex items-center gap-1.5 px-4 py-2 rounded-full text-primary hover:text-primary transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Globe size={14} aria-hidden="true" /> {t.otherLang}
        </button>

        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="!text-[28px]">{t.auth.signInTitle}</h1>
            <p className="text-muted-foreground text-base mt-2">
              {mode === "login" ? t.auth.subtitle : t.auth.forgotSubtitle}
            </p>
          </div>

          {mode === "login" ? (
            <form onSubmit={login} className="space-y-4">
              <div>
                <Label className="text-base ml-4">{t.auth.email}</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base mt-1.5" />
              </div>
              <div>
                <Label className="text-base ml-4">{t.auth.password}</Label>
                <Input type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} className="h-12 text-base mt-1.5" />
              </div>
              <Button
                type="submit"
                disabled={busy || loginLockLeft > 0}
                className="w-full h-12 text-base hover:bg-[#021f47] shadow-[0_10px_24px_-10px_hsl(214_94%_20%/0.7)]"
              >
                {busy
                  ? t.auth.signingIn
                  : loginLockLeft > 0
                    ? `${t.auth.signIn} (${loginLockLeft}s)`
                    : t.auth.signIn}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => setMode("forgot")}
                >
                  {t.auth.forgotPassword}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={requestReset} className="space-y-4">
              <div>
                <Label className="text-base ml-4">{t.auth.email}</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base mt-1.5" autoFocus />
              </div>
              <Button
                type="submit"
                disabled={busy || cooldownLeft > 0}
                className="w-full h-12 text-base hover:bg-[#021f47]"
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
                  className="text-sm text-primary hover:underline"
                  onClick={() => setMode("login")}
                >
                  {t.auth.backToLogin}
                </button>
              </div>
            </form>
          )}

          {/* Sello Dazon por Mati y enlace al producto */}
          <div className="mt-10 glass-bar rounded-full pl-3 pr-5 py-2.5 flex items-center gap-3 text-sm text-muted-foreground">
            <img src="/brand/mati-icono.png" alt="" aria-hidden="true" className="h-9 w-9 rounded-full shrink-0" />
            <div className="leading-tight">
              <div className="font-semibold text-foreground">{t.auth.poweredBy}</div>
              <div className="text-xs">{t.auth.developedBy}</div>
            </div>
            <a
              href={MATI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full px-1"
            >
              {t.auth.learnMoreMati}
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
