# Soporte desde Kit-to-Drive → API de Mati

Los usuarios pueden reportar fallas de la aplicación desde **Soporte**
(`/soporte`). Los tickets viven en el módulo de soporte de Mati
(`support_tickets` / `support_ticket_messages`) y el equipo los atiende en
mati-admin (`/admin/tickets`) o en la app tenant (`/soporte`).

## Piezas

| Pieza | URL |
|---|---|
| API Mati | https://mati-api-six.vercel.app |
| Admin | https://mati-admin.vercel.app/admin/tickets |
| Edge function | `mati-support` |

```
kit-to-drive UI  --(JWT Supabase)-->  edge function mati-support
mati-support     --(Bearer mati_token)-->  mati-api /workspace/tickets
```

## Contrato HTTP (edge function)

Base:

```
https://dmhzhyeivvuliumcgsmm.supabase.co/functions/v1/mati-support
```

Auth: `Authorization: Bearer <access_token del usuario de kit-to-drive>`.

| Método | Ruta | Body |
|---|---|---|
| `GET` | `/health` | — (público de liveness; no exige JWT de negocio) |
| `GET` | `/tickets` | — lista los tickets de este usuario |
| `POST` | `/tickets` | `{ asunto, descripcion, prioridad?, ruta?, user_agent? }` |
| `GET` | `/tickets/:id` | detalle + mensajes |
| `POST` | `/tickets/:id/messages` | `{ mensaje }` |

`prioridad`: `baja` · `normal` · `alta` · `urgente`.

Al crear, el bridge antepone `[kit-to-drive]` al asunto y agrega metadatos del
usuario (nombre, email, id, área × nivel, pantalla) a la descripción para que
el equipo de Mati sepa quién reportó.

## Secretos en Supabase

Edge Functions → Secrets:

| Secreto | Uso |
|---|---|
| `MATI_API_URL` | Default `https://mati-api-six.vercel.app` |
| `MATI_SUPPORT_TOKEN` | Bearer de una cuenta del tenant Mati (preferido) |
| `MATI_SUPPORT_EMAIL` | Alternativa: login en `/auth/login` |
| `MATI_SUPPORT_PASSWORD` | Contraseña de esa cuenta |

La cuenta debe ser un usuario del tenant Mati con el módulo **soporte** activo
(planes growth / enterprise / partner). Sin estos secretos la edge function
responde `503 BRIDGE_NOT_CONFIGURED` y la UI lo avisa.

## API Mati consumida

Documentada por el cliente `mati-app` (bundle público):

| Método | Ruta | Body |
|---|---|---|
| `POST` | `/auth/login` | `{ email, password }` → `{ token, user, tenant }` |
| `GET` | `/workspace/tickets` | lista |
| `POST` | `/workspace/tickets` | `{ asunto, descripcion, prioridad }` |
| `GET` | `/workspace/tickets/:id` | detalle |
| `POST` | `/workspace/tickets/:id/messages` | `{ mensaje }` |

Auth: `Authorization: Bearer <mati_token>` (`localStorage.mati_token` en la app Mati).

## Despliegue

1. Crear los secretos en el proyecto Supabase `dmhzhyeivvuliumcgsmm`.
2. Desplegar la función:

```bash
supabase functions deploy mati-support --project-ref dmhzhyeivvuliumcgsmm
```

`verify_jwt` queda en `false` en `config.toml` porque la función valida el JWT
con el cliente anon (igual que `admin-create-user`) y así puede devolver
errores JSON claros cuando falta la sesión.
