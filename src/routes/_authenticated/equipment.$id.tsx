import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AttachmentPreviewDialog, type PreviewAttachment } from "@/components/attachment-preview";
import {
  Plus, Trash2, FileText, Image as ImageIcon, FileSearch, Wrench, Download, Eye,
  AlertTriangle, History, CheckCircle2, Droplet, ClipboardCheck, ListFilter,
  ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/equipment/$id")({
  head: () => ({ meta: [{ title: "Urządzenie" }] }),
  component: EquipmentDetailsPage,
});

type Category = { id: string; name: string };
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
  event_id?: string | null;
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
  awaria: "Awaria", naprawa: "Naprawa", serwis: "Serwis", przeglad: "Przegląd", inne: "Inne",
};
const EVENT_ICONS: Record<EventKind, React.ComponentType<{ className?: string }>> = {
  awaria: AlertTriangle, naprawa: CheckCircle2, serwis: Droplet, przeglad: ClipboardCheck, inne: History,
};
const KIND_LABELS: Record<AttachmentKind, string> = {
  documentation: "Dokumentacja", photo: "Zdjęcia", schema: "Schematy", service: "Inne / serwisowe",
};
const KIND_ICONS: Record<AttachmentKind, React.ComponentType<{ className?: string }>> = {
  documentation: FileText, photo: ImageIcon, schema: FileSearch, service: Wrench,
};

