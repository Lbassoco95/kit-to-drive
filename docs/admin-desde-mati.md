# Administración de Kit-to-Drive desde Mati Admin

Kit-to-Drive es un sistema de la familia **Mati** (marca *Mati by Yoltik*). La
administración canónica —usuarios, áreas × nivel, alta/baja y configuración
general— se hace desde **mati-admin**, no desde la UI local de Sistema.

| Pieza | URL / repo |
|---|---|
| Panel admin | https://mati-admin.vercel.app |
| API Mati | https://mati-api-six.vercel.app |
| App operativa | https://kit-to-drive.vercel.app |
| Repo app | https://github.com/Lbassoco95/kit-to-drive |
| Repo Mati | https://github.com/Lbassoco95/mati-app |

## Puente en este repo

Edge function: `mati-admin-bridge`

```
https://dmhzhyeivvuliumcgsmm.supabase.co/functions/v1/mati-admin-bridge
```

Autenticación (secreto compartido, **no** JWT de usuario):

```
Authorization: Bearer <MATI_ADMIN_BRIDGE_SECRET>
# o
x-mati-bridge-secret: <MATI_ADMIN_BRIDGE_SECRET>
```

El secreto se configura en Supabase → Edge Functions → Secrets como
`MATI_ADMIN_BRIDGE_SECRET`, y el mismo valor en mati-api (p. ej.
`KIT_TO_DRIVE_BRIDGE_SECRET`).

`verify_jwt` está en `false` porque mati-api autentica con el secreto propio
de admin de Mati y luego llama al bridge.

## Contrato HTTP

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Liveness + identidad del sistema |
| `GET` | `/meta` | Áreas, niveles, URLs |
| `GET` | `/users` | Lista `profiles` + `user_roles` |
| `GET` | `/users/:id` | Detalle |
| `POST` | `/users` | Alta (Auth + profile + rol) |
| `PATCH` | `/users/:id` | Perfil y/o `area`/`nivel`/`activo` |
| `POST` | `/users/:id/activate` | `activo = true` |
| `POST` | `/users/:id/deactivate` | `activo = false` |
| `POST` | `/users/:id/reset-password` | `{ password, force_password_change? }` |
| `GET` | `/config` | Fila `config_general` id=1 |
| `PATCH` | `/config` | Campos permitidos (abajo) |

### Alta de usuario (`POST /users`)

```json
{
  "email": "persona@empresa.com",
  "password": "temporal-segura",
  "nombre_completo": "Nombre Apellido",
  "area": "comercial",
  "nivel": "operador",
  "codigo_vendedor": "VEN001",
  "force_password_change": true
}
```

`area`: `comercial` · `fabrica` · `almacen_logistica` · `administracion` · `direccion`  
`nivel`: `operador` · `supervisor` · `admin`

El `role` legacy de `user_roles` lo deriva el bridge (y el trigger de BD).

### Configuración (`PATCH /config`)

Campos permitidos: `empresa_nombre`, `capacidad_diaria`,
`plazo_max_credito_dias`, `limite_ya_armados`.

## Qué hay que agregar en mati-app

En el monorepo de Mati (admin + api):

1. **mati-api**: módulo/proxy `GET|POST|PATCH /admin/kit-to-drive/...` que
   reenvía al bridge con el secreto. Reutilizar el middleware de
   `admin` (token `mati_admin_token` / `admin_users`).
2. **mati-admin**: sección **Kit-to-Drive** (ruta sugerida
   `/admin/kit-to-drive`) con:
   - listado / alta / edición / activar-desactivar usuarios
   - selector de área × nivel (mismo modelo que este repo)
   - pantalla de configuración general
3. Variables de entorno en mati-api:
   - `KIT_TO_DRIVE_BRIDGE_URL`
   - `KIT_TO_DRIVE_BRIDGE_SECRET`

Hasta que eso exista, este repo deja el aviso en `/usuarios` y
`/configuracion` apuntando a mati-admin, y la UI local deja de ofrecer
altas cuando `VITE_MATI_ADMIN_MANAGED` no está en `false`.

## Variables en Kit-to-Drive (frontend)

| Variable | Uso |
|---|---|
| `VITE_MATI_ADMIN_URL` | Base del panel (default `https://mati-admin.vercel.app`) |
| `VITE_MATI_ADMIN_MANAGED` | `true`/`false` — si la UI local se considera gestionada desde Mati (default: true) |

## Modelo de permisos (recordatorio)

Ver `docs/usuarios-y-permisos.md`. Un usuario = un área × un nivel.
`profiles.activo = false` corta la sesión en UI y el acceso RLS.
