import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, LogOut, Check, X } from "lucide-react";
import { useLang } from "@/contexts/LangContext";

interface Props {
  onChangePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  onSignOut: () => Promise<void>;
}

export default function ForcePasswordChange({ onChangePassword, onSignOut }: Props) {
  const { t } = useLang();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const checks = useMemo(() => ({
    minLength: pwd.length >= 8,
    noDazon: !pwd.toLowerCase().includes("dazon"),
    no1234: !pwd.includes("1234"),
    passwordsMatch: pwd.length > 0 && pwd === confirm,
  }), [pwd, confirm]);

  const allMet = useMemo(() => Object.values(checks).every(Boolean), [checks]);

  const requirements = [
    { key: "minLength", met: checks.minLength },
    { key: "noDazon", met: checks.noDazon },
    { key: "no1234", met: checks.no1234 },
    { key: "passwordsMatch", met: checks.passwordsMatch },
  ] as const;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!allMet) {
      if (!checks.minLength) {
        toast.error(t.auth.passwordTooShort);
      } else if (!checks.passwordsMatch) {
        toast.error(t.auth.passwordMismatch);
      } else {
        toast.error(t.auth.passwordWeak);
      }
      return;
    }
    setBusy(true);
    const { error } = await onChangePassword(pwd);
    // Éxito: changePassword cierra sesión y hace redirect a /auth?passwordUpdated=1.
    if (error) {
      setBusy(false);
      toast.error(error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1F3864]/90 p-4">
      <Card className="w-full max-w-md p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-600">
            <Lock size={20} />
          </div>
          <h2 className="text-xl font-bold text-[#1F3864]">{t.auth.forceTitle}</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {t.auth.forceSubtitle}
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="new-password">{t.auth.newPassword}</Label>
            <Input
              id="new-password"
              type={showPwd ? "text" : "password"}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              className="h-11"
              placeholder={t.auth.passwordTooShort}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">{t.auth.confirmPassword}</Label>
            <Input
              id="confirm-password"
              type={showPwd ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11"
              placeholder={t.auth.confirmPassword}
            />
          </div>
          <div className="rounded-lg border bg-slate-50 p-3">
            <p className="mb-2 text-sm font-medium text-[#1F3864]">{t.auth.passwordRequirements.title}</p>
            <ul className="space-y-1.5">
              {requirements.map(({ key, met }) => (
                <li key={key} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${met ? "bg-green-100 text-green-600" : "bg-slate-200 text-slate-500"}`}>
                    {met ? <Check size={10} strokeWidth={4} /> : <X size={10} strokeWidth={4} />}
                  </span>
                  <span className={met ? "text-muted-foreground line-through" : "text-slate-700"}>
                    {t.auth.passwordRequirements[key]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id="showPwd"
              checked={showPwd}
              onChange={(e) => setShowPwd(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="showPwd" className="text-muted-foreground cursor-pointer">{t.auth.showPasswords}</label>
          </div>
          <Button
            type="submit"
            disabled={busy || !allMet}
            className="w-full h-11 bg-[#1F3864] hover:bg-[#162a4d]"
          >
            {busy ? t.auth.savingPassword : t.auth.savePassword}
          </Button>
        </form>
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => void onSignOut()} className="text-muted-foreground">
            <LogOut size={16} className="mr-2" /> {t.auth.signOut}
          </Button>
        </div>
      </Card>
    </div>
  );
}
