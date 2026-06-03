import type { TDocumentDefinitions, Content, TableCell } from "pdfmake/interfaces";
import { downloadPdf } from "./pdfmake-instance";

export type ShiftReportPdfData = {
  date: string;
  shift: string;
  operator: string;
  operatorzy?: string | null;
  submittedAt: string;
  data: {
    energia_start: number | null;
    energia_end: number | null;
    flokulant_proszkowy_kg: number | null;
    flokulant_emulsyjny_l: number | null;
    wapno_kg: number | null;
    chlorek_zelaza_l: number | null;
    sm_osadu_zageszcz: number | null;
    sm_osadu_odwwapn: number | null;
    opady: boolean;
    uwagi: string | null;
  };
  items: Array<{
    object_name: string;
    ocena_status: "ok" | "problem";
    ocena_opis: string | null;
    harmonogram_status: "ok" | "nie_wykonano";
    harmonogram_opis: string | null;
    proponowany_termin: string | null;
    inne_czynnosci: string | null;
  }>;
};

const SHIFT_SHORT: Record<string, string> = {
  rano: "I",
  popoludnie: "II",
  noc: "III",
};

const SHIFT_NUM: Record<string, string> = {
  rano: "1",
  popoludnie: "2",
  noc: "3",
};

const orBrak = (v: string | null | undefined) => {
  const s = String(v ?? "").trim();
  return s === "" ? "Brak" : s;
};

const v = (x: number | null | undefined) => (x == null ? "" : String(x));

const GRAY = "#d9d9d9";
const SOFT_BREAK = "\u200B";

const wrapPdfText = (value: string | null | undefined, maxChunk = 18) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part) || part.length <= maxChunk) return part;
      return part
        .replace(/([/\\_-])/g, `$1${SOFT_BREAK}`)
        .replace(new RegExp(`([^${SOFT_BREAK}]{${maxChunk}})`, "g"), `$1${SOFT_BREAK}`);
    })
    .join("");

const textCell = (text: string | null | undefined, margin: [number, number, number, number]): TableCell => ({
  text: wrapPdfText(text),
  margin,
  noWrap: false,
});

