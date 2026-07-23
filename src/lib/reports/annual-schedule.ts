import ExcelJS from "exceljs";
import type { TDocumentDefinitions, TableCell } from "pdfmake/interfaces";
import { downloadPdf } from "@/lib/pdf/pdfmake-instance";
import type { ShiftType } from "@/lib/shifts";

export type AnnualTask = {
  id: string;
  task_number: number;
  name: string;
  requires_service_report: boolean;
  frequency_note: string | null;
};

export type AnnualTemplateEntry = {
  task_id: string;
  day_of_month: number;
  shifts: ShiftType[];
};

export type AnnualOverrideEntry = {
  task_id: string;
  year: number;
  month: number;
  day_of_month: number;
  shifts: ShiftType[];
};

const MONTHS_PL = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];
// weekday indexes: 1=Mon..7=Sun (ISO)
const WD_PL = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];

const TOTAL_COLS = 31; // day columns 1..31 covering worst-case month

// Colors
const HEADER_FILL = "FFFF6B6B";   // red-ish header (matches reference)
const ZEBRA_FILL = "FFFFF2A8";    // yellow zebra
const MARK_FILL = "FFFFF2A8";     // marked cells background
const WEEKEND_FILL = "FFE8F5E9";  // light green weekend
const SERVICE_COLOR = "FF1D4ED8"; // blue for tasks requiring service report

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
function isoWeekday(year: number, month: number, day: number): number {
  // JS: 0=Sun..6=Sat  → ISO: 1=Mon..7=Sun
  const d = new Date(year, month - 1, day).getDay();
  return d === 0 ? 7 : d;
}
function shiftMark(shifts: ShiftType[]): string {
  if (!shifts || shifts.length === 0) return "";
  const has1 = shifts.includes("rano");
  const has2 = shifts.includes("popoludnie") || shifts.includes("noc");
  if (has1 && has2) return "1;2";
  if (has1) return "1";
  if (has2) return "2";
  return "";
}
function buildResolver(
  template: AnnualTemplateEntry[],
  overrides: AnnualOverrideEntry[],
) {
  const tpl = new Map<string, ShiftType[]>();
  template.forEach((e) => tpl.set(`${e.task_id}:${e.day_of_month}`, e.shifts));
  const ovr = new Map<string, ShiftType[]>();
  overrides.forEach((e) =>
    ovr.set(`${e.task_id}:${e.year}:${e.month}:${e.day_of_month}`, e.shifts),
  );
  return function resolve(
    taskId: string, year: number, month: number, day: number,
  ): ShiftType[] {
    const o = ovr.get(`${taskId}:${year}:${month}:${day}`);
    if (o !== undefined) return o;
    return tpl.get(`${taskId}:${day}`) ?? [];
  };
}

/* ---------- PDF (single A4 landscape page) ---------- */

