import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/change-password")({
  head: () => ({ meta: [{ title: "Zmiana hasła" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const { user, profile, refreshProfile } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const mustChange = profile?.must_change_password ?? false;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pw1 = String(fd.get("pw1") ?? "");
    const pw2 = String(fd.get("pw2") ?? "");
    if (pw1.length < 8) return toast.error("Hasło musi mieć min. 8 znaków");
    if (pw1 !== pw2) return toast.error("Hasła nie są takie same");

    setBusy(true);
    const { error: pwErr } = await supabase.auth.updateUser({ password: pw1 });
    if (pwErr) {
      setBusy(false);
      return toast.error(pwErr.message);
    }
    // wyczyść flagę wymuszenia zmiany
    if (user) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", user.id);
      await refreshProfile();
    }
    setBusy(false);
    toast.success("Hasło zostało zmienione");
    nav({ to: "/dashboard" });
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Zmiana hasła</CardTitle>
          <CardDescription>
            {mustChange
              ? "Ustaw własne hasło zanim przejdziesz dalej."
              : "Zmień swoje hasło dostępu do systemu."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw1">Nowe hasło (min. 8 znaków)</Label>
              <Input id="pw1" name="pw1" type="password" minLength={8} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Powtórz nowe hasło</Label>
              <Input id="pw2" name="pw2" type="password" minLength={8} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Zapisywanie…" : "Zapisz hasło"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
