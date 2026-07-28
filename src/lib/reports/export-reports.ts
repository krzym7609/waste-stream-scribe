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
        ["Przekazania zmiany", { text: String(d.handovers.length), alignment: "right" }],
      ],
    },
    margin: [0, 0, 0, 10],
  };


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
        
        ["Przekazania (przyjęte/wszystkie)", { text: `${d.agg.handoversAccepted} / ${d.agg.handovers}`, alignment: "right" }],
      ],
    },
    margin: [0, 0, 0, 10],
  };

  const energyChart = buildAreaChart(
    d.dailyChart.map((r) => ({ label: r.day, value: r.energia })),
    { width: 520, height: 150, title: "Zużycie energii [kWh] — dzienne", color: "#3b82f6", unit: "kWh" },
  );

  const chemistryGrid = buildChemistryGrid(
    d.dailyChart.map((r) => ({ label: r.day, flokProszk: r.flokProszk, flokEmul: r.flokEmul, wapno: r.wapno, fecl: r.fecl })),
  );



  

  const dailyTable: Content = {
    table: {
      headerRows: 1,
      widths: [24, 60, 60, 60, 50, 50],
      body: [
        [
          { text: "Dz.", fillColor: GRAY, bold: true },
          { text: "Energia", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Flok.p.", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Flok.e.", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Wapno", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "FeCl₃", fillColor: GRAY, bold: true, alignment: "right" },
        ],
        ...d.dailyChart.map<TableCell[]>((r) => [
          { text: r.day },
          { text: r.energia.toFixed(0), alignment: "right" },
          { text: r.flokProszk.toFixed(1), alignment: "right" },
          { text: r.flokEmul.toFixed(1), alignment: "right" },
          { text: r.wapno.toFixed(1), alignment: "right" },
          { text: r.fecl.toFixed(1), alignment: "right" },
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
      { text: "Energia", bold: true, margin: [0, 8, 0, 4] },
      energyChart,
      { text: "Chemia", bold: true, margin: [0, 8, 0, 4] },
      chemistryGrid,
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
    }),
    { energia: 0, flokProszk: 0, flokEmul: 0, wapno: 0, fecl: 0 },
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
        
      ],
    },
    margin: [0, 0, 0, 10],
  };

  const energyChart = buildAreaChart(
    d.months.map((r) => ({ label: r.month, value: r.energia })),
    { width: 520, height: 160, title: "Zużycie energii [kWh] — miesięcznie", color: "#3b82f6", unit: "kWh", mode: "line" },
  );
  const chemistryGrid = buildChemistryGrid(
    d.months.map((r) => ({ label: r.month, flokProszk: r.flokProszk, flokEmul: r.flokEmul, wapno: r.wapno, fecl: r.fecl })),
    { mode: "line" },
  );


  const monthlyTable: Content = {
    table: {
      headerRows: 1,
      widths: [40, 70, 65, 65, 60, 60],
      body: [
        [
          { text: "M-c", fillColor: GRAY, bold: true },
          { text: "Energia", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Flok.p.", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Flok.e.", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "Wapno", fillColor: GRAY, bold: true, alignment: "right" },
          { text: "FeCl₃", fillColor: GRAY, bold: true, alignment: "right" },
        ],
        ...d.months.map<TableCell[]>((r) => [
          { text: r.month },
          { text: r.energia.toFixed(0), alignment: "right" },
          { text: r.flokProszk.toFixed(1), alignment: "right" },
          { text: r.flokEmul.toFixed(1), alignment: "right" },
          { text: r.wapno.toFixed(1), alignment: "right" },
          { text: r.fecl.toFixed(1), alignment: "right" },
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
      { text: "Energia", bold: true, margin: [0, 8, 0, 4] },
      energyChart,
      { text: "Chemia", bold: true, margin: [0, 8, 0, 4] },
      chemistryGrid,
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
      const lbl = fmtTick(d.value);
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${d.color}"/>
        <text x="${x + barW / 2}" y="${Math.max(padT + 7, y - 2)}" font-size="6" text-anchor="middle" fill="#111">${lbl}</text>
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

function fmtTick(v: number) {
  if (Math.abs(v) >= 1000) return String(Math.round(v));
  if (Math.abs(v) >= 10) return v.toFixed(0);
  return v.toFixed(1);
}

function buildAreaChart(
  data: Array<{ label: string; value: number }>,
  opts: { width?: number; height?: number; title?: string; color: string; unit?: string; mode?: "area" | "line" },
): Content {
  const width = opts.width ?? 520;
  const height = opts.height ?? 150;
  const padL = 38, padR = 10, padT = 16, padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const points = data.map((d, i) => {
    const x = data.length > 1 ? padL + stepX * i : padL + innerW / 2;
    const y = padT + innerH - (d.value / max) * innerH;
    return { x, y, d };
  });

  const yTicks = 4;
  const grid: string[] = [];
  for (let i = 0; i <= yTicks; i++) {
    const v = (max * i) / yTicks;
    const y = padT + innerH - (innerH * i) / yTicks;
    grid.push(
      `<line x1="${padL}" y1="${y}" x2="${padL + innerW}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`,
      `<text x="${padL - 4}" y="${y + 3}" font-size="7" text-anchor="end" fill="#666">${fmtTick(v)}</text>`,
    );
  }

  // X labels — thin them if too many
  const maxLabels = Math.floor(innerW / 22);
  const stepLabel = Math.max(1, Math.ceil(n / maxLabels));
  const xLabels = points
    .map((p, i) =>
      i % stepLabel === 0
        ? `<text x="${p.x}" y="${padT + innerH + 10}" font-size="6" text-anchor="middle" fill="#333">${escapeXml(p.d.label)}</text>`
        : "",
    )
    .join("");

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    opts.mode === "line"
      ? ""
      : `${linePath} L${points[points.length - 1].x.toFixed(1)},${padT + innerH} L${points[0].x.toFixed(1)},${padT + innerH} Z`;

  const gradId = `g_${Math.random().toString(36).slice(2, 8)}`;
  const defs =
    opts.mode === "line"
      ? ""
      : `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${opts.color}" stop-opacity="0.55"/><stop offset="100%" stop-color="${opts.color}" stop-opacity="0.05"/></linearGradient></defs>`;

  const area = areaPath ? `<path d="${areaPath}" fill="url(#${gradId})"/>` : "";
  const line = `<path d="${linePath}" fill="none" stroke="${opts.color}" stroke-width="1.6"/>`;
  const dots = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="1.4" fill="${opts.color}"/>`).join("");
  const valueLabels = points
    .map((p, i) => (i % stepLabel === 0 ? `<text x="${p.x.toFixed(1)}" y="${(p.y - 3).toFixed(1)}" font-size="6" text-anchor="middle" fill="#111">${fmtTick(p.d.value)}</text>` : ""))
    .join("");


  const title = opts.title
    ? `<text x="${width / 2}" y="10" font-size="9" text-anchor="middle" font-weight="bold" fill="#111">${escapeXml(opts.title)}</text>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${defs}${title}${grid.join("")}
    <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="#333" stroke-width="0.6"/>
    ${area}${line}${dots}${xLabels}
  </svg>`;
  return { svg, width, alignment: "center" };
}

const CHEM_DEFS = [
  { key: "flokProszk" as const, name: "Flokulant proszkowy", unit: "kg", color: "#10b981" },
  { key: "flokEmul" as const,   name: "Flokulant emulsyjny", unit: "l",  color: "#f59e0b" },
  { key: "wapno" as const,      name: "Wapno",               unit: "kg", color: "#8b5cf6" },
  { key: "fecl" as const,       name: "Chlorek żelaza",      unit: "l",  color: "#ef4444" },
];

type ChemRow = { label: string; flokProszk: number; flokEmul: number; wapno: number; fecl: number };

function buildChemistryGrid(rows: ChemRow[], opts?: { mode?: "bar" | "line" }): Content {
  const mode = opts?.mode ?? "bar";
  const cellW = 254;
  const cellH = 130;
  const cells = CHEM_DEFS.map((c) => {
    const data = rows.map((r) => ({ label: r.label, value: Number(r[c.key]) || 0 }));
    const chart =
      mode === "line"
        ? buildAreaChart(data, { width: cellW, height: cellH, color: c.color, unit: c.unit, mode: "line", title: `${c.name} [${c.unit}]` })
        : buildBarChart(
            data.map((d) => ({ label: d.label, value: d.value, color: c.color })),
            { width: cellW, height: cellH, title: `${c.name} [${c.unit}]` },
          );
    return chart;
  });
  return {
    table: {
      widths: [cellW, cellW],
      body: [
        [cells[0], cells[1]],
        [cells[2], cells[3]],
      ],
    },
    layout: {
      hLineColor: () => "#e5e7eb",
      vLineColor: () => "#e5e7eb",
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  };
}



function escapeXml(s: string) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
}
