import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Pulpit — Oczyszczalnia" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, isManager, roles } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [todayShifts, myShifts, active] = await Promise.all([
        supabase.from("shifts").select("id", { count: "exact", head: true }).eq("shift_date", today),
        supabase.from("shifts").select("id", { count: "exact", head: true }).eq("operator_id", user!.id),
        supabase.from("shifts").select("id", { count: "exact", head: true }).eq("status", "w_trakcie"),
      ]);
      return {
        today: todayShifts.count ?? 0,
        mine: myShifts.count ?? 0,
        active: active.count ?? 0,
      };
    },
    enabled: !!user,
  });

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pulpit</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Witaj{user?.email ? `, ${user.email}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {roles.map((r) => (
            <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={ClipboardList} label="Zmiany dziś" value={stats?.today ?? "—"} />
        <StatCard icon={Clock} label="W trakcie" value={stats?.active ?? "—"} />
        <StatCard icon={CheckCircle2} label="Moje zmiany" value={stats?.mine ?? "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Moduły w przygotowaniu
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• Harmonogram zadań z przeniesieniami</p>
          <p>• Raport zmianowy (7 sekcji) z generowaniem PDF</p>
          <p>• Rejestr awarii urządzeń</p>
          <p>• Panel kierownika z KPI</p>
          <p className="pt-2 text-xs">
            {isManager ? "Masz uprawnienia kierownika — wkrótce zobaczysz dodatkowe widoki." : "Pracujesz jako operator."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-3xl font-bold mt-1">{value}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
