import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCurrentDuty } from "@/lib/use-current-duty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Lock } from "lucide-react";
import { handoverItemSchema } from "@/lib/validation/shift-report";
import { generateHandoverPdf } from "@/lib/pdf/shift-report-pdf";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/shift/handover")({
  validateSearch: (s: Record<string, unknown>) => ({
    handover: typeof s.handover === "string" ? s.handover : undefined,
  }),
  component: HandoverPage,
});

function HandoverPage() {
  const { user, profile, isManager } = useAuth();
  const { data: duty } = useCurrentDuty();
  const router = useRouter();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const overrideHandoverId = isManager ? search.handover : undefined;

  const sessionId = duty?.session?.id;
  const isMine = duty?.session?.user_id === user?.id;

  const { data: objects } = useQuery({
    queryKey: ["handover_objects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("handover_objects")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      return data ?? [];
    },
  });

  const { data: overrideHandover } = useQuery({
    queryKey: ["handover_override", overrideHandoverId],
    enabled: !!overrideHandoverId,
    queryFn: async () => {
      const { data } = await supabase
        .from("handover_reports")
        .select("*")
        .eq("id", overrideHandoverId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: handovers } = useQuery({
    queryKey: ["handovers", sessionId, user?.id],
    enabled: !!user && !overrideHandoverId,
    queryFn: async () => {
      // Pobieramy: (a) moje przekazania (jako from/to) (b) wszystkie nieprzyjęte
      // przekazania (żeby nowy operator zobaczył oczekujące od poprzedniej zmiany).
      const { data } = await supabase
        .from("handover_reports")
        .select("*")
        .or(
          `from_user_id.eq.${user!.id},to_user_id.eq.${user!.id},accepted_at.is.null`,
        )
        .order("submitted_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const mineAsFrom = handovers?.find(
    (h) => h.duty_session_from_id === sessionId && !h.accepted_at,
  );
  // Nieprzyjęte przekazanie od poprzedniej zmiany (nie moje własne)
  const pendingForMe = handovers?.find(
    (h) => !h.accepted_at && h.from_user_id !== user?.id,
  );
  const lastAccepted = handovers?.find((h) => h.to_user_id === user?.id && h.accepted_at);
  const activeHandover = overrideHandover ?? mineAsFrom ?? pendingForMe ?? lastAccepted;
  const activeId = activeHandover?.id;


  const { data: items } = useQuery({
    queryKey: ["handover_items", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("handover_report_items")
        .select("*")
        .eq("handover_id", activeId!);
      return data ?? [];
    },
  });

  const [itemMap, setItemMap] = useState<
    Record<string, { uwagi_przekazujacego: string; uwagi_przyjmujacego: string }>
  >({});
  const [uwagiOgolne, setUwagiOgolne] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  useEffect(() => {
    const m: typeof itemMap = {};
    for (const it of items ?? []) {
      m[it.object_id] = {
        uwagi_przekazujacego: it.uwagi_przekazujacego ?? "",
        uwagi_przyjmujacego: it.uwagi_przyjmujacego ?? "",
      };
    }
    setItemMap(m);
    setUwagiOgolne(activeHandover?.uwagi_ogolne ?? "");
  }, [items?.length, activeHandover?.id]);

  const locked = !!activeHandover?.locked_at;
  const mode: "incoming" | "outgoing" | "history" = pendingForMe
    ? "incoming"
    : isMine && !locked
      ? "outgoing"
      : "history";

  const canEditFrom = (mode === "outgoing" && !locked) || (locked && isManager);
  const canEditTo = mode === "incoming" || (locked && isManager);

  const validateFrom = (): boolean => {
    const errs: Record<string, string> = {};
    for (const obj of objects ?? []) {
      const v = itemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
      const r = handoverItemSchema.safeParse({
        object_id: obj.id,
        uwagi_przekazujacego: v.uwagi_przekazujacego,
      });
      if (!r.success) {
        for (const issue of r.error.issues) {
          errs[`${obj.id}:${String(issue.path[0])}`] = issue.message;
        }
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Każdy obiekt wymaga uwag (min. 3 znaki — wpisz „brak uwag”).");
      return false;
    }
    return true;
  };

  const saveFrom = useMutation({
    mutationFn: async () => {
      if (!sessionId || !user) throw new Error("Brak otwartej zmiany");
      if (!validateFrom()) throw new Error("Formularz zawiera błędy");
      if (locked && isManager && reason.trim().length < 5) {
        throw new Error("Edycja zamkniętego protokołu wymaga powodu (min. 5 znaków)");
      }

      // Snapshot przed edycją kierownika
      if (locked && isManager && activeHandover) {
        const { error: snapErr } = await supabase.from("handover_report_snapshots").insert({
          handover_id: activeHandover.id,
          snapshot: JSON.parse(JSON.stringify(activeHandover)),
          items_snapshot: JSON.parse(JSON.stringify(items ?? [])),
          edited_by: user.id,
          reason: reason.trim(),
        });
        if (snapErr) throw snapErr;
      }

      let id = activeHandover?.id;
      if (!id) {
        const { data, error } = await supabase
          .from("handover_reports")
          .insert({
            duty_session_from_id: sessionId,
            from_user_id: user.id,
            uwagi_ogolne: uwagiOgolne || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      } else {
        await supabase
          .from("handover_reports")
          .update({ uwagi_ogolne: uwagiOgolne || null })
          .eq("id", id);
      }
      for (const obj of objects ?? []) {
        const v = itemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
        const { error } = await supabase.from("handover_report_items").upsert(
          {
            handover_id: id!,
            object_id: obj.id,
            uwagi_przekazujacego: v.uwagi_przekazujacego || null,
            ...(canEditTo ? { uwagi_przyjmujacego: v.uwagi_przyjmujacego || null } : {}),
          },
          { onConflict: "handover_id,object_id" },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handovers"] });
      qc.invalidateQueries({ queryKey: ["handover_items"] });
      qc.invalidateQueries({ queryKey: ["shift_report_status"] });
      setReason("");
      toast.success("Protokół zapisany.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accept = useMutation({
    mutationFn: async () => {
      if (!pendingForMe || !user || !sessionId) throw new Error("Brak protokołu do przyjęcia");
      // Walidacja: każdy obiekt musi mieć uwagi przejmującego (min 3 znaki)
      const errs: Record<string, string> = {};
      for (const obj of objects ?? []) {
        const v = itemMap[obj.id]?.uwagi_przyjmujacego?.trim() ?? "";
        if (v.length < 3) {
          errs[`${obj.id}:uwagi_przyjmujacego`] = "Wymagane (min. 3 znaki, np. „brak uwag”)";
        }
      }
      setErrors(errs);
      if (Object.keys(errs).length > 0) {
        throw new Error("Uzupełnij uwagi przejmującego dla każdego obiektu (min. 3 znaki).");
      }
      for (const obj of objects ?? []) {
        const v = itemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
        await supabase.from("handover_report_items").upsert(
          {
            handover_id: pendingForMe.id,
            object_id: obj.id,
            uwagi_przyjmujacego: v.uwagi_przyjmujacego || null,
          },
          { onConflict: "handover_id,object_id" },
        );
      }
      const { error } = await supabase
        .from("handover_reports")
        .update({
          accepted_at: new Date().toISOString(),
          to_user_id: user.id,
          duty_session_to_id: sessionId,
        })
        .eq("id", pendingForMe.id);
      if (error) throw error;
      // Powiadom kierownika o przyjęciu zmiany
      await supabase.from("shift_notifications").insert({
        recipient_role: "kierownik",
        kind: "handover_accepted",
        title: "Przekazanie zmiany przyjęte",
        body: `Operator przyjął przekazanie zmiany (protokół ${pendingForMe.id.slice(0, 8)}).`,
        related_session_id: sessionId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handovers"] });
      qc.invalidateQueries({ queryKey: ["handover_items"] });
      qc.invalidateQueries({ queryKey: ["mgr-daily"] });
      toast.success("Protokół przyjęty");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadPdf = async () => {
    if (!activeHandover || !objects) return;
    const objMap = new Map(objects.map((o) => [o.id, o.name]));
    const fromName =
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
      profile?.username ||
      "—";
    await generateHandoverPdf({
      date: activeHandover.submitted_at.slice(0, 10),
      shiftFrom: duty?.session?.shift_type ?? "—",
      operatorFrom: fromName,
      operatorTo: null,
      submittedAt: activeHandover.submitted_at,
      acceptedAt: activeHandover.accepted_at,
      uwagiOgolne: activeHandover.uwagi_ogolne,
      items: (items ?? []).map((it) => ({
        object_name: objMap.get(it.object_id) ?? "—",
        uwagi_przekazujacego: it.uwagi_przekazujacego,
        uwagi_przyjmujacego: it.uwagi_przyjmujacego,
      })),
    });
  };

  if (!sessionId && !overrideHandoverId) {
    return <div className="p-6 text-muted-foreground">Brak otwartej zmiany.</div>;
  }


  const signature = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
  const today = new Date().toISOString().slice(0, 10);
  const fromName = signature || profile?.username || "—";
  const toName = activeHandover?.to_user_id ? "—" : "—";

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div className="text-sm text-muted-foreground">
          Protokół przekazania zmiany · Operator: <strong>{fromName}</strong>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {mode === "incoming" && "Do przyjęcia"}
            {mode === "outgoing" && "Przekazujesz zmianę"}
            {mode === "history" && "Historia"}
          </Badge>
          {locked && (
            <Badge variant="outline" className="gap-1">
              <Lock className="w-3 h-3" /> Zamknięty
            </Badge>
          )}
          {activeHandover && (
            <Button variant="outline" size="sm" onClick={downloadPdf}>
              <Download className="w-4 h-4 mr-1" /> Pobierz PDF
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.history.back()}>
            Wstecz
          </Button>
        </div>
      </div>

      {locked && isManager && (
        <div className="border border-amber-500/50 bg-amber-500/10 rounded p-3 text-sm print:hidden">
          <div className="font-medium mb-1">Edycja zamkniętego protokołu przez kierownika</div>
          <Label className="text-xs">Powód edycji (wymagane, min. 5 znaków)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
        </div>
      )}

      {mode === "incoming" && (
        <div className="border border-blue-500/50 bg-blue-500/10 rounded-md p-4 text-sm print:hidden">
          <div className="font-semibold mb-1">Przejmujesz zmianę</div>
          <div>
            Przeczytaj uwagi przekazującego (kolumna po lewej) i obowiązkowo wpisz swoje uwagi
            dla każdego obiektu (kolumna po prawej). Bez tego nie można potwierdzić przyjęcia zmiany.
          </div>
        </div>
      )}
      {mode === "outgoing" && (
        <div className="border border-emerald-500/40 bg-emerald-500/10 rounded-md p-4 text-sm print:hidden">
          <div className="font-semibold mb-1">Przekazujesz zmianę</div>
          <div>
            Uzupełnij uwagi dla każdego obiektu. Kolumna „Uwagi przejmującego” wypełni się,
            kiedy następny operator przyjmie zmianę.
          </div>
        </div>
      )}

      {/* === Papierowy formularz === */}
      <div className="bg-white text-black border border-black p-6 font-serif text-[13px] leading-tight">
        <table className="w-full border-collapse mb-1">
          <tbody>
            <tr>
              <td className="align-top pb-1 w-1/2">
                <span className="italic font-bold underline">PRZEKAZANIE  ZMIANY :</span>
              </td>
              <td className="align-top pb-1 border border-black p-2">
                Data : <strong>{activeHandover?.submitted_at?.slice(0, 10) ?? today}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <table className="w-full border-collapse border border-black mb-2">
          <tbody>
            <tr>
              <td className="border border-black p-2">
                <div>Zmianę przekazuje: <strong>{fromName}</strong></div>
                <div className="mt-1">Zmianę przejmuje: <strong>{activeHandover?.accepted_at ? toName : "—"}</strong></div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="italic mb-1">
          {mode === "incoming"
            ? "Twoje uwagi po przejęciu zmiany (wypełnij każdy obiekt):"
            : mode === "outgoing"
              ? "Twoje uwagi przekazujące zmianę:"
              : "Uwagi dotyczące przekazania zmiany:"}
        </div>

        <table className="w-full border-collapse border border-black">
          <thead className="bg-[#d9d9d9]">
            <tr>
              <th className="border border-black p-1 w-[20%] font-bold">Obiekt</th>
              <th className={`border border-black p-1 font-bold ${mode === "incoming" ? "bg-[#eeeeee]" : ""}`}>
                Uwagi przekazującego zmianę{mode === "incoming" ? " (do przeczytania)" : ""}
              </th>
              <th className={`border border-black p-1 font-bold ${mode === "incoming" ? "bg-yellow-100" : ""}`}>
                Uwagi przejmującego zmianę{mode === "incoming" ? " (wymagane)" : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {(objects ?? []).map((obj) => {
              const v = itemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
              const setField = (k: "uwagi_przekazujacego" | "uwagi_przyjmujacego", val: string) =>
                setItemMap((m) => ({ ...m, [obj.id]: { ...v, [k]: val } }));
              const errKey = `${obj.id}:uwagi_przekazujacego`;
              const errKeyTo = `${obj.id}:uwagi_przyjmujacego`;
              return (
                <tr key={obj.id} className="align-top">
                  <td className="border border-black bg-[#d9d9d9] p-1 italic">{obj.name}</td>
                  <td className="border border-black p-1">
                    {mode === "incoming" ? (
                      <div className="text-xs whitespace-pre-wrap min-h-[3em] p-1">
                        {v.uwagi_przekazujacego || <span className="italic text-gray-500">— brak uwag —</span>}
                      </div>
                    ) : (
                      <Textarea
                        value={v.uwagi_przekazujacego}
                        onChange={(e) => setField("uwagi_przekazujacego", e.target.value)}
                        disabled={!canEditFrom}
                        placeholder={canEditFrom ? "Wpisz uwagi lub „brak uwag”" : ""}
                        rows={3}
                        className={`text-xs ${errors[errKey] ? "border-destructive" : ""}`}
                      />
                    )}
                  </td>
                  <td className={`border border-black p-1 ${mode === "incoming" ? "bg-yellow-50" : ""}`}>
                    {mode === "outgoing" ? (
                      <div className="text-xs italic text-gray-500 min-h-[3em] p-1">
                        — wypełni przejmujący zmianę —
                      </div>
                    ) : (
                      <Textarea
                        value={v.uwagi_przyjmujacego}
                        onChange={(e) => setField("uwagi_przyjmujacego", e.target.value)}
                        disabled={!canEditTo}
                        placeholder={canEditTo ? "Wpisz swoje uwagi (wymagane, np. „brak uwag”)" : ""}
                        rows={3}
                        className={`text-xs ${errors[errKeyTo] ? "border-destructive ring-1 ring-destructive" : ""}`}
                        autoFocus={mode === "incoming"}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="border border-black bg-[#d9d9d9] p-2 font-bold">Podpisy:</td>
              <td className="border border-black p-2 underline">Przekazujący : {fromName}</td>
              <td className="border border-black p-2 underline">Przejmujący : {activeHandover?.accepted_at ? toName : ""}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2 print:hidden">
        {mode === "outgoing" && canEditFrom && (
          <Button onClick={() => saveFrom.mutate()} disabled={saveFrom.isPending}>
            {saveFrom.isPending
              ? "Zapisywanie…"
              : activeHandover
                ? "Aktualizuj protokół"
                : "Zapisz protokół"}
          </Button>
        )}
        {mode === "history" && locked && isManager && (
          <Button onClick={() => saveFrom.mutate()} disabled={saveFrom.isPending}>
            {saveFrom.isPending ? "Zapisywanie…" : "Zapisz zmiany (z historią)"}
          </Button>
        )}
        {mode === "incoming" && (
          <Button onClick={() => accept.mutate()} disabled={accept.isPending} size="lg">
            {accept.isPending ? "Zapisywanie…" : "Potwierdź przyjęcie zmiany"}
          </Button>
        )}
      </div>
    </div>
  );
}
