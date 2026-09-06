import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { es } from "@/i18n/es";
import { zh } from "@/i18n/zh";
import type { Translations } from "@/i18n/es";

type Lang = "es" | "zh";

interface LangCtx {
  lang: Lang;
  t: Translations;
  toggleLang: () => void;
}

const CLAVE = "dazon_lang";

/** Idioma guardado. Fuera de React también hace falta saberlo. */
function langGuardado(): Lang {
  try {
    return localStorage.getItem(CLAVE) === "zh" ? "zh" : "es";
  } catch {
    return "es";
  }
}

/**
 * Diccionario del idioma guardado, para el código que corre por fuera del
 * provider (p. ej. el aviso de permisos de AuthContext, que lo envuelve).
 */
export function dictActual(): Translations {
  return langGuardado() === "zh" ? zh : es;
}

const LangContext = createContext<LangCtx>({
  lang: "es",
  t: es,
  toggleLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(langGuardado);

  const t = lang === "zh" ? zh : es;

  const toggleLang = () => {
    const next: Lang = lang === "es" ? "zh" : "es";
    setLang(next);
    try { localStorage.setItem(CLAVE, next); } catch {}
  };

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "es-MX";
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, t, toggleLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
