import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useLang } from "@/contexts/LangContext";

interface DocumentViewerDialogProps {
  path: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentViewerDialog({ path, open, onOpenChange }: DocumentViewerDialogProps) {
  const { t } = useLang();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase.storage.from("remisiones-docs").createSignedUrl(path, 60).then(({ data, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error || !data?.signedUrl) {
        toast.error(t.componentes.visor.errorCargar);
        setUrl(null);
        return;
      }
      setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [open, path]);

  const download = async () => {
    if (!path) return;
    const nombre = path.split("/").pop() || "documento.pdf";
    const { data, error } = await supabase.storage.from("remisiones-docs").createSignedUrl(path, 60, { download: nombre });
    if (error || !data?.signedUrl) {
      toast.error(t.componentes.visor.errorDescargar);
      return;
    }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = nombre;
    link.click();
  };

  const isPdf = url?.toLowerCase().includes(".pdf") || path?.toLowerCase().includes(".pdf");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>{t.componentes.visor.titulo}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 px-4 pb-2">
          {loading && <div className="h-full flex items-center justify-center text-muted-foreground">{t.componentes.visor.cargando}</div>}
          {!loading && url && (
            isPdf ? (
              <iframe src={url} title={t.componentes.visor.documento} className="w-full h-full rounded border" />
            ) : (
              <img src={url} alt={t.componentes.visor.documento} className="max-w-full max-h-full mx-auto object-contain rounded border" />
            )
          )}
          {!loading && !url && <div className="h-full flex items-center justify-center text-muted-foreground">{t.componentes.visor.errorCargarPunto}</div>}
        </div>
        <DialogFooter className="px-4 pb-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}><X className="h-4 w-4 mr-2"/> {t.actions.close}</Button>
          <Button onClick={download}><Download className="h-4 w-4 mr-2"/> {t.componentes.visor.descargar}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
