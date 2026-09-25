import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock, LogOut } from "lucide-react";
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
    const { error } = await onChangePassword(pwd);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t.auth.passwordUpdated);
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
            <Label>{t.auth.newPassword}</Label>
            <Input
              type={showPwd ? "text" : "password"}
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              className="h-11"
              placeholder={t.auth.passwordTooShort}
              autoFocus
            />
          </div>
          <div>
            <Label>{t.auth.confirmPassword}</Label>
            <Input
              type={showPwd ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11"
              placeholder={t.auth.confirmPassword}
            />
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
            disabled={busy}
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
