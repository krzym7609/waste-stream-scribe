import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCurrentDuty } from "@/lib/use-current-duty";
import {
  getCurrentShiftWindow,
  isWithinHandoverWindow,
  SHIFT_LABEL,
  formatHM,
} from "@/lib/shifts";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Clock, UserCheck, UserX, AlertTriangle, FileText, ArrowRightLeft, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/notifications-bell";

export function DutyBar() {
  const { user } = useAuth();
  const { data, isLoading } = useCurrentDuty();
  const qc = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const [takeOpen, setTakeOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { start, end, type } = getCurrentShiftWindow(now);
  const withinWindow = isWithinHandoverWindow(now);

  const startedAt = data?.session ? new Date(data.session.started_at) : null;
  const minutesWithoutDuty = !data?.session
    ? Math.floor((now.getTime() - start.getTime()) / 60_000)
    : 0;
  const alertNoDuty = !data?.session && minutesWithoutDuty >= 15 && now >= start;
  const sessionId = data?.session?.id;

  // Gate: status raportu + przekazania dla bieżącej zmiany
  const { data: gate } = useQuery({
    queryKey: ["shift-end-gate", sessionId],
    enabled: !!sessionId && endOpen,
    queryFn: async () => {
      const [{ data: r }, { data: h }] = await Promise.all([
        supabase
          .from("shift_reports")
          .select("id, energia_end")
          .eq("duty_session_id", sessionId!)
          .maybeSingle(),
        supabase
          .from("handover_reports")
          .select("id, submitted_at")
          .eq("duty_session_from_id", sessionId!)
          .maybeSingle(),
      ]);
      return {
        reportDone: !!r && r.energia_end != null,
        handoverDone: !!h?.submitted_at,
      };
    },
  });

  const takeDuty = useMutation({
    mutationFn: async (input: { note: string }) => {
      if (!user) throw new Error("Brak sesji");
      if (data?.session) {
        const { error: eEnd } = await supabase
          .from("duty_sessions")
          .update({ ended_at: new Date().toISOString(), end_note: "Przekazanie automatyczne (przejęcie)" })
          .eq("id", data.session.id);
        if (eEnd) throw eEnd;
      }
      const { error } = await supabase.from("duty_sessions").insert({
        user_id: user.id,
        shift_type: type,
        start_note: input.note || null,
        outside_window: !withinWindow,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["current-duty"] });
      setTakeOpen(false);
      setNote("");
      toast.success("Zmiana przejęta");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const endDuty = useMutation({
    mutationFn: async (input: { note: string }) => {
      if (!data?.session) throw new Error("Brak otwartej zmiany");
      if (!gate?.reportDone) throw new Error("Wypełnij raport zmianowy przed zakończeniem zmiany.");
      if (!gate?.handoverDone) throw new Error("Wypełnij protokół przekazania przed zakończeniem zmiany.");

      // Zablokuj raport i protokół (locked_at)
      const nowIso = new Date().toISOString();
      await supabase
        .from("shift_reports")
        .update({ locked_at: nowIso })
        .eq("duty_session_id", data.session.id)
        .is("locked_at", null);
      await supabase
        .from("handover_reports")
        .update({ locked_at: nowIso })
        .eq("duty_session_from_id", data.session.id)
        .is("locked_at", null);

      const { error } = await supabase
        .from("duty_sessions")
        .update({ ended_at: nowIso, end_note: input.note || null })
        .eq("id", data.session.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["current-duty"] });
      setEndOpen(false);
      setNote("");
      toast.success("Zmiana zakończona. Raport i protokół zamknięte.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="h-12 border-b bg-muted/30" />;
  }

  const isMine = data?.session?.user_id === user?.id;
  const operatorName = data?.operator
    ? `${data.operator.first_name ?? ""} ${data.operator.last_name ?? ""}`.trim() ||
      data.operator.username ||
      "—"
    : null;

  const canEnd = gate?.reportDone && gate?.handoverDone;

  return (
    <div
      className={cn(
        "border-b px-4 py-2 flex items-center gap-4 text-sm",
        alertNoDuty
          ? "bg-destructive/10 border-destructive/30"
          : isMine
            ? "bg-emerald-500/10 border-emerald-500/30"
            : data?.session
              ? "bg-blue-500/10 border-blue-500/30"
              : "bg-amber-500/10 border-amber-500/30",
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <Clock className="w-4 h-4" />
        {SHIFT_LABEL[type]}
      </div>
      <div className="text-muted-foreground text-xs">
        Okno: {formatHM(start)}–{formatHM(end)}
      </div>

      <div className="flex-1" />

      {data?.session ? (
        <>
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" />
            <span>
              Zmianę pełni: <strong>{operatorName}</strong> od {formatHM(startedAt!)}
              {data.session.outside_window && (
                <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                  (poza oknem)
                </span>
              )}
            </span>
          </div>
          {isMine ? (
            <Dialog open={endOpen} onOpenChange={setEndOpen}>
              <DialogTrigger asChild>
                <Button size="sm">Zakończ zmianę</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Zakończenie zmiany</DialogTitle>
                  <DialogDescription>
                    Aby zakończyć zmianę, raport zmianowy i protokół przekazania muszą być wypełnione.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 border rounded">
                    {gate?.reportDone ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="flex-1 text-sm">Raport zmianowy</span>
                    {!gate?.reportDone && (
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/shift/report" onClick={() => setEndOpen(false)}>Wypełnij</Link>
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 p-2 border rounded">
                    {gate?.handoverDone ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                    <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
                    <span className="flex-1 text-sm">Protokół przekazania</span>
                    {!gate?.handoverDone && (
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/shift/handover" onClick={() => setEndOpen(false)}>Wypełnij</Link>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mt-2">
                  <Label htmlFor="end-note">Notatka końcowa (opcjonalnie)</Label>
                  <Textarea
                    id="end-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="np. Pompa P2 nadal w obserwacji, dmuchawa OK…"
                    rows={3}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEndOpen(false)}>Anuluj</Button>
                  <Button
                    onClick={() => endDuty.mutate({ note })}
                    disabled={endDuty.isPending || !canEnd}
                  >
                    {endDuty.isPending ? "Zapisywanie…" : "Zakończ zmianę"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={takeOpen} onOpenChange={setTakeOpen}>
              <DialogTrigger asChild>
                <Button size="sm">Przejmij zmianę</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Przejęcie zmiany od {operatorName}</DialogTitle>
                  <DialogDescription>
                    Bieżąca zmiana zostanie automatycznie zamknięta. Możesz dodać notatkę startową.
                    {!withinWindow && (
                      <span className="block mt-2 text-amber-700 dark:text-amber-400">
                        ⚠ Przejęcie poza standardowym oknem zmiany (±1h). Fakt zostanie odnotowany.
                      </span>
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="start-note">Notatka startowa (opcjonalnie)</Label>
                  <Textarea
                    id="start-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTakeOpen(false)}>Anuluj</Button>
                  <Button onClick={() => takeDuty.mutate({ note })} disabled={takeDuty.isPending}>
                    {takeDuty.isPending ? "Zapisywanie…" : "Przejmij zmianę"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {alertNoDuty ? (
              <>
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <span className="text-destructive font-medium">
                  Brak operatora od {minutesWithoutDuty} min — wymagana reakcja
                </span>
              </>
            ) : (
              <>
                <UserX className="w-4 h-4" />
                <span>Brak operatora na zmianie</span>
              </>
            )}
          </div>
          <Dialog open={takeOpen} onOpenChange={setTakeOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Rozpocznij zmianę</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rozpoczęcie zmiany</DialogTitle>
                <DialogDescription>
                  Otwierasz nową zmianę: {SHIFT_LABEL[type]}.
                  {!withinWindow && (
                    <span className="block mt-2 text-amber-700 dark:text-amber-400">
                      ⚠ Rozpoczęcie poza standardowym oknem zmiany (±1h). Fakt zostanie odnotowany.
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="start-note-2">Notatka startowa (opcjonalnie)</Label>
                <Textarea
                  id="start-note-2"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTakeOpen(false)}>Anuluj</Button>
                <Button onClick={() => takeDuty.mutate({ note })} disabled={takeDuty.isPending}>
                  {takeDuty.isPending ? "Zapisywanie…" : "Rozpocznij zmianę"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
