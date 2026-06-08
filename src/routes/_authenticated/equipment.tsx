import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, FileText, Image as ImageIcon, FileSearch, Wrench, Download, Search, Settings, AlertTriangle, History, CheckCircle2, Droplet, ClipboardCheck, ListFilter } from "lucide-react";

export const Route = createFileRoute("/_authenticated/equipment")({
  head: () => ({ meta: [{ title: "Urządzenia" }] }),
  component: EquipmentPage,
});

type Category = { id: string; name: string; sort_order: number };
type Equipment = {
  id: string;
  category_id: string | null;
  name: string;
  code: string | null;
  location: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  installed_at: string | null;
  notes: string | null;
  active: boolean;
  status: "sprawne" | "awaria" | "serwis";
};
type AttachmentKind = "documentation" | "photo" | "schema" | "service";
type Attachment = {
  id: string;
  equipment_id: string;
  kind: AttachmentKind;
  file_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

type EventKind = "awaria" | "naprawa" | "serwis" | "przeglad" | "inne";
type EquipmentEvent = {
  id: string;
  equipment_id: string;
  kind: EventKind;
  title: string | null;
  description: string | null;
  performed_at: string;
  created_by: string | null;
  created_at: string;
};

const EVENT_LABELS: Record<EventKind, string> = {
  awaria: "Awaria",
  naprawa: "Naprawa",
  serwis: "Serwis",
  przeglad: "Przegląd",
  inne: "Inne",
};
const EVENT_ICONS: Record<EventKind, React.ComponentType<{ className?: string }>> = {
  awaria: AlertTriangle,
  naprawa: CheckCircle2,
  serwis: Droplet,
  przeglad: ClipboardCheck,
  inne: History,
};

const KIND_LABELS: Record<AttachmentKind, string> = {
  documentation: "Dokumentacja",
  photo: "Zdjęcia",
  schema: "Schematy",
  service: "Inne / serwisowe",
};
const KIND_ICONS: Record<AttachmentKind, React.ComponentType<{ className?: string }>> = {
  documentation: FileText,
  photo: ImageIcon,
  schema: FileSearch,
  service: Wrench,
};

function EquipmentPage() {
  const { isManager, user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [selectedEq, setSelectedEq] = useState<Equipment | null>(null);
  const [editEq, setEditEq] = useState<Equipment | null>(null);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [showNewEq, setShowNewEq] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [breakdownFor, setBreakdownFor] = useState<Equipment | null>(null);
  const [repairFor, setRepairFor] = useState<Equipment | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: cats }, { data: eq }] = await Promise.all([
      supabase.from("equipment_categories").select("*").order("sort_order"),
      supabase.from("equipment").select("*").order("name"),
    ]);
    setCategories((cats ?? []) as Category[]);
    setEquipment((eq ?? []) as Equipment[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipment.filter((e) => {
      if (filterCat !== "all" && e.category_id !== filterCat) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.code ?? "").toLowerCase().includes(q) ||
        (e.location ?? "").toLowerCase().includes(q) ||
        (e.manufacturer ?? "").toLowerCase().includes(q) ||
        (e.model ?? "").toLowerCase().includes(q)
      );
    });
  }, [equipment, filterCat, search]);

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Baza urządzeń</h1>
          <p className="text-sm text-muted-foreground">
            Ewidencja urządzeń oczyszczalni z dokumentacją, zdjęciami i schematami.
          </p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowNewCat(true)}>
              <Settings className="w-4 h-4" /> Kategorie
            </Button>
            <Button onClick={() => setShowNewEq(true)}>
              <Plus className="w-4 h-4" /> Dodaj urządzenie
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px]">
              <Label className="text-xs">Szukaj</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Nazwa, kod, lokalizacja, producent…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="min-w-[200px]">
              <Label className="text-xs">Kategoria</Label>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground text-sm">Ładowanie…</div>
          ) : filtered.length === 0 ? (
            <div className="text-muted-foreground text-sm py-8 text-center">
              Brak urządzeń. {isManager && "Kliknij Dodaj urządzenie, aby utworzyć pierwsze."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Kod</TableHead>
                  <TableHead>Kategoria</TableHead>
                  <TableHead>Lokalizacja</TableHead>
                  <TableHead>Producent / model</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[160px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-muted-foreground">{e.code ?? "—"}</TableCell>
                    <TableCell>{catName(e.category_id)}</TableCell>
                    <TableCell>{e.location ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {[e.manufacturer, e.model].filter(Boolean).join(" / ") || "—"}
                    </TableCell>
                    <TableCell>
                      {e.status === "awaria" ? (
                        <Badge variant="destructive">Awaria</Badge>
                      ) : e.status === "serwis" ? (
                        <Badge className="bg-amber-600">Serwis</Badge>
                      ) : e.active ? (
                        <Badge variant="secondary">Sprawne</Badge>
                      ) : (
                        <Badge variant="outline">Wyłączone</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedEq(e)}>Szczegóły</Button>
                      {isManager && (
                        <>
                          {e.status !== "awaria" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setBreakdownFor(e)}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" /> Zgłoś awarię
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRepairFor(e)}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Oznacz sprawne
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setEditEq(e)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedEq && (
        <EquipmentDetailsDialog
          equipment={selectedEq}
          categoryName={catName(selectedEq.category_id)}
          userId={user?.id ?? null}
          isManager={isManager}
          onClose={() => setSelectedEq(null)}
        />
      )}

      {(showNewEq || editEq) && (
        <EquipmentFormDialog
          equipment={editEq}
          categories={categories}
          onClose={() => {
            setShowNewEq(false);
            setEditEq(null);
          }}
          onSaved={() => {
            setShowNewEq(false);
            setEditEq(null);
            load();
          }}
        />
      )}

      {(showNewCat || editCat) && (
        <CategoryManagerDialog
          categories={categories}
          onClose={() => {
            setShowNewCat(false);
            setEditCat(null);
          }}
          onSaved={load}
        />
      )}

      {breakdownFor && (
        <EquipmentEventDialog
          equipment={breakdownFor}
          userId={user?.id ?? null}
          fixedKind="awaria"
          title="Zgłoś awarię"
          description="Opisz objawy awarii. Powiadomienie zostanie wysłane do kierownika."
          afterSave={async (eqId) => {
            const { error } = await supabase
              .from("equipment")
              .update({ status: "awaria" })
              .eq("id", eqId);
            if (error) toast.error(error.message);
            else toast.success("Zgłoszono awarię");
            setBreakdownFor(null);
            load();
          }}
          onClose={() => setBreakdownFor(null)}
        />
      )}

      {repairFor && (
        <EquipmentEventDialog
          equipment={repairFor}
          userId={user?.id ?? null}
          fixedKind="naprawa"
          title="Oznacz jako sprawne"
          description="Opisz wykonaną naprawę. Wpis trafi do historii urządzenia."
          afterSave={async (eqId) => {
            const { error } = await supabase
              .from("equipment")
              .update({ status: "sprawne" })
              .eq("id", eqId);
            if (error) toast.error(error.message);
            else toast.success("Oznaczono jako sprawne");
            setRepairFor(null);
            load();
          }}
          onClose={() => setRepairFor(null)}
        />
      )}
    </div>
  );
}

function EquipmentFormDialog({
  equipment,
  categories,
  onClose,
  onSaved,
}: {
  equipment: Equipment | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [categoryId, setCategoryId] = useState<string | "none">(equipment?.category_id ?? "none");
  const [active, setActive] = useState(equipment?.active ?? true);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name")).trim(),
      code: String(fd.get("code") ?? "").trim() || null,
      location: String(fd.get("location") ?? "").trim() || null,
      manufacturer: String(fd.get("manufacturer") ?? "").trim() || null,
      model: String(fd.get("model") ?? "").trim() || null,
      serial_number: String(fd.get("serial_number") ?? "").trim() || null,
      installed_at: String(fd.get("installed_at") ?? "") || null,
      notes: String(fd.get("notes") ?? "").trim() || null,
      category_id: categoryId === "none" ? null : categoryId,
      active,
    };
    try {
      if (equipment) {
        const { error } = await supabase.from("equipment").update(payload).eq("id", equipment.id);
        if (error) throw error;
        toast.success("Zaktualizowano urządzenie");
      } else {
        const { error } = await supabase.from("equipment").insert(payload);
        if (error) throw error;
        toast.success("Dodano urządzenie");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!equipment) return;
    if (!confirm(`Usunąć urządzenie „${equipment.name}"? Załączniki też zostaną usunięte.`)) return;
    setBusy(true);
    const { error } = await supabase.from("equipment").delete().eq("id", equipment.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Usunięto urządzenie");
      onSaved();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{equipment ? "Edytuj urządzenie" : "Nowe urządzenie"}</DialogTitle>
          <DialogDescription>Dane podstawowe oraz parametry serwisowe.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Nazwa *</Label>
            <Input name="name" defaultValue={equipment?.name ?? ""} required />
          </div>
          <div>
            <Label>Kod</Label>
            <Input name="code" defaultValue={equipment?.code ?? ""} placeholder="np. P-01" />
          </div>
          <div>
            <Label>Kategoria</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v as string)}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— brak —</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Lokalizacja</Label>
            <Input name="location" defaultValue={equipment?.location ?? ""} placeholder="np. Hala dmuchaw" />
          </div>
          <div>
            <Label>Producent</Label>
            <Input name="manufacturer" defaultValue={equipment?.manufacturer ?? ""} />
          </div>
          <div>
            <Label>Model</Label>
            <Input name="model" defaultValue={equipment?.model ?? ""} />
          </div>
          <div>
            <Label>Nr seryjny</Label>
            <Input name="serial_number" defaultValue={equipment?.serial_number ?? ""} />
          </div>
          <div>
            <Label>Data instalacji</Label>
            <Input type="date" name="installed_at" defaultValue={equipment?.installed_at ?? ""} />
          </div>
          <div className="col-span-2">
            <Label>Notatki</Label>
            <Textarea name="notes" defaultValue={equipment?.notes ?? ""} rows={3} />
          </div>
          <label className="col-span-2 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Aktywne
          </label>
          <DialogFooter className="col-span-2">
            {equipment && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={busy}>
                <Trash2 className="w-4 h-4" /> Usuń
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Anuluj
            </Button>
            <Button type="submit" disabled={busy}>{busy ? "Zapisywanie…" : "Zapisz"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryManagerDialog({
  categories,
  onClose,
  onSaved,
}: {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(100);

  async function addCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("equipment_categories")
      .insert({ name: name.trim(), sort_order: sortOrder });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Dodano kategorię");
      setName("");
      onSaved();
    }
  }

  async function removeCategory(id: string) {
    if (!confirm("Usunąć kategorię? Urządzenia zostaną odpięte (pole kategorii puste).")) return;
    const { error } = await supabase.from("equipment_categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Usunięto");
      onSaved();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kategorie urządzeń</DialogTitle>
          <DialogDescription>Zarządzaj kategoriami używanymi do grupowania.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[280px] overflow-auto">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between border rounded px-3 py-2">
              <div>
                <div className="font-medium text-sm">{c.name}</div>
                <div className="text-xs text-muted-foreground">Sort: {c.sort_order}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeCategory(c.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <form onSubmit={addCategory} className="border-t pt-4 grid grid-cols-3 gap-2 items-end">
          <div className="col-span-2">
            <Label className="text-xs">Nowa kategoria</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa" />
          </div>
          <div>
            <Label className="text-xs">Sort</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>
          <Button type="submit" disabled={busy} className="col-span-3">
            <Plus className="w-4 h-4" /> Dodaj kategorię
          </Button>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Zamknij</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EquipmentDetailsDialog({
  equipment,
  categoryName,
  userId,
  isManager,
  onClose,
}: {
  equipment: Equipment;
  categoryName: string;
  userId: string | null;
  isManager: boolean;
  onClose: () => void;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AttachmentKind>("documentation");
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("equipment_attachments")
      .select("*")
      .eq("equipment_id", equipment.id)
      .order("uploaded_at", { ascending: false });
    setAttachments((data ?? []) as Attachment[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [equipment.id]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const path = `${equipment.id}/${tab}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? "." + ext : ""}`;
      const { error: upErr } = await supabase.storage.from("equipment-files").upload(path, file);
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("equipment_attachments").insert({
        equipment_id: equipment.id,
        kind: tab,
        file_path: path,
        original_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: userId,
      });
      if (dbErr) throw dbErr;
      toast.success("Załącznik dodany");
      e.target.value = "";
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd uploadu");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(att: Attachment) {
    const { data, error } = await supabase.storage
      .from("equipment-files")
      .createSignedUrl(att.file_path, 60);
    if (error || !data) {
      toast.error(error?.message ?? "Nie udało się wygenerować linku");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function handleDelete(att: Attachment) {
    if (!confirm(`Usunąć załącznik „${att.original_name}"?`)) return;
    await supabase.storage.from("equipment-files").remove([att.file_path]);
    const { error } = await supabase.from("equipment_attachments").delete().eq("id", att.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Usunięto");
      load();
    }
  }

  const grouped = useMemo(() => {
    const g: Record<AttachmentKind, Attachment[]> = {
      documentation: [],
      photo: [],
      schema: [],
      service: [],
    };
    attachments.forEach((a) => g[a.kind].push(a));
    return g;
  }, [attachments]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{equipment.name}</DialogTitle>
          <DialogDescription>
            {equipment.code && <span>Kod: <b>{equipment.code}</b> · </span>}
            Kategoria: <b>{categoryName}</b>
            {equipment.location && <span> · Lokalizacja: <b>{equipment.location}</b></span>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm border rounded-md p-3 bg-muted/30">
          <div><span className="text-muted-foreground">Producent:</span> {equipment.manufacturer ?? "—"}</div>
          <div><span className="text-muted-foreground">Model:</span> {equipment.model ?? "—"}</div>
          <div><span className="text-muted-foreground">Nr seryjny:</span> {equipment.serial_number ?? "—"}</div>
          <div><span className="text-muted-foreground">Data instalacji:</span> {equipment.installed_at ?? "—"}</div>
          {equipment.notes && (
            <div className="col-span-2 mt-1">
              <div className="text-muted-foreground">Notatki:</div>
              <div className="whitespace-pre-wrap">{equipment.notes}</div>
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as AttachmentKind)}>
          <TabsList className="grid grid-cols-4 w-full">
            {(Object.keys(KIND_LABELS) as AttachmentKind[]).map((k) => {
              const Icon = KIND_ICONS[k];
              return (
                <TabsTrigger key={k} value={k}>
                  <Icon className="w-3.5 h-3.5" /> {KIND_LABELS[k]} ({grouped[k].length})
                </TabsTrigger>
              );
            })}
          </TabsList>
          {(Object.keys(KIND_LABELS) as AttachmentKind[]).map((k) => (
            <TabsContent key={k} value={k} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{KIND_LABELS[k]}</div>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleUpload}
                    disabled={uploading || tab !== k}
                  />
                  <Button asChild size="sm" disabled={uploading} type="button">
                    <span><Plus className="w-3.5 h-3.5" /> {uploading ? "Wysyłanie…" : "Dodaj plik"}</span>
                  </Button>
                </label>
              </div>
              {loading ? (
                <div className="text-sm text-muted-foreground">Ładowanie…</div>
              ) : grouped[k].length === 0 ? (
                <div className="text-sm text-muted-foreground border rounded p-4 text-center">Brak plików.</div>
              ) : (
                <div className="space-y-1">
                  {grouped[k].map((a) => (
                    <div key={a.id} className="flex items-center justify-between border rounded px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.original_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.mime_type ?? "—"} · {a.size_bytes ? `${Math.round(a.size_bytes / 1024)} kB` : ""}
                          {" · "}
                          {new Date(a.uploaded_at).toLocaleString("pl-PL")}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(a)}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        {(isManager || a.uploaded_by === userId) && (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(a)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>

        <EquipmentTimeline equipmentId={equipment.id} userId={userId} isManager={isManager} />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Zamknij</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EquipmentTimeline({
  equipmentId,
  userId,
  isManager,
}: {
  equipmentId: string;
  userId: string | null;
  isManager: boolean;
}) {
  const [events, setEvents] = useState<EquipmentEvent[]>([]);
  const [eventAtts, setEventAtts] = useState<Record<string, Attachment[]>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const ALL_KINDS: EventKind[] = ["awaria", "naprawa", "serwis", "przeglad", "inne"];
  const [selectedKinds, setSelectedKinds] = useState<EventKind[]>([...ALL_KINDS]);
  const [groupByStatus, setGroupByStatus] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: evs }, { data: atts }] = await Promise.all([
      supabase
        .from("equipment_events")
        .select("*")
        .eq("equipment_id", equipmentId)
        .order("performed_at", { ascending: false }),
      supabase
        .from("equipment_attachments")
        .select("*")
        .eq("equipment_id", equipmentId)
        .not("event_id", "is", null),
    ]);
    setEvents((evs ?? []) as EquipmentEvent[]);
    const grouped: Record<string, Attachment[]> = {};
    ((atts ?? []) as Attachment[]).forEach((a) => {
      const k = (a as Attachment & { event_id: string | null }).event_id;
      if (!k) return;
      (grouped[k] ||= []).push(a);
    });
    setEventAtts(grouped);
    setLoading(false);
  }

  useEffect(() => { load(); }, [equipmentId]);

  async function openFile(att: Attachment) {
    const { data, error } = await supabase.storage
      .from("equipment-files")
      .createSignedUrl(att.file_path, 60);
    if (error || !data) toast.error(error?.message ?? "Błąd");
    else window.open(data.signedUrl, "_blank");
  }

  async function handleDelete(ev: EquipmentEvent) {
    if (!confirm("Usunąć wpis z historii? (Załączniki zostaną usunięte)")) return;
    const atts = eventAtts[ev.id] ?? [];
    if (atts.length) {
      await supabase.storage.from("equipment-files").remove(atts.map((a) => a.file_path));
    }
    const { error } = await supabase.from("equipment_events").delete().eq("id", ev.id);
    if (error) toast.error(error.message);
    else { toast.success("Usunięto"); load(); }
  }

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm flex items-center gap-2">
          <History className="w-4 h-4" /> Historia serwisowa ({events.length})
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="w-3.5 h-3.5" /> Dodaj wpis
        </Button>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Ładowanie…</div>
      ) : events.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded p-4 text-center">
          Brak wpisów. Dodaj wymianę oleju, przegląd lub naprawę.
        </div>
      ) : (
        <ol className="relative border-l ml-2 space-y-3">
          {events.map((ev) => {
            const Icon = EVENT_ICONS[ev.kind];
            const color =
              ev.kind === "awaria" ? "bg-destructive text-destructive-foreground" :
              ev.kind === "naprawa" ? "bg-emerald-600 text-white" :
              ev.kind === "serwis" ? "bg-blue-600 text-white" :
              ev.kind === "przeglad" ? "bg-amber-600 text-white" :
              "bg-muted text-foreground";
            return (
              <li key={ev.id} className="ml-4">
                <span className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ${color}`}>
                  <Icon className="w-3 h-3" />
                </span>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {EVENT_LABELS[ev.kind]}{ev.title ? ` — ${ev.title}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(ev.performed_at).toLocaleString("pl-PL")}
                    </div>
                    {ev.description && (
                      <div className="text-sm whitespace-pre-wrap mt-1">{ev.description}</div>
                    )}
                    {(eventAtts[ev.id]?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {eventAtts[ev.id]!.map((a) => {
                          const isImg = (a.mime_type ?? "").startsWith("image/");
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => openFile(a)}
                              className="inline-flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-muted"
                              title={a.original_name}
                            >
                              {isImg ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                              <span className="max-w-[160px] truncate">{a.original_name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {(isManager || ev.created_by === userId) && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(ev)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {adding && (
        <EquipmentEventDialog
          equipment={{ id: equipmentId, name: "" } as Equipment}
          userId={userId}
          title="Dodaj wpis serwisowy"
          description="Wymiana oleju, przegląd, naprawa itp."
          afterSave={() => { setAdding(false); load(); }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function EquipmentEventDialog({
  equipment,
  userId,
  fixedKind,
  title,
  description,
  afterSave,
  onClose,
}: {
  equipment: Equipment;
  userId: string | null;
  fixedKind?: EventKind;
  title: string;
  description?: string;
  afterSave: (equipmentId: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<EventKind>(fixedKind ?? "serwis");
  const [titleVal, setTitleVal] = useState("");
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [performedAt, setPerformedAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: inserted, error } = await supabase
        .from("equipment_events")
        .insert({
          equipment_id: equipment.id,
          kind,
          title: titleVal.trim() || null,
          description: desc.trim() || null,
          performed_at: new Date(performedAt).toISOString(),
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (files.length > 0 && inserted) {
        for (const file of files) {
          const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
          const path = `${equipment.id}/event/${inserted.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? "." + ext : ""}`;
          const { error: upErr } = await supabase.storage.from("equipment-files").upload(path, file);
          if (upErr) throw upErr;
          const isImage = (file.type || "").startsWith("image/");
          const { error: dbErr } = await supabase.from("equipment_attachments").insert({
            equipment_id: equipment.id,
            event_id: inserted.id,
            kind: isImage ? "photo" : "service",
            file_path: path,
            original_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
            uploaded_by: userId,
          });
          if (dbErr) throw dbErr;
        }
      }

      toast.success("Dodano wpis");
      await afterSave(equipment.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!fixedKind && (
            <div>
              <Label>Rodzaj wpisu</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as EventKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(EVENT_LABELS) as EventKind[]).map((k) => (
                    <SelectItem key={k} value={k}>{EVENT_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Tytuł (opcjonalnie)</Label>
            <Input
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              placeholder={kind === "serwis" ? "np. Wymiana oleju" : "Krótki nagłówek"}
            />
          </div>
          <div>
            <Label>Opis {fixedKind === "awaria" ? "awarii" : ""}</Label>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              placeholder={
                fixedKind === "awaria"
                  ? "Objawy, okoliczności wystąpienia awarii…"
                  : fixedKind === "naprawa"
                  ? "Co zostało wykonane, użyte części…"
                  : "Szczegóły wykonanej czynności"
              }
              required={fixedKind === "awaria"}
            />
          </div>
          <div>
            <Label>Data i czas</Label>
            <Input
              type="datetime-local"
              value={performedAt}
              onChange={(e) => setPerformedAt(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Zdjęcia / pliki (opcjonalnie)</Label>
            <Input
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                Wybrano: {files.map((f) => f.name).join(", ")}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Anuluj</Button>
            <Button type="submit" disabled={busy}>{busy ? "Zapisywanie…" : "Zapisz"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
