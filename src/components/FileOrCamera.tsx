/**
 * FileOrCamera — input de archivo con opción explícita de cámara para móvil.
 * Muestra dos botones: 📷 Tomar foto (capture) y 📁 Subir archivo/PDF.
 * En desktop el botón de cámara también funciona si hay webcam.
 */
import { useRef } from "react";
import { Camera, FolderOpen, X } from "lucide-react";

interface FileOrCameraProps {
  value: File | null;
  onChange: (file: File | null) => void;
  /** Si true, solo acepta imágenes (sin PDF). Default: acepta imagen + PDF */
  imageOnly?: boolean;
  /** Label personalizado para el área (opcional) */
  label?: string;
  className?: string;
}

export function FileOrCamera({ value, onChange, imageOnly = false, label, className = "" }: FileOrCameraProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  const accept    = imageOnly ? "image/*" : "image/*,application/pdf";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.files?.[0] ?? null);
    // Reset input value so the same file can be re-selected
    e.target.value = "";
  };

  if (value) {
    // Preview state
    const isImage = value.type.startsWith("image/");
    const preview = isImage ? URL.createObjectURL(value) : null;

    return (
      <div className={`flex items-center gap-2 p-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 ${className}`}>
        {preview ? (
          <img src={preview} alt="preview" className="w-12 h-12 rounded object-cover border border-emerald-200 shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <FolderOpen size={22} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-emerald-700 truncate">✓ {value.name}</p>
          <p className="text-[10px] text-emerald-600">{(value.size / 1024).toFixed(0)} KB</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 p-1 rounded-full hover:bg-emerald-200 text-emerald-600"
          title="Quitar"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <div className="grid grid-cols-2 gap-2">
        {/* Camera button */}
        <label className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 cursor-pointer transition-all active:scale-95">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleChange}
          />
          <Camera size={22} className="text-blue-500" />
          <span className="text-xs font-semibold text-blue-600">Tomar foto</span>
        </label>

        {/* File picker button */}
        <label className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-all active:scale-95">
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={handleChange}
          />
          <FolderOpen size={22} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-600">
            {imageOnly ? "Elegir foto" : "Foto o PDF"}
          </span>
        </label>
      </div>
    </div>
  );
}
