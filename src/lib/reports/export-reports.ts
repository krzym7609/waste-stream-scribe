import * as XLSX from "xlsx";
import type { TDocumentDefinitions, Content, TableCell } from "pdfmake/interfaces";
import { downloadPdf } from "@/lib/pdf/pdfmake-instance";

const GRAY = "#d9d9d9";

function saveWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

const num = (v: unknown) => (v == null || v === "" ? "" : Number(v));

/* -------- DAILY -------- */

export type DailyExportData = {
  date: string;
  reports: any[];
  handovers: any[];
  execs: any[];
  profMap: Map<string, string>;
};

export function exportDailyExcel(d: DailyExportData) {
  const wb = XLSX.utils.book_new();

  const reportsRows = d.reports.map((r) => ({
    Operator: d.profMap.get(r.submitted_by) ?? "—",
    Godzina: new Date(r.submitted_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
    "Energia start [kWh]": num(r.energia_start),
    "Energia koniec [kWh]": num(r.energia_end),
    "Zużycie [kWh]":
      r.energia_start != null && r.energia_end != null
        ? Math.max(0, Number(r.energia_end) - Number(r.energia_start))
        : "",
    "Flok. proszk. [kg]": num(r.flokulant_proszkowy_kg),
    "Flok. emul. [l]": num(r.flokulant_emulsyjny_l),
    "Wapno [kg]": num(r.wapno_kg),
    "FeCl₃ [l]": num(r.chlorek_zelaza_l),
    "S.M. zagęszcz. [%]": num(r.sm_osadu_zageszcz),
    "S.M. odwod. [%]": num(r.sm_osadu_odwwapn),
    Opady: r.opady ? "T" : "N",
    Uwagi: r.uwagi ?? "",
  }));
  const wsReports = XLSX.utils.json_to_sheet(reportsRows);
  XLSX.utils.book_append_sheet(wb, wsReports, "Raporty zmianowe");

  const execsRows = d.execs.map((e) => ({
    Zmiana: e.scheduled_shift ?? "",
    "Nr zadania": e.task?.task_number ?? "",
    Nazwa: e.task?.name ?? "",
    Status: e.status,
    Notatka: e.note ?? "",
  }));
  const wsExecs = XLSX.utils.json_to_sheet(execsRows);
  XLSX.utils.book_append_sheet(wb, wsExecs, "Zadania");

  const handRows = d.handovers.map((h) => ({
    Przekazujący: d.profMap.get(h.from_user_id) ?? "—",
    Przejmujący: h.to_user_id ? d.profMap.get(h.to_user_id) ?? "—" : "(brak)",
    Godzina: new Date(h.submitted_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
    Przyjęte: h.accepted_at ? "Tak" : "Nie",
    Uwagi: h.uwagi_ogolne ?? "",
  }));
  const wsHand = XLSX.utils.json_to_sheet(handRows);
  XLSX.utils.book_append_sheet(wb, wsHand, "Przekazania");

  saveWorkbook(wb, `Raport-Dzienny-${d.date}.xlsx`);
}

export async function exportDailyPdf(d: DailyExportData) {
  const doneCnt = d.execs.filter((e) => e.status === "done").length;
  const pendingCnt = d.execs.filter((e) => e.status === "pending").length;
  const deferredCnt = d.execs.filter((e) => e.status === "deferred").length;

  const totalEnergia = d.reports.reduce(
    (s, r) => s + Math.max(0, (Number(r.energia_end) || 0) - (Number(r.energia_start) || 0)),
    0,
  );
  const sum = (k: string) => d.reports.reduce((s, r) => s + (Number(r[k]) || 0), 0);

  const summaryTable: Content = {
    table: {
      widths: ["*", 90],
      body: [
        [{ text: "Wskaźnik", fillColor: GRAY, bold: true }, { text: "Wartość", fillColor: GRAY, bold: true, alignment: "right" }],
        ["Raporty zmianowe", { text: String(d.reports.length), alignment: "right" }],
        ["Zużycie energii [kWh]", { text: totalEnergia.toFixed(0), alignment: "right" }],
        ["Flokulant proszk. [kg]", { text: sum("flokulant_proszkowy_kg").toFixed(1), alignment: "right" }],
        ["Flokulant emul. [l]", { text: sum("flokulant_emulsyjny_l").toFixed(1), alignment: "right" }],
        ["Wapno [kg]", { text: sum("wapno_kg").toFixed(1), alignment: "right" }],
        ["Chlorek żelaza [l]", { text: sum("chlorek_zelaza_l").toFixed(1), alignment: "right" }],
        ["Zadania — wykonane / niewykonane / przeniesione", { text: `${doneCnt} / ${pendingCnt} / ${deferredCnt}`, alignment: "right" }],
        ["Przekazania zmiany", { text: String(d.handovers.length), alignment: "right" }],
      ],
    },
    margin: [0, 0, 0, 10],
  };

  const chartData = [
    { label: "Wykonane", value: doneCnt, color: "#10b981" },
    { label: "Niewykon.", value: pendingCnt, color: "#ef4444" },
    { label: "Przenies.", value: deferredCnt, color: "#f59e0b" },
  ];
  const barChart = buildBarChart(chartData);

  const reportsTable: Content =
    d.reports.length === 0
      ? { text: "Brak raportów.", italics: true, color: "#666" }
      : {
          table: {
            headerRows: 1,
            widths: [80, 40, "*", 40, 40, 40, 40],
            body: [
              [
                { text: "Operator", fillColor: GRAY, bold: true },
                { text: "Godz.", fillColor: GRAY, bold: true },
                { text: "Uwagi", fillColor: GRAY, bold: true },
                { text: "En. [kWh]", fillColor: GRAY, bold: true, alignment: "right" },
                { text: "Flok.p.", fillColor: GRAY, bold: true, alignment: "right" },
                { text: "Flok.e.", fillColor: GRAY, bold: true, alignment: "right" },
                { text: "Wapno", fillColor: GRAY, bold: true, alignment: "right" },
              ],
              ...d.reports.map<TableCell[]>((r) => [
                { text: d.profMap.get(r.submitted_by) ?? "—" },
                {
                  text: new Date(r.submitted_at).toLocaleTimeString("pl-PL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                },
                { text: r.uwagi ?? "" },
                {
                  text:
                    r.energia_start != null && r.energia_end != null
                      ? String(Math.max(0, Number(r.energia_end) - Number(r.energia_start)))
                      : "",
                  alignment: "right",
                },
                { text: r.flokulant_proszkowy_kg ?? "", alignment: "right" },
                { text: r.flokulant_emulsyjny_l ?? "", alignment: "right" },
                { text: r.wapno_kg ?? "", alignment: "right" },
              ]),
            ],
          },
        };

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [36, 40, 36, 40],
    info: { title: `Raport dzienny ${d.date}` },
    content: [
      { text: `Raport dzienny — ${d.date}`, bold: true, fontSize: 14, alignment: "center", margin: [0, 0, 0, 12] },
      { text: "Podsumowanie", bold: true, margin: [0, 0, 0, 4] },
      summaryTable,
      { text: "Wykonanie zadań", bold: true, margin: [0, 4, 0, 4] },
      barChart,
      { text: "Raporty zmianowe", bold: true, margin: [0, 12, 0, 4] },
      reportsTable,
    ],
    defaultStyle: { fontSize: 9 },
  };
  await downloadPdf(doc, `Raport-Dzienny-${d.date}.pdf`);
}

/* -------- MONTHLY -------- */

export type MonthlyExportData = {
  year: number;
  month: number; // 1..12
  agg: {
    raportow: number;
    energia: number;
    flokProszk: number;
    flokEmul: number;
    wapno: number;
    fecl: number;
    smZag: number;
    smOdw: number;
    done: number;
    pending: number;
    deferred: number;
    handovers: number;
    handoversAccepted: number;
  };
  dailyChart: Array<{
    day: string;
    energia: number;
    flokProszk: number;
    flokEmul: number;
    wapno: number;
    fecl: number;
    done: number;
    pending: number;
  }>;
};

export function exportMonthlyExcel(d: MonthlyExportData) {
  const wb = XLSX.utils.book_new();
  const summary = [
    { Wskaznik: "Raportów", Wartosc: d.agg.raportow },
    { Wskaznik: "Zużycie energii [kWh]", Wartosc: Number(d.agg.energia.toFixed(0)) },
    { Wskaznik: "Flokulant proszk. [kg]", Wartosc: Number(d.agg.flokProszk.toFixed(1)) },
    { Wskaznik: "Flokulant emul. [l]", Wartosc: Number(d.agg.flokEmul.toFixed(1)) },
    { Wskaznik: "Wapno [kg]", Wartosc: Number(d.agg.wapno.toFixed(1)) },
    { Wskaznik: "Chlorek żelaza [l]", Wartosc: Number(d.agg.fecl.toFixed(1)) },
    { Wskaznik: "Średnia S.M. zagęszcz. [%]", Wartosc: Number(d.agg.smZag.toFixed(2)) },
    { Wskaznik: "Średnia S.M. odwod. [%]", Wartosc: Number(d.agg.smOdw.toFixed(2)) },
    { Wskaznik: "Zadania wykonane", Wartosc: d.agg.done },
    { Wskaznik: "Zadania niewykonane", Wartosc: d.agg.pending },
    { Wskaznik: "Przeniesione", Wartosc: d.agg.deferred },
    { Wskaznik: "Przekazania (przyjęte / wszystkie)", Wartosc: `${d.agg.handoversAccepted} / ${d.agg.handovers}` },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Podsumowanie");

  const daily = d.dailyChart.map((r) => ({
    Dzień: r.day,
    "Energia [kWh]": Number(r.energia.toFixed(0)),
    "Flok. proszk. [kg]": Number(r.flokProszk.toFixed(2)),
    "Flok. emul. [l]": Number(r.flokEmul.toFixed(2)),
    "Wapno [kg]": Number(r.wapno.toFixed(2)),
    "FeCl₃ [l]": Number(r.fecl.toFixed(2)),
    "Zadania wykonane": r.done,
    "Zadania niewykonane": r.pending,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(daily), "Dziennie");
  saveWorkbook(wb, `Raport-Miesieczny-${d.year}-${String(d.month).padStart(2, "0")}.xlsx`);
}

export async function exportMonthlyPdf(d: MonthlyExportData) {
  const summaryTable: Content = {
    table: {
      widths: ["*", 90],
      body: [
        [{ text: "Wskaźnik", fillColor: GRAY, bold: true }, { text: "Wartość", fillColor: GRAY, bold: true, alignment: "right" }],
        ["Raporty zmianowe", { text: String(d.agg.raportow), alignment: "right" }],
        ["Zużycie energii [kWh]", { text: d.agg.energia.toFixed(0), alignment: "right" }],
        ["Flokulant proszk. [kg]", { text: d.agg.flokProszk.toFixed(1), alignment: "right" }],
        ["Flokulant emul. [l]", { text: d.agg.flokEmul.toFixed(1), alignment: "right" }],
        ["Wapno [kg]", { text: d.agg.wapno.toFixed(1), alignment: "right" }],
        ["Chlorek żelaza [l]", { text: d.agg.fecl.toFixed(1), alignment: "right" }],
        ["Śr. S.M. zagęszcz. [%]", { text: d.agg.smZag.toFixed(2), alignment: "right" }],
        ["Śr. S.M. odwod. [%]", { text: d.agg.smOdw.toFixed(2), alignment: "right" }],
        ["Zadania — wyk./niewyk./prze.", { text: `${d.agg.done} / ${d.agg.pending} / ${d.agg.deferred}`, alignment: "right" }],
        ["Przekazania (przyjęte/wszystkie)", { text: `${d.agg.handoversAccepted} / ${d.agg.handovers}`, alignment: "right" }],
      ],
    },
    margin: [0, 0, 0, 10],
  };

  const energyBars = buildBarChart(
    d.dailyChart.map((r) => ({ label: r.day, value: r.energia, color: "#3b82f6" })),
    { width: 520, height: 140, title: "Zużycie energii [kWh] — dzienne" },
  );

  const tasksBars = buildStackedTasksChart(d.dailyChart);

  const dailyTable: Content = {
    table: {
      headerRows: 1,
      widths: [24, 50, 50, 50, 40, 40, 40, 40],
      body: [
        [
          { text: "Dz.", fillColor: GRAY, bold: true },
          { text: "Energia", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Flok.p.", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Flok.e.", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Wapno", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "FeCl₃", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Wyk.", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Niewyk.", fillColor: GRAY, bold: true, alignment: "right" },
        ],
        ...d.dailyChart.map<TableCell[]>((r) => [
          { text: r.day },
          { text: r.energia.toFixed(0), alignment: "right" },
          { text: r.flokProszk.toFixed(1), alignment: "right" },
          { text: r.flokEmul.toFixed(1), alignment: "right" },
          { text: r.wapno.toFixed(1), alignment: "right" },
          { text: r.fecl.toFixed(1), alignment: "right" },
          { text: String(r.done), alignment: "right" },
          { text: String(r.pending), alignment: "right" },
        ]),
      ],
    },
  };

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [36, 40, 36, 40],
    info: { title: `Raport miesięczny ${d.year}-${d.month}` },
    content: [
      {
        text: `Raport miesięczny — ${String(d.month).padStart(2, "0")}/${d.year}`,
        bold: true,
        fontSize: 14,
        alignment: "center",
        margin: [0, 0, 0, 12],
      },
      { text: "Podsumowanie", bold: true, margin: [0, 0, 0, 4] },
      summaryTable,
      energyBars,
      { text: "", margin: [0, 6, 0, 0] },
      tasksBars,
      { text: "Rozkład dzienny", bold: true, margin: [0, 12, 0, 4], pageBreak: "before" },
      dailyTable,
    ],
    defaultStyle: { fontSize: 9 },
  };
  await downloadPdf(doc, `Raport-Miesieczny-${d.year}-${String(d.month).padStart(2, "0")}.pdf`);
}

/* -------- YEARLY -------- */

export type YearlyExportData = {
  year: number;
  months: Array<{
    month: string;
    energia: number;
    flokProszk: number;
    flokEmul: number;
    wapno: number;
    fecl: number;
    done: number;
    pending: number;
  }>;
};

export function exportYearlyExcel(d: YearlyExportData) {
  const wb = XLSX.utils.book_new();
  const rows = d.months.map((r) => ({
    Miesiąc: r.month,
    "Energia [kWh]": Number(r.energia.toFixed(0)),
    "Flok. proszk. [kg]": Number(r.flokProszk.toFixed(2)),
    "Flok. emul. [l]": Number(r.flokEmul.toFixed(2)),
    "Wapno [kg]": Number(r.wapno.toFixed(2)),
    "FeCl₃ [l]": Number(r.fecl.toFixed(2)),
    "Zadania wykonane": r.done,
    "Zadania niewykonane": r.pending,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), `Rok ${d.year}`);
  saveWorkbook(wb, `Raport-Roczny-${d.year}.xlsx`);
}

export async function exportYearlyPdf(d: YearlyExportData) {
  const totals = d.months.reduce(
    (s, r) => ({
      energia: s.energia + r.energia,
      flokProszk: s.flokProszk + r.flokProszk,
      flokEmul: s.flokEmul + r.flokEmul,
      wapno: s.wapno + r.wapno,
      fecl: s.fecl + r.fecl,
      done: s.done + r.done,
      pending: s.pending + r.pending,
    }),
    { energia: 0, flokProszk: 0, flokEmul: 0, wapno: 0, fecl: 0, done: 0, pending: 0 },
  );

  const summary: Content = {
    table: {
      widths: ["*", 90],
      body: [
        [{ text: "Wskaźnik roczny", fillColor: GRAY, bold: true }, { text: "Suma", fillColor: GRAY, bold: true, alignment: "right" }],
        ["Zużycie energii [kWh]", { text: totals.energia.toFixed(0), alignment: "right" }],
        ["Flokulant proszk. [kg]", { text: totals.flokProszk.toFixed(1), alignment: "right" }],
        ["Flokulant emul. [l]", { text: totals.flokEmul.toFixed(1), alignment: "right" }],
        ["Wapno [kg]", { text: totals.wapno.toFixed(1), alignment: "right" }],
        ["Chlorek żelaza [l]", { text: totals.fecl.toFixed(1), alignment: "right" }],
        ["Zadania wykonane / niewykonane", { text: `${totals.done} / ${totals.pending}`, alignment: "right" }],
      ],
    },
    margin: [0, 0, 0, 10],
  };

  const energyBars = buildBarChart(
    d.months.map((r) => ({ label: r.month, value: r.energia, color: "#3b82f6" })),
    { width: 520, height: 160, title: "Zużycie energii [kWh] — miesięcznie" },
  );
  const tasksBars = buildStackedTasksChart(
    d.months.map((r) => ({ day: r.month, done: r.done, pending: r.pending, energia: 0, flokProszk: 0, flokEmul: 0, wapno: 0, fecl: 0 })),
  );

  const monthlyTable: Content = {
    table: {
      headerRows: 1,
      widths: [40, 60, 55, 55, 50, 50, 40, 45],
      body: [
        [
          { text: "M-c", fillColor: GRAY, bold: true },
          { text: "Energia", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Flok.p.", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Flok.e.", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Wapno", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "FeCl₃", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Wyk.", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Niewyk.", fillColor: GRAY, bold: true, alignment: "right" },
        ],
        ...d.months.map<TableCell[]>((r) => [
          { text: r.month },
          { text: r.energia.toFixed(0), alignment: "right" },
          { text: r.flokProszk.toFixed(1), alignment: "right" },
          { text: r.flokEmul.toFixed(1), alignment: "right" },
          { text: r.wapno.toFixed(1), alignment: "right" },
          { text: r.fecl.toFixed(1), alignment: "right" },
          { text: String(r.done), alignment: "right" },
          { text: String(r.pending), alignment: "right" },
        ]),
      ],
    },
  };

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [36, 40, 36, 40],
    info: { title: `Raport roczny ${d.year}` },
    content: [
      { text: `Raport roczny — ${d.year}`, bold: true, fontSize: 14, alignment: "center", margin: [0, 0, 0, 12] },
      { text: "Podsumowanie", bold: true, margin: [0, 0, 0, 4] },
      summary,
      energyBars,
      { text: "", margin: [0, 6, 0, 0] },
      tasksBars,
      { text: "Rozkład miesięczny", bold: true, margin: [0, 12, 0, 4] },
      monthlyTable,
    ],
    defaultStyle: { fontSize: 9 },
  };
  await downloadPdf(doc, `Raport-Roczny-${d.year}.pdf`);
}

/* -------- CHART HELPERS (pdfmake SVG) -------- */

function buildBarChart(
  data: Array<{ label: string; value: number; color: string }>,
  opts?: { width?: number; height?: number; title?: string },
): Content {
  const width = opts?.width ?? 520;
  const height = opts?.height ?? 140;
  const padL = 34;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = innerW / Math.max(1, data.length);
  const barW = Math.max(2, step * 0.72);

  const yTicks = 4;
  const ticks: string[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = (max * i) / yTicks;
    const y = padT + innerH - (innerH * i) / yTicks;
    ticks.push(
      `<line x1="${padL}" y1="${y}" x2="${padL + innerW}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`,
      `<text x="${padL - 4}" y="${y + 3}" font-size="7" text-anchor="end" fill="#666">${v >= 1000 ? Math.round(v) : v.toFixed(v < 10 ? 1 : 0)}</text>`,
    );
  }
  const bars = data
    .map((d, i) => {
      const h = (d.value / max) * innerH;
      const x = padL + step * i + (step - barW) / 2;
      const y = padT + innerH - h;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${d.color}"/>
        <text x="${x + barW / 2}" y="${padT + innerH + 10}" font-size="6" text-anchor="middle" fill="#333">${escapeXml(d.label)}</text>`;
    })
    .join("");

  const title = opts?.title
    ? `<text x="${width / 2}" y="8" font-size="9" text-anchor="middle" font-weight="bold" fill="#111">${escapeXml(opts.title)}</text>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${title}
    ${ticks.join("")}
    <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="#333" stroke-width="0.6"/>
    ${bars}
  </svg>`;
  return { svg, width, alignment: "center" };
}

function buildStackedTasksChart(
  data: Array<{ day: string; done: number; pending: number }>,
): Content {
  const width = 520;
  const height = 140;
  const padL = 34;
  const padR = 8;
  const padT = 20;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.done + d.pending));
  const step = innerW / Math.max(1, data.length);
  const barW = Math.max(2, step * 0.72);

  const yTicks = 4;
  const ticks: string[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = (max * i) / yTicks;
    const y = padT + innerH - (innerH * i) / yTicks;
    ticks.push(
      `<line x1="${padL}" y1="${y}" x2="${padL + innerW}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`,
      `<text x="${padL - 4}" y="${y + 3}" font-size="7" text-anchor="end" fill="#666">${Math.round(v)}</text>`,
    );
  }
  const bars = data
    .map((d, i) => {
      const hDone = (d.done / max) * innerH;
      const hPend = (d.pending / max) * innerH;
      const x = padL + step * i + (step - barW) / 2;
      const yDone = padT + innerH - hDone;
      const yPend = yDone - hPend;
      return `<rect x="${x}" y="${yDone}" width="${barW}" height="${hDone}" fill="#10b981"/>
        <rect x="${x}" y="${yPend}" width="${barW}" height="${hPend}" fill="#ef4444"/>
        <text x="${x + barW / 2}" y="${padT + innerH + 10}" font-size="6" text-anchor="middle" fill="#333">${escapeXml(d.day)}</text>`;
    })
    .join("");

  const legend = `
    <rect x="${padL}" y="4" width="9" height="9" fill="#10b981"/>
    <text x="${padL + 13}" y="12" font-size="8" fill="#111">Wykonane</text>
    <rect x="${padL + 80}" y="4" width="9" height="9" fill="#ef4444"/>
    <text x="${padL + 93}" y="12" font-size="8" fill="#111">Niewykonane</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <text x="${width / 2}" y="12" font-size="9" text-anchor="middle" font-weight="bold" fill="#111">Wykonanie zadań</text>
    ${legend}
    ${ticks.join("")}
    <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="#333" stroke-width="0.6"/>
    ${bars}
  </svg>`;
  return { svg, width, alignment: "center" };
}

function escapeXml(s: string) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
}
