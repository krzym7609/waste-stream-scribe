import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCurrentDuty } from "@/lib/use-current-duty";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shift/handover")({
  component: HandoverPage,
});

function HandoverPage() {
  const { user, profile } = useAuth();
  const { data: duty } = useCurrentDuty();
  const qc = useQueryClient();

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

  // Trwające przekazanie dla MOJEJ sesji jako "from" (wypełniam przekazujący)
  // lub jako "to" (wypełniam przyjmujący — accepted_at jeszcze nie ustawione)
  const { data: handovers } = useQuery({
    queryKey: ["handovers", sessionId, user?.id],
    enabled: !!user,
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
  const pendingForMe = handovers?.find(
    (h) => h.to_user_id === user?.id && !h.accepted_at,
  );
  const lastAccepted = handovers?.find((h) => h.to_user_id === user?.id && h.accepted_at);

  const activeId = mineAsFrom?.id ?? pendingForMe?.id ?? lastAccepted?.id;

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

  useEffect(() => {
    const m: typeof itemMap = {};
    for (const it of items ?? []) {
      m[it.object_id] = {
        uwagi_przekazujacego: it.uwagi_przekazujacego ?? "",
        uwagi_przyjmujacego: it.uwagi_przyjmujacego ?? "",
      };
    }
    setItemMap(m);
    const cur = mineAsFrom ?? pendingForMe ?? lastAccepted;
    setUwagiOgolne(cur?.uwagi_ogolne ?? "");
  }, [items?.length, mineAsFrom?.id, pendingForMe?.id, lastAccepted?.id]);

  // Akcja: zapisz uwagi przekazującego (utwórz handover jeśli brak)
  const saveFrom = useMutation({
    mutationFn: async () => {
      if (!sessionId || !user) throw new Error("Brak dyżuru");
      let id = mineAsFrom?.id;
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
        await supabase
          .from("handover_report_items")
          .upsert(
            {
              handover_id: id!,
              object_id: obj.id,
              uwagi_przekazujacego: v.uwagi_przekazujacego || null,
            },
            { onConflict: "handover_id,object_id" },
          );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handovers"] });
      qc.invalidateQueries({ queryKey: ["handover_items"] });
      toast.success("Przekazanie zapisane. Następny operator zobaczy uwagi po zalogowaniu.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Akcja: przyjmujący akceptuje
  const accept = useMutation({
    mutationFn: async () => {
      if (!pendingForMe || !user || !sessionId) throw new Error("Brak przekazania do przyjęcia");
      for (const obj of objects ?? []) {
        const v = itemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
        if (v.uwagi_przyjmujacego) {
          await supabase
            .from("handover_report_items")
            .upsert(
              {
                handover_id: pendingForMe.id,
                object_id: obj.id,
                uwagi_przyjmujacego: v.uwagi_przyjmujacego,
              },
              { onConflict: "handover_id,object_id" },
            );
        }
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
      toast.success("Przekazanie przyjęte");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!sessionId) {
    return <div className="p-6 text-muted-foreground">Brak otwartego dyżuru.</div>;
  }

  // Tryb: przyjmujący (jest oczekujące przekazanie dla mnie)
  const mode: "incoming" | "outgoing" | "history" = pendingForMe
    ? "incoming"
    : isMine
      ? "outgoing"
      : "history";

  const signature = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Przekazanie zmiany</h1>
          <p className="text-sm text-muted-foreground">
            Operator: <strong>{signature || profile?.username}</strong>
          </p>
        </div>
        <Badge variant="outline">
          {mode === "incoming" && "Do przyjęcia"}
          {mode === "outgoing" && "Przekazujesz zmianę"}
          {mode === "history" && "Historia"}
        </Badge>
      </div>

      {mode === "incoming" && (
        <div className="border border-blue-500/40 bg-blue-500/10 rounded-md p-3 text-sm">
          Masz przekazanie do przyjęcia. Przeczytaj uwagi i ewentualnie dopisz swoje.
        </div>
      )}

      <div className="border rounded-md">
        <div className="p-4 border-b font-medium">Uwagi per obiekt</div>
        <div className="divide-y">
          {(objects ?? []).map((obj) => {
            const v = itemMap[obj.id] ?? { uwagi_przekazujacego: "", uwagi_przyjmujacego: "" };
            const setField = (k: "uwagi_przekazujacego" | "uwagi_przyjmujacego", val: string) =>
              setItemMap((m) => ({ ...m, [obj.id]: { ...v, [k]: val } }));
            return (
              <div key={obj.id} className="p-4 grid md:grid-cols-2 gap-3">
                <div>
                  <div className="font-medium text-sm">{obj.name}</div>
                  <Label className="text-xs mt-2 block">Uwagi przekazującego</Label>
                  <Textarea
                    value={v.uwagi_przekazujacego}
                    onChange={(e) => setField("uwagi_przekazujacego", e.target.value)}
                    disabled={mode !== "outgoing"}
                    placeholder={mode === "outgoing" ? "Brak uwag…" : "—"}
                    rows={2}
                  />
                </div>
                <div>
                  <Label className="text-xs">Uwagi przyjmującego</Label>
                  <Textarea
                    value={v.uwagi_przyjmujacego}
                    onChange={(e) => setField("uwagi_przyjmujacego", e.target.value)}
                    disabled={mode !== "incoming"}
                    placeholder={mode === "incoming" ? "Dopisz uwagi…" : "—"}
                    rows={2}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <Label>Uwagi ogólne</Label>
        <Textarea
          value={uwagiOgolne}
          onChange={(e) => setUwagiOgolne(e.target.value)}
          disabled={mode !== "outgoing"}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        {mode === "outgoing" && (
          <Button onClick={() => saveFrom.mutate()} disabled={saveFrom.isPending}>
            {saveFrom.isPending ? "Zapisywanie…" : mineAsFrom ? "Aktualizuj przekazanie" : "Zapisz przekazanie"}
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
