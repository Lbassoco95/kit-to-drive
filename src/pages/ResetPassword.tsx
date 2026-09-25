import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";

export default function ResetPassword() {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [ready, setReady] = useState(false);
  const { user, loading, changePassword, clearPasswordRecovery, signOut } = useAuth();
  const { t, toggleLang } = useLang();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    // Con sesión (recovery o autenticada en esta ruta), mostrar el formulario.
    if (user) {
      setReady(true);
      return;
    }
    setReady(false);
  }, [user, loading]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (pwd.length < 8) {
      toast.error(t.auth.passwordTooShort);
      return;
    }
    if (pwd !== confirm) {
      toast.error(t.auth.passwordMismatch);
      return;
    }
    if (pwd.toLowerCase().includes("dazon") || pwd.toLowerCase().includes("1234")) {
      toast.error(t.auth.passwordWeak);
      return;
    }
    setBusy(true);
    const { error } = await changePassword(pwd);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    clearPasswordRecovery();
    toast.success(t.auth.passwordUpdated);
    nav("/", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1F3864] p-4 text-white">
        {t.componentes.acceso.cargando}
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1F3864] p-4">
        <Card className="w-full max-w-lg p-8 shadow-2xl relative space-y-4">
          <button
            type="button"
            onClick={toggleLang}
            className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-slate-500 hover:text-[#1F3864] hover:border-[#1F3864] transition-all text-sm font-medium"
          >
            🌐 {t.otherLang}
          </button>
          <h1 className="!text-2xl !text-[#1F3864] text-center">{t.auth.resetTitle}</h1>
          <p className="text-muted-foreground text-center text-sm">{t.auth.resetLinkInvalid}</p>
          <Button asChild className="w-full h-12 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            <Link to="/auth">{t.auth.requestNewLink}</Link>
          </Button>
        </Card>
      </div>
    );
  }

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
          <h1 className="!text-3xl !text-[#1F3864]">{t.auth.resetTitle}</h1>
          <p className="text-muted-foreground text-base mt-2">{t.auth.resetSubtitle}</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-base">{t.auth.newPassword}</Label>
            <Input
              type={showPwd ? "text" : "password"}
              required
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              className="h-12 text-base"
              placeholder={t.usuarios.passwordPlaceholder}
              autoFocus
            />
          </div>
          <div>
            <Label className="text-base">{t.auth.confirmPassword}</Label>
            <Input
              type={showPwd ? "text" : "password"}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-12 text-base"
              placeholder={t.auth.confirmPassword}
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id="showPwdReset"
              checked={showPwd}
              onChange={(e) => setShowPwd(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="showPwdReset" className="text-muted-foreground cursor-pointer">
              {t.auth.showPasswords}
            </label>
          </div>
          <Button type="submit" disabled={busy} className="w-full h-12 text-base bg-[#1F3864] hover:bg-[#162a4d]">
            {busy ? t.auth.savingPassword : t.auth.savePassword}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            className="text-sm text-[#1F3864] hover:underline"
            onClick={() => {
              clearPasswordRecovery();
              void signOut();
              nav("/auth", { replace: true });
            }}
          >
            {t.auth.backToLogin}
          </button>
        </div>
      </Card>
    </div>
  );
}
