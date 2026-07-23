import ExcelJS from "exceljs";
import type { TDocumentDefinitions, TableCell } from "pdfmake/interfaces";
import { downloadPdf } from "@/lib/pdf/pdfmake-instance";
import type { ShiftType } from "@/lib/shifts";

/* -----------------------------------------------------------
   Odtworzenie layoutu z pliku harmonogram-roczny-2026.xlsx
   Wygląd 1:1. Dynamicznie zmieniają się tylko daty pod dany rok
   oraz oznaczenia zmian pobierane z szablonu użytkownika.
   ----------------------------------------------------------- */

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
// Kolumny C..AD (28 sztuk) – nagłówek dni tygodnia w cyklu Wt→Pn (4 tygodnie)
const WEEKDAY_HEADERS = [
  "Wt","Śr","Cz","Pt","Sb","Nd","Pn",
  "Wt","Śr","Cz","Pt","Sb","Nd","Pn",
  "Wt","Śr","Cz","Pt","Sb","Nd","Pn",
  "Wt","Śr","Cz","Pt","Sb","Nd","Pn",
];
const STRIP_COLS = 28;      // C..AD
const FIRST_DAY_COL = 3;    // kolumna C (1-based)
const NAME_COL = 2;         // kolumna B

// Kolory (dokładnie jak w pliku źródłowym)
const HEADER_FILL = "FFFF0000";   // czerwony nagłówek
const MARK_FILL   = "FFFFF66";    // żółte pole oznaczenia zmiany (jak C27 w źródle)
const SHIFT_FILL  = "FFFFFF66";   // żółty pas "Z M I A N A"
const SERVICE_COLOR = "FF1D4ED8"; // niebieski dla zadań z raportem serwisowym

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
// JS Date: 0=Nd..6=Sb  → mapujemy tak, że Wt=0..Pn=6 (bo strip zaczyna się od Wt)
function offsetFromTue(year: number, month: number, day: number): number {
  const d = new Date(year, month - 1, day).getDay(); // 0=Nd
  // Wt=2 (JS) → 0. Formuła: (jsDay - 2 + 7) % 7
  return (d - 2 + 7) % 7;
}
function daysBeforeMonth(year: number, month: number): number {
  let n = 0;
  for (let m = 1; m < month; m++) n += daysInMonth(year, m);
  return n;
}
/** Zwraca kolumnę (1-based) i wiersz w obrębie pary wierszy miesiąca (0 lub 1)
 *  dla dnia `day` miesiąca `month` w danym roku. */
