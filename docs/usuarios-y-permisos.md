# Usuarios: tipo de usuario × área

Solo existen **tres tipos de usuario**. El **área** es una dimensión aparte:
define *qué* módulos toca la persona; el tipo de usuario define *qué puede hacer*
dentro de ellos.

## Tipos de usuario (nivel)

| Tipo | Qué puede hacer |
|---|---|
| **Operador** | Captura y da seguimiento a **su propio** trabajo dentro de su área. Crea y edita lo suyo; no borra. |
| **Supervisor** | Ve y corrige **todo lo de su área**, aprueba y consulta indicadores del equipo. No borra ni gestiona usuarios. |
| **Administrador** | Control total de su área, incluido **borrar** y **dar de alta/baja usuarios de su área**. |

El **Administrador de Dirección** es el administrador global: ve y opera todas
las áreas y es el único con acceso a *Configuración*.

## Áreas

`Comercial` · `Fábrica` · `Almacén y Logística` · `Administración` · `Dirección`

Dirección tiene visibilidad transversal (ve todo), pero solo su administrador
escribe fuera de su área.

## Módulos por área

| Módulo | Comercial | Fábrica | Almacén y Log. | Administración | Dirección |
|---|:-:|:-:|:-:|:-:|:-:|
| Tablero | ✓ | ✓ | ✓ | ✓ | ✓ |
| Producción | | ✓ | ✓ | | 👁 |
| Inventario | | ✓ | ✓ | | 👁 |
| Reportes de turno | | ✓ | ✓ | | 👁 |
| Remisiones | ✓ | ✓ | ✓ | ✓ | 👁 |
| Entregas | | | ✓ | | 👁 |
| Mis motocarros | ✓ | | | | 👁 |
| Clientes | ✓ | ✓ | | ✓ | 👁 |
| CRM (oportunidades, actividades, rutas) | ✓ | | | | 👁 |
| CRM equipo y tracker | ✓ (supervisor+) | | | | 👁 |
| Finanzas | | | | ✓ | 👁 |
| Importar datos | | ✓ (admin) | ✓ (admin) | ✓ (admin) | ✓ (admin) |
| Usuarios | ✓ (admin) | ✓ (admin) | ✓ (admin) | ✓ (admin) | ✓ (admin) |
| Bitácora | ✓ (admin) | ✓ (admin) | ✓ (admin) | ✓ (admin) | ✓ (admin) |
| Configuración | | | | | ✓ (admin) |

`✓` opera · `👁` solo lectura (Dirección, salvo su administrador)

## Remisiones: leer es del área, escribir es del nivel

La bandeja de remisiones es el caso donde la distinción importa y conviene no
confundirla:

- **Leer.** Toda el área Comercial ve **todas** las remisiones, en cualquier
  nivel — más Dirección y Administración. El equipo trabaja sobre la misma
  información: un operador tiene que poder consultar la remisión que capturó
  otro. Lo resuelven las políticas `comercial lee remisiones` y
  `comercial lee motocarros`, que van por área, no por nivel.
- **Escribir.** Sigue el nivel, sin excepción. El operador captura y edita
  **lo suyo**; el supervisor corrige lo de cualquiera de su área; sólo el
  administrador de área borra.
- **Corregir y complementar, con motivo.** Hasta 2026-09-02 corregir una
  remisión ya capturada era en la práctica cosa del administrador: los
  renglones (`remision_items`) no tenían política de UPDATE y su DELETE pedía el
  rol legado `admin`. Ahora el operador corrige y complementa **las que
  capturó** y el supervisor las de todo su área, pero **el motivo es
  obligatorio**: se guarda en `remisiones_bitacora` (con `CHECK` de 10
  caracteres en la propia tabla) *antes* de aplicar el cambio, así que una
  modificación sin justificación no llega a guardarse. El historial se ve en
  «Ver remisión completa» y la tarjeta marca cuántas veces se modificó.
- **Fábrica no frena a Ventas, pero el armado empezado no se toca.** Bajar el
  total reparte las unidades sobrantes en tres:
  1. Las que siguen en `PENDIENTE` **se liberan solas** y Fábrica y Logística
     reciben el aviso. Para ellos es indistinto: el chasis vuelve a la fila.
  2. Las que ya entraron a armado (`EN_PROCESO` en adelante) **no se quitan
     desde Comercial**: se levanta una **solicitud** a Fábrica, que acepta o
     rechaza desde su bandeja (`responder_solicitud()`). Aceptar libera la
     unidad ahí mismo; la respuesta le regresa a quien la pidió.
  3. Las ya **entregadas o en ruta** no se pueden ni pidiendo: ya salieron del
     almacén.

  `PENDIENTE` es el corte porque es lo único que la base guarda como «todavía
  no se toca»: `ATRASADO` nunca se escribe, se calcula en pantalla para lo
  vencido.
- **Lo que no hay, no se compromete.** Al capturar y al editar, una línea que
  pida más de lo disponible no deja guardar: «estás pidiendo 3 de Azul y sólo
  hay 1». Cuando no hay dato de inventario de ese color no se bloquea — no
  saber no es lo mismo que no haber.
