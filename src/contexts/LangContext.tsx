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

const LangContext = createContext<LangCtx>({
  lang: "es",
  t: es,
  toggleLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem("dazon_lang");
      return (stored === "zh" ? "zh" : "es") as Lang;
    } catch {
      return "es";
    }
  });

  const t = lang === "zh" ? zh : es;

  const toggleLang = () => {
    const next: Lang = lang === "es" ? "zh" : "es";
    setLang(next);
    try { localStorage.setItem("dazon_lang", next); } catch {}
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