function placeDay(year: number, month: number, day: number) {
  const startOffset = offsetFromTue(year, 1, 1); // wyrównanie roku
  const pos = (startOffset + daysBeforeMonth(year, month) + (day - 1)) % STRIP_COLS;
  const monthStart = (startOffset + daysBeforeMonth(year, month)) % STRIP_COLS;
  const linear = monthStart + (day - 1);
  const rowInMonth = Math.floor(linear / STRIP_COLS);
  const col = FIRST_DAY_COL + (linear % STRIP_COLS);
  return { col, rowInMonth, pos };
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

/* ---------- EXCEL (1:1 z plikiem źródłowym) ---------- */

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

  // Szerokości kolumn – jak w oryginale
  ws.getColumn(1).width = 3;      // A – Nr
  ws.getColumn(2).width = 62.875; // B – nazwa / miesiąc
  ws.getColumn(3).width = 3.625;  // C
  for (let i = 1; i < STRIP_COLS; i++) ws.getColumn(FIRST_DAY_COL + i).width = 3.25;

  const border = {
    top:    { style: "thin" as const, color: { argb: "FF808080" } },
    left:   { style: "thin" as const, color: { argb: "FF808080" } },
    bottom: { style: "thin" as const, color: { argb: "FF808080" } },
    right:  { style: "thin" as const, color: { argb: "FF808080" } },
  };
  const thinBorder = border;

  // === Wiersz 1: nagłówek dni tygodnia (kalendarz) ===
  const hdr1 = ws.getRow(1);
  hdr1.getCell(NAME_COL).value = "Miesiąc / Dzień tygodnia:";
  hdr1.getCell(NAME_COL).font = { bold: true, size: 8, color: { argb: "FFFFFFFF" } };
  hdr1.getCell(NAME_COL).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  hdr1.getCell(NAME_COL).alignment = { horizontal: "left", vertical: "middle" };
  hdr1.getCell(NAME_COL).border = thinBorder;
  for (let i = 0; i < STRIP_COLS; i++) {
    const c = hdr1.getCell(FIRST_DAY_COL + i);
    c.value = WEEKDAY_HEADERS[i];
    c.font = { bold: true, size: 7, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder;
  }
  hdr1.height = 14;

  // === Wiersze 2..25: 12 miesięcy × 2 wiersze ===
  for (let m = 1; m <= 12; m++) {
    const topRow = 2 + (m - 1) * 2;
    const botRow = topRow + 1;
    // Scalone: kolumna A i B pomiędzy tymi 2 wierszami
    ws.mergeCells(topRow, 1, botRow, 1);
    ws.mergeCells(topRow, NAME_COL, botRow, NAME_COL);
    const nameCell = ws.getCell(topRow, NAME_COL);
    nameCell.value = MONTHS_PL[m - 1];
    nameCell.font = { bold: true, size: 9 };
    nameCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    nameCell.border = thinBorder;
    ws.getCell(topRow, 1).border = thinBorder;

    ws.getRow(topRow).height = 13;
    ws.getRow(botRow).height = 13;

    // Rozłóż dni miesiąca
    const dcount = daysInMonth(year, m);
    // Najpierw zainicjalizuj wszystkie 28 kolumn w obu wierszach ramkami
    for (const r of [topRow, botRow]) {
      for (let i = 0; i < STRIP_COLS; i++) {
        const c = ws.getCell(r, FIRST_DAY_COL + i);
        c.border = thinBorder;
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.font = { size: 8 };
      }
    }
    for (let d = 1; d <= dcount; d++) {
      const { col, rowInMonth } = placeDay(year, m, d);
      const row = rowInMonth === 0 ? topRow : botRow;
      const c = ws.getCell(row, col);
      c.value = d;
      c.font = { size: 8 };
    }
  }

  // === Wiersz 26: nagłówek tabeli zadań ===
  const hdr2 = ws.getRow(26);
  hdr2.getCell(NAME_COL).value = "Wyszczególnienie/ Dzień tygodnia:";
  hdr2.getCell(NAME_COL).font = { bold: true, size: 8, color: { argb: "FFFFFFFF" } };
  hdr2.getCell(NAME_COL).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  hdr2.getCell(NAME_COL).alignment = { horizontal: "left", vertical: "middle" };
  hdr2.getCell(NAME_COL).border = thinBorder;
  for (let i = 0; i < STRIP_COLS; i++) {
    const c = hdr2.getCell(FIRST_DAY_COL + i);
    c.value = WEEKDAY_HEADERS[i];
    c.font = { bold: true, size: 7, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder;
  }
  hdr2.height = 14;

  // === Wiersz 27: pas "Z M I A N A" ===
  const shiftRow = ws.getRow(27);
  ws.mergeCells(27, FIRST_DAY_COL, 27, FIRST_DAY_COL + STRIP_COLS - 1);
  const shiftCell = shiftRow.getCell(FIRST_DAY_COL);
  shiftCell.value = "Z M I A N A";
  shiftCell.font = { bold: true, size: 9 };
  shiftCell.alignment = { horizontal: "center", vertical: "middle" };
  shiftCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SHIFT_FILL } };
  shiftCell.border = thinBorder;
  shiftRow.getCell(NAME_COL).border = thinBorder;
  shiftRow.getCell(1).border = thinBorder;
  shiftRow.height = 13;

  // === Wiersze 28+: zadania ===
  // Kolumny C..AD (28) reprezentują dni miesiąca 1..28 (jak w oryginale).
  // Znaczniki dla dni 29-31 nie mają miejsca w pasku, więc trafiają w kolumny C..E
  // (te same, co dni 1..3 – co odpowiada wizualnie pierwszym kolumnom paska).
  // W praktyce większość szablonów mieści się w 1..28.
  tasks.forEach((t, idx) => {
    const rowIdx = 28 + idx;
    const r = ws.getRow(rowIdx);
    r.height = 13;
    r.getCell(1).value = t.task_number;
    r.getCell(1).font = { size: 8, bold: true };
    r.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    r.getCell(1).border = thinBorder;

    const nm = r.getCell(NAME_COL);
    nm.value = t.name;
    nm.font = {
      size: 8,
      bold: t.requires_service_report,
      color: t.requires_service_report ? { argb: SERVICE_COLOR } : undefined,
    };
    nm.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    nm.border = thinBorder;

    // Zbierz oznaczenia dla dni 1..28 (i 29..31 nakładając na kolumny 1..3)
    const marks: string[] = new Array(STRIP_COLS).fill("");
    for (const e of template) {
      if (e.task_id !== t.id) continue;
      const d = e.day_of_month;
      const colIdx = ((d - 1) % STRIP_COLS); // 0..27
      const mark = shiftMark(e.shifts);
      if (!mark) continue;
      // jeśli już jest inny znacznik, połącz do 1;2
      if (marks[colIdx] && marks[colIdx] !== mark) marks[colIdx] = "1;2";
      else marks[colIdx] = mark;
    }

    for (let i = 0; i < STRIP_COLS; i++) {
      const c = r.getCell(FIRST_DAY_COL + i);
      c.border = thinBorder;
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.font = { size: 8, bold: !!marks[i] };
      if (marks[i]) {
        c.value = marks[i];
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARK_FILL } };
      }
    }
  });

  // === Stopka – wiersz z dniami tygodnia ===
  const footerRowIdx = 28 + tasks.length;
  const fr = ws.getRow(footerRowIdx);
  fr.getCell(NAME_COL).value = " Dzień tygodnia:";
  fr.getCell(NAME_COL).font = { bold: true, size: 8, color: { argb: "FFFFFFFF" } };
  fr.getCell(NAME_COL).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  fr.getCell(NAME_COL).alignment = { horizontal: "left", vertical: "middle" };
  fr.getCell(NAME_COL).border = thinBorder;
  for (let i = 0; i < STRIP_COLS; i++) {
    const c = fr.getCell(FIRST_DAY_COL + i);
    c.value = WEEKDAY_HEADERS[i];
    c.font = { bold: true, size: 7, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder;
  }
  fr.height = 14;

  ws.pageSetup.printArea = `A1:${ws.getColumn(FIRST_DAY_COL + STRIP_COLS - 1).letter}${footerRowIdx}`;

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

/* ---------- PDF (ten sam układ, A4 poziomo, 1 strona) ---------- */

export async function exportAnnualSchedulePdf(
  year: number,
  tasks: AnnualTask[],
  template: AnnualTemplateEntry[],
  _overrides: AnnualOverrideEntry[],
) {
  // Budujemy taką samą siatkę jak w Excelu, tylko jako tabelę pdfmake
  const totalCols = 1 /*A Nr*/ + 1 /*B Nazwa*/ + STRIP_COLS;

  // Kalendarz – nagłówek
  const hdrRow: TableCell[] = [
    { text: "", style: "hdr" },
    { text: "Miesiąc / Dzień tygodnia:", style: "hdr", alignment: "left" },
    ...WEEKDAY_HEADERS.map<TableCell>((w) => ({ text: w, style: "hdr" })),
  ];
  const body: TableCell[][] = [hdrRow];

  for (let m = 1; m <= 12; m++) {
    const dcount = daysInMonth(year, m);
    const top: TableCell[] = new Array(totalCols).fill(null).map(() => ({ text: "", style: "cell" }));
    const bot: TableCell[] = new Array(totalCols).fill(null).map(() => ({ text: "", style: "cell" }));
    // scalone A i B na dwa wiersze
    top[0] = { text: "", style: "cell", rowSpan: 2 };
    top[1] = { text: MONTHS_PL[m - 1], style: "monthName", rowSpan: 2, alignment: "left" };
    for (let d = 1; d <= dcount; d++) {
      const { col, rowInMonth } = placeDay(year, m, d);
      // col to 1-based nr kolumny arkusza; w PDF-owej tablicy index = col - 1
      const idx = col - 1;
      const target = rowInMonth === 0 ? top : bot;
      target[idx] = { text: String(d), style: "cell" };
    }
    body.push(top, bot);
  }

  // Nagłówek tabeli zadań
  const taskHdr: TableCell[] = [
    { text: "", style: "hdr" },
    { text: "Wyszczególnienie/ Dzień tygodnia:", style: "hdr", alignment: "left" },
    ...WEEKDAY_HEADERS.map<TableCell>((w) => ({ text: w, style: "hdr" })),
  ];
  body.push(taskHdr);

  // Pas "Z M I A N A"
  const shiftBand: TableCell[] = [
    { text: "", style: "cell" },
    { text: "", style: "cell" },
    { text: "Z M I A N A", style: "shiftBand", colSpan: STRIP_COLS, alignment: "center" },
    ...new Array(STRIP_COLS - 1).fill({}),
  ];
  body.push(shiftBand);

  // Zadania
  tasks.forEach((t) => {
    const marks: string[] = new Array(STRIP_COLS).fill("");
    for (const e of template) {
      if (e.task_id !== t.id) continue;
      const colIdx = ((e.day_of_month - 1) % STRIP_COLS);
      const mark = shiftMark(e.shifts);
      if (!mark) continue;
      if (marks[colIdx] && marks[colIdx] !== mark) marks[colIdx] = "1;2";
      else marks[colIdx] = mark;
    }
    const row: TableCell[] = [
      { text: String(t.task_number), style: "cell", alignment: "center", bold: true },
      {
        text: t.name,
        style: "cell",
        alignment: "left",
        color: t.requires_service_report ? "#1d4ed8" : undefined,
        bold: t.requires_service_report,
      },
      ...marks.map<TableCell>((mk) => ({
        text: mk,
        style: "cell",
        alignment: "center",
        bold: !!mk,
        fillColor: mk ? "#FFFF66" : undefined,
      })),
    ];
    body.push(row);
  });

  // Stopka – dni tygodnia
  body.push([
    { text: "", style: "hdr" },
    { text: " Dzień tygodnia:", style: "hdr", alignment: "left" },
    ...WEEKDAY_HEADERS.map<TableCell>((w) => ({ text: w, style: "hdr" })),
  ]);

  // Szerokości – dopasowane by szerokościowo mieściło się na A4 poziomo.
  // W pionie może się rozlewać na kolejne strony.
  const nrW = 14;
  const nameW = 190;
  const usable = 802 - nrW - nameW;
  const dayW = usable / STRIP_COLS;

  const doc: TDocumentDefinitions = {
    pageOrientation: "landscape",
    pageSize: "A4",
    pageMargins: [10, 12, 10, 12],
    defaultStyle: { font: "Roboto", fontSize: 7 },
    styles: {
      hdr: {
        bold: true,
        alignment: "center",
        fillColor: "#FF0000",
        color: "#FFFFFF",
        fontSize: 7,
      },
      cell: { fontSize: 7, alignment: "center" },
      monthName: { bold: true, fontSize: 8, alignment: "left" },
      shiftBand: { bold: true, fontSize: 9, fillColor: "#FFFF66", alignment: "center" },
    },
    content: [
      {
        text: `HARMONOGRAM PODSTAWOWYCH CZYNNOŚCI EKSPLOATACYJNYCH URZĄDZEŃ OCZYSZCZALNI ŚCIEKÓW — ${year}`,
        bold: true,
        alignment: "center",
        fontSize: 10,
        margin: [0, 0, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [nrW, nameW, ...Array(STRIP_COLS).fill(dayW)],
          body,
        },
        layout: {
          hLineWidth: () => 0.3,
          vLineWidth: () => 0.3,
          hLineColor: () => "#808080",
          vLineColor: () => "#808080",
        },
      },
    ],
  };

  await downloadPdf(doc, `harmonogram-roczny-${year}.pdf`);
}
