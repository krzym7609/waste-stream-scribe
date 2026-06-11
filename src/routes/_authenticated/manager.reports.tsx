import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Download, Pencil, History, Lock } from "lucide-react";
import { generateShiftReportPdf, generateHandoverPdf } from "@/lib/pdf/shift-report-pdf";

export const Route = createFileRoute("/_authenticated/manager/reports")({
  head: () => ({ meta: [{ title: "Raporty — Oczyszczalnia" }] }),
  component: ManagerReportsPage,
});

const MONTHS_PL = [
  "Sty", "Lut", "Mar", "Kwi", "Maj", "Cze",
  "Lip", "Sie", "Wrz", "Paź", "Lis", "Gru",
];

function ManagerReportsPage() {
  const { isManager, loading } = useAuth();
  if (loading) return <div className="p-6 text-muted-foreground">Ładowanie…</div>;
  if (!isManager) return <Navigate to="/shift/checklist" />;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Raporty</h1>
        <p className="text-sm text-muted-foreground">
          Podgląd raportów zmianowych, przekazań i wykonania zadań.
        </p>
      </div>

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Dziennie</TabsTrigger>
          <TabsTrigger value="monthly">Miesięcznie</TabsTrigger>
          <TabsTrigger value="yearly">Rocznie</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4">
          <DailyView />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <MonthlyView />
        </TabsContent>
        <TabsContent value="yearly" className="mt-4">
          <YearlyView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- DAILY ---------------- */

function DailyView() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data } = useQuery({
    queryKey: ["mgr-daily", date],
    queryFn: async () => {
      const start = `${date}T00:00:00`;
      const end = `${date}T23:59:59`;
      const [reports, handovers, execs, profiles, sessions] = await Promise.all([
        supabase
          .from("shift_reports")
          .select("*, items:shift_report_items(*, object:report_objects(name, code))")
          .gte("submitted_at", start)
          .lte("submitted_at", end)
          .order("submitted_at"),
        supabase
          .from("handover_reports")
          .select("*")
          .gte("submitted_at", start)
          .lte("submitted_at", end),
        supabase
          .from("schedule_executions")
          .select("*, task:schedule_tasks(task_number, name)")
          .eq("scheduled_date", date),
        supabase.from("profiles").select("id, first_name, last_name, username"),
        supabase
          .from("duty_sessions")
          .select("id, user_id, started_at, ended_at")
          .gte("started_at", start)
          .lte("started_at", `${date}T23:59:59`)
          .order("started_at"),
      ]);
      const profMap = new Map(
        (profiles.data ?? []).map((p) => [
          p.id,
          `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.username || "—",
        ]),
      );
      return {
        reports: reports.data ?? [],
        handovers: handovers.data ?? [],
        execs: execs.data ?? [],
        profMap,
        sessions: sessions.data ?? [],
      };
    },
  });

  if (!data) return <div className="text-muted-foreground">Ładowanie…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <Label className="text-xs">Data</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raporty zmianowe ({data.reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.reports.length === 0 ? (
            <div className="text-sm text-muted-foreground">Brak raportów.</div>
          ) : (
            <div className="space-y-4">
              {data.reports.map((r: any) => (
                <div key={r.id} className="border rounded p-3 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium flex items-center gap-2">
                      {data.profMap.get(r.submitted_by) ?? "—"}
                      {r.locked_at && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Lock className="w-3 h-3" /> Zamknięty
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.submitted_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <ReportActions report={r} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <Metric label="Energia start" value={r.energia_start} unit="kWh" />
                    <Metric label="Energia koniec" value={r.energia_end} unit="kWh" />
                    <Metric label="Flok. proszk." value={r.flokulant_proszkowy_kg} unit="kg" />
                    <Metric label="Flok. emul." value={r.flokulant_emulsyjny_l} unit="l" />
                    <Metric label="Wapno" value={r.wapno_kg} unit="kg" />
                    <Metric label="FeCl₃" value={r.chlorek_zelaza_l} unit="l" />
                    <Metric label="S.M. zagęsz." value={r.sm_osadu_zageszcz} unit="%" />
                    <Metric label="S.M. odwod." value={r.sm_osadu_odwwapn} unit="%" />
                  </div>
                  {r.uwagi && <div className="mt-2 text-xs italic">„{r.uwagi}"</div>}
                  {r.items?.length > 0 && (
                    <div className="mt-2 text-xs">
                      <div className="font-medium mb-1">Ocena obiektów:</div>
                      <ul className="space-y-0.5">
                        {r.items.map((it: any) => (
                          <li key={it.id} className="flex gap-2">
                            <Badge variant={it.ocena_status === "ok" ? "outline" : "destructive"} className="text-[10px]">
                              {it.ocena_status}
                            </Badge>
                            <span>{it.object?.name}</span>
                            {it.ocena_opis && <span className="text-muted-foreground">— {it.ocena_opis}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wykonanie zadań ({data.execs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-sm mb-3">
            <Stat label="Wykonane" value={data.execs.filter((e: any) => e.status === "done").length} />
            <Stat label="Niewykonane" value={data.execs.filter((e: any) => e.status === "pending").length} />
            <Stat label="Przeniesione" value={data.execs.filter((e: any) => e.status === "deferred").length} />
          </div>
          <ul className="divide-y text-sm">
            {data.execs.map((e: any) => (
              <li key={e.id} className="py-2 flex items-center gap-2">
                <Badge variant={e.status === "done" ? "default" : "outline"} className="text-[10px]">
                  {e.status}
                </Badge>
                <span className="text-muted-foreground">{e.scheduled_shift}</span>
                <span>#{e.task?.task_number} {e.task?.name}</span>
                {e.note && <span className="ml-auto text-xs italic text-muted-foreground">{e.note}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Przekazania zmiany ({data.handovers.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {data.handovers.length === 0 ? (
            <div className="text-sm text-muted-foreground">Brak przekazań.</div>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.handovers.map((h: any) => {
                const fromName = data.profMap.get(h.from_user_id) ?? "—";
                const toName = h.to_user_id ? data.profMap.get(h.to_user_id) ?? "—" : null;
                return (
                  <li key={h.id} className="border rounded p-2">
                    <div className="flex justify-between text-xs gap-2 flex-wrap">
                      <span>
                        <span className="text-muted-foreground">Przekazujący:</span>{" "}
                        <strong>{fromName}</strong>
                        <span className="mx-1 text-muted-foreground">→</span>
                        <span className="text-muted-foreground">Przejmujący:</span>{" "}
                        <strong>{toName ?? <em className="font-normal text-muted-foreground">oczekuje na przyjęcie</em>}</strong>
                      </span>
                      <span className="text-muted-foreground flex items-center gap-2">
                        {new Date(h.submitted_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                        {h.accepted_at ? " · przyjęte" : " · oczekuje"}
                        <HandoverActions handover={h} />
                      </span>
                    </div>
                    {h.uwagi_ogolne && <div className="mt-1 italic text-xs">„{h.uwagi_ogolne}"</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- MONTHLY ---------------- */

function MonthlyView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data } = useQuery({
    queryKey: ["mgr-monthly", year, month],
    queryFn: async () => {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).getDate();
      const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
      const [reports, execs, handovers] = await Promise.all([
        supabase.from("shift_reports").select("*").gte("submitted_at", `${start}T00:00:00`).lte("submitted_at", `${end}T23:59:59`),
        supabase.from("schedule_executions").select("status").gte("scheduled_date", start).lte("scheduled_date", end),
        supabase.from("handover_reports").select("id, accepted_at").gte("submitted_at", `${start}T00:00:00`).lte("submitted_at", `${end}T23:59:59`),
      ]);
      return {
        reports: reports.data ?? [],
        execs: execs.data ?? [],
        handovers: handovers.data ?? [],
      };
    },
  });

  const agg = useMemo(() => {
    if (!data) return null;
    const sum = (k: string) =>
      data.reports.reduce((s, r: any) => s + (Number(r[k]) || 0), 0);
    const avg = (k: string) => {
      const vals = data.reports.map((r: any) => Number(r[k])).filter((v) => !Number.isNaN(v) && v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    };
    const energiaTotal = data.reports.reduce(
      (s, r: any) => s + Math.max(0, (Number(r.energia_end) || 0) - (Number(r.energia_start) || 0)),
      0,
    );
    return {
      raportow: data.reports.length,
      energia: energiaTotal,
      flokProszk: sum("flokulant_proszkowy_kg"),
      flokEmul: sum("flokulant_emulsyjny_l"),
      wapno: sum("wapno_kg"),
      fecl: sum("chlorek_zelaza_l"),
      smZag: avg("sm_osadu_zageszcz"),
      smOdw: avg("sm_osadu_odwwapn"),
      done: data.execs.filter((e: any) => e.status === "done").length,
      pending: data.execs.filter((e: any) => e.status === "pending").length,
      deferred: data.execs.filter((e: any) => e.status === "deferred").length,
      handovers: data.handovers.length,
      handoversAccepted: data.handovers.filter((h: any) => h.accepted_at).length,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <Label className="text-xs">Rok</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
        </div>
        <div>
          <Label className="text-xs">Miesiąc</Label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS_PL.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!agg ? (
        <div className="text-muted-foreground">Ładowanie…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Raportów" value={agg.raportow} />
            <Stat label="Zużycie energii" value={`${agg.energia.toFixed(0)} kWh`} />
            <Stat label="Flokulant proszk." value={`${agg.flokProszk.toFixed(1)} kg`} />
            <Stat label="Flokulant emul." value={`${agg.flokEmul.toFixed(1)} l`} />
            <Stat label="Wapno" value={`${agg.wapno.toFixed(1)} kg`} />
            <Stat label="Chlorek żelaza" value={`${agg.fecl.toFixed(1)} l`} />
            <Stat label="Średnia S.M. zag." value={`${agg.smZag.toFixed(2)} %`} />
            <Stat label="Średnia S.M. odw." value={`${agg.smOdw.toFixed(2)} %`} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Zadania wykonane" value={agg.done} />
            <Stat label="Zadania niewyk." value={agg.pending} />
            <Stat label="Przeniesione" value={agg.deferred} />
            <Stat label="Przekazania" value={`${agg.handoversAccepted}/${agg.handovers}`} />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- YEARLY ---------------- */

function YearlyView() {
  const [year, setYear] = useState(new Date().getFullYear());

  const { data } = useQuery({
    queryKey: ["mgr-yearly", year],
    queryFn: async () => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const [reports, execs] = await Promise.all([
        supabase.from("shift_reports").select("submitted_at, energia_start, energia_end, flokulant_proszkowy_kg, flokulant_emulsyjny_l, wapno_kg, chlorek_zelaza_l").gte("submitted_at", `${start}T00:00:00`).lte("submitted_at", `${end}T23:59:59`),
        supabase.from("schedule_executions").select("scheduled_date, status").gte("scheduled_date", start).lte("scheduled_date", end),
      ]);
      return { reports: reports.data ?? [], execs: execs.data ?? [] };
    },
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: MONTHS_PL[i],
      energia: 0,
      flokProszk: 0,
      flokEmul: 0,
      wapno: 0,
      fecl: 0,
      done: 0,
      pending: 0,
    }));
    for (const r of data.reports as any[]) {
      const m = new Date(r.submitted_at).getMonth();
      months[m].energia += Math.max(0, (Number(r.energia_end) || 0) - (Number(r.energia_start) || 0));
      months[m].flokProszk += Number(r.flokulant_proszkowy_kg) || 0;
      months[m].flokEmul += Number(r.flokulant_emulsyjny_l) || 0;
      months[m].wapno += Number(r.wapno_kg) || 0;
      months[m].fecl += Number(r.chlorek_zelaza_l) || 0;
    }
    for (const e of data.execs as any[]) {
      const m = Number(e.scheduled_date.slice(5, 7)) - 1;
      if (e.status === "done") months[m].done++;
      else if (e.status === "pending") months[m].pending++;
    }
    return months;
  }, [data]);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Rok</Label>
        <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Zużycie energii i chemii</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="energia" fill="#3b82f6" name="Energia [kWh]" />
              <Bar dataKey="flokProszk" fill="#10b981" name="Flok. proszk. [kg]" />
              <Bar dataKey="flokEmul" fill="#f59e0b" name="Flok. emul. [l]" />
              <Bar dataKey="wapno" fill="#8b5cf6" name="Wapno [kg]" />
              <Bar dataKey="fecl" fill="#ef4444" name="FeCl₃ [l]" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Wykonanie zadań</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="done" fill="#10b981" name="Wykonane" />
              <Bar dataKey="pending" fill="#ef4444" name="Niewykonane" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- HELPERS ---------------- */

function Metric({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="bg-muted/40 rounded px-2 py-1">
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className="font-medium">{value != null ? `${value} ${unit}` : "—"}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

/* ---------------- ACTIONS / HISTORY ---------------- */

function ReportActions({ report }: { report: any }) {
  const downloadPdf = async () => {
    const [{ data: items }, { data: objects }, { data: session }, { data: profile }] =
      await Promise.all([
        supabase.from("shift_report_items").select("*").eq("report_id", report.id),
        supabase.from("report_objects").select("id, name").eq("active", true),
        supabase.from("duty_sessions").select("shift_type").eq("id", report.duty_session_id).maybeSingle(),
        supabase.from("profiles").select("first_name, last_name, username").eq("id", report.submitted_by).maybeSingle(),
      ]);
    const objMap = new Map((objects ?? []).map((o) => [o.id, o.name]));
    const operator =
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || profile?.username || "—";
    await generateShiftReportPdf({
      date: report.submitted_at.slice(0, 10),
      shift: session?.shift_type ?? "—",
      operator,
      operatorzy: report.operatorzy ?? null,
      submittedAt: report.submitted_at,
      data: {
        energia_start: report.energia_start,
        energia_end: report.energia_end,
        flokulant_proszkowy_kg: report.flokulant_proszkowy_kg,
        flokulant_emulsyjny_l: report.flokulant_emulsyjny_l,
        wapno_kg: report.wapno_kg,
        chlorek_zelaza_l: report.chlorek_zelaza_l,
        sm_osadu_zageszcz: report.sm_osadu_zageszcz,
        sm_osadu_odwwapn: report.sm_osadu_odwwapn,
        opady: report.opady,
        uwagi: report.uwagi,
      },
      items: (items ?? []).map((it: any) => ({
        object_name: objMap.get(it.object_id) ?? "—",
        ocena_status: it.ocena_status,
        ocena_opis: it.ocena_opis,
        harmonogram_status: it.harmonogram_status,
        harmonogram_opis: it.harmonogram_opis,
        proponowany_termin: it.proponowany_termin,
        inne_czynnosci: it.inne_czynnosci,
      })),
    });
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={downloadPdf} title="Pobierz PDF">
        <Download className="w-4 h-4" />
      </Button>
      <Button asChild variant="ghost" size="sm" title="Edytuj">
        <Link to="/shift/report" search={{ session: report.duty_session_id }}>
          <Pencil className="w-4 h-4" />
        </Link>
      </Button>
      <HistoryDialog kind="report" id={report.id} />
    </div>
  );
}

function HandoverActions({ handover }: { handover: any }) {
  const downloadPdf = async () => {
    const [{ data: items }, { data: objects }, { data: fromP }, { data: toP }] = await Promise.all([
      supabase.from("handover_report_items").select("*").eq("handover_id", handover.id),
      supabase.from("handover_objects").select("id, name").eq("active", true),
      supabase.from("profiles").select("first_name, last_name, username").eq("id", handover.from_user_id).maybeSingle(),
      handover.to_user_id
        ? supabase.from("profiles").select("first_name, last_name, username").eq("id", handover.to_user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const objMap = new Map((objects ?? []).map((o) => [o.id, o.name]));
    const fmt = (p: any) =>
      p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.username || "—" : "—";
    await generateHandoverPdf({
      date: handover.submitted_at.slice(0, 10),
      shiftFrom: "—",
      operatorFrom: fmt(fromP),
      operatorTo: handover.to_user_id ? fmt(toP) : null,
      submittedAt: handover.submitted_at,
      acceptedAt: handover.accepted_at,
      uwagiOgolne: handover.uwagi_ogolne,
      items: (items ?? []).map((it: any) => ({
        object_name: objMap.get(it.object_id) ?? "—",
        uwagi_przekazujacego: it.uwagi_przekazujacego,
        uwagi_przyjmujacego: it.uwagi_przyjmujacego,
      })),
    });
  };

  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={downloadPdf} title="Pobierz PDF">
        <Download className="w-4 h-4" />
      </Button>
      <Button asChild variant="ghost" size="sm" title="Edytuj">
        <Link to="/shift/handover" search={{ handover: handover.id }}>
          <Pencil className="w-4 h-4" />
        </Link>
      </Button>
      <HistoryDialog kind="handover" id={handover.id} />
    </span>
  );
}

function HistoryDialog({ kind, id }: { kind: "report" | "handover"; id: string }) {
  const [open, setOpen] = useState(false);



  const { data } = useQuery({
    queryKey: ["snapshots", kind, id, open],
    enabled: open,
    queryFn: async () => {
      const snapsRes =
        kind === "report"
          ? await supabase
              .from("shift_report_snapshots")
              .select("*")
              .eq("report_id", id)
              .order("edited_at", { ascending: false })
          : await supabase
              .from("handover_report_snapshots")
              .select("*")
              .eq("handover_id", id)
              .order("edited_at", { ascending: false });
      const snaps = snapsRes.data ?? [];

      const editorIds = Array.from(new Set((snaps ?? []).map((s: any) => s.edited_by)));
      const { data: profiles } = editorIds.length
        ? await supabase.from("profiles").select("id, first_name, last_name, username").in("id", editorIds)
        : { data: [] as any[] };
      const profMap = new Map(
        (profiles ?? []).map((p: any) => [
          p.id,
          `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.username || "—",
        ]),
      );
      return { snaps: snaps ?? [], profMap };
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Historia zmian">
          <History className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historia zmian</DialogTitle>
        </DialogHeader>
        {!data ? (
          <div className="text-sm text-muted-foreground">Ładowanie…</div>
        ) : data.snaps.length === 0 ? (
          <div className="text-sm text-muted-foreground">Brak edycji — raport w wersji pierwotnej.</div>
        ) : (
          <ul className="space-y-3 text-sm">
            {data.snaps.map((s: any) => (
              <li key={s.id} className="border rounded p-3">
                <div className="flex justify-between text-xs mb-2">
                  <strong>{data.profMap.get(s.edited_by) ?? "—"}</strong>
                  <span className="text-muted-foreground">
                    {new Date(s.edited_at).toLocaleString("pl-PL")}
                  </span>
                </div>
                {s.reason && (
                  <div className="text-xs italic mb-2">Powód: „{s.reason}"</div>
                )}
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Pokaż snapshot
                  </summary>
                  <pre className="text-[10px] bg-muted/40 rounded p-2 mt-2 overflow-x-auto">
                    {JSON.stringify(s.snapshot, null, 2)}
                  </pre>
                  <pre className="text-[10px] bg-muted/40 rounded p-2 mt-1 overflow-x-auto">
                    {JSON.stringify(s.items_snapshot, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

