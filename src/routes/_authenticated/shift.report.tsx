import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCurrentDuty } from "@/lib/use-current-duty";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shift/report")({
  component: ShiftReportPage,
});

type NumField =
  | "energia_start"
  | "energia_end"
  | "flokulant_proszkowy_kg"
  | "flokulant_emulsyjny_l"
  | "wapno_kg"
  | "chlorek_zelaza_l"
  | "sm_osadu_zageszcz"
  | "sm_osadu_odwwapn";

const NUM_FIELDS: { key: NumField; label: string }[] = [
  { key: "energia_start", label: "Energia – stan początkowy [kWh]" },
  { key: "energia_end", label: "Energia – stan końcowy [kWh]" },
  { key: "flokulant_proszkowy_kg", label: "Flokulant proszkowy [kg]" },
  { key: "flokulant_emulsyjny_l", label: "Flokulant emulsyjny [l]" },
  { key: "wapno_kg", label: "Wapno [kg]" },
  { key: "chlorek_zelaza_l", label: "Chlorek żelaza [l]" },
  { key: "sm_osadu_zageszcz", label: "S.M. osadu zagęszczonego [%]" },
  { key: "sm_osadu_odwwapn", label: "S.M. osadu odwodnionego/wapnowanego [%]" },
];

function ShiftReportPage() {
  const { user, profile } = useAuth();
  const { data: duty } = useCurrentDuty();
  const qc = useQueryClient();

  const sessionId = duty?.session?.id;
  const isMine = duty?.session?.user_id === user?.id;

  const { data: objects } = useQuery({
    queryKey: ["report_objects"],
    queryFn: async () => {
      const { data } = await supabase
        .from("report_objects")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      return data ?? [];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["shift_report", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data: r } = await supabase
        .from("shift_reports")
        .select("*")
        .eq("duty_session_id", sessionId!)
        .maybeSingle();
      if (!r) return null;
      const { data: items } = await supabase
        .from("shift_report_items")
        .select("*")
        .eq("report_id", r.id);
      return { report: r, items: items ?? [] };
    },
  });

  const [nums, setNums] = useState<Record<string, string>>({});
  const [opady, setOpady] = useState(false);
  const [uwagi, setUwagi] = useState("");
  const [items, setItems] = useState<
    Record<
      string,
      {
        ocena_status: "ok" | "problem";
        ocena_opis: string;
        harmonogram_status: "ok" | "nie_wykonano";
        harmonogram_opis: string;
        proponowany_termin: string;
        inne_czynnosci: string;
      }
    >
  >({});

  useEffect(() => {
    if (existing?.report) {
      const r = existing.report;
      setOpady(r.opady);
      setUwagi(r.uwagi ?? "");
      const next: Record<string, string> = {};
      for (const f of NUM_FIELDS) {
        const v = r[f.key as keyof typeof r];
        next[f.key] = v == null ? "" : String(v);
      }
      setNums(next);
      const itemMap: typeof items = {};
      for (const it of existing.items) {
        itemMap[it.object_id] = {
          ocena_status: it.ocena_status as "ok" | "problem",
          ocena_opis: it.ocena_opis ?? "",
          harmonogram_status: it.harmonogram_status as "ok" | "nie_wykonano",
          harmonogram_opis: it.harmonogram_opis ?? "",
          proponowany_termin: it.proponowany_termin ?? "",
          inne_czynnosci: it.inne_czynnosci ?? "",
        };
      }
      setItems(itemMap);
    }
  }, [existing?.report?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!sessionId || !user) throw new Error("Brak dyżuru");
      const payload: Record<string, unknown> = {
        duty_session_id: sessionId,
        submitted_by: user.id,
        opady,
        uwagi: uwagi || null,
      };
      for (const f of NUM_FIELDS) {
        const raw = nums[f.key];
        payload[f.key] = raw === "" || raw == null ? null : Number(raw);
      }
      let reportId = existing?.report?.id;
      if (reportId) {
        const { error } = await supabase.from("shift_reports").update(payload).eq("id", reportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("shift_reports")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        reportId = data.id;
      }
      // upsert items
      for (const obj of objects ?? []) {
        const i = items[obj.id] ?? {
          ocena_status: "ok",
          ocena_opis: "",
          harmonogram_status: "ok",
          harmonogram_opis: "",
          proponowany_termin: "",
          inne_czynnosci: "",
        };
        const itemPayload = {
          report_id: reportId!,
          object_id: obj.id,
          ocena_status: i.ocena_status,
          ocena_opis: i.ocena_opis || null,
          harmonogram_status: i.harmonogram_status,
          harmonogram_opis: i.harmonogram_opis || null,
          proponowany_termin: i.proponowany_termin || null,
          inne_czynnosci: i.inne_czynnosci || null,
        };
        await supabase
          .from("shift_report_items")
          .upsert(itemPayload, { onConflict: "report_id,object_id" });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift_report"] });
      toast.success("Raport zapisany");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!sessionId) {
    return <div className="p-6 text-muted-foreground">Brak otwartego dyżuru.</div>;
  }
  if (!isMine) {
    return <div className="p-6 text-muted-foreground">Raport może wypełnić operator pełniący dyżur.</div>;
  }

  const signature = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Raport zmianowy</h1>
        <p className="text-sm text-muted-foreground">
          Operator: <strong>{signature || profile?.username}</strong>
        </p>
      </div>

      <section className="border rounded-md p-4 space-y-4">
        <h2 className="font-medium">Dane wejściowe</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {NUM_FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="text-xs">{f.label}</Label>
              <Input
                type="number"
                step="0.01"
                value={nums[f.key] ?? ""}
                onChange={(e) => setNums((m) => ({ ...m, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="opady" checked={opady} onCheckedChange={(v) => setOpady(!!v)} />
          <Label htmlFor="opady">Opady atmosferyczne</Label>
        </div>
        <div>
          <Label>Uwagi ogólne</Label>
          <Textarea value={uwagi} onChange={(e) => setUwagi(e.target.value)} rows={2} />
        </div>
      </section>

      <section className="border rounded-md">
        <div className="p-4 border-b font-medium">Ocena obiektów</div>
        <div className="divide-y">
          {(objects ?? []).map((obj) => {
            const i = items[obj.id] ?? {
              ocena_status: "ok" as const,
              ocena_opis: "",
              harmonogram_status: "ok" as const,
              harmonogram_opis: "",
              proponowany_termin: "",
              inne_czynnosci: "",
            };
            const setField = <K extends keyof typeof i>(k: K, v: (typeof i)[K]) =>
              setItems((m) => ({ ...m, [obj.id]: { ...i, [k]: v } }));
            return (
              <div key={obj.id} className="p-4 space-y-2">
                <div className="font-medium text-sm">{obj.name}</div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Ocena prawidłowości pracy</Label>
                    <Select value={i.ocena_status} onValueChange={(v) => setField("ocena_status", v as "ok" | "problem")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ok">✓ OK</SelectItem>
                        <SelectItem value="problem">⚠ Problem</SelectItem>
                      </SelectContent>
                    </Select>
                    {i.ocena_status === "problem" && (
                      <Textarea
                        className="mt-2"
                        placeholder="Opis problemu (wymagany)"
                        value={i.ocena_opis}
                        onChange={(e) => setField("ocena_opis", e.target.value)}
                        rows={2}
                      />
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Wykonanie harmonogramu</Label>
                    <Select
                      value={i.harmonogram_status}
                      onValueChange={(v) => setField("harmonogram_status", v as "ok" | "nie_wykonano")}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ok">✓ Wykonane</SelectItem>
                        <SelectItem value="nie_wykonano">✗ Nie wykonano</SelectItem>
                      </SelectContent>
                    </Select>
                    {i.harmonogram_status === "nie_wykonano" && (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          placeholder="Opis (wymagany)"
                          value={i.harmonogram_opis}
                          onChange={(e) => setField("harmonogram_opis", e.target.value)}
                          rows={2}
                        />
                        <div>
                          <Label className="text-xs">Proponowany termin</Label>
                          <Input
                            type="date"
                            value={i.proponowany_termin}
                            onChange={(e) => setField("proponowany_termin", e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Inne czynności</Label>
                  <Textarea
                    value={i.inne_czynnosci}
                    onChange={(e) => setField("inne_czynnosci", e.target.value)}
                    rows={1}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Podpis: <strong>{signature || profile?.username}</strong>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Zapisywanie…" : "Zapisz raport"}
        </Button>
      </div>
    </div>
  );
}
