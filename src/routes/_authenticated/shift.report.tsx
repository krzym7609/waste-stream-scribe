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
    // numeric (accept comma or dot as decimal separator)
    const parsed: Record<string, number> = {};
    for (const f of NUM_FIELDS) {
      const raw = (nums[f.key] ?? "").trim().replace(",", ".");
      if (raw === "") {
        errs[f.key] = `${f.label}: wymagane`;
      } else if (!/^-?\d+(\.\d+)?$/.test(raw)) {
        errs[f.key] = `${f.label}: nieprawidłowa liczba (użyj , lub .)`;
      } else {
        parsed[f.key] = Number(raw);
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
  const shiftShort = sessionShiftType === "rano" ? "I" : sessionShiftType === "popoludnie" ? "II" : sessionShiftType === "noc" ? "III" : "—";
  const err = (k: string) => errors[k];

  const setNum = (key: NumField, v: string) => {
    // accept digits, comma, dot, minus
    const cleaned = v.replace(/[^0-9.,-]/g, "");
    setNums((m) => ({ ...m, [key]: cleaned }));
    if (errors[key]) setErrors((e) => { const c = { ...e }; delete c[key]; return c; });
  };

  const numInput = (key: NumField) => {
    const hasErr = !!err(key);
    return (
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={nums[key] ?? ""}
          disabled={!canEdit}
          onChange={(e) => setNum(key, e.target.value)}
          aria-invalid={hasErr}
          title={err(key) ?? ""}
          className={`w-full bg-transparent outline-none text-center px-1 py-0.5 text-sm rounded-sm ${
            hasErr ? "bg-destructive/10 ring-2 ring-destructive text-destructive" : ""
          }`}
        />
      </div>
    );
  };

  // Pobór = energia_end - energia_start (allows manual override)
  const startNum = Number((nums.energia_start ?? "").replace(",", "."));
  const endNum = Number((nums.energia_end ?? "").replace(",", "."));
  const poborAuto =
    nums.energia_start && nums.energia_end && !Number.isNaN(startNum) && !Number.isNaN(endNum)
      ? +(endNum - startNum).toFixed(2)
      : "";
  const [poborManual, setPoborManual] = useState<string>("");
  const poborValue = poborManual !== "" ? poborManual : poborAuto === "" ? "" : String(poborAuto);
  const poborErr =
    poborManual !== "" && !/^-?\d+([.,]\d+)?$/.test(poborManual.trim())
      ? "Pobór: nieprawidłowa liczba"
      : poborAuto !== "" && (poborAuto as number) < 0
      ? "Pobór ujemny — sprawdź wartości"
      : "";
  const pobor = poborValue;

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-3">
      {/* Toolbar (poza papierowym formularzem) */}
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div className="text-sm text-muted-foreground">
          Raport zmianowy · Operator: <strong>{signature || profile?.username}</strong>
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
        <div className="border border-amber-500/50 bg-amber-500/10 rounded p-3 text-sm print:hidden">
          <div className="font-medium mb-1">Edycja zamkniętego raportu przez kierownika</div>
          <Label className="text-xs">Powód edycji (wymagane, min. 5 znaków)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
        </div>
      )}

      {/* === Papierowy formularz === */}
      <div className="bg-white text-black border border-black p-6 font-serif text-[13px] leading-tight">
        <h1 className="text-center font-bold underline text-[15px] mb-3">
          Raport zmianowy oczyszczalni ścieków.
        </h1>

        {/* Header: Data/zmiana | Operator */}
        <table className="w-full border-collapse border border-black mb-2">
          <tbody>
            <tr>
              <td rowSpan={2} className="border border-black p-2 align-middle w-[42%]">
                Data / zmiana : <strong>{today}</strong> / <strong>{shiftShort}</strong>
              </td>
              <td className="border border-black p-1 bg-[#d9d9d9] w-[22%]">Operator wiodący:</td>
              <td className="border border-black p-1">{signature || profile?.username}</td>
            </tr>
            <tr>
              <td className="border border-black p-1 bg-[#d9d9d9]">Operator(zy):</td>
              <td className="border border-black p-1">&nbsp;</td>
            </tr>
          </tbody>
        </table>

        {/* Energy */}
        <table className="w-full border-collapse border border-black mb-2 text-center">
          <thead>
            <tr className="bg-[#d9d9d9]">
              <th className="border border-black p-1 font-normal">
                Pobór energii elektrycznej<br />[kwh]
              </th>
              <th className="border border-black p-1 font-normal">Stan początkowy</th>
              <th className="border border-black p-1 font-normal">Stan końcowy</th>
              <th className="border border-black p-1 font-normal">Pobór</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-black bg-[#d9d9d9] p-1 italic text-left">
                Pobór energii elektrycznej [kWh]
              </td>
              <td className="border border-black p-1">{numInput("energia_start")}</td>
              <td className="border border-black p-1">{numInput("energia_end")}</td>
              <td className={`border border-black p-1 ${poborErr ? "bg-destructive/10" : ""}`}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={pobor === "" ? "" : String(pobor)}
                  disabled={!canEdit}
                  onChange={(e) => setPoborManual(e.target.value.replace(/[^0-9.,-]/g, ""))}
                  title={poborErr || "Auto: stan końcowy − stan początkowy (możesz nadpisać)"}
                  className={`w-full bg-transparent outline-none text-center px-1 py-0.5 text-sm ${
                    poborErr ? "text-destructive ring-2 ring-destructive rounded-sm" : ""
                  }`}
                />
              </td>
            </tr>
          </tbody>
        </table>
        {(err("energia_start") || err("energia_end") || poborErr) && (
          <div className="text-destructive text-xs mb-2">
            {err("energia_start") || err("energia_end") || poborErr}
          </div>
        )}

        {/* Chemicals + SM + opady */}
        <div className="flex gap-3 mb-3">
          <table className="border-collapse border border-black flex-1">
            <tbody>
              {[
                ["Zużycie flokulanta proszkowego [kg]", "flokulant_proszkowy_kg"],
                ["Zużycie flokulanta emulsyjnego [l]", "flokulant_emulsyjny_l"],
                ["Dostawa wapna do higienizacji [kg]:", "wapno_kg"],
                ["Zużycie chlorku żelazowego [l]:", "chlorek_zelaza_l"],
              ].map(([label, key]) => (
                <tr key={key}>
                  <td className="border border-black bg-[#d9d9d9] p-1 italic">{label}</td>
                  <td className="border border-black p-1 w-[110px]">{numInput(key as NumField)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="w-[300px] flex flex-col gap-3">
            <table className="border-collapse border border-black">
              <tbody>
                <tr>
                  <td className="border border-black bg-[#d9d9d9] p-1 italic">S.M. osadu zagęszcz:</td>
                  <td className="border border-black p-1 w-[90px]">{numInput("sm_osadu_zageszcz")}</td>
                </tr>
                <tr>
                  <td className="border border-black bg-[#d9d9d9] p-1 italic">S.M. osadu odw.wapn.:</td>
                  <td className="border border-black p-1 w-[90px]">{numInput("sm_osadu_odwwapn")}</td>
                </tr>
              </tbody>
            </table>
            <table className="border-collapse border border-black">
              <tbody>
                <tr>
                  <td className="border border-black bg-[#d9d9d9] p-1 italic">Występ. opadów (T/N):</td>
                  <td className="border border-black p-1 w-[90px] text-center">
                    <Select
                      value={opady ? "T" : "N"}
                      disabled={!canEdit}
                      onValueChange={(v) => setOpady(v === "T")}
                    >
                      <SelectTrigger className="h-7 text-xs font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="T">T — tak</SelectItem>
                        <SelectItem value="N">N — nie</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="italic font-bold mb-1">EKSPLOATACJA  URZĄDZEŃ  OCZYSZCZALNI.</div>

        {/* Objects table — 4 columns */}
        <table className="w-full border-collapse border border-black">
          <thead className="bg-[#d9d9d9]">
            <tr>
              <th className="border border-black p-1 w-[14%] font-normal">Nazwa<br />obiektu</th>
              <th className="border border-black p-1 w-[27%] font-normal">
                Ocena prawidłowości pracy w ciągu zmiany, ew. awarie i prawdopodobne przyczyny.
              </th>
              <th className="border border-black p-1 w-[32%] font-normal">
                Wykonane zgodnie z harmonogramem czynności obsługowe, ew. przyczyna nie-wykonania z propozycją nowego terminu.
              </th>
              <th className="border border-black p-1 font-normal">
                Inne bieżące czynności eksploatacyjne, remon-towe i porządkowe.
              </th>
            </tr>
          </thead>
          <tbody>
            {objectsList.map((obj) => {
              const i = items[obj.id] ?? emptyItem();
              const setField = <K extends keyof ItemState>(k: K, val: ItemState[K]) =>
                setItems((m) => ({ ...m, [obj.id]: { ...i, [k]: val } }));
              const eKey = (k: string) => `item:${obj.id}:${k}`;
              return (
                <tr key={obj.id} className="align-top">
                  <td className="border border-black bg-[#d9d9d9] p-1 italic">{obj.name}</td>
                  <td className="border border-black p-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Select
                        value={i.ocena_status}
                        disabled={!canEdit}
                        onValueChange={(val) => setField("ocena_status", val as "ok" | "problem")}
                      >
                        <SelectTrigger className="h-6 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ok">prawidłowo</SelectItem>
                          <SelectItem value="problem">awaria / problem</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {i.ocena_status === "problem" && (
                      <Textarea
                        value={i.ocena_opis}
                        disabled={!canEdit}
                        onChange={(e) => setField("ocena_opis", e.target.value)}
                        rows={3}
                        placeholder="Opis (min. 10 znaków)"
                        className={`text-xs ${errors[eKey("ocena_opis")] ? "border-destructive" : ""}`}
                      />
                    )}
                  </td>
                  <td className="border border-black p-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Select
                        value={i.harmonogram_status}
                        disabled={!canEdit}
                        onValueChange={(val) => setField("harmonogram_status", val as "ok" | "nie_wykonano")}
                      >
                        <SelectTrigger className="h-6 text-xs w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ok">wykonane</SelectItem>
                          <SelectItem value="nie_wykonano">nie wykonano</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {i.harmonogram_status === "nie_wykonano" && (
                      <div className="space-y-1">
                        <Textarea
                          value={i.harmonogram_opis}
                          disabled={!canEdit}
                          onChange={(e) => setField("harmonogram_opis", e.target.value)}
                          rows={2}
                          placeholder="Przyczyna (min. 10 znaków)"
                          className={`text-xs ${errors[eKey("harmonogram_opis")] ? "border-destructive" : ""}`}
                        />
                        <Input
                          type="date"
                          value={i.proponowany_termin}
                          disabled={!canEdit}
                          onChange={(e) => setField("proponowany_termin", e.target.value)}
                          className={`h-7 text-xs ${errors[eKey("proponowany_termin")] ? "border-destructive" : ""}`}
                        />
                      </div>
                    )}
                  </td>
                  <td className="border border-black p-1">
                    <Textarea
                      value={i.inne_czynnosci}
                      disabled={!canEdit}
                      onChange={(e) => setField("inne_czynnosci", e.target.value)}
                      rows={3}
                      className="text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="text-center font-bold mt-4">
          Podpis operatora wiodącego: {signature || profile?.username}
        </p>
      </div>

      {/* Toolbar zapisu */}
      <div className="flex justify-between items-center print:hidden">
        <div className="text-xs text-muted-foreground">
          {Object.keys(errors).length > 0 && `Błędy: ${Object.keys(errors).length}`}
          {today && <> · Data: <strong>{today}</strong></>}
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
