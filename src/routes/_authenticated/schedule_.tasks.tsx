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