export async function generateShiftReportPdf(d: ShiftReportPdfData) {
  const pobor =
    d.data.energia_end != null && d.data.energia_start != null
      ? String(Math.max(0, d.data.energia_end - d.data.energia_start))
      : "";

  // Top header: Data/zmiana | Operator wiodący / Operator(zy)
  const headerTop: Content = {
    table: {
      widths: [180, 110, "*"],
      body: [
        [
          {
            text: `Data / zmiana : ${d.date} / ${SHIFT_SHORT[d.shift] ?? d.shift}`,
            rowSpan: 2,
            margin: [4, 14, 4, 14],
          },
          { text: "Operator wiodący:", fillColor: GRAY, margin: [4, 2, 4, 2] },
          { text: d.operator, margin: [4, 2, 4, 2] },
        ],
        [
          {},
          { text: "Operator(zy):", fillColor: GRAY, margin: [4, 2, 4, 2] },
          { text: d.operatorzy ?? "", margin: [4, 2, 4, 2] },
        ],
      ],
    },
    margin: [0, 0, 0, 6],
  };

  // Energy table
  const energyTable: Content = {
    table: {
      widths: ["*", 90, 90, 90],
      body: [
        [
          { text: "Pobór energii elektrycznej", alignment: "center", fillColor: GRAY, margin: [2, 6, 2, 6] },
          { text: "Stan początkowy", alignment: "center", fillColor: GRAY, margin: [2, 6, 2, 6] },
          { text: "Stan końcowy", alignment: "center", fillColor: GRAY, margin: [2, 6, 2, 6] },
          { text: "Pobór", alignment: "center", fillColor: GRAY, margin: [2, 6, 2, 6] },
        ],
        [
          { text: "[kwh]", alignment: "center", margin: [2, 6, 2, 6] },
          { text: v(d.data.energia_start), alignment: "center", margin: [2, 6, 2, 6] },
          { text: v(d.data.energia_end), alignment: "center", margin: [2, 6, 2, 6] },
          { text: pobor, alignment: "center", margin: [2, 6, 2, 6] },
        ],
      ],
    },
    margin: [0, 0, 0, 6],
  };

  // Two column chemicals/SM
  const labelCell = (t: string): TableCell => ({
    text: t,
    fillColor: GRAY,
    margin: [4, 3, 4, 3],
  });
  const valueCell = (t: string): TableCell => ({
    text: t,
    margin: [4, 3, 4, 3],
    alignment: "center",
  });
  const chemicals: Content = {
    columns: [
      {
        width: "*",
        table: {
          widths: ["*", 70],
          body: [
            [labelCell("Zużycie flokulanta proszkowego [kg]"), valueCell(v(d.data.flokulant_proszkowy_kg))],
            [labelCell("Zużycie flokulanta emulsyjnego [l]"), valueCell(v(d.data.flokulant_emulsyjny_l))],
            [labelCell("Dostawa wapna do higienizacji [kg]:"), valueCell(v(d.data.wapno_kg))],
            [labelCell("Zużycie chlorku żelazowego [l]:"), valueCell(v(d.data.chlorek_zelaza_l))],
          ],
        },
      },
      { width: 10, text: "" },
      {
        width: 240,
        stack: [
          {
            table: {
              widths: ["*", 60],
              body: [
                [labelCell("S.M. osadu zagęszcz:"), valueCell(v(d.data.sm_osadu_zageszcz))],
                [labelCell("S.M. osadu odw.wapn.:"), valueCell(v(d.data.sm_osadu_odwwapn))],
              ],
            },
            margin: [0, 0, 0, 18],
          },
          {
            table: {
              widths: ["*", 60],
              body: [[labelCell("Występ. opadów (T/N):"), valueCell(d.data.opady ? "T" : "N")]],
            },
          },
        ],
      },
    ],
    margin: [0, 0, 0, 8],
  };

  // Items table — 4 columns matching paper
  const itemHeader: TableCell[] = [
    { text: "Nazwa\nobiektu", alignment: "center", fillColor: GRAY, margin: [2, 4, 2, 4] },
    {
      text:
        "Ocena prawidłowości pracy\nw ciągu zmiany, ew. awarie i\nprawdopodobne przyczyny.",
      alignment: "center",
      fillColor: GRAY,
      margin: [2, 4, 2, 4],
    },
    {
      text:
        "Wykonane zgodnie z harmonogramem\nczynności obsługowe, ew. przyczyna nie-\nwykonania z propozycją nowego terminu.",
      alignment: "center",
      fillColor: GRAY,
      margin: [2, 4, 2, 4],
    },
    {
      text:
        "Inne bieżące czynności\neksploatacyjne, remon-\ntowe i porządkowe.",
      alignment: "center",
      fillColor: GRAY,
      margin: [2, 4, 2, 4],
    },
  ];

  const itemsBody: TableCell[][] = [itemHeader];
  for (const it of d.items) {
    const ocenaCell: TableCell =
      it.ocena_status === "ok"
        ? { text: "[OK]  prawidłowo", color: "#059669", bold: true, alignment: "center", margin: [3, 6, 3, 6] }
        : textCell(`Problem / awaria:\n${it.ocena_opis ?? ""}`, [3, 3, 3, 3]);
    const harmCell: TableCell =
      it.harmonogram_status === "ok"
        ? { text: "[OK]  wykonane", color: "#059669", bold: true, alignment: "center", margin: [3, 6, 3, 6] }
        : textCell(
            `Nie wykonano: ${it.harmonogram_opis ?? ""}${
              it.proponowany_termin ? `\nProponowany termin: ${it.proponowany_termin}` : ""
            }`,
            [3, 3, 3, 3],
          );
    itemsBody.push([
      { text: it.object_name, fillColor: GRAY, margin: [3, 3, 3, 3] },
      ocenaCell,
      harmCell,
      textCell(it.inne_czynnosci, [3, 3, 3, 3]),
    ]);
  }

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 36],
    info: { title: `Raport zmianowy ${d.date}`, author: d.operator },
    content: [
      {
        text: "Raport zmianowy oczyszczalni ścieków.",
        alignment: "center",
        bold: true,
        decoration: "underline",
        fontSize: 13,
        margin: [0, 0, 0, 8],
      },
      headerTop,
      energyTable,
      chemicals,
      {
        text: "EKSPLOATACJA  URZĄDZEŃ  OCZYSZCZALNI.",
        italics: true,
        bold: true,
        margin: [0, 6, 0, 4],
      },
      {
        table: { widths: [95, "*", "*", "*"], body: itemsBody, headerRows: 1 },
      },
      {
        text: `Podpis operatora wiodącego: ${d.operator}`,
        alignment: "center",
        bold: true,
        margin: [0, 16, 0, 0],
      },
    ],
    defaultStyle: { fontSize: 9 },
  };

  await downloadPdf(doc, `raport-zmianowy-${d.date}-${d.shift}.pdf`);
}