export async function exportAnnualSchedulePdf(
  year: number,
  tasks: AnnualTask[],
  template: AnnualTemplateEntry[],
  overrides: AnnualOverrideEntry[],
) {
  const resolve = buildResolver(template, overrides);
  const dayNums = Array.from({ length: TOTAL_COLS }, (_, i) => i + 1);

  // --- CALENDAR STRIP (top): rows per month; each cell = day number (or blank),
  //     background green for weekends, empty for days that don't exist.
  const calBody: TableCell[][] = [];
  // header
  calBody.push([
    { text: "Miesiąc / Dzień", style: "hdr" },
    ...dayNums.map<TableCell>((d) => ({ text: String(d), style: "hdr" })),
  ]);
  for (let m = 1; m <= 12; m++) {
    const dcount = daysInMonth(year, m);
    const row: TableCell[] = [{ text: MONTHS_PL[m - 1], style: "monthName" }];
    for (const d of dayNums) {
      if (d > dcount) {
        row.push({ text: "", style: "calCell", fillColor: "#f3f4f6" });
      } else {
        const wd = isoWeekday(year, m, d);
        const isWeekend = wd >= 6;
        row.push({
          text: WD_PL[wd - 1],
          style: "calCell",
          fillColor: isWeekend ? "#c6efce" : undefined,
        });
      }
    }
    calBody.push(row);
  }

  // --- TASK TABLE: one row per task, 31 day columns, marks from template
  const taskBody: TableCell[][] = [];
  taskBody.push([
    { text: "Nr", style: "hdr" },
    { text: "Wyszczególnienie", style: "hdr" },
    ...dayNums.map<TableCell>((d) => ({ text: String(d), style: "hdr" })),
  ]);

  tasks.forEach((t, idx) => {
    const zebra = idx % 2 === 1;
    const zebraFill = zebra ? "#fffbe6" : undefined;
    const row: TableCell[] = [
      { text: String(t.task_number), style: "cell", alignment: "center", fillColor: zebraFill },
      {
        text: t.name,
        style: "cell",
        color: t.requires_service_report ? "#1d4ed8" : undefined,
        bold: t.requires_service_report,
        fillColor: zebraFill,
      },
    ];
    for (const d of dayNums) {
      // aggregate: take any month's override if present, else template
      let mark = "";
      // check template first (uniform across year); if any override in year for this day changes it,
      // we still show the template mark — the annual report shows the recurring plan.
      const tplShifts = template.find(
        (e) => e.task_id === t.id && e.day_of_month === d,
      );
      if (tplShifts) mark = shiftMark(tplShifts.shifts);
      row.push({
        text: mark,
        style: "cell",
        alignment: "center",
        bold: !!mark,
        fillColor: mark ? "#fff2a8" : zebraFill,
      });
    }
    taskBody.push(row);
  });

  // widths: name col wider; day cols equal narrow
  const nameW = 130;
  const nrW = 14;
  const dayW = (770 - nrW - nameW) / TOTAL_COLS; // ~19pt each
  const calMonthW = nrW + nameW;

  const content: TDocumentDefinitions["content"] = [
    {
      text: `HARMONOGRAM PODSTAWOWYCH CZYNNOŚCI EKSPLOATACYJNYCH URZĄDZEŃ OCZYSZCZALNI ŚCIEKÓW — ${year}`,
      style: "title",
      alignment: "center",
      margin: [0, 0, 0, 4],
    },
    {
      table: {
        headerRows: 1,
        widths: [calMonthW, ...dayNums.map(() => dayW)],
        body: calBody,
      },
      layout: {
        hLineWidth: () => 0.3,
        vLineWidth: () => 0.3,
        hLineColor: () => "#666",
        vLineColor: () => "#666",
      },
      fontSize: 5,
    },
    { text: "", margin: [0, 2, 0, 0] },
    {
      table: {
        headerRows: 1,
        widths: [nrW, nameW, ...dayNums.map(() => dayW)],
        body: taskBody,
      },
      layout: {
        hLineWidth: () => 0.3,
        vLineWidth: () => 0.3,
        hLineColor: () => "#666",
        vLineColor: () => "#666",
      },
      fontSize: 5,
    },
    {
      text: "Legenda: 1 = zmiana 1 (rano), 2 = zmiana 2 (popołudnie), 1;2 = obie zmiany. Zadania niebieską czcionką wymagają wewnętrznego raportu serwisowego. Zielone pola w kalendarzu = weekend.",
      fontSize: 5,
      italics: true,
      margin: [0, 3, 0, 0],
    },
  ];

  const doc: TDocumentDefinitions = {
    pageOrientation: "landscape",
    pageSize: "A4",
    pageMargins: [12, 14, 12, 12],
    defaultStyle: { font: "Roboto", fontSize: 5 },
    styles: {
      title: { fontSize: 9, bold: true },
      hdr: { bold: true, alignment: "center", fillColor: "#fecaca", fontSize: 5 },
      monthName: { bold: true, fontSize: 5 },
      calCell: { alignment: "center", fontSize: 5 },
      cell: { fontSize: 5 },
    },
    content,
  };

  await downloadPdf(doc, `harmonogram-roczny-${year}.pdf`);
}

/* ---------- EXCEL (single sheet, one printed page A4 landscape) ---------- */

