import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { createEmployee, resetEmployeePassword } from "@/lib/employees.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, KeyRound, Copy, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Zespół" }] }),
  component: TeamPage,
});

type Row = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  must_change_password: boolean;
  role?: string;
};

function TeamPage() {
  const { isManager, isAdmin } = useAuth();
  const create = useServerFn(createEmployee);
  const reset = useServerFn(resetEmployeePassword);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string; full_name: string } | null>(null);

  async function load() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, username, phone, must_change_password")
      .order("last_name", { ascending: true });
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const map = new Map<string, string>();
    (roles ?? []).forEach((r) => map.set(r.user_id, r.role));
    setRows((profiles ?? []).map((p) => ({ ...(p as Row), role: map.get(p.id) })));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (!isManager) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4" /> Brak dostępu — tylko kierownik lub administrator.
        </div>
      </div>
    );
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const result = await create({
        data: {
          first_name: String(fd.get("first_name")),
          last_name: String(fd.get("last_name")),
          phone: String(fd.get("phone") ?? "") || null,
          role: String(fd.get("role") ?? "operator") as "operator" | "kierownik" | "admin",
        },
      });
      setShowCreate(false);
      setCredentials({ username: result.username, password: result.password, full_name: result.full_name });
      toast.success("Konto utworzone");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Błąd tworzenia konta");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(row: Row) {
    if (!confirm(`Zresetować hasło dla ${row.first_name} ${row.last_name}?`)) return;
    try {
      const { password } = await reset({ data: { user_id: row.id } });
      setCredentials({
        username: row.username ?? "",
        password,
        full_name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
      });
      toast.success("Hasło zresetowane");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Błąd resetu hasła");
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Zespół</h1>
          <p className="text-sm text-muted-foreground">Zarządzanie kontami pracowników</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <UserPlus className="w-4 h-4" /> Dodaj pracownika
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwisko i imię</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Rola</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Ładowanie…</TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Brak pracowników</TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.last_name} {r.first_name}</TableCell>
                  <TableCell><code className="text-sm">{r.username ?? "—"}</code></TableCell>
                  <TableCell>{r.phone ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{r.role ?? "—"}</Badge></TableCell>
                  <TableCell>
                    {r.must_change_password ? (
                      <Badge variant="outline" className="text-amber-600 border-amber-600">Wymaga zmiany hasła</Badge>
                    ) : (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-600">Aktywne</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => handleReset(r)}>
                      <KeyRound className="w-3.5 h-3.5" /> Resetuj hasło
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy pracownik</DialogTitle>
            <DialogDescription>
              Login zostanie wygenerowany automatycznie (np. „jkowalski"). Hasło 8-znakowe pojawi się po utworzeniu konta — przekaż je pracownikowi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first_name">Imię</Label>
                <Input id="first_name" name="first_name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nazwisko</Label>
                <Input id="last_name" name="last_name" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon (opcjonalnie)</Label>
              <Input id="phone" name="phone" type="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rola</Label>
              <Select name="role" defaultValue="operator">
                <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operator</SelectItem>
                  {isAdmin && <SelectItem value="kierownik">Kierownik</SelectItem>}
                  {isAdmin && <SelectItem value="admin">Administrator</SelectItem>}
                </SelectContent>
              </Select>
              {!isAdmin && (
                <p className="text-xs text-muted-foreground">Kierownik może dodawać tylko operatorów.</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Anuluj</Button>
              <Button type="submit" disabled={busy}>{busy ? "Tworzenie…" : "Utwórz konto"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!credentials} onOpenChange={(o) => !o && setCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dane logowania</DialogTitle>
            <DialogDescription>
              Przekaż te dane pracownikowi — <strong>nie będą później widoczne</strong>. Pracownik zostanie poproszony o zmianę hasła przy pierwszym logowaniu.
            </DialogDescription>
          </DialogHeader>
          {credentials && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">Pracownik: <strong>{credentials.full_name}</strong></div>
              <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                <Label>Login</Label>
                <Input readOnly value={credentials.username} className="font-mono" />
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(credentials.username); toast.success("Skopiowano"); }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Label>Hasło</Label>
                <Input readOnly value={credentials.password} className="font-mono" />
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(credentials.password); toast.success("Skopiowano"); }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredentials(null)}>Zamknij</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
