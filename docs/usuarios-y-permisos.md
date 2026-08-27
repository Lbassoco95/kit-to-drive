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