function EquipmentDetailsPage() {
  const { id } = Route.useParams();
  const { isManager, user } = useAuth();
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [breakdown, setBreakdown] = useState(false);
  const [repair, setRepair] = useState(false);

  async function load() {
    setLoading(true);
    const { data: eq, error } = await supabase.from("equipment").select("*").eq("id", id).maybeSingle();
    if (error) toast.error(error.message);
    setEquipment((eq ?? null) as Equipment | null);
    if (eq?.category_id) {
      const { data: c } = await supabase.from("equipment_categories").select("id, name").eq("id", eq.category_id).maybeSingle();
      setCategory((c ?? null) as Category | null);
    } else setCategory(null);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="p-6 text-muted-foreground">Ładowanie…</div>;
  if (!equipment) return (
    <div className="p-6 space-y-3">
      <Button variant="outline" asChild><Link to="/equipment"><ArrowLeft className="w-4 h-4" /> Wróć</Link></Button>
      <div className="text-muted-foreground">Nie znaleziono urządzenia.</div>
    </div>
  );

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link to="/equipment"><ArrowLeft className="w-4 h-4" /> Lista urządzeń</Link>
          </Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {equipment.name}
            {equipment.status === "awaria" ? <Badge variant="destructive">Awaria</Badge>
              : equipment.status === "serwis" ? <Badge className="bg-amber-600">Serwis</Badge>
              : equipment.active ? <Badge variant="secondary">Sprawne</Badge>
              : <Badge variant="outline">Wyłączone</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {equipment.code && <>Kod: <b>{equipment.code}</b> · </>}
            Kategoria: <b>{category?.name ?? "—"}</b>
            {equipment.location && <> · Lokalizacja: <b>{equipment.location}</b></>}
          </p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            {equipment.status !== "awaria" ? (
              <Button variant="destructive" onClick={() => setBreakdown(true)}>
                <AlertTriangle className="w-4 h-4" /> Zgłoś awarię
              </Button>
            ) : (
              <Button onClick={() => setRepair(true)}>
                <CheckCircle2 className="w-4 h-4" /> Oznacz sprawne
              </Button>
            )}
          </div>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dane podstawowe</CardTitle></CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><span className="text-muted-foreground">Producent:</span> {equipment.manufacturer ?? "—"}</div>
            <div><span className="text-muted-foreground">Model:</span> {equipment.model ?? "—"}</div>
            <div><span className="text-muted-foreground">Nr seryjny:</span> {equipment.serial_number ?? "—"}</div>
            <div><span className="text-muted-foreground">Data instalacji:</span> {equipment.installed_at ?? "—"}</div>
            {equipment.notes && (
              <div className="sm:col-span-2 mt-1">
                <div className="text-muted-foreground">Notatki:</div>
                <div className="whitespace-pre-wrap">{equipment.notes}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pliki i dokumentacja</CardTitle>
          <CardDescription>Dokumentacja, zdjęcia, schematy i inne pliki serwisowe.</CardDescription>
        </CardHeader>
        <CardContent>
          <AttachmentsPanel equipmentId={equipment.id} userId={user?.id ?? null} isManager={isManager} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historia serwisowa</CardTitle>
          <CardDescription>Awarie, naprawy, serwisy i przeglądy.</CardDescription>
        </CardHeader>
        <CardContent>
          <EquipmentTimeline equipmentId={equipment.id} userId={user?.id ?? null} isManager={isManager} />
        </CardContent>
      </Card>

      {breakdown && (
        <EquipmentEventDialog
          equipmentId={equipment.id}
          userId={user?.id ?? null}
          fixedKind="awaria"
          title="Zgłoś awarię"
          description="Opisz objawy awarii. Powiadomienie zostanie wysłane do kierownika."
          afterSave={async () => {
            const { error } = await supabase.from("equipment").update({ status: "awaria" }).eq("id", equipment.id);
            if (error) toast.error(error.message); else toast.success("Zgłoszono awarię");
            setBreakdown(false); load();
          }}
          onClose={() => setBreakdown(false)}
        />
      )}
      {repair && (
        <EquipmentEventDialog
          equipmentId={equipment.id}
          userId={user?.id ?? null}
          fixedKind="naprawa"
          title="Oznacz jako sprawne"
          description="Opisz wykonaną naprawę. Wpis trafi do historii urządzenia."
          afterSave={async () => {
            const { error } = await supabase.from("equipment").update({ status: "sprawne" }).eq("id", equipment.id);
            if (error) toast.error(error.message); else toast.success("Oznaczono jako sprawne");
            setRepair(false); load();
          }}
          onClose={() => setRepair(false)}
        />
      )}
    </div>
  );
}

function AttachmentsPanel({ equipmentId, userId, isManager }: { equipmentId: string; userId: string | null; isManager: boolean }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AttachmentKind>("documentation");
  const [uploading, setUploading] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<PreviewAttachment | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("equipment_attachments")
      .select("*")
      .eq("equipment_id", equipmentId)
      .is("event_id", null)
      .order("uploaded_at", { ascending: false });
    setAttachments((data ?? []) as Attachment[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [equipmentId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
      const path = `${equipmentId}/${tab}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? "." + ext : ""}`;
      const { error: upErr } = await supabase.storage.from("equipment-files").upload(path, file);
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("equipment_attachments").insert({
        equipment_id: equipmentId, kind: tab, file_path: path,
        original_name: file.name, mime_type: file.type || null, size_bytes: file.size, uploaded_by: userId,
      });
      if (dbErr) throw dbErr;
      toast.success("Załącznik dodany");
      e.target.value = "";
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd uploadu");
    } finally { setUploading(false); }
  }

  async function handleDownload(att: Attachment) {
    const { data, error } = await supabase.storage.from("equipment-files").createSignedUrl(att.file_path, 60);
    if (error || !data) { toast.error(error?.message ?? "Błąd"); return; }
    window.open(data.signedUrl, "_blank");
  }
  async function handleDelete(att: Attachment) {
    if (!confirm(`Usunąć załącznik „${att.original_name}"?`)) return;
    await supabase.storage.from("equipment-files").remove([att.file_path]);
    const { error } = await supabase.from("equipment_attachments").delete().eq("id", att.id);
    if (error) toast.error(error.message); else { toast.success("Usunięto"); load(); }
  }

  const grouped = useMemo(() => {
    const g: Record<AttachmentKind, Attachment[]> = { documentation: [], photo: [], schema: [], service: [] };
    attachments.forEach((a) => g[a.kind].push(a));
    return g;
  }, [attachments]);

  return (
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
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading || tab !== k} />
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
                      {" · "}{new Date(a.uploaded_at).toLocaleString("pl-PL")}
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
  );
}

function EquipmentTimeline({ equipmentId, userId, isManager }: { equipmentId: string; userId: string | null; isManager: boolean }) {
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
      supabase.from("equipment_events").select("*").eq("equipment_id", equipmentId).order("performed_at", { ascending: false }),
      supabase.from("equipment_attachments").select("*").eq("equipment_id", equipmentId).not("event_id", "is", null),
    ]);
    setEvents((evs ?? []) as EquipmentEvent[]);
    const grouped: Record<string, Attachment[]> = {};
    ((atts ?? []) as Attachment[]).forEach((a) => {
      const k = a.event_id; if (!k) return;
      (grouped[k] ||= []).push(a);
    });
    setEventAtts(grouped);
    setLoading(false);
  }
  useEffect(() => { load(); }, [equipmentId]);

  const filteredEvents = useMemo(() => events.filter((e) => selectedKinds.includes(e.kind)), [events, selectedKinds]);
  const { damaged, repaired } = useMemo(() => ({
    damaged: filteredEvents.filter((e) => e.kind === "awaria"),
    repaired: filteredEvents.filter((e) => e.kind !== "awaria"),
  }), [filteredEvents]);

  async function openFile(att: Attachment) {
    const { data, error } = await supabase.storage.from("equipment-files").createSignedUrl(att.file_path, 60);
    if (error || !data) toast.error(error?.message ?? "Błąd"); else window.open(data.signedUrl, "_blank");
  }
  async function handleDelete(ev: EquipmentEvent) {
    if (!confirm("Usunąć wpis z historii? (Załączniki zostaną usunięte)")) return;
    const atts = eventAtts[ev.id] ?? [];
    if (atts.length) await supabase.storage.from("equipment-files").remove(atts.map((a) => a.file_path));
    const { error } = await supabase.from("equipment_events").delete().eq("id", ev.id);
    if (error) toast.error(error.message); else { toast.success("Usunięto"); load(); }
  }

  const renderList = (items: EquipmentEvent[]) => (
    <ol className="relative border-l ml-2 space-y-3">
      {items.map((ev) => {
        const Icon = EVENT_ICONS[ev.kind];
        const color =
          ev.kind === "awaria" ? "bg-destructive text-destructive-foreground" :
          ev.kind === "naprawa" ? "bg-emerald-600 text-white" :
          ev.kind === "serwis" ? "bg-blue-600 text-white" :
          ev.kind === "przeglad" ? "bg-amber-600 text-white" : "bg-muted text-foreground";
        return (
          <li key={ev.id} className="ml-4">
            <span className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ${color}`}>
              <Icon className="w-3 h-3" />
            </span>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{EVENT_LABELS[ev.kind]}{ev.title ? ` — ${ev.title}` : ""}</div>
                <div className="text-xs text-muted-foreground">{new Date(ev.performed_at).toLocaleString("pl-PL")}</div>
                {ev.description && <div className="text-sm whitespace-pre-wrap mt-1">{ev.description}</div>}
                {(eventAtts[ev.id]?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {eventAtts[ev.id]!.map((a) => {
                      const isImg = (a.mime_type ?? "").startsWith("image/");
                      return (
                        <button key={a.id} type="button" onClick={() => openFile(a)}
                          className="inline-flex items-center gap-1 text-xs border rounded px-2 py-1 hover:bg-muted" title={a.original_name}>
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
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{filteredEvents.length} wpisów</div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="w-3.5 h-3.5" /> Dodaj wpis
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup type="multiple" value={selectedKinds} onValueChange={(v) => setSelectedKinds(v as EventKind[])} className="flex flex-wrap gap-1">
          {ALL_KINDS.map((k) => {
            const Icon = EVENT_ICONS[k];
            return (
              <ToggleGroupItem key={k} value={k} aria-label={EVENT_LABELS[k]} className="text-xs h-8 px-2 gap-1">
                <Icon className="w-3.5 h-3.5" /> {EVENT_LABELS[k]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
          <input type="checkbox" checked={groupByStatus} onChange={(e) => setGroupByStatus(e.target.checked)} className="rounded border-gray-300" />
          <span className="flex items-center gap-1"><ListFilter className="w-3.5 h-3.5" /> Grupuj: uszkodzone / naprawione</span>
        </label>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Ładowanie…</div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded p-4 text-center">Brak wpisów pasujących do filtrów.</div>
      ) : groupByStatus ? (
        <div className="space-y-4">
          {damaged.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-destructive flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4" /> Uszkodzone ({damaged.length})
              </div>
              {renderList(damaged)}
            </div>
          )}
          {repaired.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-emerald-600 flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4" /> Naprawione / serwis ({repaired.length})
              </div>
              {renderList(repaired)}
            </div>
          )}
        </div>
      ) : renderList(filteredEvents)}

      {adding && (
        <EquipmentEventDialog
          equipmentId={equipmentId}
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
  equipmentId, userId, fixedKind, title, description, afterSave, onClose,
}: {
  equipmentId: string; userId: string | null; fixedKind?: EventKind;
  title: string; description?: string;
  afterSave: () => void | Promise<void>; onClose: () => void;
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
      const { data: inserted, error } = await supabase.from("equipment_events").insert({
        equipment_id: equipmentId, kind,
        title: titleVal.trim() || null, description: desc.trim() || null,
        performed_at: new Date(performedAt).toISOString(), created_by: userId,
      }).select("id").single();
      if (error) throw error;
      if (files.length > 0 && inserted) {
        for (const file of files) {
          const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
          const path = `${equipmentId}/event/${inserted.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext ? "." + ext : ""}`;
          const { error: upErr } = await supabase.storage.from("equipment-files").upload(path, file);
          if (upErr) throw upErr;
          const isImage = (file.type || "").startsWith("image/");
          const { error: dbErr } = await supabase.from("equipment_attachments").insert({
            equipment_id: equipmentId, event_id: inserted.id,
            kind: isImage ? "photo" : "service",
            file_path: path, original_name: file.name,
            mime_type: file.type || null, size_bytes: file.size, uploaded_by: userId,
          });
          if (dbErr) throw dbErr;
        }
      }
      toast.success("Dodano wpis");
      await afterSave();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd zapisu");
    } finally { setBusy(false); }
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
            <Input value={titleVal} onChange={(e) => setTitleVal(e.target.value)}
              placeholder={kind === "serwis" ? "np. Wymiana oleju" : "Krótki nagłówek"} />
          </div>
          <div>
            <Label>Opis {fixedKind === "awaria" ? "awarii" : ""}</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4}
              placeholder={
                fixedKind === "awaria" ? "Objawy, okoliczności wystąpienia awarii…" :
                fixedKind === "naprawa" ? "Co zostało wykonane, użyte części…" :
                "Szczegóły wykonanej czynności"
              }
              required={fixedKind === "awaria"} />
          </div>
          <div>
            <Label>Data i czas</Label>
            <Input type="datetime-local" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} required />
          </div>
          <div>
            <Label>Zdjęcia / pliki (opcjonalnie)</Label>
            <Input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            {files.length > 0 && <div className="text-xs text-muted-foreground mt-1">Wybrano: {files.map((f) => f.name).join(", ")}</div>}
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
