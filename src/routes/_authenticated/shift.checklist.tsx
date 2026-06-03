import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCurrentDuty } from "@/lib/use-current-duty";
import { getCurrentShiftWindow } from "@/lib/shifts";
import { toIsoDate, nextShift, addDays } from "@/lib/shift-utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, FileText, ArrowRightLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/shift/checklist")({
  component: ChecklistPage,
});

function ChecklistPage() {
  const { user } = useAuth();
  const { data: duty } = useCurrentDuty();
  const qc = useQueryClient();
  const now = new Date();
  const today = toIsoDate(now);
  const { type: currentShift } = getCurrentShiftWindow(now);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  const isMine = duty?.session && duty.session.user_id === user?.id;

  // 1. Pobierz zadania zaplanowane na dziś + bieżącą zmianę (z szablonu + nadpisania)
  const { data: scheduled } = useQuery({
    queryKey: ["scheduled", today, currentShift],
    queryFn: async () => {
      const dayOfMonth = now.getDate();
      const [{ data: tasks }, { data: templates }, { data: overrides }] = await Promise.all([
        supabase.from("schedule_tasks").select("id, task_number, name").eq("active", true).order("task_number"),
        supabase.from("schedule_template_entries").select("task_id, shifts, note").eq("day_of_month", dayOfMonth),
        supabase.from("schedule_overrides").select("task_id, shifts, skip, note").eq("override_date", today),
      ]);
      const tasksList = tasks ?? [];
      const tplMap = new Map((templates ?? []).map((t) => [t.task_id, t]));
      const ovrMap = new Map((overrides ?? []).map((o) => [o.task_id, o]));
      const result: { task_id: string; task_number: number; name: string; note: string | null }[] = [];
      for (const t of tasksList) {
        const ovr = ovrMap.get(t.id);
        let shifts: string[] = [];
        let note: string | null = null;
        if (ovr) {
          if (ovr.skip) continue;
          shifts = ovr.shifts;
          note = ovr.note;
        } else if (tplMap.has(t.id)) {
          shifts = tplMap.get(t.id)!.shifts;
          note = tplMap.get(t.id)!.note;
        }
        if (shifts.includes(currentShift)) {
          result.push({ task_id: t.id, task_number: t.task_number, name: t.name, note });
        }
      }
      return result;
    },
  });

  // 2. Pobierz istniejące wykonania (dla tej daty+zmiany) oraz zaległe (status pending z poprzednich)
  const { data: executions } = useQuery({
    queryKey: ["executions", today, currentShift, duty?.session?.id],
    enabled: !!duty?.session,
    queryFn: async () => {
      const { data } = await supabase
        .from("schedule_executions")
        .select("*, task:schedule_tasks(task_number, name)")
        .or(
          `and(scheduled_date.eq.${today},scheduled_shift.eq.${currentShift}),and(status.eq.pending,scheduled_date.lt.${today})`,
        );
      return data ?? [];
    },
  });

  // 3. Upewnij się że wpisy istnieją (pending) dla scheduled
  const ensure = useMutation({
    mutationFn: async () => {
      if (!scheduled || !duty?.session) return;
      const existing = new Set(
        (executions ?? [])
          .filter((e) => e.scheduled_date === today && e.scheduled_shift === currentShift)
          .map((e) => e.task_id),
      );
      const toInsert = scheduled
        .filter((s) => !existing.has(s.task_id))
        .map((s) => ({
          task_id: s.task_id,
          scheduled_date: today,
          scheduled_shift: currentShift,
          duty_session_id: duty.session!.id,
          status: "pending" as const,
        }));
      if (toInsert.length) {
        await supabase.from("schedule_executions").insert(toInsert);
        qc.invalidateQueries({ queryKey: ["executions"] });
      }
    },
  });

  // Auto-ensure raz po załadowaniu
  useMemo(() => {
    if (scheduled && executions && duty?.session && isMine) {
      ensure.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduled?.length, executions?.length, duty?.session?.id, isMine]);

  const toggle = useMutation({
    mutationFn: async (input: { id: string; done: boolean; note?: string }) => {
      const { error } = await supabase
        .from("schedule_executions")
        .update({
          status: input.done ? "done" : "pending",
          completed_at: input.done ? new Date().toISOString() : null,
          completed_by: input.done ? user?.id : null,
          note: input.note ?? null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["executions"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!duty?.session) {
    return (
      <div className="p-6 text-muted-foreground">Brak otwartego dyżuru. Przyjmij dyżur, aby zobaczyć checklistę.</div>
    );
  }
  if (!isMine) {
    return (
      <div className="p-6 text-muted-foreground">
        Dyżur pełni inny operator. Możesz zobaczyć checklistę dopiero po przejęciu dyżuru.
      </div>
    );
  }

  const current = (executions ?? []).filter(
    (e) => e.scheduled_date === today && e.scheduled_shift === currentShift,
  );
  const overdue = (executions ?? []).filter((e) => e.scheduled_date < today && e.status === "pending");
  const undone = current.filter((e) => e.status !== "done");

  const confirmEnd = useMutation({
    mutationFn: async () => {
      // Niewykonane → deferred + nowy pending na kolejną zmianę
      const ns = nextShift(currentShift);
      const nextDate = toIsoDate(addDays(now, ns.dayOffset));
      for (const e of undone) {
        await supabase
          .from("schedule_executions")
          .update({ status: "deferred" })
          .eq("id", e.id);
        await supabase.from("schedule_executions").insert({
          task_id: e.task_id,
          scheduled_date: nextDate,
          scheduled_shift: ns.type,
          deferred_from_session_id: duty.session!.id,
          status: "pending",
        });
      }
      if (undone.length) {
        await supabase.from("shift_notifications").insert({
          recipient_role: "kierownik",
          kind: "deferred_tasks",
          title: `Niewykonane zadania (${undone.length})`,
          body: `Zmiana ${currentShift} ${today}: ${undone.map((u) => u.task?.name).join(", ")}`,
          related_session_id: duty.session!.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["executions"] });
      setConfirmEndOpen(false);
      toast.success("Zadania zostały przekazane na kolejną zmianę");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Checklista zmiany</h1>
          <p className="text-sm text-muted-foreground">
            {today} · Zmiana: <strong>{currentShift}</strong>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/shift/handover">Przekazanie zmiany</Link>
          </Button>
          <Button onClick={() => setConfirmEndOpen(true)}>
            Rozlicz zmianę
          </Button>
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="border border-amber-500/40 bg-amber-500/10 rounded-md p-4">
          <div className="flex items-center gap-2 font-medium mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Zadania zaległe z poprzednich zmian ({overdue.length})
          </div>
          <ul className="space-y-2">
            {overdue.map((e) => (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={e.status === "done"}
                  onCheckedChange={(v) => toggle.mutate({ id: e.id, done: !!v })}
                />
                <span className="text-muted-foreground">#{e.task?.task_number}</span>
                <span>{e.task?.name}</span>
                <Badge variant="outline" className="ml-auto">
                  {e.scheduled_date} / {e.scheduled_shift}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border rounded-md">
        <div className="p-4 border-b font-medium">
          Zadania bieżącej zmiany ({current.filter((c) => c.status === "done").length}/{current.length})
        </div>
        {current.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Brak zaplanowanych zadań na tę zmianę.</div>
        ) : (
          <ul className="divide-y">
            {current.map((e) => (
              <li key={e.id} className="p-3 flex items-start gap-3">
                <Checkbox
                  className="mt-1"
                  checked={e.status === "done"}
                  onCheckedChange={(v) => toggle.mutate({ id: e.id, done: !!v, note: noteMap[e.id] })}
                />
                <div className="flex-1">
                  <div className="text-sm">
                    <span className="text-muted-foreground">#{e.task?.task_number}</span>{" "}
                    <span className={e.status === "done" ? "line-through text-muted-foreground" : ""}>
                      {e.task?.name}
                    </span>
                  </div>
                  <Textarea
                    placeholder="Notatka (opcjonalna)"
                    className="mt-2 text-sm"
                    rows={1}
                    value={noteMap[e.id] ?? e.note ?? ""}
                    onChange={(ev) => setNoteMap((m) => ({ ...m, [e.id]: ev.target.value }))}
                    onBlur={() => {
                      if ((noteMap[e.id] ?? "") !== (e.note ?? "")) {
                        toggle.mutate({ id: e.id, done: e.status === "done", note: noteMap[e.id] });
                      }
                    }}
                  />
                </div>
                {e.status === "done" && <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-1" />}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={confirmEndOpen} onOpenChange={setConfirmEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rozliczenie zmiany</DialogTitle>
            <DialogDescription>
              {undone.length === 0
                ? "Wszystkie zaplanowane zadania zostały wykonane."
                : `Niewykonane zadania (${undone.length}): zostaną przekazane na kolejną zmianę, a kierownik otrzyma powiadomienie.`}
            </DialogDescription>
          </DialogHeader>
          {undone.length > 0 && (
            <ul className="text-sm list-disc pl-5 space-y-1 max-h-48 overflow-auto">
              {undone.map((u) => (
                <li key={u.id}>
                  #{u.task?.task_number} {u.task?.name}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEndOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={() => confirmEnd.mutate()} disabled={confirmEnd.isPending}>
              {undone.length === 0 ? "Potwierdź" : "Przekaż niewykonane"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