export type HandoverPdfData = {
  date: string;
  shiftFrom: string;
  operatorFrom: string;
  operatorTo: string | null;
  submittedAt: string;
  acceptedAt: string | null;
  uwagiOgolne: string | null;
  items: Array<{
    object_name: string;
    uwagi_przekazujacego: string | null;
    uwagi_przyjmujacego: string | null;
  }>;
};

export async function generateHandoverPdf(d: HandoverPdfData) {
  const headerTop: Content = {
    table: {
      widths: ["*", 260],
      body: [
        [
          {
            text: "PRZEKAZANIE  ZMIANY :",
            bold: true,
            italics: true,
            decoration: "underline",
            margin: [4, 6, 4, 6],
            border: [false, false, false, false],
          },
          {
            stack: [
              { text: `Data : ${d.date}`, margin: [4, 2, 4, 2] },
            ],
          },
        ],
        [
          {
            stack: [
              { text: `Zmianę przekazuje: ${d.operatorFrom}`, margin: [4, 2, 4, 2] },
              { text: `Zmianę przejmuje: ${d.operatorTo ?? ""}`, margin: [4, 2, 4, 2] },
            ],
            colSpan: 2,
            border: [true, true, true, true],
          },
          {},
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
    },
    margin: [0, 0, 0, 4],
  };

  const itemsBody: TableCell[][] = [
    [
      { text: "Obiekt", alignment: "center", bold: true, fillColor: "#d9d9d9", margin: [2, 4, 2, 4] },
      {
        text: "Uwagi przekazującego zmianę",
        alignment: "center",
        bold: true,
        fillColor: "#d9d9d9",
        margin: [2, 4, 2, 4],
      },
      {
        text: "Uwagi przejmującego zmianę",
        alignment: "center",
        bold: true,
        fillColor: "#d9d9d9",
        margin: [2, 4, 2, 4],
      },
    ],
  ];
  for (const it of d.items) {
    itemsBody.push([
      { text: it.object_name, fillColor: "#d9d9d9", margin: [3, 4, 3, 4] },
      textCell(it.uwagi_przekazujacego, [3, 4, 3, 4]),
      textCell(it.uwagi_przyjmujacego, [3, 4, 3, 4]),
    ]);
  }
  itemsBody.push([
    { text: "Podpisy:", fillColor: "#d9d9d9", margin: [3, 6, 3, 6], bold: true },
    {
      text: `Przekazujący : ${d.operatorFrom}`,
      decoration: "underline",
      margin: [3, 6, 3, 6],
    },
    {
      text: `Przejmujący : ${d.operatorTo ?? ""}`,
      decoration: "underline",
      margin: [3, 6, 3, 6],
    },
  ]);

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 36],
    info: { title: `Przekazanie zmiany ${d.date}`, author: d.operatorFrom },
    content: [
      headerTop,
      {
        text: "Uwagi dotyczące przekazania zmiany:",
        italics: true,
        margin: [0, 2, 0, 4],
      },
      {
        table: { widths: [150, "*", "*"], body: itemsBody, headerRows: 1 },
      },
      ...(d.uwagiOgolne
        ? ([{ text: d.uwagiOgolne, italics: true, margin: [0, 8, 0, 0] }] as Content[])
        : []),
    ],
    defaultStyle: { fontSize: 9 },
  };

  await downloadPdf(doc, `przekazanie-zmiany-${d.date}.pdf`);
}
