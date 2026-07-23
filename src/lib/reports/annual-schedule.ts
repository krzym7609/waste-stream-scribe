import * as XLSX from "xlsx";
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

// dzień tygodnia jako litera PL (Pn Wt Śr Cz Pt Sb Nd)
const WD_PL = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function shiftMark(shifts: ShiftType[]): string {
  if (!shifts || shifts.length === 0) return "";
  const has = (s: ShiftType) => shifts.includes(s);
  // "rano" = 1, "popoludnie"/"noc" = 2
  const has1 = has("rano");
  const has2 = has("popoludnie") || has("noc");
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
    taskId: string,
    year: number,
    month: number,
    day: number,
  ): ShiftType[] {
    const o = ovr.get(`${taskId}:${year}:${month}:${day}`);
    if (o !== undefined) return o;
    return tpl.get(`${taskId}:${day}`) ?? [];
  };
}

/* ---------- PDF ---------- */

export async function exportAnnualSchedulePdf(
  year: number,
  tasks: AnnualTask[],
  template: AnnualTemplateEntry[],
  overrides: AnnualOverrideEntry[],
) {
  const resolve = buildResolver(template, overrides);

  const content: TDocumentDefinitions["content"] = [
    {
      text: `HARMONOGRAM PODSTAWOWYCH CZYNNOŚCI EKSPLOATACYJNYCH URZĄDZEŃ OCZYSZCZALNI ŚCIEKÓW — ${year}`,
      style: "h1",
      alignment: "center",
      margin: [0, 0, 0, 8],
    },
  ];

  // Jedna strona pejzażowa per miesiąc.
  for (let m = 1; m <= 12; m++) {
    const dcount = daysInMonth(year, m);
    const dayNums = Array.from({ length: dcount }, (_, i) => i + 1);

    // Nagłówek: numer dnia + dzień tygodnia
    const headerRow1: TableCell[] = [
      { text: "Nr", style: "th", rowSpan: 2 },
      { text: "Zadanie", style: "th", rowSpan: 2 },
      ...dayNums.map<TableCell>((d) => ({ text: String(d), style: "th" })),
    ];
    const headerRow2: TableCell[] = [
      {}, {},
      ...dayNums.map<TableCell>((d) => {
        const wd = new Date(year, m - 1, d).getDay();
        const isWeekend = wd === 0 || wd === 6;
        return {
          text: WD_PL[wd],
          style: "th",
          fillColor: isWeekend ? "#c6efce" : undefined,
        };
      }),
    ];

    const body: TableCell[][] = [headerRow1, headerRow2];

    tasks.forEach((t) => {
      const row: TableCell[] = [
        { text: String(t.task_number), style: "cell", alignment: "center" },
        {
          text: t.name,
          style: "cell",
          color: t.requires_service_report ? "#1d4ed8" : undefined,
          bold: t.requires_service_report,
        },
        ...dayNums.map<TableCell>((d) => {
          const shifts = resolve(t.id, year, m, d);
          const wd = new Date(year, m - 1, d).getDay();
          const isWeekend = wd === 0 || wd === 6;
          const mark = shiftMark(shifts);
          return {
            text: mark,
            style: "cell",
            alignment: "center",
            fillColor: mark
              ? "#fff2a8"
              : isWeekend
                ? "#e8f5e9"
                : undefined,
          };
        }),
      ];
      body.push(row);
    });

    const dayColWidth = Math.max(10, Math.floor((770 - 20 - 180) / dcount));

    content.push({
      text: `${MONTHS_PL[m - 1]} ${year}`,
      style: "h2",
      margin: [0, m === 1 ? 4 : 10, 0, 4],
      pageBreak: m === 1 ? undefined : "before",
    });
    content.push({
      table: {
        headerRows: 2,
        widths: ["auto", 180, ...dayNums.map(() => dayColWidth)],
        body,
      },
      layout: {
        hLineWidth: () => 0.4,
        vLineWidth: () => 0.4,
        hLineColor: () => "#888",
        vLineColor: () => "#888",
      },
      fontSize: 6,
    });
    content.push({
      text: "Legenda: 1 = zmiana 1 (rano), 2 = zmiana 2 (popołudnie), 1;2 = obie zmiany. Zadania niebieską czcionką wymagają wewnętrznego raportu serwisowego.",
      fontSize: 6,
      italics: true,
      margin: [0, 4, 0, 0],
    });
  }

  const doc: TDocumentDefinitions = {
    pageOrientation: "landscape",
    pageSize: "A4",
    pageMargins: [16, 24, 16, 24],
    defaultStyle: { font: "Roboto", fontSize: 7 },
    styles: {
      h1: { fontSize: 11, bold: true },
      h2: { fontSize: 10, bold: true },
      th: { bold: true, alignment: "center", fillColor: "#fde2e2", fontSize: 6 },
      cell: { fontSize: 6 },
    },
    content,
  };

  await downloadPdf(doc, `harmonogram-roczny-${year}.pdf`);
}

/* ---------- EXCEL ---------- */

export function exportAnnualScheduleXlsx(
  year: number,
  tasks: AnnualTask[],
  template: AnnualTemplateEntry[],
  overrides: AnnualOverrideEntry[],
) {
  const resolve = buildResolver(template, overrides);
  const wb = XLSX.utils.book_new();

  for (let m = 1; m <= 12; m++) {
    const dcount = daysInMonth(year, m);
    const dayNums = Array.from({ length: dcount }, (_, i) => i + 1);

    const aoa: (string | number)[][] = [];
    aoa.push(["Nr", "Zadanie", ...dayNums.map((d) => d)]);
    aoa.push(["", "", ...dayNums.map((d) => WD_PL[new Date(year, m - 1, d).getDay()])]);

    tasks.forEach((t) => {
      const row: (string | number)[] = [t.task_number, t.name];
      dayNums.forEach((d) => row.push(shiftMark(resolve(t.id, year, m, d))));
      aoa.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // szerokości kolumn
    ws["!cols"] = [
      { wch: 4 },
      { wch: 45 },
      ...dayNums.map(() => ({ wch: 4 })),
    ];
    XLSX.utils.book_append_sheet(wb, ws, MONTHS_PL[m - 1]);
  }

  XLSX.writeFile(wb, `harmonogram-roczny-${year}.xlsx`);
}
