import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Save } from "lucide-react";
import { toast } from "sonner";
import { SHIFT_DEFS, type ShiftType } from "@/lib/shifts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({ meta: [{ title: "Harmonogram — Oczyszczalnia" }] }),
  component: SchedulePage,
});

type Task = { id: string; task_number: number; name: string };
type Entry = { id: string; task_id: string; day_of_month: number; shifts: ShiftType[]; note: string | null };

const SHIFT_BADGE: Record<ShiftType, { label: string; color: string }> = {
  rano: { label: "R", color: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200" },
  popoludnie: { label: "P", color: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200" },
  noc: { label: "N", color: "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-200" },
};

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function SchedulePage() {
  const { isManager } = useAuth();
  const qc = useQueryClient();

  const { data: tasks } = useQuery({
    queryKey: ["schedule-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_tasks")
        .select("*")
        .eq("active", true)
        .order("task_number");
      if (error) throw error;
      return data as Task[];
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["schedule-template"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedule_template_entries")
        .select("*");
      if (error) throw error;
      return data as Entry[];
    },
  });

  const entryMap = new Map<string, Entry>();
  (entries ?? []).forEach((e) => entryMap.set(`${e.task_id}:${e.day_of_month}`, e));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Harmonogram czynności eksploatacyjnych</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Szablon powtarzalny co miesiąc. {isManager ? "Kliknij komórkę, aby przypisać zmiany." : "Tylko do podglądu."}
          </p>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-3">
            Szablon miesięczny
            <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <Badge variant="outline" className={SHIFT_BADGE.rano.color}>R</Badge> Rano 6–14
              <Badge variant="outline" className={SHIFT_BADGE.popoludnie.color}>P</Badge> Popołudnie 14–22
              <Badge variant="outline" className={SHIFT_BADGE.noc.color}>N</Badge> Noc 22–6
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-280px)]">
            <table className="border-collapse text-xs w-full">
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th className="sticky left-0 z-20 bg-card border-r border-b p-2 text-left w-12">Nr</th>
                  <th className="sticky left-12 z-20 bg-card border-r border-b p-2 text-left min-w-[280px]">Zadanie</th>
                  {DAYS.map((d) => (
                    <th key={d} className="border-b border-r p-1 w-9 text-center font-medium">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks?.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-card border-r border-b p-2 font-mono text-center">
                      {t.task_number}
                    </td>
                    <td className="sticky left-12 z-10 bg-card border-r border-b p-2">{t.name}</td>
                    {DAYS.map((d) => {
                      const e = entryMap.get(`${t.id}:${d}`);
                      return (
                        <td key={d} className="border-r border-b p-0 text-center">
                          <Cell
                            taskId={t.id}
                            day={d}
                            entry={e}
                            canEdit={isManager}
                            onSaved={() => qc.invalidateQueries({ queryKey: ["schedule-template"] })}
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
    </div>
  );
}

function Cell({
  taskId,
  day,
  entry,
  canEdit,
  onSaved,
}: {
  taskId: string;
  day: number;
  entry: Entry | undefined;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const shifts = entry?.shifts ?? [];

  const content = (
    <div
      className={cn(
        "h-8 w-full flex items-center justify-center gap-0.5 px-0.5",
        canEdit && "cursor-pointer hover:bg-accent/50",
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
        <button className="w-full">{content}</button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="center">
        <EditForm
          taskId={taskId}
          day={day}
          entryId={entry?.id}
          initialShifts={shifts}
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
  day,
  entryId,
  initialShifts,
  onDone,
}: {
  taskId: string;
  day: number;
  entryId: string | undefined;
  initialShifts: ShiftType[];
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
      if (arr.length === 0) {
        if (entryId) {
          const { error } = await supabase
            .from("schedule_template_entries")
            .delete()
            .eq("id", entryId);
          if (error) throw error;
        }
        return;
      }
      if (entryId) {
        const { error } = await supabase
          .from("schedule_template_entries")
          .update({ shifts: arr })
          .eq("id", entryId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("schedule_template_entries")
          .insert({ task_id: taskId, day_of_month: day, shifts: arr });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Zapisano");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground">Dzień {day} miesiąca</div>
      {(Object.keys(SHIFT_DEFS) as ShiftType[]).map((s) => (
        <label key={s} className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={selected.has(s)} onCheckedChange={() => toggle(s)} />
          <Label className="cursor-pointer text-sm font-normal">{SHIFT_DEFS[s].label}</Label>
        </label>
      ))}
      <Button size="sm" className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
        <Save className="w-3.5 h-3.5" />
        {save.isPending ? "Zapisywanie…" : "Zapisz"}
      </Button>
    </div>
  );
}
