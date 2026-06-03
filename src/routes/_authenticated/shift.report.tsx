import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCurrentDuty } from "@/lib/use-current-duty";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Lock } from "lucide-react";
import { shiftReportSchema, shiftReportItemSchema } from "@/lib/validation/shift-report";
import { generateShiftReportPdf } from "@/lib/pdf/shift-report-pdf";

export const Route = createFileRoute("/_authenticated/shift/report")({
  validateSearch: (s: Record<string, unknown>) => ({
    session: typeof s.session === "string" ? s.session : undefined,
  }),
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

const NUM_FIELDS: { key: NumField; label: string; unit: string }[] = [
  { key: "energia_start", label: "Energia – stan początkowy", unit: "kWh" },
  { key: "energia_end", label: "Energia – stan końcowy", unit: "kWh" },
  { key: "flokulant_proszkowy_kg", label: "Flokulant proszkowy", unit: "kg" },
  { key: "flokulant_emulsyjny_l", label: "Flokulant emulsyjny", unit: "l" },
  { key: "wapno_kg", label: "Wapno", unit: "kg" },
  { key: "chlorek_zelaza_l", label: "Chlorek żelaza", unit: "l" },
  { key: "sm_osadu_zageszcz", label: "S.M. osadu zagęszczonego", unit: "%" },
  { key: "sm_osadu_odwwapn", label: "S.M. osadu odwodnionego/wapnowanego", unit: "%" },
];

type ItemState = {
  ocena_status: "ok" | "problem";
  ocena_opis: string;
  harmonogram_status: "ok" | "nie_wykonano";
  harmonogram_opis: string;
  proponowany_termin: string;
  inne_czynnosci: string;
};

const emptyItem = (): ItemState => ({
  ocena_status: "ok",
  ocena_opis: "",
  harmonogram_status: "ok",
  harmonogram_opis: "",
  proponowany_termin: "",
  inne_czynnosci: "",
});

function ShiftReportPage() {
  const { user, profile, isManager } = useAuth();
  const { data: duty } = useCurrentDuty();
  const router = useRouter();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const overrideSessionId = isManager ? search.session : undefined;

  // Fetch override session details (for shift_type / operator) when manager opens another's report
  const { data: overrideSession } = useQuery({
    queryKey: ["duty_session", overrideSessionId],
    enabled: !!overrideSessionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("duty_sessions")
        .select("*")
        .eq("id", overrideSessionId!)
        .maybeSingle();
      return data;
    },
  });

  const sessionId = overrideSessionId ?? duty?.session?.id;
  const sessionUserId = overrideSession?.user_id ?? duty?.session?.user_id;
  const sessionShiftType = overrideSession?.shift_type ?? duty?.session?.shift_type;
  const isMine = sessionUserId === user?.id;


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
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState(""); // manager edit reason

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
      const itemMap: Record<string, ItemState> = {};
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
  }, [existing?.report?.id, existing?.items?.length]);

  const locked = !!existing?.report?.locked_at;
  const canEdit = !locked || isManager;
  const needsReason = locked && isManager;

  const validate = (): { ok: boolean; payload?: Record<string, number | boolean | string | null> } => {
    const errs: Record<string, string> = {};
    // numeric
    const parsed: Record<string, number> = {};
    for (const f of NUM_FIELDS) {
      const raw = nums[f.key];
      if (raw === "" || raw == null) {
        errs[f.key] = `${f.label}: wymagane`;
      } else {
        const n = Number(raw);
        if (Number.isNaN(n)) errs[f.key] = `${f.label}: nieprawidłowa liczba`;
        else parsed[f.key] = n;
      }
    }
    if (Object.keys(errs).length === 0) {
      const r = shiftReportSchema.safeParse({
        ...parsed,
        opady,
        uwagi: uwagi || undefined,
      });
      if (!r.success) {
        for (const issue of r.error.issues) {
          errs[String(issue.path[0])] = issue.message;
        }
      }
    }
    // items
    for (const obj of objects ?? []) {
      const it = items[obj.id] ?? emptyItem();
      const r = shiftReportItemSchema.safeParse({ object_id: obj.id, ...it });
      if (!r.success) {
        for (const issue of r.error.issues) {
          errs[`item:${obj.id}:${String(issue.path[0] ?? "_")}`] = issue.message;
        }
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error(`Popraw błędy w formularzu (${Object.keys(errs).length})`);
      return { ok: false };
    }
    const payload: Record<string, number | boolean | string | null> = {
      opady,
      uwagi: uwagi || null,
      ...parsed,
    };
    return { ok: true, payload };
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!sessionId || !user) throw new Error("Brak otwartej zmiany");
      const v = validate();
      if (!v.ok || !v.payload) throw new Error("Formularz zawiera błędy");
      if (needsReason && reason.trim().length < 5) {
        throw new Error("Kierownik edytujący zamknięty raport musi podać powód (min. 5 znaków)");
      }

      // Snapshot before manager edit on locked report
      if (locked && isManager && existing?.report) {
        const { error: snapErr } = await supabase.from("shift_report_snapshots").insert({
          report_id: existing.report.id,
          snapshot: JSON.parse(JSON.stringify(existing.report)),
          items_snapshot: JSON.parse(JSON.stringify(existing.items)),
          edited_by: user.id,
          reason: reason.trim(),
        });
        if (snapErr) throw snapErr;
      }

      const updatePayload = v.payload as Partial<TablesInsert<"shift_reports">>;
      const insertPayload = {
        ...updatePayload,
        duty_session_id: sessionId,
        submitted_by: existing?.report?.submitted_by ?? user.id,
      } as TablesInsert<"shift_reports">;
      let reportId = existing?.report?.id;
      if (reportId) {
        const { error } = await supabase
          .from("shift_reports")
          .update(updatePayload)
          .eq("id", reportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("shift_reports")
          .insert(insertPayload)
          .select("id")
          .single();
        if (error) throw error;
        reportId = data.id;
      }
      for (const obj of objects ?? []) {
        const i = items[obj.id] ?? emptyItem();
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
        const { error } = await supabase
          .from("shift_report_items")
          .upsert(itemPayload, { onConflict: "report_id,object_id" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift_report"] });
      qc.invalidateQueries({ queryKey: ["shift_report_status"] });
      setReason("");
      toast.success("Raport zapisany");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const objectsList = objects ?? [];
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const downloadPdf = async () => {
    if (!existing?.report || !objects) return;
    const objMap = new Map(objects.map((o) => [o.id, o.name]));
    const r = existing.report;
    const operatorName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
      profile?.username || "—";
    await generateShiftReportPdf({
      date: r.submitted_at.slice(0, 10),
      shift: sessionShiftType ?? "—",
      operator: operatorName,
      submittedAt: r.submitted_at,
      data: {

        energia_start: r.energia_start as number | null,
        energia_end: r.energia_end as number | null,
        flokulant_proszkowy_kg: r.flokulant_proszkowy_kg as number | null,
        flokulant_emulsyjny_l: r.flokulant_emulsyjny_l as number | null,
        wapno_kg: r.wapno_kg as number | null,
        chlorek_zelaza_l: r.chlorek_zelaza_l as number | null,
        sm_osadu_zageszcz: r.sm_osadu_zageszcz as number | null,
        sm_osadu_odwwapn: r.sm_osadu_odwwapn as number | null,
        opady: r.opady,
        uwagi: r.uwagi,
      },
      items: existing.items.map((it) => ({
        object_name: objMap.get(it.object_id) ?? "—",
        ocena_status: it.ocena_status as "ok" | "problem",
        ocena_opis: it.ocena_opis,
        harmonogram_status: it.harmonogram_status as "ok" | "nie_wykonano",
        harmonogram_opis: it.harmonogram_opis,
        proponowany_termin: it.proponowany_termin,
        inne_czynnosci: it.inne_czynnosci,
      })),
    });
  };

  if (!sessionId) {
    return <div className="p-6 text-muted-foreground">Brak otwartej zmiany.</div>;
  }
  if (!isMine && !isManager) {
    return (
      <div className="p-6 text-muted-foreground">
        Raport może wypełnić operator pełniący zmianę.
      </div>
    );
  }

  const signature = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
  const fieldClass = (key: string) =>
    `w-full ${errors[key] ? "border-destructive focus-visible:ring-destructive" : ""}`;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Raport zmianowy</h1>
          <p className="text-sm text-muted-foreground">
            Data: <strong>{today}</strong> · Operator: <strong>{signature || profile?.username}</strong>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {locked && (
            <Badge variant="outline" className="gap-1">
              <Lock className="w-3 h-3" /> Zamknięty
            </Badge>
          )}
          {existing?.report && (
            <Button variant="outline" size="sm" onClick={downloadPdf}>
              <Download className="w-4 h-4 mr-1" /> Pobierz PDF
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.history.back()}>
            Wstecz
          </Button>
        </div>
      </div>

      {needsReason && (
        <div className="border border-amber-500/50 bg-amber-500/10 rounded p-3 text-sm">
          <div className="font-medium mb-1">Edycja zamkniętego raportu przez kierownika</div>
          <Label className="text-xs">Powód edycji (wymagane, min. 5 znaków)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
        </div>
      )}

      {/* --- Sekcja 1: Dane eksploatacyjne (tabela jak na papierze) --- */}
      <section className="border rounded-md overflow-hidden">
        <div className="p-3 border-b font-medium bg-muted/40">1. Dane eksploatacyjne</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b">
            <tr>
              <th className="text-left p-2 font-medium w-1/2">Parametr</th>
              <th className="text-left p-2 font-medium w-32">Wartość</th>
              <th className="text-left p-2 font-medium w-20">Jedn.</th>
              <th className="text-left p-2 font-medium">Uwagi / błąd</th>
            </tr>
          </thead>
          <tbody>
            {NUM_FIELDS.map((f) => (
              <tr key={f.key} className="border-b">
                <td className="p-2">{f.label}</td>
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={nums[f.key] ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => setNums((m) => ({ ...m, [f.key]: e.target.value }))}
                    className={fieldClass(f.key)}
                  />
                </td>
                <td className="p-2 text-muted-foreground">{f.unit}</td>
                <td className="p-2 text-xs text-destructive">{errors[f.key]}</td>
              </tr>
            ))}
            <tr className="border-b">
              <td className="p-2">Opady atmosferyczne</td>
              <td className="p-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="opady"
                    checked={opady}
                    disabled={!canEdit}
                    onCheckedChange={(v) => setOpady(!!v)}
                  />
                  <Label htmlFor="opady" className="text-sm">{opady ? "TAK" : "NIE"}</Label>
                </div>
              </td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* --- Sekcja 2: Ocena obiektów --- */}
      <section className="border rounded-md overflow-hidden">
        <div className="p-3 border-b font-medium bg-muted/40">
          2. Ocena obiektów i wykonanie harmonogramu ({objectsList.length})
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/30 border-b">
            <tr>
              <th className="text-left p-2 font-medium w-8">Lp.</th>
              <th className="text-left p-2 font-medium w-1/4">Obiekt</th>
              <th className="text-left p-2 font-medium w-1/4">Ocena pracy</th>
              <th className="text-left p-2 font-medium w-1/4">Harmonogram</th>
              <th className="text-left p-2 font-medium">Inne czynności</th>
            </tr>
          </thead>
          <tbody>
            {objectsList.map((obj, idx) => {
              const i = items[obj.id] ?? emptyItem();
              const setField = <K extends keyof ItemState>(k: K, v: ItemState[K]) =>
                setItems((m) => ({ ...m, [obj.id]: { ...i, [k]: v } }));
              const eKey = (k: string) => `item:${obj.id}:${k}`;
              return (
                <tr key={obj.id} className="border-b align-top">
                  <td className="p-2 text-muted-foreground">{idx + 1}</td>
                  <td className="p-2 font-medium">{obj.name}</td>
                  <td className="p-2 space-y-1">
                    <Select
                      value={i.ocena_status}
                      disabled={!canEdit}
                      onValueChange={(v) => setField("ocena_status", v as "ok" | "problem")}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ok">✓ OK</SelectItem>
                        <SelectItem value="problem">⚠ Problem</SelectItem>
                      </SelectContent>
                    </Select>
                    {i.ocena_status === "problem" && (
                      <>
                        <Textarea
                          placeholder="Opis problemu (min. 10 znaków)"
                          value={i.ocena_opis}
                          disabled={!canEdit}
                          onChange={(e) => setField("ocena_opis", e.target.value)}
                          rows={2}
                          className={errors[eKey("ocena_opis")] ? "border-destructive" : ""}
                        />
                        {errors[eKey("ocena_opis")] && (
                          <p className="text-xs text-destructive">{errors[eKey("ocena_opis")]}</p>
                        )}
                      </>
                    )}
                  </td>
                  <td className="p-2 space-y-1">
                    <Select
                      value={i.harmonogram_status}
                      disabled={!canEdit}
                      onValueChange={(v) =>
                        setField("harmonogram_status", v as "ok" | "nie_wykonano")
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ok">✓ Wykonane</SelectItem>
                        <SelectItem value="nie_wykonano">✗ Nie wykonano</SelectItem>
                      </SelectContent>
                    </Select>
                    {i.harmonogram_status === "nie_wykonano" && (
                      <>
                        <Textarea
                          placeholder="Opis (min. 10 znaków)"
                          value={i.harmonogram_opis}
                          disabled={!canEdit}
                          onChange={(e) => setField("harmonogram_opis", e.target.value)}
                          rows={2}
                          className={errors[eKey("harmonogram_opis")] ? "border-destructive" : ""}
                        />
                        {errors[eKey("harmonogram_opis")] && (
                          <p className="text-xs text-destructive">{errors[eKey("harmonogram_opis")]}</p>
                        )}
                        <Input
                          type="date"
                          value={i.proponowany_termin}
                          disabled={!canEdit}
                          onChange={(e) => setField("proponowany_termin", e.target.value)}
                          className={errors[eKey("proponowany_termin")] ? "border-destructive" : ""}
                        />
                        {errors[eKey("proponowany_termin")] && (
                          <p className="text-xs text-destructive">{errors[eKey("proponowany_termin")]}</p>
                        )}
                      </>
                    )}
                  </td>
                  <td className="p-2">
                    <Textarea
                      value={i.inne_czynnosci}
                      disabled={!canEdit}
                      onChange={(e) => setField("inne_czynnosci", e.target.value)}
                      rows={2}
                      placeholder="—"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* --- Sekcja 3: Uwagi ogólne --- */}
      <section className="border rounded-md">
        <div className="p-3 border-b font-medium bg-muted/40">3. Uwagi ogólne</div>
        <div className="p-3">
          <Textarea
            value={uwagi}
            disabled={!canEdit}
            onChange={(e) => setUwagi(e.target.value)}
            rows={3}
            placeholder="Dodatkowe informacje, awarie, obserwacje…"
          />
        </div>
      </section>

      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Podpis: <strong>{signature || profile?.username}</strong>
        </div>
        {canEdit && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Zapisywanie…" : locked ? "Zapisz zmiany (z historią)" : "Zapisz raport"}
          </Button>
        )}
      </div>
    </div>
  );
}
