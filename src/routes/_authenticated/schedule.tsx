import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, Save } from "lucide-react";
import { toast } from "sonner";
import { SHIFT_DEFS, type ShiftType } from "@/lib/shifts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({ meta: [{ title: "Harmonogram — Oczyszczalnia" }] }),
  component: SchedulePage,
});

type Task = {
  id: string;
  task_number: number;
  name: string;
  requires_service_report: boolean;
  frequency_note: string | null;
};
type TemplateEntry = { id: string; task_id: string; day_of_month: number; shifts: ShiftType[] };
type OverrideEntry = {
  id: string;
  task_id: string;
  year: number;
  month: number;
  day_of_month: number;
  shifts: ShiftType[];
};

const SHIFT_BADGE: Record<ShiftType, { label: string; color: string }> = {
  rano: { label: "R", color: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200" },
  popoludnie: { label: "P", color: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200" },
  noc: { label: "N", color: "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-200" },
};

const MONTHS_PL = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function SchedulePage() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: tasks } = useQuery({
    queryKey: ["schedule-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_tasks")
        .select("id, task_number, name, requires_service_report, frequency_note")
        .eq("active", true)
        .order("task_number");
      if (error) throw error;
      return data as Task[];
    },
  });

  const { data: templateEntries } = useQuery({
    queryKey: ["schedule-template"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_template_entries")
        .select("id, task_id, day_of_month, shifts");
      if (error) throw error;
      return data as TemplateEntry[];
    },
  });

  const { data: overrideEntries } = useQuery({
    queryKey: ["schedule-overrides", year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_month_overrides")
        .select("id, task_id, year, month, day_of_month, shifts")
        .eq("year", year)
        .eq("month", month);
      if (error) throw error;
      return data as OverrideEntry[];
    },
  });

  const tplMap = useMemo(() => {
    const m = new Map<string, TemplateEntry>();
    (templateEntries ?? []).forEach((e) => m.set(`${e.task_id}:${e.day_of_month}`, e));
    return m;
  }, [templateEntries]);

  const ovrMap = useMemo(() => {
    const m = new Map<string, OverrideEntry>();
    (overrideEntries ?? []).forEach((e) => m.set(`${e.task_id}:${e.day_of_month}`, e));
    return m;
  }, [overrideEntries]);

  const days = useMemo(() => {
    const n = daysInMonth(year, month);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [year, month]);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 3; y++) list.push(y);
    return list;
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Harmonogram czynności eksploatacyjnych</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isManager
              ? "Kliknij komórkę, aby przypisać zmiany dla wybranego miesiąca."
              : "Tylko do podglądu."}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Rok</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Miesiąc</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS_PL.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isManager && (
            <Button variant="outline" asChild>
              <Link to="/schedule/tasks">
                <ListChecks className="w-4 h-4" />
                Zarządzaj zadaniami
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-3 flex-wrap">
            {MONTHS_PL[month - 1]} {year}
            <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <Badge variant="outline" className={SHIFT_BADGE.rano.color}>R</Badge> Rano 6–14
              <Badge variant="outline" className={SHIFT_BADGE.popoludnie.color}>P</Badge> Popołudnie 14–22
              <Badge variant="outline" className={SHIFT_BADGE.noc.color}>N</Badge> Noc 22–6
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-320px)]">
            <table className="border-collapse text-xs" style={{ tableLayout: "fixed", width: 48 + 280 + days.length * 36 }}>
              <colgroup>
                <col style={{ width: 48 }} />
                <col style={{ width: 280 }} />
                {days.map((d) => (
                  <col key={d} style={{ width: 36 }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-30 bg-card">
                <tr>
                  <th className="sticky left-0 z-40 bg-card border-r border-b p-2 text-left">Nr</th>
                  <th className="sticky z-40 bg-card border-r border-b p-2 text-left" style={{ left: 48 }}>Zadanie</th>
                  {days.map((d) => (
                    <th key={d} className="border-b border-r p-1 text-center font-medium bg-card">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks?.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="sticky left-0 z-20 bg-card border-r border-b p-2 font-mono text-center">
                      {t.task_number}
                    </td>
                    <td
                      className={cn(
                        "sticky z-20 bg-card border-r border-b p-2",
                        t.requires_service_report && "text-blue-600 dark:text-blue-400 font-medium",
                      )}
                      style={{ left: 48 }}
                      title={t.frequency_note ?? undefined}
                    >
                      {t.name}
                    </td>
                    {days.map((d) => {
                      const key = `${t.id}:${d}`;
                      const ovr = ovrMap.get(key);
                      const tpl = tplMap.get(key);
                      const shifts = ovr ? ovr.shifts : (tpl?.shifts ?? []);
                      const isFromTemplate = !ovr && shifts.length > 0;
                      return (
                        <td key={d} className="border-r border-b p-0 text-center">
                          <Cell
                            taskId={t.id}
                            year={year}
                            month={month}
                            day={d}
                            shifts={shifts}
                            fromTemplate={isFromTemplate}
                            overrideId={ovr?.id}
                            canEdit={isManager}
                            onSaved={() =>
                              qc.invalidateQueries({ queryKey: ["schedule-overrides", year, month] })
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-1 text-sm">
          <p className="font-medium text-blue-600 dark:text-blue-400">
            UWAGA! Czynności wypisane niebieską czcionką wymagają wypełnienia wewnętrznych raportów serwisowych.
          </p>
          <p className="text-xs text-muted-foreground">
            Objaśnienia: [*)] — raz na trzy miesiące, [**)] — raz na sześć miesięcy, [***)] — raz na miesiąc, ale tylko w sezonie.
          </p>
          <p className="text-xs text-muted-foreground italic">
            Komórki wyświetlone z lekkim wyszarzeniem pochodzą z szablonu domyślnego. Edycja zapisuje przypisanie tylko dla wybranego miesiąca i roku.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Cell({
  taskId,
  year,
  month,
  day,
  shifts,
  fromTemplate,
  overrideId,
  canEdit,
  onSaved,
}: {
  taskId: string;
  year: number;
  month: number;
  day: number;
  shifts: ShiftType[];
  fromTemplate: boolean;
  overrideId: string | undefined;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);

  const content = (
    <div
      className={cn(
        "h-8 w-full flex items-center justify-center gap-0.5 px-0.5",
        canEdit && "cursor-pointer hover:bg-accent/50",
        fromTemplate && "opacity-50",
      )}
    >
      {shifts.length === 0 ? (
        <span className="text-muted-foreground/30">·</span>
      ) : (
        shifts.map((s) => (
          <span
            key={s}
            className={cn(
              "inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-semibold border",
              SHIFT_BADGE[s].color,
            )}
          >
            {SHIFT_BADGE[s].label}
          </span>
        ))
      )}
    </div>
  );

  if (!canEdit) return content;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="w-full" type="button">{content}</button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" align="center">
        <EditForm
          taskId={taskId}
          year={year}
          month={month}
          day={day}
          overrideId={overrideId}
          initialShifts={shifts}
          fromTemplate={fromTemplate}
          onDone={() => {
            setOpen(false);
            onSaved();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function EditForm({
  taskId,
  year,
  month,
  day,
  overrideId,
  initialShifts,
  fromTemplate,
  onDone,
}: {
  taskId: string;
  year: number;
  month: number;
  day: number;
  overrideId: string | undefined;
  initialShifts: ShiftType[];
  fromTemplate: boolean;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<ShiftType>>(new Set(initialShifts));

  function toggle(s: ShiftType) {
    const next = new Set(selected);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setSelected(next);
  }

  const save = useMutation({
    mutationFn: async () => {
      const arr = Array.from(selected);
      if (overrideId) {
        const { error } = await supabase
          .from("schedule_month_overrides")
          .update({ shifts: arr })
          .eq("id", overrideId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("schedule_month_overrides")
          .insert({ task_id: taskId, year, month, day_of_month: day, shifts: arr });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Zapisano");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revert = useMutation({
    mutationFn: async () => {
      if (!overrideId) return;
      const { error } = await supabase
        .from("schedule_month_overrides")
        .delete()
        .eq("id", overrideId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Przywrócono z szablonu");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">
        {day}.{String(month).padStart(2, "0")}.{year}
        {fromTemplate && <span className="ml-2 italic">(z szablonu)</span>}
      </div>
      {(Object.keys(SHIFT_DEFS) as ShiftType[]).map((s) => (
        <label key={s} className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={selected.has(s)} onCheckedChange={() => toggle(s)} />
          <Label className="cursor-pointer text-sm font-normal">{SHIFT_DEFS[s].label}</Label>
        </label>
      ))}
      <Button size="sm" className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
        <Save className="w-3.5 h-3.5" />
        {save.isPending ? "Zapisywanie…" : "Zapisz dla tego miesiąca"}
      </Button>
      {overrideId && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-xs"
          onClick={() => revert.mutate()}
          disabled={revert.isPending}
        >
          Wróć do szablonu
        </Button>
      )}
    </div>
  );
}
