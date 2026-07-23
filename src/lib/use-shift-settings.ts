import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SHIFT_TIMES, setShiftTimesCache, type ShiftTimes } from "./shifts";

async function fetchShiftSettings(): Promise<ShiftTimes> {
  const { data } = await supabase
    .from("shift_settings" as any)
    .select("shift1_start, shift1_end, shift2_start, shift2_end")
    .eq("id", 1)
    .maybeSingle();
  const row: any = data;
  const times: ShiftTimes = row
    ? {
        shift1_start: (row.shift1_start ?? DEFAULT_SHIFT_TIMES.shift1_start).slice(0, 5),
        shift1_end: (row.shift1_end ?? DEFAULT_SHIFT_TIMES.shift1_end).slice(0, 5),
        shift2_start: (row.shift2_start ?? DEFAULT_SHIFT_TIMES.shift2_start).slice(0, 5),
        shift2_end: (row.shift2_end ?? DEFAULT_SHIFT_TIMES.shift2_end).slice(0, 5),
      }
    : DEFAULT_SHIFT_TIMES;
  setShiftTimesCache(times);
  return times;
}

export function useShiftSettings() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["shift-settings"],
    queryFn: fetchShiftSettings,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`shift-settings-rt-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_settings" }, () => {
        qc.invalidateQueries({ queryKey: ["shift-settings"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return q;
}
