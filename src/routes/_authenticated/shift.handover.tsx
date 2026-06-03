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
      const { data } = await supabase
        .from("handover_reports")
        .select("*")
        .or(
          `from_user_id.eq.${user!.id},to_user_id.eq.${user!.id}` +
            (sessionId
              ? `,duty_session_from_id.eq.${sessionId},duty_session_to_id.eq.${sessionId}`
              : ""),
        )
        .order("submitted_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const mineAsFrom = handovers?.find(
    (h) => h.duty_session_from_id === sessionId && !h.accepted_at,
  );
  const pendingForMe = handovers?.find((h) => h.to_user_id === user?.id && !h.accepted_at);
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handovers"] });
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

  if (!sessionId) {
    return <div className="p-6 text-muted-foreground">Brak otwartej zmiany.</div>;
  }

  const signature = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Protokół przekazania zmiany</h1>
          <p className="text-sm text-muted-foreground">
            Operator: <strong>{signature || profile?.username}</strong>
          </p>
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
        <div className="border border-amber-500/50 bg-amber-500/10 rounded p-3 text-sm">
          <div className="font-medium mb-1">Edycja zamkniętego protokołu przez kierownika</div>
          <Label className="text-xs">Powód edycji (wymagane, min. 5 znaków)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
        </div>
      )}

      {mode === "incoming" && (
        <div className="border border-blue-500/40 bg-blue-500/10 rounded-md p-3 text-sm">
          Masz protokół do przyjęcia. Przeczytaj uwagi przekazującego i dopisz swoje.
        </div>
      )}

      <section className="border rounded-md overflow-hidden">
        <div className="p-3 border-b font-medium bg-muted/40">Uwagi per obiekt</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b">
            <tr>
              <th className="text-left p-2 font-medium w-8">Lp.</th>
              <th className="text-left p-2 font-medium w-1/4">Obiekt</th>
              <th className="text-left p-2 font-medium">Uwagi przekazującego</th>
              <th className="text-left p-2 font-medium">Uwagi przyjmującego</th>
            </tr>
          </thead>
          <tbody>
            {(objects ?? []).map((obj, idx) => {
              const v = itemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
              const setField = (
                k: "uwagi_przekazujacego" | "uwagi_przyjmujacego",
                val: string,
              ) => setItemMap((m) => ({ ...m, [obj.id]: { ...v, [k]: val } }));
              const errKey = `${obj.id}:uwagi_przekazujacego`;
              return (
                <tr key={obj.id} className="border-b align-top">
                  <td className="p-2 text-muted-foreground">{idx + 1}</td>
                  <td className="p-2 font-medium">{obj.name}</td>
                  <td className="p-2">
                    <Textarea
                      value={v.uwagi_przekazujacego}
                      onChange={(e) => setField("uwagi_przekazujacego", e.target.value)}
                      disabled={!canEditFrom}
                      placeholder={canEditFrom ? "Wpisz uwagi lub „brak uwag”" : "—"}
                      rows={2}
                      className={errors[errKey] ? "border-destructive" : ""}
                    />
                    {errors[errKey] && (
                      <p className="text-xs text-destructive mt-1">{errors[errKey]}</p>
                    )}
                  </td>
                  <td className="p-2">
                    <Textarea
                      value={v.uwagi_przyjmujacego}
                      onChange={(e) => setField("uwagi_przyjmujacego", e.target.value)}
                      disabled={!canEditTo}
                      placeholder={canEditTo ? "Dopisz uwagi…" : "—"}
                      rows={2}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div>
        <Label>Uwagi ogólne</Label>
        <Textarea
          value={uwagiOgolne}
          onChange={(e) => setUwagiOgolne(e.target.value)}
          disabled={!canEditFrom}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        {(canEditFrom || canEditTo) && mode !== "incoming" && (
          <Button onClick={() => saveFrom.mutate()} disabled={saveFrom.isPending}>
            {saveFrom.isPending
              ? "Zapisywanie…"
              : locked
                ? "Zapisz zmiany (z historią)"
                : activeHandover
                  ? "Aktualizuj protokół"
                  : "Zapisz protokół"}
          </Button>
        )}
        {mode === "incoming" && (
          <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending ? "Zapisywanie…" : "Przyjmij zmianę"}
          </Button>
        )}
      </div>
    </div>
  );
}
