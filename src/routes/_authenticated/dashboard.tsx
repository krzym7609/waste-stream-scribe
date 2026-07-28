import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCurrentDuty } from "@/lib/use-current-duty";
import { getCurrentShiftWindow, SHIFT_LABEL, formatHM } from "@/lib/shifts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CalendarRange,
  ClipboardList,
  FileText,
  Users,
  Settings,
  Wrench,
  BarChart3,
  Bell,
  UserCheck,
  UserX,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: ManagerDashboard,
});

function ManagerDashboard() {
  const { isManager } = useAuth();
  if (!isManager) return <Navigate to="/shift/checklist" replace />;

  const { data: duty } = useCurrentDuty();
  const now = new Date();
  const { start, end, type } = getCurrentShiftWindow(now);

  const todayIso = now.toISOString().slice(0, 10);
  const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const { data: stats } = useQuery({
    queryKey: ["manager-dashboard-stats", todayIso, monthStartIso],
    queryFn: async () => {
      const [overdue, todayDone, todayAll, unread, breakdowns, missingReports] =
        await Promise.all([
          supabase
            .from("schedule_executions")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
            .lt("scheduled_date", todayIso),
          supabase
            .from("schedule_executions")
            .select("id", { count: "exact", head: true })
            .eq("scheduled_date", todayIso)
            .eq("status", "done"),
          supabase
            .from("schedule_executions")
            .select("id", { count: "exact", head: true })
            .eq("scheduled_date", todayIso),
          supabase
            .from("shift_notifications")
            .select("id", { count: "exact", head: true })
            .is("read_at", null),
          supabase
            .from("equipment")
            .select("id", { count: "exact", head: true })
            .eq("status", "awaria"),
          supabase
            .from("duty_sessions")
            .select("id", { count: "exact", head: true })
            .gte("started_at", `${monthStartIso}T00:00:00`)
            .not("ended_at", "is", null),
        ]);
      return {
        overdue: overdue.count ?? 0,
        todayDone: todayDone.count ?? 0,
        todayAll: todayAll.count ?? 0,
        unread: unread.count ?? 0,
        breakdowns: breakdowns.count ?? 0,
        endedThisMonth: missingReports.count ?? 0,
      };
    },
  });

  const { data: recentReports } = useQuery({
    queryKey: ["manager-dashboard-reports"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shift_reports")
        .select(
          "id, duty_session_id, submitted_at, energia_end, locked_at, duty_sessions(shift_type, started_at, ended_at, user_id, profiles(first_name, last_name, username))",
        )
        .order("submitted_at", { ascending: false })
        .limit(8);
      return (data ?? []) as any[];
    },
  });

  const { data: recentBreakdowns } = useQuery({
    queryKey: ["manager-dashboard-breakdowns"],
    queryFn: async () => {
      const { data } = await supabase
        .from("equipment_events")
        .select(
          "id, description, performed_at, equipment_id, equipment(name, location)",
        )
        .eq("kind", "awaria")
        .order("performed_at", { ascending: false })
        .limit(6);
      return (data ?? []) as any[];
    },
  });

  const operatorName = duty?.operator
    ? `${duty.operator.first_name ?? ""} ${duty.operator.last_name ?? ""}`.trim() ||
      duty.operator.username ||
      "—"
    : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Pulpit kierownika</h1>
        <p className="text-sm text-muted-foreground">
          Podgląd bieżącej zmiany i kluczowych wskaźników pracy oczyszczalni.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bieżąca zmiana — {SHIFT_LABEL[type]}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="text-muted-foreground mb-2">
            Okno: {formatHM(start)}–{formatHM(end)}
          </div>
          {duty?.session ? (
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>
                Zmianę pełni: <strong>{operatorName}</strong> od{" "}
                {formatHM(new Date(duty.session.started_at))}
                {duty.session.outside_window && (
                  <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                    (poza oknem)
                  </span>
                )}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <UserX className="w-4 h-4" />
              <span>Brak operatora na zmianie</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatTile
          label="Zaległe zadania"
          value={stats?.overdue ?? 0}
          icon={<AlertTriangle className="w-4 h-4" />}
          tone={stats && stats.overdue > 0 ? "danger" : "muted"}
        />
        <StatTile
          label="Dziś wykonane"
          value={`${stats?.todayDone ?? 0} / ${stats?.todayAll ?? 0}`}
          icon={<ClipboardList className="w-4 h-4" />}
        />
        <StatTile
          label="Nieprzeczytane"
          value={stats?.unread ?? 0}
          icon={<Bell className="w-4 h-4" />}
          tone={stats && stats.unread > 0 ? "warn" : "muted"}
        />
        <StatTile
          label="Awarie"
          value={stats?.breakdowns ?? 0}
          icon={<Wrench className="w-4 h-4" />}
          tone={stats && stats.breakdowns > 0 ? "danger" : "muted"}
        />
        <StatTile
          label="Zamknięte zmiany (mies.)"
          value={stats?.endedThisMonth ?? 0}
          icon={<FileText className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base">Ostatnie raporty zmianowe</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/manager/reports">Wszystkie</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentReports?.length ? (
              recentReports.map((r) => {
                const s = r.duty_sessions;
                const p = s?.profiles;
                const name =
                  `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() ||
                  p?.username ||
                  "—";
                const filled = r.energia_end != null;
                const locked = !!r.locked_at;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 border rounded p-2 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s?.shift_type ? SHIFT_LABEL[s.shift_type as "rano" | "popoludnie"] : "—"} ·{" "}
                        {new Date(r.submitted_at).toLocaleString("pl-PL")}
                      </div>
                    </div>
                    <Badge variant={locked ? "secondary" : filled ? "default" : "outline"}>
                      {locked ? "zamknięty" : filled ? "wypełniony" : "w trakcie"}
                    </Badge>
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to="/shift/report"
                        search={{ session: r.duty_session_id } as any}
                      >
                        {locked ? "Podgląd" : "Edytuj"}
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link
                        to="/shift/handover"
                        search={{ session: r.duty_session_id } as any}
                      >
                        Przekazanie
                      </Link>
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-muted-foreground">Brak raportów.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base">Ostatnie awarie</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link to="/equipment">Obiekty</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentBreakdowns?.length ? (
              recentBreakdowns.map((e) => (
                <Link
                  key={e.id}
                  to="/equipment/$id"
                  params={{ id: e.equipment_id }}
                  className="flex items-center gap-2 border rounded p-2 text-sm hover:bg-accent"
                >
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {e.equipment?.name ?? "—"}
                      {e.equipment?.location ? (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          · {e.equipment.location}
                        </span>
                      ) : null}
                    </div>
                    {e.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {e.description}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {new Date(e.performed_at).toLocaleString("pl-PL")}
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">Brak zgłoszeń awarii.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Szybkie skróty</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/schedule">
              <CalendarRange className="w-4 h-4" /> Harmonogram
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/manager/reports">
              <BarChart3 className="w-4 h-4" /> Raporty
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/team">
              <Users className="w-4 h-4" /> Zespół
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/settings/shifts">
              <Settings className="w-4 h-4" /> Ustawienia zmian
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: "default" | "muted" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/5"
        : "";
  return (
    <div className={`border rounded-lg p-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
