import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/schedule/tasks")({
  head: () => ({ meta: [{ title: "Zadania harmonogramu — Oczyszczalnia" }] }),
  component: TasksPage,
});

type Task = { id: string; task_number: number; name: string; active: boolean };

function TasksPage() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["schedule-tasks"],
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
    mutationFn: async (input: { id?: string; task_number: number; name: string }) => {
      if (input.id) {
        const { error } = await supabase
          .from("schedule_tasks")
          .update({ task_number: input.task_number, name: input.name })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("schedule_tasks")
          .insert({ task_number: input.task_number, name: input.name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-tasks"] });
      setOpen(false);
      setEditing(null);
      toast.success("Zapisano");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedule_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
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
              Słownik 35 podstawowych czynności (kierownik może edytować)
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
                  {isManager && <TableHead className="text-right w-32">Akcje</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks?.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono">{t.task_number}</TableCell>
                    <TableCell>{t.name}</TableCell>
                    {isManager && (
                      <TableCell className="text-right space-x-1">
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
                            if (confirm(`Usunąć zadanie nr ${t.task_number}?`)) remove.mutate(t.id);
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
