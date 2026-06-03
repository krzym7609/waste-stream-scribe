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
  const incomingHandover = overrideHandover ?? pendingForMe ?? lastAccepted;
  const outgoingHandover = overrideHandover ?? mineAsFrom;
  const activeHandover = outgoingHandover ?? incomingHandover;


  const { data: incomingItems } = useQuery({
    queryKey: ["handover_items", "incoming", incomingHandover?.id],
    enabled: !!incomingHandover?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("handover_report_items")
        .select("*")
        .eq("handover_id", incomingHandover!.id);
      return data ?? [];
    },
  });

  const { data: outgoingItems } = useQuery({
    queryKey: ["handover_items", "outgoing", outgoingHandover?.id],
    enabled: !!outgoingHandover?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("handover_report_items")
        .select("*")
        .eq("handover_id", outgoingHandover!.id);
      return data ?? [];
    },
  });

  const { data: incomingFromProfile } = useQuery({
    queryKey: ["profile", incomingHandover?.from_user_id],
    enabled: !!incomingHandover?.from_user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name,username")
        .eq("id", incomingHandover!.from_user_id)
        .maybeSingle();
      return data;
    },
  });
  const incomingFromName =
    `${incomingFromProfile?.first_name ?? ""} ${incomingFromProfile?.last_name ?? ""}`.trim() ||
    incomingFromProfile?.username ||
    "—";

  const { data: incomingToProfile } = useQuery({
    queryKey: ["profile", incomingHandover?.to_user_id],
    enabled: !!incomingHandover?.to_user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name,username")
        .eq("id", incomingHandover!.to_user_id!)
        .maybeSingle();
      return data;
    },
  });
  const incomingToName =
    `${incomingToProfile?.first_name ?? ""} ${incomingToProfile?.last_name ?? ""}`.trim() ||
    incomingToProfile?.username ||
    "—";

  const { data: outgoingToProfile } = useQuery({
    queryKey: ["profile", outgoingHandover?.to_user_id],
    enabled: !!outgoingHandover?.to_user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name,username")
        .eq("id", outgoingHandover!.to_user_id!)
        .maybeSingle();
      return data;
    },
  });
  const outgoingToName =
    `${outgoingToProfile?.first_name ?? ""} ${outgoingToProfile?.last_name ?? ""}`.trim() ||
    outgoingToProfile?.username ||
    null;

  const [incomingItemMap, setIncomingItemMap] = useState<
    Record<string, { uwagi_przekazujacego: string; uwagi_przyjmujacego: string }>
  >({});
  const [outgoingItemMap, setOutgoingItemMap] = useState<
    Record<string, { uwagi_przekazujacego: string; uwagi_przyjmujacego: string }>
  >({});
  const [uwagiOgolne, setUwagiOgolne] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  useEffect(() => {
    const m: typeof incomingItemMap = {};
    for (const it of incomingItems ?? []) {
      m[it.object_id] = {
        uwagi_przekazujacego: it.uwagi_przekazujacego ?? "",
        uwagi_przyjmujacego: it.uwagi_przyjmujacego ?? "",
      };
    }
    setIncomingItemMap(m);
  }, [incomingItems, incomingHandover?.id]);

  useEffect(() => {
    const m: typeof outgoingItemMap = {};
    for (const it of outgoingItems ?? []) {
      m[it.object_id] = {
        uwagi_przekazujacego: it.uwagi_przekazujacego ?? "",
        uwagi_przyjmujacego: it.uwagi_przyjmujacego ?? "",
      };
    }
    setOutgoingItemMap(m);
    setUwagiOgolne(outgoingHandover?.uwagi_ogolne ?? "");
  }, [outgoingItems, outgoingHandover?.id]);

  const incomingLocked = !!incomingHandover?.locked_at;
  const outgoingLocked = !!outgoingHandover?.locked_at;
  const activeLocked = !!activeHandover?.locked_at;
  const mode: "incoming" | "outgoing" | "history" = pendingForMe
    ? "incoming"
    : isMine && !outgoingLocked
      ? "outgoing"
      : "history";

  const validateFrom = (): boolean => {
    const errs: Record<string, string> = {};
    for (const obj of objects ?? []) {
      const v = outgoingItemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
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
      toast.error("Sprawdź formularz.");
      return false;
    }
    return true;
  };

  const saveFrom = useMutation({
    mutationFn: async () => {
      if (!sessionId || !user) throw new Error("Brak otwartej zmiany");
      if (!validateFrom()) throw new Error("Formularz zawiera błędy");
      if (outgoingLocked && isManager && reason.trim().length < 5) {
        throw new Error("Edycja zamkniętego protokołu wymaga powodu (min. 5 znaków)");
      }

      // Snapshot przed edycją kierownika
      if (outgoingLocked && isManager && outgoingHandover) {
        const { error: snapErr } = await supabase.from("handover_report_snapshots").insert({
          handover_id: outgoingHandover.id,
          snapshot: JSON.parse(JSON.stringify(outgoingHandover)),
          items_snapshot: JSON.parse(JSON.stringify(outgoingItems ?? [])),
          edited_by: user.id,
          reason: reason.trim(),
        });
        if (snapErr) throw snapErr;
      }

      let id = outgoingHandover?.id;
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
        const v = outgoingItemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
        const { error } = await supabase.from("handover_report_items").upsert(
          {
            handover_id: id!,
            object_id: obj.id,
            uwagi_przekazujacego: v.uwagi_przekazujacego || null,
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
      setErrors({});
      for (const obj of objects ?? []) {
        const v = incomingItemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
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
    const useOutgoing = !!outgoingHandover;
    const activeItems = useOutgoing ? outgoingItems : incomingItems;
    const meName =
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
      profile?.username ||
      "—";
    // Operator przekazujący = autor raportu (from_user); przejmujący = to_user
    const operatorFrom = useOutgoing ? meName : incomingFromName;
    const operatorTo = useOutgoing
      ? outgoingToName
      : activeHandover.accepted_at
        ? meName
        : null;
    await generateHandoverPdf({
      date: activeHandover.submitted_at.slice(0, 10),
      shiftFrom: duty?.session?.shift_type ?? "—",
      operatorFrom,
      operatorTo,
      submittedAt: activeHandover.submitted_at,
      acceptedAt: activeHandover.accepted_at,
      uwagiOgolne: activeHandover.uwagi_ogolne,
      items: (activeItems ?? []).map((it) => ({
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
          {activeLocked && (
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

      {activeLocked && isManager && (
        <div className="border border-amber-500/50 bg-amber-500/10 rounded p-3 text-sm print:hidden">
          <div className="font-medium mb-1">Edycja zamkniętego protokołu przez kierownika</div>
          <Label className="text-xs">Powód edycji (wymagane, min. 5 znaków)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
        </div>
      )}
      {pendingForMe && (
        <div className="border border-blue-500/50 bg-blue-500/10 rounded-md p-4 text-sm print:hidden">
          <div className="font-semibold mb-1">Oczekujący protokół do przyjęcia</div>
          <div>
            Poprzedni operator przekazał Ci zmianę. Przejdź do zakładki <strong>Przyjęcie zmiany</strong>{" "}
            i wpisz swoje uwagi dla każdego obiektu.
          </div>
        </div>
      )}

      <Tabs defaultValue={pendingForMe ? "incoming" : "outgoing"} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="incoming">
            Przyjęcie zmiany{pendingForMe ? " •" : ""}
          </TabsTrigger>
          <TabsTrigger value="outgoing">Przekazanie zmiany</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="space-y-3">
          {renderReport("incoming")}
        </TabsContent>
        <TabsContent value="outgoing" className="space-y-3">
          {renderReport("outgoing")}
        </TabsContent>
      </Tabs>
    </div>
  );

  function renderReport(tab: "incoming" | "outgoing") {
    const editFrom = tab === "outgoing" && isMine && !outgoingLocked;
    const editTo = tab === "incoming" && !!pendingForMe && !incomingLocked;
    const currentItemMap = tab === "incoming" ? incomingItemMap : outgoingItemMap;
    const setCurrentItemMap = tab === "incoming" ? setIncomingItemMap : setOutgoingItemMap;
    const ctxHandover = tab === "incoming" ? incomingHandover : outgoingHandover;

    if (tab === "incoming" && !pendingForMe && !lastAccepted) {
      return (
        <div className="bg-white text-black border border-black p-6 font-serif text-sm">
          Brak protokołu do przyjęcia. Gdy poprzedni operator wyśle protokół przekazania,
          zobaczysz go tutaj.
        </div>
      );
    }
    if (tab === "outgoing" && !isMine && !mineAsFrom) {
      return (
        <div className="bg-white text-black border border-black p-6 font-serif text-sm">
          Nie masz otwartej własnej zmiany — nie możesz utworzyć protokołu przekazania.
        </div>
      );
    }

    return (
      <div className="bg-white text-black border border-black p-6 font-serif text-[13px] leading-tight max-w-full overflow-x-auto">
        <table className="w-full border-collapse mb-1">
          <tbody>
            <tr>
              <td className="align-top pb-1 w-1/2">
                <span className="italic font-bold underline">
                  {tab === "incoming" ? "PRZYJĘCIE  ZMIANY :" : "PRZEKAZANIE  ZMIANY :"}
                </span>
              </td>
              <td className="align-top pb-1 border border-black p-2">
                Data : <strong>{ctxHandover?.submitted_at?.slice(0, 10) ?? today}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <table className="w-full border-collapse border border-black mb-2">
          <tbody>
            <tr>
              <td className="border border-black p-2">
                <div>
                  Zmianę przekazuje:{" "}
                  <strong>{tab === "outgoing" ? fromName : incomingFromName}</strong>
                </div>
                <div className="mt-1">
                  Zmianę przejmuje:{" "}
                  <strong>{tab === "incoming" ? fromName : (ctxHandover?.accepted_at ? toName : "—")}</strong>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="italic mb-1">Uwagi dotyczące przekazania zmiany:</div>

        <table className="w-full border-collapse border border-black table-fixed">
          <thead className="bg-[#d9d9d9]">
            <tr>
              <th className="border border-black p-1 w-[22%] font-bold">Obiekt</th>
              <th className={`border border-black p-1 w-[39%] font-bold ${editFrom ? "bg-yellow-100" : ""}`}>
                Uwagi przekazującego zmianę
              </th>
              <th className={`border border-black p-1 w-[39%] font-bold ${editTo ? "bg-yellow-100" : ""}`}>
                Uwagi przejmującego zmianę
              </th>
            </tr>
          </thead>
          <tbody>
            {(objects ?? []).map((obj) => {
              const v = currentItemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
              const setField = (k: "uwagi_przekazujacego" | "uwagi_przyjmujacego", val: string) =>
                setCurrentItemMap((m) => ({
                  ...m,
                  [obj.id]: {
                    ...(m[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" }),
                    [k]: val,
                  },
                }));
              const errFrom = `${obj.id}:uwagi_przekazujacego`;
              const errTo = `${obj.id}:uwagi_przyjmujacego`;
              return (
                <tr key={obj.id} className="align-top">
                  <td className="border border-black bg-[#d9d9d9] p-1 italic break-all">{obj.name}</td>
                  <td className={`border border-black p-1 break-all ${editFrom ? "bg-yellow-50" : ""}`}>
                    {editFrom ? (
                      <Textarea
                        value={v.uwagi_przekazujacego}
                        onChange={(e) => setField("uwagi_przekazujacego", e.target.value)}
                        placeholder="Wpisz uwagi lub: brak uwag"
                        rows={3}
                        className={`text-xs resize-none w-full ${errors[errFrom] ? "border-destructive" : ""}`}
                      />
                    ) : (
                      <div className="text-xs whitespace-pre-wrap min-h-[3em] p-1 break-words">
                        {v.uwagi_przekazujacego || (
                          <span className="italic text-gray-500">— brak uwag —</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className={`border border-black p-1 break-words ${editTo ? "bg-yellow-50" : ""}`}>
                    {editTo ? (
                      <Textarea
                        value={v.uwagi_przyjmujacego}
                        onChange={(e) => setField("uwagi_przyjmujacego", e.target.value)}
                        placeholder="Wpisz uwagi (opcjonalne)"
                        rows={3}
                        className={`text-xs resize-none w-full ${errors[errTo] ? "border-destructive ring-1 ring-destructive" : ""}`}
                      />
                    ) : (
                      <div className="text-xs whitespace-pre-wrap min-h-[3em] p-1 break-words">
                        {v.uwagi_przyjmujacego || (
                          <span className="italic text-gray-500">
                            {tab === "outgoing" ? "— wypełni przejmujący —" : "— brak uwag —"}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="border border-black bg-[#d9d9d9] p-2 font-bold">Podpisy:</td>
              <td className="border border-black p-2 underline">
                Przekazujący : {tab === "outgoing" ? fromName : incomingFromName}
              </td>
              <td className="border border-black p-2 underline">
                Przejmujący : {tab === "incoming" ? fromName : (ctxHandover?.accepted_at ? toName : "")}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end gap-2 mt-3 print:hidden">
          {tab === "outgoing" && editFrom && (
            <Button onClick={() => saveFrom.mutate()} disabled={saveFrom.isPending}>
              {saveFrom.isPending
                ? "Zapisywanie…"
                : mineAsFrom
                  ? "Aktualizuj protokół"
                  : "Zapisz protokół"}
            </Button>
          )}
          {tab === "incoming" && editTo && (
            <Button onClick={() => accept.mutate()} disabled={accept.isPending} size="lg">
              {accept.isPending ? "Zapisywanie…" : "Potwierdź przyjęcie zmiany"}
            </Button>
          )}
        </div>
      </div>
    );
  }
}
