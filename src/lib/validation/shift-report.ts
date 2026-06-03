import { z } from "zod";

const numRequired = (label: string, min = 0, max = 1_000_000_000) =>
  z
    .number({ message: `${label}: wymagane` })
    .min(min, `${label}: nie mniej niż ${min}`)
    .max(max, `${label}: nie więcej niż ${max}`);

export const shiftReportSchema = z
  .object({
    energia_start: numRequired("Energia początkowa"),
    energia_end: numRequired("Energia końcowa"),
    flokulant_proszkowy_kg: numRequired("Flokulant proszkowy"),
    flokulant_emulsyjny_l: numRequired("Flokulant emulsyjny"),
    wapno_kg: numRequired("Wapno"),
    chlorek_zelaza_l: numRequired("Chlorek żelaza"),
    sm_osadu_zageszcz: numRequired("S.M. osadu zagęszczonego", 0, 100),
    sm_osadu_odwwapn: numRequired("S.M. osadu odwodnionego", 0, 100),
    opady: z.boolean(),
    uwagi: z.string().max(2000).optional(),
  })
  .refine((d) => d.energia_end >= d.energia_start, {
    message: "Energia końcowa musi być ≥ energii początkowej",
    path: ["energia_end"],
  })
  .refine((d) => d.energia_end - d.energia_start <= 100_000, {
    message: "Różnica energii wygląda nierealnie (>100 000 kWh)",
    path: ["energia_end"],
  });

export const shiftReportItemSchema = z
  .object({
    object_id: z.string().uuid(),
    ocena_status: z.enum(["ok", "problem"]),
    ocena_opis: z.string().optional(),
    harmonogram_status: z.enum(["ok", "nie_wykonano"]),
    harmonogram_opis: z.string().optional(),
    proponowany_termin: z.string().optional(),
    inne_czynnosci: z.string().optional(),
  })
  .refine((d) => d.ocena_status !== "problem" || (d.ocena_opis ?? "").trim().length >= 10, {
    message: "Przy ocenie „problem” opis musi mieć co najmniej 10 znaków",
    path: ["ocena_opis"],
  })
  .refine(
    (d) =>
      d.harmonogram_status !== "nie_wykonano" ||
      (d.harmonogram_opis ?? "").trim().length >= 10,
    {
      message: "Przy „nie wykonano” opis musi mieć co najmniej 10 znaków",
      path: ["harmonogram_opis"],
    },
  )
  .refine(
    (d) => {
      if (d.harmonogram_status !== "nie_wykonano") return true;
      if (!d.proponowany_termin) return false;
      const t = new Date(d.proponowany_termin);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return !isNaN(t.getTime()) && t >= today;
    },
    { message: "Proponowany termin musi być dziś lub w przyszłości", path: ["proponowany_termin"] },
  );

export type ShiftReportInput = z.infer<typeof shiftReportSchema>;
export type ShiftReportItemInput = z.infer<typeof shiftReportItemSchema>;

export const handoverItemSchema = z.object({
  object_id: z.string().uuid(),
  uwagi_przekazujacego: z
    .string()
    .trim()
    .min(3, "Uwagi: min. 3 znaki (wpisz „brak uwag” jeśli nic do zgłoszenia)"),
});

export type HandoverItemInput = z.infer<typeof handoverItemSchema>;
