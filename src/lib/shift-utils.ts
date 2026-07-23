import { type ShiftType } from "./shifts";

/** Z Date → 'YYYY-MM-DD' wg lokalnej strefy. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nextShift(s: ShiftType): { type: ShiftType; dayOffset: number } {
  // System 2-zmianowy: rano → popoludnie (ten sam dzień), popoludnie → rano (następny dzień).
  // Wartość 'noc' (historyczna) traktujemy jak popoludnie.
  if (s === "rano") return { type: "popoludnie", dayOffset: 0 };
  return { type: "rano", dayOffset: 1 };
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}
