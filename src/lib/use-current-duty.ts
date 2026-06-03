import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ShiftType } from "./shifts";

export interface DutySession {
  id: string;
  user_id: string;
  shift_type: ShiftType;
  started_at: string;
  ended_at: string | null;
  start_note: string | null;
  outside_window: boolean;
}

export interface DutyOperator {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

export interface CurrentDuty {
  session: DutySession | null;
  operator: DutyOperator | null;
}

async function fetchCurrentDuty(): Promise<CurrentDuty> {
  const { data: session } = await supabase
    .from("duty_sessions")
    .select("id, user_id, shift_type, started_at, ended_at, start_note, outside_window")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return { session: null, operator: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, username")
    .eq("id", session.user_id)
    .maybeSingle();

  return { session: session as DutySession, operator: profile as DutyOperator | null };
}

export function useCurrentDuty() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["current-duty"],
    queryFn: fetchCurrentDuty,
    refetchInterval: 60_000, // odświeżanie co minutę (zegar belki też)
  });

  useEffect(() => {
    const ch = supabase.channel(`duty-sessions-rt-${Math.random().toString(36).slice(2)}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "duty_sessions" }, () => {
      qc.invalidateQueries({ queryKey: ["current-duty"] });
    }).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return q;
}
