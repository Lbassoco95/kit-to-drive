# Prompt para el agente de desarrollo — "Dazon por Mati": diseño fluido, circular y con cristal

> Pégalo completo en Claude Code / Cursor, dentro del repositorio `Lbassoco95/kit-to-drive`. Está escrito para terminar todo el trabajo en una sola corrida, con las decisiones ya tomadas. Antes de pegarlo, descomprime en la raíz del repo el paquete `rediseno-dazon-paquete.zip`: crea la carpeta `rediseno/` con el parche, las capturas de referencia, los activos de marca y la lista de elementos (`LEEME-ELEMENTOS.md`).

---

## 0. Rol y objetivo

Eres el ingeniero front-end del repositorio `kit-to-drive`, la plataforma que Grupo Dazon usa para controlar producción, inventario, remisiones, entregas, clientes, seguimiento comercial y finanzas. Es un desarrollo de Yoltik Mx hecho con Mati. La usa personal mexicano y personal chino, en español de México y en chino simplificado.

Ya existe un **prototipo funcional** del nuevo diseño en `rediseno/rediseno-dazon-fluido.patch`: login, menú lateral flotante, barra superior, paleta de navegación, formas base de los componentes y la pantalla de inicio convertida en centro de la operación. Tu trabajo es (1) aplicarlo, (2) extender el mismo lenguaje a **todas** las pantallas, (3) cerrar lo que el prototipo dejó pendiente (sección 9) y (4) verificarlo. Hay que dejarlo terminado sin pedir confirmaciones intermedias. Si una decisión no está escrita aquí, toma la opción más simple que respete las reglas de la sección 2 y anótala en el PR.

## 1. Lenguaje de diseño: dinámico, fluido y circular

La idea central es que la plataforma **concentra** todo y que la información **fluye** entre áreas. Eso se traduce en cinco decisiones visuales:

1. **Sin esquinas duras.** Las formas son círculos, píldoras y contenedores muy redondeados. Botones, campos, selectores, etiquetas, menús, buscador, avatar e íconos son **píldoras o círculos** (`rounded-full`). Tarjetas, paneles y diálogos usan radios grandes (`1.75rem` a `3.5rem`). `--radius` global es `1.25rem`. Solo se conservan ángulos rectos donde los exige el contenido, como las celdas internas de una tabla, y aun así la tabla va dentro de un contenedor redondeado.
2. **Cristal en el marco, papel en el contenido.** El cristal (desenfoque del fondo con borde luminoso) vive solo en la capa de navegación: menú lateral, barra superior, buscador, menús flotantes, paleta de búsqueda y el sello "por Mati". Tablas, formularios, números y tarjetas de datos son **opacos**, para leerse bien en el piso de producción y en equipos modestos.
3. **Orbes y curvas que se mueven despacio.** Detrás de la interfaz hay tres orbes de color (azul Dazon, dorado, verde azulado) con desenfoque que **cambian de forma y se desplazan muy lento** (animación de `border-radius` y traslación de 16 a 34 s). En los paneles de marca hay círculos concéntricos finos que sugieren ondas. Es movimiento ambiental, nunca llama la atención ni se usa en texto.
4. **Indicadores en anillos.** Los números clave del inicio van dentro de círculos con un anillo de avance (ver 7.3). Los accesos a módulos son burbujas circulares con ícono.
5. **El panda dentro de un orbe, completo.** La mascota va **entera y centrada** dentro del círculo de cristal: altura del 88 % del círculo, ancho máximo del 86 %, `object-contain`, centrada con `absolute inset-0 m-auto`, con una sombra suave y sin salirse ni recortarse en ningún borde (ni cabeza, ni manos, ni pies). Nunca en tablas ni formularios. Esa regla vale para todos los orbes con mascota: login, inicio, estados vacíos y pantallas de carga o sin acceso.

**Restricción de lenguaje.** En la interfaz **no aparecen las siglas "ERP" ni "CRM"**, ni la frase "sistema de gestión". El producto se describe por lo que concentra. El grupo del menú "CRM" se llama **"Comercial"** (中文: **销售与客户**).

## 2. Reglas que no se negocian

