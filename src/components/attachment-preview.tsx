import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PreviewAttachment = {
  file_path: string;
  original_name: string;
  mime_type?: string | null;
};

export function AttachmentPreviewDialog({
  attachment,
  open,
  onOpenChange,
}: {
  attachment: PreviewAttachment | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!open || !attachment) { setUrl(null); return; }
    setLoading(true);
    supabase.storage
      .from("equipment-files")
      .createSignedUrl(attachment.file_path, 600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          toast.error(error?.message ?? "Nie udało się otworzyć pliku");
          onOpenChange(false);
        } else {
          setUrl(data.signedUrl);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, attachment, onOpenChange]);

  const mime = (attachment?.mime_type ?? "").toLowerCase();
  const name = (attachment?.original_name ?? "").toLowerCase();
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name);
  const isPdf = mime === "application/pdf" || name.endsWith(".pdf");
  const isVideo = mime.startsWith("video/") || /\.(mp4|webm|ogg|mov)$/i.test(name);
  const isAudio = mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/i.test(name);
  const isText = mime.startsWith("text/") || /\.(txt|csv|log|json|md)$/i.test(name);
  const canInline = isImage || isPdf || isVideo || isAudio || isText;

  function download() {
    if (!url || !attachment) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = attachment.original_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base truncate pr-8">
            {attachment?.original_name ?? "Podgląd"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/30 flex items-center justify-center overflow-auto">
          {loading || !url ? (
            <div className="text-sm text-muted-foreground">Ładowanie…</div>
          ) : isImage ? (
            <img src={url} alt={attachment?.original_name} className="max-w-full max-h-full object-contain" />
          ) : isPdf ? (
            <iframe src={url} title={attachment?.original_name} className="w-full h-full bg-white" />
          ) : isVideo ? (
            <video src={url} controls className="max-w-full max-h-full" />
          ) : isAudio ? (
            <audio src={url} controls className="w-full max-w-md" />
          ) : isText ? (
            <iframe src={url} title={attachment?.original_name} className="w-full h-full bg-white" />
          ) : (
            <div className="text-sm text-muted-foreground p-6 text-center">
              Podgląd tego typu pliku nie jest dostępny.<br />Pobierz lub otwórz w nowej karcie.
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t">
          {url && (
            <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank")}>
              <ExternalLink className="w-3.5 h-3.5" /> Otwórz w nowej karcie
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={download} disabled={!url}>
            <Download className="w-3.5 h-3.5" /> Pobierz
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