- **Capturar.** `crear remisiones` y `remision_items_insert` existen en dos
  versiones con el mismo nombre: la original, que sólo conoce los roles legados
  (`admin`, `coordinador`, `ventas`) y por tanto no deja capturar al supervisor
  de Comercial —`coordinador_ventas`— ni siquiera a su nombre; y la de
  20260825000001, que ya trae la escalera por área. Como el nombre no dice cuál
  quedó, 20260902000001 se hace cargo del INSERT de renglones y suma una
  política de captura por área: si la buena ya estaba, no cambia nada; si no,
  cierra el hueco.

## Cuidado con revisar políticas por nombre

Varios scripts **redefinen** una política conservando su nombre
(`crear remisiones`, `remision_items_insert`, `leer remisiones por rol`…). Que
exista no dice cuál versión quedó, y por eso `diagnostico_esquema.sql` acepta un
tercer campo con un texto que la política debe contener
(`politica|tabla.nombre|supervisa_area`). El mismo cuidado aplica a los helpers:
ese script revisaba **uno** de los ocho que crea 20260823000005 y daba el
archivo por aplicado, así que un hueco a media migración sólo salía cuando otro
script se negaba a correr. Ahora los revisa todos.

En la UI eso es `editaTodas = perms.puedeEditar("remisiones")` en
`src/pages/Remisiones.tsx`, que gobierna **acciones**, nunca visibilidad. Qué
filas llegan lo decide el RLS; el selector *Todo el equipo / Solo las mías* es
sólo un filtro de vista del lado del cliente.

## Dónde vive esto en el código

- `src/lib/permissions.ts` — única fuente de verdad: niveles, áreas, módulos y
  la función `permisosDe(area, nivel)` con `puedeVer / puedeCrear / puedeEditar /
  puedeEliminar / puedeAprobar / soloPropios`.
- `src/contexts/AuthContext.tsx` — expone `area`, `nivel` y `perms`.
- `src/components/ProtectedRoute.tsx` y `AppSidebar.tsx` — resuelven rutas y menú
  por módulo, no por rol.
- `supabase/migrations/20260823000005_usuarios_niveles_areas.sql` — columnas
  `user_roles.nivel` y `user_roles.area`, helpers de RLS (`es_area`,
  `nivel_al_menos`, `es_admin_area`, `es_admin_global`, `supervisa_area`) y
  políticas por área.
- `supabase/migrations/20260824000002_comercial_lee_toda_la_bandeja.sql` —
  corrige la lectura de remisiones y motocarros para que sea por área y no por
  nivel (ver la sección anterior).
- `supabase/migrations/20260902000001_operador_edita_remisiones.sql` — la
  escalera de Comercial en `rol_comercial()` (global / supervisor / operador /
  ninguno) y dos predicados encima: `puede_editar_remision()` y
  `puede_capturar_remision()`. Con ellos abre UPDATE/DELETE/INSERT de
  `remision_items`, el UPDATE del encabezado y el INSERT de `remisiones`;
  agrega `remision_items.orden_linea` y crea `remisiones_bitacora` (motivo
  obligatorio, sin políticas de UPDATE ni DELETE: la bitácora no se corrige).
  **No usa `es_area()` / `supervisa_area()` a propósito**: la primera versión
  los exigía en su preflight y se negó a correr en producción porque faltaba al
  menos uno. `rol_comercial()` lee `user_roles.area/nivel` directamente y, si
  vienen vacíos, deduce el par del rol legado igual que `desdeRolLegacy()`, así
  que da lo mismo si los helpers están o no. Al correr, el script imprime cuáles
  encontró.
- `src/lib/remisionesEdicion.ts` — reconstruye el formulario desde los
  renglones guardados, calcula el alta/cambio/baja de cada renglón al guardar, y
  decide qué líneas no alcanzan con el inventario.
- `supabase/migrations/20260903000001_avisos_entre_areas.sql` — la tabla
  `avisos` (el único canal entre áreas que hay) con acuse de «visto», y
  `ajustar_unidades_remision()`, que libera las unidades sobrantes al bajar una
  remisión y deja el aviso. El aviso no se puede editar después: un trigger
  congela todo menos el acuse.
- `supabase/migrations/20260904000001_solicitudes_a_fabrica.sql` — el corte en
  el inicio de armado, y las solicitudes: `avisos` aprende a pedir respuesta
  (`requiere_respuesta`, `estado`, `accion`) y `responder_solicitud()` la
  ejecuta. Un aviso se acusa y se contesta, pero nunca se reescribe.
- `src/components/BandejaAvisos.tsx` — la bandeja (Producción y Remisiones) y
  el contador del tablero. Un aviso normal se despacha con «Visto»; una
  solicitud pide «Aceptar y liberar» o «No se puede», con respuesta escrita.

## Compatibilidad

La columna histórica `user_roles.role` (enum `app_role`) **se conserva y se
deriva automáticamente** de `(area, nivel)` mediante trigger, de modo que las
políticas RLS y los scripts de carga existentes siguen funcionando. Los usuarios
previos se migraron así:

| Rol anterior | Área | Tipo |
|---|---|---|
| `admin` | Dirección | Administrador |
| `director_ventas` | Comercial | Administrador |
| `coordinador_ventas`, `coordinador` | Comercial | Supervisor |
| `ventas`, `auxiliar_ventas` | Comercial | Operador |
| `fabrica` | Fábrica | Operador |
| `logistica` | Almacén y Logística | Operador |
| `admin_financiero` | Administración | Administrador |
| `finanzas` | Administración | Operador |