1. **Git y producción** (de `AGENTS.md`): ejecuta `git fetch origin` y parte de la versión más reciente de `origin/main`. Trabaja en la rama `rediseno-dazon-por-mati`. **No subas a `main` ni despliegues.** Abre un Pull Request con vista previa de Vercel y deja que Polo lo apruebe. No elimines ni sobrescribas los módulos de almacén y remisiones de refacciones.
2. **Antes de abrir el PR** deben pasar `npm run typecheck`, `npm run test` y `npm run build`.
3. **Sin cambios de comportamiento.** Permisos, rutas, consultas a Supabase, bloqueo de login y reglas de negocio quedan igual. Es trabajo de presentación; la única función nueva es la paleta de navegación y su ampliación a búsqueda de datos (sección 7.4).
4. **Nunca cristal sobre cristal.** Un menú flotante que se abre sobre la barra de cristal es casi opaco. Nunca cristal sobre tablas, formularios, tarjetas KPI, etiquetas ni texto corrido.
5. **Accesibilidad.** Texto normal ≥ 4.5:1 y texto grande ≥ 3:1, **medidos contra el peor fondo posible detrás del cristal**. Estatus siempre con ícono + palabra + color. Foco visible en todo control. Objetivos táctiles ≥ 44 px en móvil.
6. **Degradación obligatoria.** El cristal pasa a fondo sólido sin `backdrop-filter`, con `prefers-reduced-transparency: reduce`, con `prefers-contrast: more` y con la clase `sin-cristal` en `<html>`. Con `prefers-reduced-motion: reduce` los orbes se quedan quietos. Todo esto ya está en el parche (`src/index.css`); no lo quites.
7. **Sin emoji en la interfaz.** Todo ícono es de `lucide-react`.
8. **Colores.** El rojo de marca (`dazon-red`) nunca comunica error; para errores va `destructive`. El dorado (`dazon-gold`) solo es filete, punto o detalle, nunca lleva texto. El teal y el naranja de Mati viven solo dentro del sello "por Mati".
9. **Chino.** Cada texto nuevo lleva traducción real en `src/i18n/zh.ts`. En chino se aplica `word-break: keep-all` a los titulares grandes para que no se partan a mitad de frase, interlineado de 1.6 en cuerpo de texto y sin cursivas. Marca los textos nuevos en el PR como "pendientes de revisión por hablante nativo".

## 3. Insumos y estado de partida

- `rediseno/rediseno-dazon-fluido.patch`: aplícalo primero con `git apply --3way` sobre la rama de trabajo y resuelve conflictos si `origin/main` avanzó. Contiene, ya implementado y probado (typecheck, 339 pruebas y build en verde):
  - **Tokens y estilos** (`src/index.css`, `tailwind.config.ts`): paleta Dazon, `--radius: 1.25rem`, utilidades `.glass-bar`, `.glass-pop`, `.glass-pill-active`, `.ambient` (orbes de fondo), `.blob`, animaciones `blob-morph` y `blob-drift`, y todas las degradaciones.
  - **Formas base** (`src/components/ui/*`): botón, campo, área de texto y selector en píldora; tarjeta con radio grande; diálogo, menús, selector y paleta con cristal casi opaco y esquinas redondeadas; contenedor de tabla redondeado; menú lateral flotante con cristal.
  - **Login** (`src/pages/Auth.tsx`): panel de marca flotante con curvas, orbes y círculos concéntricos, logotipo en negativo, titular bilingüe, píldoras de módulos, panda dentro de un orbe, formulario en píldoras y sello "Dazon por Mati" en cristal con enlace "Saber más de Mati".
  - **Menú lateral** (`AppSidebar.tsx`): flotante, con cristal, ícono de Dazon en círculo y "por Mati", ítems en píldora con burbuja de ícono, punto dorado en el activo, selector de idioma con ícono, enlace "Saber más de Mati" al pie. Exporta `ITEMS`, `GROUPS` y el hook `useNavItems`.
  - **Barra superior y envoltura** (`AppLayout.tsx`): barra de cristal en píldora, buscador en píldora con atajo `Ctrl/⌘ K`, avatar con iniciales, orbes de fondo, pie "Dazon por Mati · Un desarrollo de Yoltik · Saber más de Mati".
  - **Paleta** (`PaletaGlobal.tsx`): salta a cualquier pantalla visible para la persona.
  - **Inicio** (`Dashboard.tsx`): encabezado de bienvenida con el texto nuevo y el panda, cuatro orbes de indicadores con anillo, cuadrícula de accesos circulares y tarjetas KPI con ícono en círculo.
  - **i18n**: llaves nuevas en `es.ts` y `zh.ts`; grupo "Comercial".
