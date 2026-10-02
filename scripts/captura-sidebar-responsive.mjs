/**
 * Evidencia visual: rail contraído (desktop) + layout móvil.
 * Sirve CSS de dist + activos /brand; el markup replica métricas del fix
 * (rail 4.5rem, círculos 44px, logo object-contain, hero que reflujo).
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = "/Users/leopoldobassoco/Library/Application Support/Cursor/AgentStores/cursor_agent_stores/bc-75804829-048f-4d14-8513-19c5c0fca8d5/files/media";
mkdirSync(OUT, { recursive: true });

const cssFile = readdirSync(join(ROOT, "dist/assets")).find(f => f.endsWith(".css"));
if (!cssFile) throw new Error("No hay CSS en dist/assets; corre npm run build");

const icon = (d) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const icons = {
  home: icon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
  factory: icon('<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>'),
  box: icon('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>'),
  file: icon('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
  truck: icon('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'),
  globe: icon('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
  menu: icon('<path d="M4 12h16"/><path d="M4 18h16"/><path d="M4 6h16"/>'),
  search: icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
};

const html = `<!doctype html>
<html lang="es-MX">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="/assets/${cssFile}"/>
<style>
  * { box-sizing: border-box; }
  body { margin:0; font-family: Inter, "Noto Sans SC", sans-serif; background: hsl(210 17% 98%); }
  .shell { display:flex; min-height:100vh; width:100%; max-width:100vw; overflow-x:hidden; }
  .rail {
    width: 4.5rem; margin: 0.5rem; border-radius: 2.25rem;
    background: hsl(214 94% 20% / 0.88); color: #fff;
    display: flex; flex-direction: column; align-items: center; gap: 0.55rem;
    padding: 1rem 0; flex-shrink: 0;
    box-shadow: 0 18px 50px -18px hsl(214 94% 10% / 0.55);
  }
  .logo {
    width: 2.75rem; height: 2.75rem; border-radius: 9999px; background: #fff;
    display: grid; place-items: center; overflow: hidden;
    box-shadow: 0 8px 20px -8px hsl(214 94% 5% / 0.7);
  }
  .logo img { width: 88%; height: 88%; object-fit: contain; display:block; }
  .ico {
    width: 2.75rem; height: 2.75rem; border-radius: 9999px;
    display: grid; place-items: center; background: rgba(255,255,255,.08); color:#fff;
  }
  .ico.active { background: rgba(255,255,255,.22); }
  .main { flex:1; min-width:0; max-width:100%; overflow-x:hidden; padding: 0.75rem 1rem 1.5rem; }
  .bar {
    min-height: 3.5rem; border-radius: 9999px; display:flex; align-items:center; gap:.5rem;
    padding: 0 .4rem; margin-bottom: 1rem;
    background: hsl(0 0% 100% / 0.7); backdrop-filter: blur(22px);
    border: 1px solid rgba(255,255,255,.75);
  }
  .bar button, .hit {
    width: 2.75rem; height: 2.75rem; border-radius: 9999px; border:0; background: transparent;
    display:grid; place-items:center; color: hsl(214 94% 20%);
  }
  .search {
    flex:1; min-width:0; height: 2.5rem; border-radius: 9999px;
    background: rgba(255,255,255,.75); display:flex; align-items:center; gap:.5rem;
    padding: 0 1rem; color:#667; font-size:.875rem;
  }
  .avatar {
    width: 2.5rem; height: 2.5rem; border-radius: 9999px; flex-shrink:0;
    background: linear-gradient(135deg,#032B61,#2E75B6); color:#fff;
    display:grid; place-items:center; font-weight:700; font-size:.8rem;
  }
  .hero {
    border-radius: 1.75rem; padding: 1.5rem 1.75rem; overflow: hidden;
    background: linear-gradient(135deg,#032b62,#03234d); color:#fff;
  }
  .hero-row { display:flex; gap:1.25rem; align-items:center; min-width:0; }
  .hero-copy { min-width:0; flex:1; overflow:hidden; }
  .hero h1 {
    margin: .35rem 0 0; color: #fff !important;
    font-size: clamp(1.5rem, 3.2vw, 2.5rem); line-height:1.15;
    text-wrap: balance; word-break: keep-all; font-weight: 800;
  }
  .hero p { margin:.55rem 0 0; opacity:.92; overflow-wrap:anywhere; color:#fff; }
  .pills { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:1rem; }
  .pill {
    border-radius:9999px; border:1px solid rgba(255,255,255,.25);
    background:rgba(255,255,255,.12); padding:.35rem .85rem; font-size:.8rem; color:#fff;
  }
  .panda {
    width: 9.5rem; height: 9.5rem; border-radius:9999px; overflow:hidden; flex-shrink:0;
    background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.3); position:relative;
  }
  .panda img {
    position:absolute; inset:0; margin:auto; height:88%; width:auto; max-width:86%;
    object-fit: contain; display:block;
  }
  .orbs { display:flex; flex-wrap:wrap; gap:1.25rem; margin-top:.75rem; }
  .orb {
    width: 8.5rem; height: 8.5rem; border-radius:9999px; background:#fff; border:1px solid #fff;
    display:grid; place-items:center; font-weight:800; font-size:1.75rem; color:#065F46;
    box-shadow: 0 18px 40px -20px hsl(214 94% 20% / .45);
  }
  .accesos { display:flex; flex-wrap:wrap; gap:1rem; margin-top:.75rem; }
  .acc { width:4.75rem; text-align:center; font-size:.7rem; color: hsl(214 94% 20%); }
  .acc span {
    display:grid; place-items:center; width:3.5rem; height:3.5rem; margin:0 auto .35rem;
    border-radius:9999px; background:#fff; color: hsl(214 94% 20%);
    box-shadow: 0 10px 24px -14px hsl(214 94% 20% / .6);
  }
  @media (max-width: 767px) {
    .rail { display:none; }
    .panda { display:none; }
    .hero { border-radius: 1.25rem; padding: 1rem 1.1rem; }
  }
</style>
</head>
<body>
  <div class="shell">
    <aside class="rail" aria-label="Menú contraído">
      <div class="logo"><img src="/brand/dazon-app-icono.png" alt="Dazon"/></div>
      <div class="ico active">${icons.home}</div>
      <div class="ico">${icons.factory}</div>
      <div class="ico">${icons.box}</div>
      <div class="ico">${icons.file}</div>
      <div class="ico">${icons.truck}</div>
      <div class="ico" style="margin-top:auto">${icons.globe}</div>
    </aside>
    <div class="main">
      <header class="bar">
        <button class="hit" aria-label="Menú">${icons.menu}</button>
        <div class="search">${icons.search}<span>Buscar…</span></div>
        <div class="avatar">PB</div>
      </header>
      <section class="hero">
        <div class="hero-row">
          <div class="hero-copy">
            <div style="opacity:.8;font-size:.8rem">jueves, 1 de octubre</div>
            <h1>Todo Dazon, fluyendo en un solo lugar</h1>
            <p>Hola, Polo Bassoco — Dirección · Admin</p>
            <div class="pills">
              <span class="pill">Producción</span><span class="pill">Inventario</span>
              <span class="pill">Remisiones</span><span class="pill">Clientes</span><span class="pill">Finanzas</span>
            </div>
          </div>
          <div class="panda" aria-hidden="true">
            <img src="/brand/panda-saluda.png" alt=""/>
          </div>
        </div>
      </section>
      <h2 style="margin:1.25rem 0 .5rem;font-size:1.15rem;color:hsl(214 94% 20%)">Hoy en Dazon</h2>
      <div class="orbs">
        <div class="orb">61%</div>
        <div class="orb" style="color:#991B1B">3</div>
      </div>
      <h2 style="margin:1.25rem 0 .5rem;font-size:1.15rem;color:hsl(214 94% 20%)">Ir a</h2>
      <div class="accesos">
        <div class="acc"><span>${icons.factory}</span>Producción</div>
        <div class="acc"><span>${icons.box}</span>Inventario</div>
        <div class="acc"><span>${icons.file}</span>Remisiones</div>
      </div>
    </div>
  </div>
</body>
</html>`;

function contentType(p) {
  return ({ ".css": "text/css", ".js": "application/javascript", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".html": "text/html" })[extname(p)] || "application/octet-stream";
}

function startStatic(port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === "/" || req.url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
        return;
      }
      const rel = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\//, "");
      const candidates = [join(ROOT, "dist", rel), join(ROOT, "public", rel)];
      for (const file of candidates) {
        try {
          if (statSync(file).isFile()) {
            res.writeHead(200, { "Content-Type": contentType(file) });
            res.end(readFileSync(file));
            return;
          }
        } catch {}
      }
      res.writeHead(404);
      res.end("missing");
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const port = 4197;
const server = await startStatic(port);
const browser = await chromium.launch({ headless: true });
try {
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const path = join(OUT, "sidebar-contraido-desktop.png");
    await page.screenshot({ path, fullPage: false });
    console.log("wrote", path);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const path = join(OUT, "sidebar-responsivo-movil.png");
    await page.screenshot({ path, fullPage: false });
    console.log("wrote", path);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
