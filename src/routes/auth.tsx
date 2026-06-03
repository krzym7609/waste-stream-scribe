import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Droplets } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Logowanie — System Oczyszczalnia" }] }),
  component: AuthPage,
});

function usernameToEmail(u: string) {
  return `${u.trim().toLowerCase()}@oczyszczalnia.local`;
}

function AuthPage() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/dashboard" />;

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get("username") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error("Nieprawidłowy login lub hasło");
      return;
    }
    nav({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
            <Droplets className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>System Oczyszczalnia</CardTitle>
          <CardDescription>Zaloguj się przy użyciu loginu pracownika</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Login</Label>
              <Input id="username" name="username" autoComplete="username" autoFocus required placeholder="np. jkowalski" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Hasło</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Logowanie…" : "Zaloguj się"}
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Konto zakłada kierownik lub administrator. <br />
              W razie zapomnienia hasła zgłoś się do kierownika.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
