// Expediente de un movimiento: N documentos clasificados por tipo.
// Reemplaza el campo único `factura_url` del módulo anterior.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Upload, ExternalLink, Trash2, Paperclip } from "lucide-react";
import { fdb } from "@/lib/finanzasDb";
import { useLang } from "@/contexts/LangContext";
import {
  BUCKET_FINANZAS, MIME_ADJUNTOS, TIPOS_ADJUNTO, rutaAdjunto,
  type Adjunto, type AdjuntoTipo,
} from "@/lib/finanzas";

interface Props {
  movimientoId: string;
  usuarioId?: string;
  puedeSubir?: boolean;
  puedeBorrar?: boolean;
  onCambio?: () => void;
}

const fmtPeso = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function ExpedienteAdjuntos({
  movimientoId, usuarioId, puedeSubir = true, puedeBorrar = true, onCambio,
}: Props) {
  const { t, lang } = useLang();
  const locale = lang === "zh" ? "zh-CN" : "es-MX";
  const etiquetaTipo = (tipo: AdjuntoTipo) => t.finanzas.tipoAdjunto(tipo);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [tipoDoc, setTipoDoc] = useState<AdjuntoTipo>("FACTURA");
  const [notas, setNotas] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await fdb
      .from("movimiento_adjuntos")
      .select("*")
      .eq("movimiento_id", movimientoId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setAdjuntos(data ?? []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [movimientoId]);

  const subir = async (file: File) => {
    setSubiendo(true);
    const path = rutaAdjunto(movimientoId, file.name);
    const { error: errUp } = await fdb.storage
      .from(BUCKET_FINANZAS)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (errUp) {
      setSubiendo(false);
      toast.error(t.finanzas.expediente.errorSubir + errUp.message);
      return;
    }

    const { error: errIns } = await fdb.from("movimiento_adjuntos").insert({
      movimiento_id: movimientoId,
      tipo_documento: tipoDoc,
      nombre_archivo: file.name,
      storage_path: path,
      mime_type: file.type || null,
      tamano_bytes: file.size,
      notas: notas.trim() || null,
      subido_por: usuarioId ?? null,
    });
    setSubiendo(false);

    if (errIns) {
      // El archivo ya subió pero el registro falló: se limpia para no dejar basura
      await fdb.storage.from(BUCKET_FINANZAS).remove([path]);
      toast.error(t.finanzas.expediente.errorRegistrar + errIns.message);
      return;
    }

    toast.success(t.finanzas.expediente.agregada(etiquetaTipo(tipoDoc)));
    setNotas("");
    if (fileRef.current) fileRef.current.value = "";
    cargar();
    onCambio?.();
  };

  const abrir = async (a: Adjunto) => {
    const { data, error } = await fdb.storage
      .from(BUCKET_FINANZAS)
      .createSignedUrl(a.storage_path, 3600);
    if (error || !data?.signedUrl) { toast.error(t.finanzas.expediente.errorAbrir); return; }
    window.open(data.signedUrl, "_blank");
  };

  const borrar = async (a: Adjunto) => {
    const { error } = await fdb.from("movimiento_adjuntos").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    await fdb.storage.from(BUCKET_FINANZAS).remove([a.storage_path]);
    toast.success(t.finanzas.expediente.eliminado);
    cargar();
    onCambio?.();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Paperclip size={16} className="text-primary" />
        <h3 className="font-bold text-primary">{t.finanzas.expediente.title}</h3>
        <Badge variant="outline" className="text-xs">
          {adjuntos.length} {adjuntos.length === 1 ? t.finanzas.expediente.documento : t.finanzas.expediente.documentos}
        </Badge>
      </div>

      {puedeSubir && (
        <div className="rounded-3xl border bg-slate-50/60 p-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{t.finanzas.expediente.tipoDocumento}</Label>
              <Select value={tipoDoc} onValueChange={v => setTipoDoc(v as AdjuntoTipo)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_ADJUNTO.map(tipo => (
                    <SelectItem key={tipo.value} value={tipo.value}>{etiquetaTipo(tipo.value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t.finanzas.expediente.nota}</Label>
              <Input
                className="h-10"
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder={t.finanzas.expediente.notaPlaceholder}
              />
            </div>
          </div>

          <div
            className="border-2 border-dashed rounded-3xl p-4 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={22} className="mx-auto mb-1 opacity-50" />
            <p className="text-sm font-medium">
              {subiendo ? t.finanzas.expediente.subiendo : t.finanzas.expediente.tocaParaAgregar}
            </p>
            <p className="text-xs mt-0.5 text-muted-foreground">
              {t.finanzas.expediente.formatos}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={MIME_ADJUNTOS}
            className="hidden"
            disabled={subiendo}
            onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); }}
          />
        </div>
      )}

      {cargando ? (
        <div className="text-sm text-muted-foreground py-3">{t.finanzas.expediente.cargando}</div>
      ) : adjuntos.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center border rounded-3xl">
          {t.finanzas.expediente.vacio}
        </div>
      ) : (
        <div className="divide-y rounded-3xl border overflow-hidden">
          {adjuntos.map(a => (
            <div key={a.id} className="flex items-center gap-2 p-3">
              <FileText size={17} className="text-secondary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold truncate">{a.nombre_archivo}</span>
                  <Badge variant="outline" className="text-[11px] border-blue-200 bg-blue-50 text-blue-700">
                    {etiquetaTipo(a.tipo_documento)}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleDateString(locale, {
                    year: "numeric", month: "short", day: "numeric",
                  })}
                  {a.tamano_bytes ? ` · ${fmtPeso(a.tamano_bytes)}` : ""}
                  {a.notas ? ` · ${a.notas}` : ""}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => abrir(a)} title={t.finanzas.expediente.abrir}>
                <ExternalLink size={15} className="text-blue-600" />
              </Button>
              {puedeBorrar && (
                <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => borrar(a)} title={t.finanzas.expediente.quitar}>
                  <Trash2 size={15} className="text-red-400" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
