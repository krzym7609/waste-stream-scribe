// System 2 zmian z konfigurowalnymi godzinami (kierownik/zarządca w /settings/shifts).
// Wartość 'noc' pozostaje tylko dla kompatybilności z historycznymi rekordami w bazie.
export type ShiftType = "rano" | "popoludnie" | "noc";

export interface ShiftTimes {
  shift1_start: string; // "HH:MM"
  shift1_end: string;
  shift2_start: string;
  shift2_end: string;
}

export const DEFAULT_SHIFT_TIMES: ShiftTimes = {
  shift1_start: "06:00",
  shift1_end: "14:00",
  shift2_start: "14:00",
  shift2_end: "22:00",
};

let cache: ShiftTimes = { ...DEFAULT_SHIFT_TIMES };
const listeners = new Set<() => void>();

export function setShiftTimesCache(t: ShiftTimes) {
  cache = { ...t };
  listeners.forEach((l) => l());
}
export function getShiftTimes(): ShiftTimes {
  return cache;
}
export function subscribeShiftTimes(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function parseHM(s: string): { h: number; m: number } {
  const [h, m] = s.split(":").map(Number);
  return { h: h ?? 0, m: m ?? 0 };
}
function toMin(s: string): number {
  const { h, m } = parseHM(s);
  return h * 60 + m;
}

/** Bieżąca zmiana (rano/popoludnie) wg godzin z ustawień. */
export function getCurrentShift(now: Date = new Date(), times: ShiftTimes = cache): "rano" | "popoludnie" {
  const cur = now.getHours() * 60 + now.getMinutes();
  const s1s = toMin(times.shift1_start);
  const s1e = toMin(times.shift1_end);
  // Zmiana 1 aktywna w [s1s, s1e); poza tym Zmiana 2.
  if (s1s <= s1e) {
    return cur >= s1s && cur < s1e ? "rano" : "popoludnie";
  }
  // s1 przechodzi przez północ (nietypowe, ale obsłużone)
  return cur >= s1s || cur < s1e ? "rano" : "popoludnie";
}

export function getCurrentShiftWindow(
  now: Date = new Date(),
  times: ShiftTimes = cache,
): { start: Date; end: Date; type: "rano" | "popoludnie" } {
  const type = getCurrentShift(now, times);
  const [sStr, eStr] = type === "rano"
    ? [times.shift1_start, times.shift1_end]
    : [times.shift2_start, times.shift2_end];
  const s = parseHM(sStr);
  const e = parseHM(eStr);
  const start = new Date(now);
  start.setHours(s.h, s.m, 0, 0);
  const end = new Date(now);
  end.setHours(e.h, e.m, 0, 0);
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  // Jeżeli teraz jesteśmy przed start (dot. zmiany 2 wcześnie rano), cofnij o dobę
  if (now.getTime() < start.getTime() - 60 * 60 * 1000) {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  }
  return { start, end, type };
}

export function isWithinHandoverWindow(now: Date = new Date(), times: ShiftTimes = cache): boolean {
  const { start, end } = getCurrentShiftWindow(now, times);
  const tol = 60 * 60 * 1000;
  return now.getTime() >= start.getTime() - tol && now.getTime() <= end.getTime() + tol;
}

export function formatHM(d: Date): string {
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function rangeLabel(a: string, b: string): string {
  return `${a}–${b}`;
}

export const SHIFT_LABEL: Record<ShiftType, string> = new Proxy(
  {} as Record<ShiftType, string>,
  {
    get(_t, key: string) {
      const t = cache;
      if (key === "rano") return `Zmiana 1 (${rangeLabel(t.shift1_start, t.shift1_end)})`;
      if (key === "popoludnie") return `Zmiana 2 (${rangeLabel(t.shift2_start, t.shift2_end)})`;
      if (key === "noc") return `Zmiana 2 (historyczna nocna)`;
      return "";
    },
  },
);

export const SHIFT_DEFS: Record<ShiftType, { label: string }> = new Proxy(
  {} as Record<ShiftType, { label: string }>,
  {
    get(_t, key: string) {
      return { label: SHIFT_LABEL[key as ShiftType] };
    },
    ownKeys() {
      // Ograniczamy iterację do 2 aktywnych zmian (schedule wyświetla wybór)
      return ["rano", "popoludnie"];
    },
    getOwnPropertyDescriptor(_t, key) {
      if (key === "rano" || key === "popoludnie") {
        return { enumerable: true, configurable: true, value: { label: SHIFT_LABEL[key as ShiftType] } };
      }
      return undefined;
    },
  },
);
