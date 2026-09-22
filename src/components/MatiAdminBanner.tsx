import { ExternalLink, Shield } from "lucide-react";
import { adminGestionadoDesdeMati, matiAdminKitUrl } from "@/lib/matiAdmin";
import { useLang } from "@/contexts/LangContext";

/**
 * Aviso en pantallas de Sistema: la administración vive en mati-admin.
 * Si el flag está apagado, no se renderiza nada.
 */
export function MatiAdminBanner() {
  const { t } = useLang();
  if (!adminGestionadoDesdeMati()) return null;

  return (
    <div className="rounded-lg border border-[#1F3864]/20 bg-[#1F3864]/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <Shield className="h-5 w-5 text-[#1F3864] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1F3864]">{t.matiAdmin.titulo}</p>
          <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{t.matiAdmin.descripcion}</p>
        </div>
      </div>
      <a
        href={matiAdminKitUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md bg-[#1F3864] text-white text-sm font-medium hover:bg-[#162a4d] shrink-0"
      >
        {t.matiAdmin.abrir}
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}