- Las capturas `diseno-fluido-*.png` son la referencia. Si tu resultado se aparta de ellas, justifícalo en el PR.
- Activos de marca: el parche ya instala en `public/brand/` los cinco que usa el prototipo. El resto (los 7 logotipos de Dazon y las 24 poses del panda) viene en `rediseno/activos/` y se copia a `public/brand/dazon/` y `public/brand/mascota/` (ver `LEEME-ELEMENTOS.md`, que dice qué pose va en cada estado vacío). El diseño de referencia completo está en https://claude.ai/artifact/Qw56jWiz2ra4b9QosSaFAo.

## 4. Texto de inicio del sistema (decidido)

Es el mensaje que abre el sistema y que acompaña al panda. Reemplaza al anterior ("Producción, inventario y remisiones en un solo lugar").

| Elemento | Español (México) | Chino simplificado |
|---|---|---|
| Titular (`auth.heroTitle`) | Todo Dazon, fluyendo en un solo lugar | Dazon 的一切，汇流于一处 |
| Módulos en píldoras (`auth.heroSub`, separados por " · ") | Producción · Inventario · Remisiones · Clientes · Finanzas | 生产 · 库存 · 提货单 · 客户 · 财务 |
| Sello (`auth.poweredBy`) | Dazon por Mati | Dazon 由 Mati 驱动 |
| Firma (`auth.developedBy`) | Un desarrollo de Yoltik | 由 Yoltik 开发 |
| Enlace (`auth.learnMoreMati`) | Saber más de Mati | 了解更多 Mati |
| Menú: "por Mati" (`layout.porMati`) | por Mati | 由 Mati 驱动 |
| Inicio: sección (`dashboard.hoy`) | Hoy en Dazon | 今日 Dazon |
| Inicio: accesos (`dashboard.accesos`) | Ir a | 快速前往 |

Criterio: "fluyendo" y "汇流" (confluir) transmiten que las áreas y la información se juntan; los módulos en píldoras dicen qué concentra el sistema sin usar siglas. En el login, la otra lengua aparece como segunda línea debajo del titular, para que el personal mexicano y el chino vean ambos idiomas. Estos textos son los de la tabla; no los reescribas.

## 5. Paso 1 — Migrar colores literales a tokens

El código tiene los colores de marca repetidos como literales (`#1F3864` cerca de 300 veces, `#2E75B6` unas 50, `#162a4d` unas 50). Con ellos no se puede cambiar de identidad.

1. Crea un script de una sola vez (`scripts/migrar-colores.mjs`, que luego se borra) que recorra `src/**/*.{ts,tsx}` y reemplace: `bg|text|border|ring-[#1F3864]` → `bg|text|border|ring-primary`; `hover:bg-[#162a4d]` → `hover:bg-primary-hover` (agrega `primary-hover` a Tailwind apuntando a `--dazon-navy-deep`); `#2E75B6` en clases → `secondary`; en `style={{...}}` y props `color="#1F3864"` → `hsl(var(--primary))`.
2. No toques colores semánticos de estado (`#065F46`, `#991B1B`, `#D97706`, `#5B21B6`, `#6B7280`, `#FEE2E2`, `#FEF2F2`). Llévalos a los pares `status-*` solo si la equivalencia es exacta.
3. Verifica con `grep -rn "1F3864\|2E75B6\|162a4d" src` que no quede ningún literal de marca (el prototipo dejó algunos, por ejemplo en `Dashboard.tsx` y `ProtectedRoute.tsx`).

## 6. Paso 2 — Llevar el lenguaje circular a todas las pantallas

Recorre las 31 rutas de `App.tsx` (producción, inventario, almacén y remisiones de refacciones, incidencias, reportes de turno, remisiones, entregas, mis motocarros, clientes, las seis pantallas de Comercial, finanzas, crédito, proveedores, importar, usuarios, bitácora, configuración, y las pantallas de recuperación de contraseña y "sin acceso") y asegura:

