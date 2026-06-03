// Definicje zmian kalendarzowych (czas lokalny zakładu)
export type ShiftType = "rano" | "popoludnie" | "noc";

export const SHIFT_DEFS: Record<ShiftType, { label: string; startHour: number; endHour: number }> = {
  rano: { label: "Rano", startHour: 6, endHour: 14 },
  popoludnie: { label: "Popołudnie", startHour: 14, endHour: 22 },
  noc: { label: "Noc", startHour: 22, endHour: 6 },
};

export const SHIFT_LABEL: Record<ShiftType, string> = {
  rano: "Rano (06:00–14:00)",
  popoludnie: "Popołudnie (14:00–22:00)",
  noc: "Noc (22:00–06:00)",
};

/** Aktualna zmiana kalendarzowa wg zegara lokalnego. */
export function getCurrentShift(now: Date = new Date()): ShiftType {
  const h = now.getHours();
  if (h >= 6 && h < 14) return "rano";
  if (h >= 14 && h < 22) return "popoludnie";
  return "noc";
}

/** Granice aktualnej zmiany (start, koniec) jako Date. */
export function getCurrentShiftWindow(now: Date = new Date()): { start: Date; end: Date; type: ShiftType } {
  const type = getCurrentShift(now);
  const start = new Date(now);
  const end = new Date(now);
  if (type === "rano") {
    start.setHours(6, 0, 0, 0);
    end.setHours(14, 0, 0, 0);
  } else if (type === "popoludnie") {
    start.setHours(14, 0, 0, 0);
    end.setHours(22, 0, 0, 0);
  } else {
    // noc: 22:00 – 06:00 (przechodzi przez północ)
    if (now.getHours() < 6) {
      start.setDate(start.getDate() - 1);
      start.setHours(22, 0, 0, 0);
      end.setHours(6, 0, 0, 0);
    } else {
      start.setHours(22, 0, 0, 0);
      end.setDate(end.getDate() + 1);
      end.setHours(6, 0, 0, 0);
    }
  }
  return { start, end, type };
}

/** Czy przejęcie dyżuru mieści się w oknie tolerancji (±1h od granic zmiany). */
export function isWithinHandoverWindow(now: Date = new Date()): boolean {
  const { start, end } = getCurrentShiftWindow(now);
  const toleranceMs = 60 * 60 * 1000;
  return now.getTime() >= start.getTime() - toleranceMs && now.getTime() <= end.getTime() + toleranceMs;
}

export function formatHM(d: Date): string {
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}