export async function exportAnnualScheduleXlsx(
  year: number,
  tasks: AnnualTask[],
  template: AnnualTemplateEntry[],
  _overrides: AnnualOverrideEntry[],
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(String(year), {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0, footer: 0 },
    },
  });

  const dayNums = Array.from({ length: TOTAL_COLS }, (_, i) => i + 1);

  // Column widths
  ws.getColumn(1).width = 4;   // Nr
  ws.getColumn(2).width = 40;  // name / month
  for (let i = 0; i < TOTAL_COLS; i++) ws.getColumn(3 + i).width = 3.2;

  const border = {
    top: { style: "thin" as const, color: { argb: "FF808080" } },
    left: { style: "thin" as const, color: { argb: "FF808080" } },
    bottom: { style: "thin" as const, color: { argb: "FF808080" } },
    right: { style: "thin" as const, color: { argb: "FF808080" } },
  };

  // Title
  const titleRow = ws.addRow([
    `HARMONOGRAM PODSTAWOWYCH CZYNNOŚCI EKSPLOATACYJNYCH URZĄDZEŃ OCZYSZCZALNI ŚCIEKÓW — ${year}`,
  ]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 2 + TOTAL_COLS);
  titleRow.getCell(1).font = { bold: true, size: 10 };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 16;

  // Calendar header
  const calHdr = ws.addRow(["", "Miesiąc / Dzień", ...dayNums.map(String)]);
  ws.mergeCells(calHdr.number, 1, calHdr.number, 2);
  calHdr.eachCell((c) => {
    c.font = { bold: true, size: 6 };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.border = border;
  });
  calHdr.height = 12;

  // Calendar rows per month
  for (let m = 1; m <= 12; m++) {
    const dcount = daysInMonth(year, m);
    const rowVals: (string | number)[] = ["", MONTHS_PL[m - 1]];
    for (const d of dayNums) {
      rowVals.push(d > dcount ? "" : WD_PL[isoWeekday(year, m, d) - 1]);
    }
    const r = ws.addRow(rowVals);
    ws.mergeCells(r.number, 1, r.number, 2);
    r.height = 11;
    r.getCell(1).value = MONTHS_PL[m - 1];
    r.getCell(1).font = { bold: true, size: 6 };
    r.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    r.getCell(1).border = border;
    for (let i = 0; i < TOTAL_COLS; i++) {
      const cell = r.getCell(3 + i);
      const d = i + 1;
      cell.font = { size: 6 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = border;
      if (d > dcount) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      } else {
        const wd = isoWeekday(year, m, d);
        if (wd >= 6) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
        }
      }
    }
  }

  // Spacer row
  ws.addRow([]);

  // Task table header
  const taskHdr = ws.addRow(["Nr", "Wyszczególnienie", ...dayNums.map(String)]);
  taskHdr.eachCell((c) => {
    c.font = { bold: true, size: 6 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.border = border;
  });
  taskHdr.height = 14;

  // Task rows
  tasks.forEach((t, idx) => {
    const zebra = idx % 2 === 1;
    const rowVals: (string | number)[] = [t.task_number, t.name];
    const marks: string[] = [];
    for (const d of dayNums) {
      const tpl = template.find((e) => e.task_id === t.id && e.day_of_month === d);
      marks.push(tpl ? shiftMark(tpl.shifts) : "");
    }
    const r = ws.addRow([...rowVals, ...marks]);
    r.height = 11;
    // Nr
    const nr = r.getCell(1);
    nr.font = { size: 6, bold: true };
    nr.alignment = { horizontal: "center", vertical: "middle" };
    nr.border = border;
    if (zebra) nr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBE6" } };
    // Name
    const nm = r.getCell(2);
    nm.font = {
      size: 6,
      bold: t.requires_service_report,
      color: t.requires_service_report ? { argb: SERVICE_COLOR } : undefined,
    };
    nm.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    nm.border = border;
    if (zebra) nm.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBE6" } };
    // Day cells
    for (let i = 0; i < TOTAL_COLS; i++) {
      const c = r.getCell(3 + i);
      c.font = { size: 6, bold: !!marks[i] };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = border;
      if (marks[i]) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARK_FILL } };
      } else if (zebra) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBE6" } };
      }
    }
  });

  // Legend
  const legend = ws.addRow([
    "Legenda: 1 = zmiana 1 (rano), 2 = zmiana 2 (popołudnie), 1;2 = obie zmiany. Zadania niebieską czcionką wymagają wewnętrznego raportu serwisowego. Zielone pola = weekend.",
  ]);
  ws.mergeCells(legend.number, 1, legend.number, 2 + TOTAL_COLS);
  legend.getCell(1).font = { italic: true, size: 6 };
  legend.getCell(1).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  legend.height = 12;

  ws.pageSetup.printArea = `A1:${ws.getColumn(2 + TOTAL_COLS).letter}${legend.number}`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `harmonogram-roczny-${year}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
