import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useLang } from "@/contexts/LangContext";

const NotFound = () => {
  const location = useLocation();
  const { lang } = useLang();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const titulo = lang === "zh" ? "页面未找到" : "Página no encontrada";
  const detalle = lang === "zh" ? "该地址不存在或已移动。" : "Esa dirección no existe o se movió.";
  const volver = lang === "zh" ? "返回首页" : "Volver al inicio";

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-alt p-6">
      <div className="max-w-md w-full rounded-[2rem] bg-card border border-border/70 p-8 text-center space-y-5 shadow-[0_18px_40px_-24px_hsl(214_94%_20%/0.4)]">
        <div
          className="relative mx-auto overflow-hidden rounded-full border border-white bg-primary/5"
          style={{ width: 140, height: 140 }}
          aria-hidden="true"
        >
          <img
            src="/brand/mascota/panda-letrero-vacio.png"
            alt=""
            className="absolute inset-0 m-auto h-[88%] w-auto max-w-[86%] object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold text-primary [word-break:keep-all]">{titulo}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{detalle}</p>
        <p className="text-xs text-muted-foreground font-mono">{location.pathname}</p>
        <Link
          to="/"
          className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-primary-foreground font-medium hover:bg-primary-hover transition-colors"
        >
          {volver}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