- **Encabezado de página estándar:** título `h1`, subtítulo opcional y acciones a la derecha; un solo botón `default` por vista. Los filtros y buscadores de cada lista van en píldora.
- **Formas.** Sustituye `rounded`, `rounded-md` y `rounded-lg` sueltos en JSX por `rounded-full` (controles, etiquetas, chips, avatares, íconos con fondo) o `rounded-3xl` / `rounded-[1.75rem]` (paneles, tarjetas, bandejas). Los íconos con fondo cuadrado pasan a círculo (`rounded-full`, mismo tamaño). Los indicadores de estatus son píldoras.
- **Tablas.** Cada tabla va dentro de una tarjeta de radio grande con `overflow-hidden`; cabecera en `primary`; filas pares `surface-alt`; las filas no llevan radio. Las clases `.data-table` y `.kpi-card` de `index.css` se actualizan en consecuencia.
- **Barras y progreso** ya son píldoras; revisa que ninguna quede rectangular.
- **Estados vacíos:** componente reutilizable `EstadoVacio` con el panda dentro de un orbe a 120–160 px, una frase y una acción. Poses: palomeado = todo al día; reloj = pendiente; lupa = incidencia; camión = entregas.
- **Cero cristal en contenido.** Revisa que ninguna pantalla use `.glass-*` fuera de la navegación.
- **Chino.** Revisa cada pantalla principal con el idioma en `zh`: ningún botón, columna ni menú debe cortarse.

Mantén el movimiento sobrio: transiciones de 200–300 ms al pasar el cursor (elevación de 4 px en burbujas y orbes) y nada más. Los orbes de fondo ya se mueven solos.

## 7. Paso 3 — El inicio como centro de la operación

El prototipo ya trae el encabezado, los cuatro orbes con anillo y los accesos. Completa:

### 7.1 Orbes de indicadores
Los orbes de hoy muestran: avance de armado en porcentaje, unidades atrasadas, entregadas y stock libre. Agrega, solo para quien tenga el permiso correspondiente (`perms.puedeVer`) y reutilizando las consultas que ya existen: remisiones pendientes, incidencias abiertas, cobranza vencida y oportunidades abiertas. Máximo 6 orbes. Si un dato requiere una consulta que hoy no existe, omite ese orbe y anótalo en el PR; **no inventes tablas**.

### 7.2 Accesos
La cuadrícula de accesos circulares usa `useNavItems()`, así que respeta permisos. Agrupa visualmente por sección (Operación, Catálogos, Comercial, Finanzas, Sistema) con una etiqueta pequeña por grupo.

### 7.3 Orbe de indicador (especificación)
Círculo de 9.5 rem, fondo `card`, borde blanco, sombra suave; anillo SVG (`r=52`, grosor 8, extremos redondeados) que se llena según el porcentaje; ícono arriba y número grande al centro en el color del estado; etiqueta debajo. Al pasar el cursor sube 4 px. Es un botón: lleva a su módulo y tiene foco visible.

### 7.4 Paleta de búsqueda
Hoy la ruta `/buscar` redirige a `/produccion` (`App.tsx`), así que el buscador de la barra no busca. El prototipo ya trae la paleta de **pantallas**. Amplíala a datos:
- Grupos: Pantallas, Clientes, Remisiones, Unidades (por serie o VIN) y Proveedores. Usa las mismas tablas y columnas que ya consultan las pantallas correspondientes, con `ilike`, límite de 5 por grupo, retardo de 250 ms y respeto de las políticas de acceso. Si la persona no puede ver un módulo, no aparecen sus resultados.
- Cada resultado navega a su detalle o a la lista filtrada por ese texto.
- Quita la redirección de `/buscar` y deja una página simple con la misma búsqueda por si alguien comparte el enlace.
- Textos: "Buscar clientes, remisiones, unidades…" / "搜索客户、提货单、车辆…".

### 7.5 Actividad reciente
Lista corta (10 elementos) de la bitácora existente, solo con permiso `bitacora`; si no, se omite. En una tarjeta de radio grande, opaca.

## 8. Paso 4 — Tipografía, metadatos y marca

- Carga las fuentes de verdad: hoy `Inter` no se carga y se ve Arial, y para chino no hay fuente. Instala `@fontsource-variable/inter` y `@fontsource/noto-sans-sc` (pesos 400, 500 y 700; el subconjunto por `unicode-range` evita descargar todo el CJK). La pila ya está en `index.css`.
- `index.html`: `<title>Dazon por Mati</title>`, `<meta name="theme-color" content="#032B61">`. Al cambiar el idioma en `LangContext`, actualiza `document.documentElement.lang` a `es-MX` o `zh-CN`.
- Favicon y `apple-touch-icon`: `dazon-app-icono.png`; actualiza el manifiesto si existe.
- Pantallas de carga, `NotFound` y "sin acceso": logotipo de Dazon o panda en orbe, con texto bilingüe, en tarjeta redondeada.
- Agrega en Configuración el conmutador **"Reducir efectos"** (guarda `dazon_efectos` en `localStorage`, agrega la clase `sin-cristal` a `<html>`; se activa solo si `matchMedia('(prefers-reduced-transparency: reduce)')` coincide).
- Refracción real con filtros SVG: **no** en la versión base (pesa y Safari/Firefox la soportan mal). Déjala opcional detrás de `.glass-refract`, solo en Chromium con `navigator.hardwareConcurrency >= 8` y solo sobre el logotipo del menú.

