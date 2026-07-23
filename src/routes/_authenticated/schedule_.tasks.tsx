import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, ArrowLeft, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SHIFT_DEFS, type ShiftType } from "@/lib/shifts";

export const Route = createFileRoute("/_authenticated/schedule_/tasks")({
  head: () => ({ meta: [{ title: "Zadania harmonogramu — Oczyszczalnia" }] }),
  component: TasksPage,
});

type Task = {
  id: string;
  task_number: number;
  name: string;
  active: boolean;
  requires_service_report: boolean;
  frequency_note: string | null;
};

function TasksPage() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_tasks")
        .select("*")
        .order("task_number");
      if (error) throw error;
      return data as Task[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: {
      id?: string;
      task_number: number;
      name: string;
      requires_service_report: boolean;
      frequency_note: string | null;
      active: boolean;
    }) => {
      if (input.id) {
        const { error } = await supabase
          .from("schedule_tasks")
          .update({
            task_number: input.task_number,
            name: input.name,
            requires_service_report: input.requires_service_report,
            frequency_note: input.frequency_note,
            active: input.active,
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("schedule_tasks").insert({
          task_number: input.task_number,
          name: input.name,
          requires_service_report: input.requires_service_report,
          frequency_note: input.frequency_note,
          active: input.active,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks-all"] });
      qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
      setOpen(false);
      setEditing(null);
      toast.success("Zapisano");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (t: Task) => {
      const { error } = await supabase
        .from("schedule_tasks")
        .update({ active: !t.active })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks-all"] });
      qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedule_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks-all"] });
      qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
      toast.success("Usunięto");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    upsert.mutate({
      id: editing?.id,
      task_number: Number(fd.get("task_number")),
      name: String(fd.get("name") ?? "").trim(),
      requires_service_report: fd.get("requires_service_report") === "on",
      frequency_note: String(fd.get("frequency_note") ?? "").trim() || null,
      active: editing ? (fd.get("active") === "on") : true,
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/schedule">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Zadania eksploatacyjne</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Słownik zadań harmonogramu — kierownik może edytować, dodawać i usuwać.
            </p>
          </div>
        </div>
        {isManager && (
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={() => setEditing(null)}>
                <Plus className="w-4 h-4" />
                Nowe zadanie
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edytuj zadanie" : "Nowe zadanie"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="task_number">Numer</Label>
                  <Input
                    id="task_number"
                    name="task_number"
                    type="number"
                    min={1}
                    defaultValue={editing?.task_number ?? (tasks?.length ?? 0) + 1}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Nazwa</Label>
                  <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="frequency_note">Notatka o częstotliwości (opcjonalnie)</Label>
                  <Input
                    id="frequency_note"
                    name="frequency_note"
                    placeholder="np. *) raz na 3 miesiące"
                    defaultValue={editing?.frequency_note ?? ""}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    id="requires_service_report"
                    name="requires_service_report"
                    defaultChecked={editing?.requires_service_report ?? false}
                  />
                  <span className="text-sm">Wymaga wewnętrznego raportu serwisowego (niebieska czcionka)</span>
                </label>
                {editing && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox id="active" name="active" defaultChecked={editing.active} />
                    <span className="text-sm">Aktywne</span>
                  </label>
                )}
                <Button type="submit" className="w-full" disabled={upsert.isPending}>
                  {upsert.isPending ? "Zapisywanie…" : "Zapisz"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista zadań</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Ładowanie…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Nr</TableHead>
                  <TableHead>Nazwa</TableHead>
                  <TableHead className="w-56">Częstotliwość</TableHead>
                  <TableHead className="w-20">Aktywne</TableHead>
                  {isManager && <TableHead className="text-right w-32">Akcje</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks?.map((t) => (
                  <TableRow key={t.id} className={cn(!t.active && "opacity-50")}>
                    <TableCell className="font-mono">{t.task_number}</TableCell>
                    <TableCell className={cn(t.requires_service_report && "text-blue-600 dark:text-blue-400 font-medium")}>
                      {t.name}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.frequency_note ?? "—"}</TableCell>
                    <TableCell>
                      <Checkbox
                        checked={t.active}
                        onCheckedChange={() => toggleActive.mutate(t)}
                        disabled={!isManager}
                      />
                    </TableCell>
                    {isManager && (
                      <TableCell className="text-right space-x-1">
                        <TemplateButton taskId={t.id} taskName={t.name} />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditing(t);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`Usunąć zadanie nr ${t.task_number}? Spowoduje to usunięcie wszystkich przypisań w harmonogramie.`))
                              remove.mutate(t.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Edytor szablonu (dni miesiąca × zmiany) ---------- */

type TplEntry = { id: string; day_of_month: number; shifts: ShiftType[] };
type OverrideEntry = { id: string; year: number; month: number; day_of_month: number; shifts: ShiftType[] };

const WEEKDAYS_PL = ["nd", "pn", "wt", "śr", "czw", "pt", "sb"];
const MONTHS_PL = [
  "styczeń","luty","marzec","kwiecień","maj","czerwiec",
  "lipiec","sierpień","wrzesień","październik","listopad","grudzień"
];

function TemplateButton({ taskId, taskName }: { taskId: string; taskName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="icon" variant="ghost" title="Ustaw dni w miesiącu" onClick={() => setOpen(true)}>
        <CalendarDays className="w-3.5 h-3.5" />
      </Button>
      {open && (
        <TemplateDialog taskId={taskId} taskName={taskName} open={open} onOpenChange={setOpen} />
      )}
    </>
  );
}

function TemplateDialog({
  taskId,
  taskName,
  open,
  onOpenChange,
}: {
  taskId: string;
  taskName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [mode, setMode] = useState<"template" | "month">("template");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            Harmonogram — <span className="font-normal">{taskName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b pb-2">
          <Button
            size="sm"
            variant={mode === "template" ? "default" : "ghost"}
            onClick={() => setMode("template")}
          >
            Szablon (co miesiąc)
          </Button>
          <Button
            size="sm"
            variant={mode === "month" ? "default" : "ghost"}
            onClick={() => setMode("month")}
          >
            Konkretny miesiąc
          </Button>
        </div>

        {mode === "template" ? (
          <TemplateEditor taskId={taskId} onDone={() => onOpenChange(false)} />
        ) : (
          <>
            <div className="flex items-center gap-2 pt-1">
              <Label className="text-xs">Rok</Label>
              <Input
                type="number"
                className="w-24 h-8"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value || "0", 10) || now.getFullYear())}
              />
              <Label className="text-xs">Miesiąc</Label>
              <select
                className="h-8 rounded border bg-background px-2 text-sm"
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              >
                {MONTHS_PL.map((n, i) => (
                  <option key={i} value={i + 1}>{i + 1} — {n}</option>
                ))}
              </select>
            </div>
            <MonthOverrideEditor
              taskId={taskId}
              year={year}
              month={month}
              onDone={() => onOpenChange(false)}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateEditor({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: entries, isLoading } = useQuery({
    queryKey: ["schedule-template-task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_template_entries")
        .select("id, day_of_month, shifts")
        .eq("task_id", taskId);
      if (error) throw error;
      return data as TplEntry[];
    },
  });

  const [state, setState] = useState<Map<number, Set<ShiftType>>>(new Map());
  useSyncedState(
    entries?.map((e) => ({ day: e.day_of_month, shifts: e.shifts as ShiftType[] })) ?? null,
    setState,
  );

  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  const save = useMutation({
    mutationFn: async () => {
      const { error: delErr } = await supabase
        .from("schedule_template_entries")
        .delete()
        .eq("task_id", taskId);
      if (delErr) throw delErr;
      const rows = Array.from(state.entries()).map(([day, set]) => ({
        task_id: taskId,
        day_of_month: day,
        shifts: Array.from(set),
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("schedule_template_entries")
          .insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-template"] });
      qc.invalidateQueries({ queryKey: ["schedule-template-task", taskId] });
      toast.success("Zapisano szablon");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Zaznacz w które dni miesiąca (1–31) zadanie ma trafiać na Zmianę 1 (R) i/lub Zmianę 2 (P).
        Ustawienie stosuje się do wszystkich miesięcy w roku.
      </p>
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6">Ładowanie…</div>
      ) : (
        <DaysGrid days={days} state={state} setState={setState} />
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>Anuluj</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
          {save.isPending ? "Zapisywanie…" : "Zapisz szablon"}
        </Button>
      </div>
    </>
  );
}

function MonthOverrideEditor({
  taskId,
  year,
  month,
  onDone,
}: {
  taskId: string;
  year: number;
  month: number;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { data: overrides, isLoading: loadingOv } = useQuery({
    queryKey: ["schedule-overrides-task", taskId, year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_month_overrides")
        .select("id, year, month, day_of_month, shifts")
        .eq("task_id", taskId)
        .eq("year", year)
        .eq("month", month);
      if (error) throw error;
      return data as OverrideEntry[];
    },
  });

  const { data: template, isLoading: loadingTpl } = useQuery({
    queryKey: ["schedule-template-task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_template_entries")
        .select("id, day_of_month, shifts")
        .eq("task_id", taskId);
      if (error) throw error;
      return data as TplEntry[];
    },
  });

  const [state, setState] = useState<Map<number, Set<ShiftType>>>(new Map());
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useSyncedState(
    overrides && template
      ? (() => {
          const merged = new Map<number, Set<ShiftType>>();
          template.forEach((t) => {
            if (t.day_of_month <= daysInMonth) merged.set(t.day_of_month, new Set(t.shifts));
          });
          overrides.forEach((o) => {
            if (o.shifts.length > 0) merged.set(o.day_of_month, new Set(o.shifts));
            else merged.delete(o.day_of_month);
          });
          return Array.from(merged.entries()).map(([day, set]) => ({
            day,
            shifts: Array.from(set) as ShiftType[],
          }));
        })()
      : null,
    setState,
  );

  const save = useMutation({
    mutationFn: async () => {
      const { error: delErr } = await supabase
        .from("schedule_month_overrides")
        .delete()
        .eq("task_id", taskId)
        .eq("year", year)
        .eq("month", month);
      if (delErr) throw delErr;

      const tplMap = new Map<number, Set<ShiftType>>();
      (template ?? []).forEach((t) => {
        if (t.day_of_month <= daysInMonth) tplMap.set(t.day_of_month, new Set(t.shifts));
      });

      const rows: Array<{
        task_id: string;
        year: number;
        month: number;
        day_of_month: number;
        shifts: ShiftType[];
      }> = [];
      for (const d of days) {
        const cur = state.get(d) ?? new Set<ShiftType>();
        const tpl = tplMap.get(d) ?? new Set<ShiftType>();
        const same = cur.size === tpl.size && Array.from(cur).every((s) => tpl.has(s));
        if (!same) {
          rows.push({
            task_id: taskId,
            year,
            month,
            day_of_month: d,
            shifts: Array.from(cur),
          });
        }
      }
      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("schedule_month_overrides")
          .insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-overrides"] });
      qc.invalidateQueries({ queryKey: ["schedule-overrides-task", taskId, year, month] });
      toast.success(`Zapisano ${MONTHS_PL[month - 1]} ${year}`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isLoading = loadingOv || loadingTpl;

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Ustaw konkretnie dla: <strong>{MONTHS_PL[month - 1]} {year}</strong>. Zapisuje wyjątki
        dla tego miesiąca — nadpisują szablon. Dni tygodnia widoczne obok numeru; weekendy podświetlone.
      </p>
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-6">Ładowanie…</div>
      ) : (
        <DaysGrid
          days={days}
          state={state}
          setState={setState}
          weekdayFor={(d) => WEEKDAYS_PL[new Date(year, month - 1, d).getDay()]}
          highlightWeekend
        />
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>Anuluj</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
          {save.isPending ? "Zapisywanie…" : "Zapisz miesiąc"}
        </Button>
      </div>
    </>
  );
}

function DaysGrid({
  days,
  state,
  setState,
  weekdayFor,
  highlightWeekend,
}: {
  days: number[];
  state: Map<number, Set<ShiftType>>;
  setState: React.Dispatch<React.SetStateAction<Map<number, Set<ShiftType>>>>;
  weekdayFor?: (day: number) => string;
  highlightWeekend?: boolean;
}) {
  function toggle(day: number, s: ShiftType) {
    setState((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(day) ?? []);
      if (set.has(s)) set.delete(s);
      else set.add(s);
      if (set.size === 0) next.delete(day);
      else next.set(day, set);
      return next;
    });
  }
  function clearDay(day: number) {
    setState((prev) => {
      const next = new Map(prev);
      next.delete(day);
      return next;
    });
  }
  return (
    <div className="max-h-[55vh] overflow-auto border rounded">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card border-b">
          <tr>
            <th className="text-left px-3 py-2 w-24">Dzień</th>
            <th className="text-center px-2 py-2 w-24">Zmiana 1 (R)</th>
            <th className="text-center px-2 py-2 w-24">Zmiana 2 (P)</th>
            <th className="text-left px-3 py-2">Aktualne</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const set = state.get(d) ?? new Set<ShiftType>();
            const has1 = set.has("rano");
            const has2 = set.has("popoludnie");
            const wd = weekdayFor?.(d);
            const isWeekend =
              !!highlightWeekend && wd !== undefined && (wd === "sb" || wd === "nd");
            return (
              <tr
                key={d}
                className={cn(
                  "border-b",
                  (has1 || has2) && "bg-yellow-50 dark:bg-yellow-900/10",
                  isWeekend && "bg-green-50 dark:bg-green-900/10",
                )}
              >
                <td className="px-3 py-1.5 font-mono">
                  {d}{wd ? <span className="text-muted-foreground ml-1">({wd})</span> : null}
                </td>
                <td className="text-center px-2 py-1.5">
                  <Checkbox checked={has1} onCheckedChange={() => toggle(d, "rano")} />
                </td>
                <td className="text-center px-2 py-1.5">
                  <Checkbox checked={has2} onCheckedChange={() => toggle(d, "popoludnie")} />
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">
                  {[has1 && "1", has2 && "2"].filter(Boolean).join(";") || "—"}
                </td>
                <td className="px-1 py-1.5">
                  {(has1 || has2) && (
                    <Button size="icon" variant="ghost" onClick={() => clearDay(d)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function useSyncedState(
  entries: Array<{ day: number; shifts: ShiftType[] }> | null,
  setState: React.Dispatch<React.SetStateAction<Map<number, Set<ShiftType>>>>,
) {
  const key = entries?.map((e) => `${e.day}:${e.shifts.join(",")}`).join("|") ?? "";
  const lastRef = useSyncedStateRef();
  if (entries && key !== lastRef.current) {
    lastRef.current = key;
    const m = new Map<number, Set<ShiftType>>();
    entries.forEach((e) => m.set(e.day, new Set(e.shifts)));
    setState(m);
  }
}

function useSyncedStateRef() {
  const [ref] = useState<{ current: string }>({ current: "__init__" });
  return ref;
}

void SHIFT_DEFS;
