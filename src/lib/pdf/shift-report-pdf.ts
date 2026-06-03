import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { downloadPdf } from "./pdfmake-instance";

export type ShiftReportPdfData = {
  date: string; // YYYY-MM-DD
  shift: string; // "rano" | "popoludnie" | "noc"
  operator: string;
  submittedAt: string; // ISO
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

const fmt = (v: number | null | undefined, unit: string) =>
  v == null || v === undefined ? "—" : `${v} ${unit}`;

const SHIFT_LABEL: Record<string, string> = {
  rano: "Ranna (6:00–14:00)",
  popoludnie: "Popołudniowa (14:00–22:00)",
  noc: "Nocna (22:00–6:00)",
};

export async function generateShiftReportPdf(d: ShiftReportPdfData) {
  const dataRows: Content = {
    table: {
      widths: ["*", 80],
      body: [
        [{ text: "Parametr", style: "th" }, { text: "Wartość", style: "th" }],
        ["Energia – stan początkowy [kWh]", fmt(d.data.energia_start, "")],
        ["Energia – stan końcowy [kWh]", fmt(d.data.energia_end, "")],
        [
          "Energia – zużycie [kWh]",
          d.data.energia_end != null && d.data.energia_start != null
            ? String(Math.max(0, d.data.energia_end - d.data.energia_start))
            : "—",
        ],
        ["Flokulant proszkowy [kg]", fmt(d.data.flokulant_proszkowy_kg, "")],
        ["Flokulant emulsyjny [l]", fmt(d.data.flokulant_emulsyjny_l, "")],
        ["Wapno [kg]", fmt(d.data.wapno_kg, "")],
        ["Chlorek żelaza [l]", fmt(d.data.chlorek_zelaza_l, "")],
        ["S.M. osadu zagęszczonego [%]", fmt(d.data.sm_osadu_zageszcz, "")],
        ["S.M. osadu odwodnionego/wapnowanego [%]", fmt(d.data.sm_osadu_odwwapn, "")],
        ["Opady atmosferyczne", d.data.opady ? "TAK" : "NIE"],
      ],
    },
    layout: "lightHorizontalLines",
    margin: [0, 0, 0, 12],
  };

  const itemsBody: Content[][] = [
    [
      { text: "Lp.", style: "th" },
      { text: "Obiekt", style: "th" },
      { text: "Ocena pracy", style: "th" },
      { text: "Harmonogram", style: "th" },
      { text: "Inne czynności", style: "th" },
    ],
  ];
  d.items.forEach((it, i) => {
    const ocena =
      it.ocena_status === "ok"
        ? { text: "✓ OK", color: "#047857" }
        : {
            stack: [
              { text: "⚠ Problem", color: "#b91c1c", bold: true },
              { text: it.ocena_opis ?? "", italics: true, fontSize: 8 },
            ],
          };
    const harm =
      it.harmonogram_status === "ok"
        ? { text: "✓ Wykonane", color: "#047857" }
        : {
            stack: [
              { text: "✗ Nie wykonano", color: "#b91c1c", bold: true },
              { text: it.harmonogram_opis ?? "", italics: true, fontSize: 8 },
              ...(it.proponowany_termin
                ? [{ text: `Proponowany termin: ${it.proponowany_termin}`, fontSize: 8 }]
                : []),
            ],
          };
    itemsBody.push([
      { text: String(i + 1) },
      { text: it.object_name },
      ocena as Content,
      harm as Content,
      { text: it.inne_czynnosci ?? "—", fontSize: 8 },
    ]);
  });

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [40, 60, 40, 60],
    info: {
      title: `Raport zmianowy ${d.date} (${d.shift})`,
      author: d.operator,
    },
    content: [
      {
        text: "RAPORT ZMIANOWY",
        style: "h1",
        alignment: "center",
      },
      {
        text: "Oczyszczalnia ścieków",
        alignment: "center",
        margin: [0, 0, 0, 12],
        color: "#6b7280",
      },
      {
        columns: [
          { text: [{ text: "Data: ", bold: true }, d.date] },
          { text: [{ text: "Zmiana: ", bold: true }, SHIFT_LABEL[d.shift] ?? d.shift] },
          { text: [{ text: "Operator: ", bold: true }, d.operator] },
        ],
        margin: [0, 0, 0, 12],
      },
      { text: "1. Dane eksploatacyjne", style: "h2" },
      dataRows,
      { text: "2. Ocena obiektów i wykonanie harmonogramu", style: "h2" },
      {
        table: { widths: [20, 110, 90, 130, "*"], body: itemsBody, headerRows: 1 },
        layout: {
          fillColor: (row: number) => (row === 0 ? "#f3f4f6" : null),
        },
      },
      ...(d.data.uwagi
        ? ([
            { text: "3. Uwagi ogólne", style: "h2", margin: [0, 12, 0, 4] },
            { text: d.data.uwagi, italics: true },
          ] as Content[])
        : []),
      {
        margin: [0, 30, 0, 0],
        columns: [
          {
            stack: [
              { text: "_______________________________", margin: [0, 20, 0, 4] },
              { text: `Operator: ${d.operator}`, fontSize: 9 },
              {
                text: `Zapisano: ${new Date(d.submittedAt).toLocaleString("pl-PL")}`,
                fontSize: 8,
                color: "#6b7280",
              },
            ],
          },
          {
            stack: [
              { text: "_______________________________", margin: [0, 20, 0, 4] },
              { text: "Kierownik / data", fontSize: 9 },
            ],
          },
        ],
      },
    ],
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      h2: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
      th: { bold: true, fillColor: "#f3f4f6" },
    },
    defaultStyle: { fontSize: 10 },
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
  const itemsBody: Content[][] = [
    [
      { text: "Lp.", style: "th" },
      { text: "Obiekt", style: "th" },
      { text: "Uwagi przekazującego", style: "th" },
      { text: "Uwagi przyjmującego", style: "th" },
    ],
  ];
  d.items.forEach((it, i) => {
    itemsBody.push([
      { text: String(i + 1) },
      { text: it.object_name },
      { text: it.uwagi_przekazujacego ?? "—" },
      { text: it.uwagi_przyjmujacego ?? "—" },
    ]);
  });

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [40, 60, 40, 60],
    info: { title: `Przekazanie zmiany ${d.date}`, author: d.operatorFrom },
    content: [
      { text: "PROTOKÓŁ PRZEKAZANIA ZMIANY", style: "h1", alignment: "center" },
      {
        text: "Oczyszczalnia ścieków",
        alignment: "center",
        margin: [0, 0, 0, 12],
        color: "#6b7280",
      },
      {
        columns: [
          { text: [{ text: "Data: ", bold: true }, d.date] },
          { text: [{ text: "Przekazujący: ", bold: true }, d.operatorFrom] },
          { text: [{ text: "Przyjmujący: ", bold: true }, d.operatorTo ?? "—"] },
        ],
        margin: [0, 0, 0, 12],
      },
      {
        table: { widths: [20, 110, "*", "*"], body: itemsBody, headerRows: 1 },
        layout: { fillColor: (row: number) => (row === 0 ? "#f3f4f6" : null) },
      },
      ...(d.uwagiOgolne
        ? ([
            { text: "Uwagi ogólne", style: "h2", margin: [0, 12, 0, 4] },
            { text: d.uwagiOgolne, italics: true },
          ] as Content[])
        : []),
      {
        margin: [0, 30, 0, 0],
        columns: [
          {
            stack: [
              { text: "_______________________________", margin: [0, 20, 0, 4] },
              { text: `Przekazujący: ${d.operatorFrom}`, fontSize: 9 },
              {
                text: `Zapisano: ${new Date(d.submittedAt).toLocaleString("pl-PL")}`,
                fontSize: 8,
                color: "#6b7280",
              },
            ],
          },
          {
            stack: [
              { text: "_______________________________", margin: [0, 20, 0, 4] },
              { text: `Przyjmujący: ${d.operatorTo ?? "—"}`, fontSize: 9 },
              {
                text: d.acceptedAt
                  ? `Przyjęte: ${new Date(d.acceptedAt).toLocaleString("pl-PL")}`
                  : "Oczekuje na przyjęcie",
                fontSize: 8,
                color: "#6b7280",
              },
            ],
          },
        ],
      },
    ],
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] },
      h2: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
      th: { bold: true, fillColor: "#f3f4f6" },
    },
    defaultStyle: { fontSize: 10 },
  };

  await downloadPdf(doc, `przekazanie-zmiany-${d.date}.pdf`);
}
