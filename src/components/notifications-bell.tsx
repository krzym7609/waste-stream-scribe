import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, AlertTriangle, FileWarning, Clock, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_META: Record<string, { icon: typeof Bell; color: string }> = {
  equipment_breakdown: { icon: AlertTriangle, color: "text-destructive" },
  missing_shift_report: { icon: FileWarning, color: "text-amber-600" },
  overdue_tasks: { icon: Clock, color: "text-amber-600" },
  deferred_tasks: { icon: Clock, color: "text-amber-600" },
};

function routeForKind(kind: string): string {
  switch (kind) {
    case "equipment_breakdown":
      return "/equipment";
    case "missing_shift_report":
      return "/manager/reports";
    case "overdue_tasks":
    case "deferred_tasks":
      return "/schedule/tasks";
    default:
      return "/dashboard";
  }
}

export function NotificationsBell() {
  const { user, isManager } = useAuth();
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_notifications")
        .select("id, kind, title, body, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("shift_notifications_rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_notifications" },
        () => qc.invalidateQueries({ queryKey: ["notifications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("shift_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const ids = items.filter((n) => !n.read_at).map((n) => n.id);
      if (!ids.length) return;
      await supabase
        .from("shift_notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (!isManager) return null;

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Powiadomienia">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px]"
            >
              {unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-medium text-sm">Powiadomienia</div>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={() => markAll.mutate()}>
              <CheckCheck className="w-4 h-4" />
              Oznacz wszystkie
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Brak powiadomień</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const meta = KIND_META[n.kind] ?? { icon: Bell, color: "text-muted-foreground" };
                const Icon = meta.icon;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "p-3 flex gap-3 items-start cursor-pointer hover:bg-accent/50",
                      !n.read_at && "bg-primary/5",
                    )}
                    onClick={() => !n.read_at && markRead.mutate(n.id)}
                  >
                    <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", meta.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{n.body}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {new Date(n.created_at).toLocaleString("pl-PL")}
                      </div>
                    </div>
                    {!n.read_at && <span className="w-2 h-2 rounded-full bg-primary mt-1.5" />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="p-2 border-t text-center">
          <Button variant="link" size="sm" asChild>
            <Link to="/equipment">Przejdź do urządzeń</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
