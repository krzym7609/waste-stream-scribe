import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { useShiftSettings } from "@/lib/use-shift-settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertCircle, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/shifts")({
  head: () => ({ meta: [{ title: "Ustawienia zmian" }] }),
  component: SettingsShiftsPage,
});

function SettingsShiftsPage() {
  const { isManager } = useAuth();
  const { data, isLoading } = useShiftSettings();

  const [s1s, setS1s] = useState("06:00");
  const [s1e, setS1e] = useState("14:00");
  const [s2s, setS2s] = useState("14:00");
  const [s2e, setS2e] = useState("22:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setS1s(data.shift1_start);
      setS1e(data.shift1_end);
      setS2s(data.shift2_start);
      setS2e(data.shift2_end);
    }
  }, [data]);

  if (!isManager) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <AlertCircle className="w-4 h-4" /> Brak dostępu — tylko kierownik lub zarządca.
      </div>
    );
  }

  async function save() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("shift_settings" as any)
        .upsert({
          id: 1,
          shift1_start: s1s + ":00",
          shift1_end: s1e + ":00",
          shift2_start: s2s + ":00",
          shift2_end: s2e + ":00",
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
      toast.success("Godziny zmian zapisane. Zmiany widoczne od razu dla wszystkich.");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ustawienia zmian</h1>
        <p className="text-sm text-muted-foreground">
          System pracuje w modelu 2-zmianowym. Godziny obowiązują dla całego zespołu (synchronizacja na żywo).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" /> Godziny zmian
          </CardTitle>
          <CardDescription>Format 24h, np. 06:00.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Ładowanie…</div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Zmiana 1</Label>
                <div className="flex items-center gap-2">
                  <Input type="time" value={s1s} onChange={(e) => setS1s(e.target.value)} className="w-32" />
                  <span className="text-muted-foreground">–</span>
                  <Input type="time" value={s1e} onChange={(e) => setS1e(e.target.value)} className="w-32" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Zmiana 2</Label>
                <div className="flex items-center gap-2">
                  <Input type="time" value={s2s} onChange={(e) => setS2s(e.target.value)} className="w-32" />
                  <span className="text-muted-foreground">–</span>
                  <Input type="time" value={s2e} onChange={(e) => setS2e(e.target.value)} className="w-32" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={save} disabled={busy}>
                  {busy ? "Zapisywanie…" : "Zapisz"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
