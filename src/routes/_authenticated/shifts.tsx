import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Play, Square } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shifts")({
  head: () => ({ meta: [{ title: "Zmiany — Oczyszczalnia" }] }),
  component: ShiftsPage,
});

type ShiftRow = {
  id: string;
  shift_date: string;
  shift_type: "rano" | "popoludnie" | "noc";
  status: "zaplanowana" | "w_trakcie" | "zakonczona";
  operator_id: string | null;
  notes: string | null;
  started_at: string | null;
  ended_at: string | null;
};

const SHIFT_LABEL: Record<ShiftRow["shift_type"], string> = {
  rano: "Zmiana 1",
  popoludnie: "Zmiana 2",
  noc: "Zmiana 2 (historyczna)",
};

const STATUS_VARIANT: Record<ShiftRow["status"], "secondary" | "default" | "outline"> = {
  zaplanowana: "outline",
  w_trakcie: "default",
  zakonczona: "secondary",
};

const STATUS_LABEL: Record<ShiftRow["status"], string> = {
  zaplanowana: "Zaplanowana",
  w_trakcie: "W trakcie",
  zakonczona: "Zakończona",
};

function ShiftsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: shifts, isLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .order("shift_date", { ascending: false })
        .order("shift_type")
        .limit(100);
      if (error) throw error;
      return data as ShiftRow[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, first_name, last_name");
      const map: Record<string, string> = {};
      (data ?? []).forEach((p) => {
        map[p.id] = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
      });
      return map;
    },
  });

  const create = useMutation({
    mutationFn: async (input: { date: string; type: ShiftRow["shift_type"]; notes: string }) => {
      const { error } = await supabase.from("shifts").insert({
        shift_date: input.date,
        shift_type: input.type,
        operator_id: user!.id,
        notes: input.notes || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
      toast.success("Zmiana zaplanowana");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ShiftRow["status"] }) => {
      const patch: Partial<ShiftRow> = { status };
      if (status === "w_trakcie") patch.started_at = new Date().toISOString();
      if (status === "zakonczona") patch.ended_at = new Date().toISOString();
      const { error } = await supabase.from("shifts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({
      date: String(fd.get("date")),
      type: fd.get("type") as ShiftRow["shift_type"],
      notes: String(fd.get("notes") ?? ""),
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Zmiany</h1>
          <p className="text-muted-foreground text-sm mt-1">Rejestr zmian operatorskich</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4" />
              Nowa zmiana
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Zaplanuj zmianę</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Zmiana</Label>
                <Select name="type" defaultValue="rano">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rano">{SHIFT_LABEL.rano}</SelectItem>
                    <SelectItem value="popoludnie">{SHIFT_LABEL.popoludnie}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Uwagi (opcjonalnie)</Label>
                <Input id="notes" name="notes" />
              </div>
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending ? "Zapisywanie…" : "Zaplanuj"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ostatnie zmiany</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Ładowanie…</div>
          ) : !shifts?.length ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Brak zmian. Dodaj pierwszą za pomocą przycisku „Nowa zmiana".
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Zmiana</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shifts.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-sm">{s.shift_date}</TableCell>
                    <TableCell>{SHIFT_LABEL[s.shift_type]}</TableCell>
                    <TableCell className="text-sm">
                      {s.operator_id ? profiles?.[s.operator_id] ?? "…" : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {s.operator_id === user?.id && s.status === "zaplanowana" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus.mutate({ id: s.id, status: "w_trakcie" })}
                        >
                          <Play className="w-3.5 h-3.5" />
                          Start
                        </Button>
                      )}
                      {s.operator_id === user?.id && s.status === "w_trakcie" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setStatus.mutate({ id: s.id, status: "zakonczona" })}
                        >
                          <Square className="w-3.5 h-3.5" />
                          Zakończ
                        </Button>
                      )}
                    </TableCell>
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
