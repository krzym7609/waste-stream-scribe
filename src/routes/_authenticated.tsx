import { createFileRoute, Outlet, Navigate, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Droplets, LayoutDashboard, ClipboardList, LogOut, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, loading, signOut, user, isManager } = useAuth();
  const nav = useNavigate();
  const { location } = useRouterState();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Ładowanie…</div>;
  }
  if (!session) return <Navigate to="/auth" />;

  const navItems = [
    { to: "/dashboard", label: "Pulpit", icon: LayoutDashboard },
    { to: "/shifts", label: "Zmiany", icon: ClipboardList },
    ...(isManager ? [{ to: "/team", label: "Zespół", icon: Users }] : []),
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r bg-card flex flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
            <Droplets className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-semibold text-sm">Oczyszczalnia</div>
            <div className="text-xs text-muted-foreground">Panel zmianowy</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <div className="text-xs text-muted-foreground truncate mb-2">{user?.email}</div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={async () => {
              await signOut();
              nav({ to: "/auth" });
            }}
          >
            <LogOut className="w-4 h-4" />
            Wyloguj
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