## 9. Pendiente que dejó el prototipo (ciérralo)

1. Colores literales restantes (Paso 1).
2. Radios sueltos en pantallas y componentes de negocio (Paso 2).
3. Búsqueda de datos en la paleta (7.4) y la ruta `/buscar`.
4. Orbes adicionales por permiso (7.1) y actividad reciente (7.5).
5. Fuentes, metadatos y conmutador "Reducir efectos" (Paso 4).
6. El menú colapsado (modo ícono) hay que revisarlo a mano: los íconos van dentro de círculos de 44 px y el ítem activo conserva su fondo de cristal.

## 10. Paso 5 — Pruebas y verificación

1. `npm run typecheck`, `npm run test` y `npm run build` en verde.
2. Pruebas nuevas (vitest + testing-library): clase `sin-cristal`, `PaletaGlobal` (abre con atajo, filtra por permisos), `EstadoVacio`, orbe de indicador (porcentaje fuera de 0–100 se limita), llaves `t.groups.CRM` ("Comercial" / "销售与客户") y las de la sección 4 en ambos idiomas.
3. Paridad de i18n: toda llave de `es.ts` existe en `zh.ts` y viceversa.
4. Contraste del peor caso: calcula el contraste del texto del menú, la barra y los menús flotantes sobre el fondo más claro y el más oscuro de los orbes; debe ser ≥ 4.5:1. Si no cumple, sube la opacidad del cristal. En el prototipo el menú usa 84 % de opacidad del azul Dazon.
5. Capturas con Playwright en 1440×900, 1024×768 y 390×844, en `es` y `zh`, de: login, inicio, producción, remisiones, un detalle de Comercial y la paleta abierta. Guárdalas en `rediseno/capturas/` y súbelas al PR. Para las pantallas con sesión, simula Supabase con `page.route` como en el prototipo (sesión en `localStorage` bajo `sb-<ref>-auth-token`).
6. Revisa en el navegador con `prefers-reduced-transparency` simulado, con "Reducir efectos" y con `backdrop-filter` deshabilitado: todo debe verse sólido y legible. Revisa también con `prefers-reduced-motion`: los orbes quedan quietos.
7. Rendimiento: con el panel de rendimiento del navegador y estrangulamiento de CPU ×4, el desplazamiento de una tabla grande debe sentirse fluido. Si no, desactiva `backdrop-filter` en la barra superior y deja solo el menú.

## 11. Entrega

- Rama `rediseno-dazon-por-mati`, commits pequeños por paso (colores, formas, inicio, búsqueda, tipografía, pruebas).
- Pull Request hacia `main` con: resumen por paso, capturas, lista de lo que dejaste fuera y por qué, y la nota "traducciones al chino pendientes de revisión por hablante nativo".
- **No fusiones el PR ni subas a `main`.** Polo lo aprueba tras ver la vista previa de Vercel.

## 12. Referencias de Liquid Glass consultadas

- Guía de Apple (resumen del foro de desarrolladores): el cristal es una capa fija de navegación, no va en el contenido que se desplaza; evita cristal sobre cristal; usa colores vivos y no grises opacos; la jerarquía se expresa con el diseño y la agrupación. https://developer.apple.com/forums/thread/791070
- "Liquid Glass on the Web" (Frontend Masters): la base es `backdrop-filter`; la refracción real exige filtros SVG que pesan y tienen soporte desigual fuera de Chromium; el contraste del texto sobre fondos desconocidos es el riesgo principal. https://blog.master.dev/liquid-glass-on-the-web/
- Librería React/TypeScript de componentes de cristal, solo para consultar patrones (no instalar sin aprobación): https://github.com/yhooi2/shadcn-glass-ui-library (Apache-2.0).
- Componentes de ejemplo: https://21st.dev/@uniquesonu/components/liquid-glass
