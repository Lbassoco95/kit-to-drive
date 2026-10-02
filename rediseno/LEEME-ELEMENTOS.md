# Elementos para subir el rediseño "Dazon por Mati"

Todo lo que el agente de desarrollo usa y necesita. Orden de lectura: este archivo, el prompt, el parche.

## 1. Contenido de esta carpeta

| Elemento | Para qué sirve |
|---|---|
| `PROMPT-rediseno-dazon-por-mati.md` | Instrucciones completas, en una sola corrida. Es lo que se pega en Claude Code o Cursor. |
| `rediseno-dazon-fluido.patch` | Prototipo ya implementado (25 archivos, incluye 5 imágenes). Se aplica con `git apply --3way`. |
| `capturas/` | Referencia visual: login es/zh/móvil, inicio es/zh/móvil y paleta de búsqueda. |
| `activos/dazon/` | 7 logotipos de Dazon con fondo transparente (el negativo lleva su azul). |
| `activos/mascota/` | 24 poses del panda con fondo transparente y recorte blanco. |
| `activos/mati-icono.png` | Ícono de Mati para el sello "por Mati". |

## 2. Acceso y entorno

- Repositorio `Lbassoco95/kit-to-drive`, partiendo de `origin/main` actualizado. Rama de trabajo: `rediseno-dazon-por-mati`.
- Node 18 o superior y `npm`. Vite 5, React, TypeScript, Tailwind, shadcn/ui, Supabase, vitest, react-router.
- Variables de entorno de Supabase: las que ya usa el proyecto. **El rediseño no cambia ninguna** ni toca la base de datos.
- Vercel despliega solo lo que llega a `main`. Una rama o Pull Request genera su propia vista previa; no se afecta producción.
- Permiso para subir una rama y abrir un Pull Request. **No se sube a `main`**: Polo aprueba tras ver la vista previa.

## 3. Dependencias

Nuevas (2), solo para tipografía:

```
npm i @fontsource-variable/inter @fontsource/noto-sans-sc
```

Ya existen y se reutilizan sin cambios: `cmdk` (paleta), `lucide-react` (todos los íconos), `recharts`, `@radix-ui/*`, `class-variance-authority`. Opcional, solo para generar capturas: `playwright` (no se agrega a las dependencias del proyecto).

## 4. Archivos que toca el parche

- Estilos: `src/index.css`, `tailwind.config.ts`.
- Componentes base: `src/components/ui/` → `button`, `card`, `command`, `dialog`, `dropdown-menu`, `input`, `popover`, `select`, `sidebar`, `table`, `textarea`.
- Estructura: `AppLayout.tsx`, `AppSidebar.tsx`, nuevo `PaletaGlobal.tsx`.
- Pantallas: `src/pages/Auth.tsx`, `src/pages/Dashboard.tsx`.
- Textos: `src/i18n/es.ts`, `src/i18n/zh.ts` (llaves nuevas `auth.heroSub`, `layout.porMati`, `layout.searchShort`, `layout.paletteTitle`, `layout.paletteEmpty`, `layout.paletteScreens`, `dashboard.hoy`, `dashboard.accesos`; texto nuevo de `auth.heroTitle`; el grupo `CRM` pasa a "Comercial" / "销售与客户").
- Imágenes nuevas en `public/brand/`: `dazon-negativo.png`, `dazon-horizontal.png`, `dazon-app-icono.png`, `panda-saluda.png`, `mati-icono.png`.

## 5. Activos de marca y dónde se usan

Copiar `activos/dazon/` a `public/brand/dazon/` y `activos/mascota/` a `public/brand/mascota/`.

| Uso | Archivo |
|---|---|
| Login (panel de marca) | `dazon-negativo.png` |
| Encabezados claros, correos, documentos | `dazon-horizontal.png` |
| Favicon, `apple-touch-icon`, ícono del menú | `dazon-app-icono.png` |
| Impresión a una tinta | `dazon-monocromatico.png` |
| Espacios cuadrados (avatar, sello) | `dazon-simbolo.png` |
| Pantallas angostas | `dazon-compacto.png` |
| Titulares grandes sobre claro | `dazon-wordmark.png` |
| Login, inicio | `panda-saluda.png` |
| Estado vacío: todo al día | `panda-listo-palomeado.png` |
| Estado vacío: pendiente | `panda-pendiente-reloj.png` |
| Estado vacío: incidencia | `panda-incidencia-lupa.png` |
| Estado vacío: entregas | `panda-camion-de-entrega.png` |
| Estado vacío: sin datos | `panda-letrero-vacio.png` |
| Meta cumplida | `panda-banderas-meta.png` |
| En proceso de armado | `panda-en-proceso-llave.png` |
| Remisión mostrada | `panda-muestra-remision.png` |

Regla del panda: entero y centrado dentro de su círculo (88 % de alto), sin recortes; una pose por pantalla; nunca en tablas ni formularios.

## 6. Textos que debe respetar

Titular: **Todo Dazon, fluyendo en un solo lugar** / **Dazon 的一切，汇流于一处**. Sello: **Dazon por Mati · Un desarrollo de Yoltik**. Enlace: **Saber más de Mati** → https://www.yoltik.mx/productos/mati (pestaña nueva, `rel="noopener noreferrer"`). No usar las siglas ERP ni CRM en la interfaz. Los textos en chino quedan pendientes de revisión por un hablante nativo.

## 7. Qué se debe revisar antes de aprobar

1. Vista previa de Vercel en español y chino: login, inicio, producción, remisiones y un detalle de Comercial.
2. Que el panda quede entero dentro de cada círculo.
3. Que tablas y formularios sigan opacos y legibles (el cristal solo está en menú, barra y menús flotantes).
4. Modo "Reducir efectos" y `prefers-reduced-motion`: todo sólido y quieto.
5. Los tres comandos del proyecto en verde: `npm run typecheck`, `npm run test`, `npm run build`.

## 8. Fuera de alcance

Cambios de base de datos, permisos, rutas o reglas de negocio; el modo oscuro; la refracción real con filtros SVG (solo opcional, detrás de `.glass-refract`).
