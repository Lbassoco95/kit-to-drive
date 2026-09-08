-- =============================================================================
-- ACCESOS DE REVISIÓN — Equipo Yoltik · Kit-to-Drive
-- 2026-09-08
--
-- Dos cuentas de Administrador global (área Dirección, nivel Administrador)
-- para que el equipo de Yoltik revise el proyecto a profundidad. Ese nivel ve
-- y opera todas las áreas y es el único con acceso a Configuración, así que
-- alcanza para recorrer toda la aplicación sin pedir permisos por módulo.
--
--   jcaguilar@yoltik.mx   JC Aguilar        Dirección · Administrador
--   cruvalcaba@yoltik.mx  Carmen Ruvalcaba  Dirección · Administrador
--
-- Las contraseñas viven en credenciales/JC_admin.txt y CARMEN_admin.txt,
-- no en este script (que sí va al repo).
--
-- Este script hace lo mismo que la Edge Function `admin-create-user`, pero
-- por SQL, para poder correrlo sin una sesión de administrador en la app.
-- Es idempotente: si la cuenta ya existe, sólo renueva contraseña, perfil y
-- rol.
--
-- OJO: sustituye los dos PLACEHOLDER_* por las contraseñas reales ANTES de
-- correrlo. Como en una cuenta existente la contraseña se sobrescribe, correr
-- el archivo tal cual dejaría a JC y Carmen sin poder entrar. El script se
-- niega a correr si los PLACEHOLDER siguen ahí, y no modifica nada.
--
-- Si sólo quieres comprobar cómo están las cuentas, corre nada más el SELECT
-- del final: es de lectura y no toca la contraseña.
--
-- Cómo correrlo: Supabase Dashboard → SQL Editor, proyecto kit-to-drive.
-- =============================================================================

DO $$
DECLARE
  cuenta   record;
  uid      uuid;
  cuentas  jsonb := '[
    {"email":"jcaguilar@yoltik.mx",  "nombre":"JC Aguilar",       "password":"PLACEHOLDER_JC"},
    {"email":"cruvalcaba@yoltik.mx", "nombre":"Carmen Ruvalcaba", "password":"PLACEHOLDER_CARMEN"}
  ]'::jsonb;
BEGIN
  FOR cuenta IN
    SELECT (c->>'email') AS email, (c->>'nombre') AS nombre, (c->>'password') AS password
    FROM jsonb_array_elements(cuentas) c
  LOOP
    -- Correr el script tal como está en el repo deja la contraseña en el texto
    -- literal 'PLACEHOLDER_...' y nadie puede entrar. Peor: en una cuenta que
    -- ya existe la sobrescribe, así que rompe accesos que funcionaban. Se
    -- aborta antes de tocar nada; RAISE EXCEPTION revierte todo el bloque.
    IF cuenta.password LIKE 'PLACEHOLDER%' THEN
      RAISE EXCEPTION
        'Sustituye los PLACEHOLDER por las contraseñas reales antes de correr este script (cuenta %). No se modificó nada.',
        cuenta.email;
    END IF;

    SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(cuenta.email);

    IF uid IS NULL THEN
      uid := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        lower(cuenta.email),
        extensions.crypt(cuenta.password, extensions.gen_salt('bf')),
        now(),  -- correo confirmado de entrada: entran con contraseña, sin correo de verificación
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('nombre_completo', cuenta.nombre),
        now(), now(), '', '', '', ''
      );

      -- Sin este renglón GoTrue no reconoce el proveedor `email` en la cuenta.
      INSERT INTO auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
      VALUES (
        gen_random_uuid(), uid, 'email', lower(cuenta.email),
        jsonb_build_object('sub', uid::text, 'email', lower(cuenta.email)),
        now(), now()
      );
    ELSE
      -- Ya existía: se renueva la contraseña y se deja el correo confirmado.
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(cuenta.password, extensions.gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at         = now()
      WHERE id = uid;
    END IF;

    -- Perfil
    INSERT INTO public.profiles (id, email, nombre_completo, codigo_vendedor, activo)
    VALUES (uid, lower(cuenta.email), cuenta.nombre, NULL, true)
    ON CONFLICT (id) DO UPDATE SET
      email           = EXCLUDED.email,
      nombre_completo = EXCLUDED.nombre_completo,
      codigo_vendedor = NULL,   -- no son vendedores: sin código
      activo          = true;

    -- Rol: Dirección · Administrador. El `role` legado se escribe consistente;
    -- el trigger de la base lo recalcula igual a partir de (area, nivel).
    DELETE FROM public.user_roles WHERE user_id = uid;
    INSERT INTO public.user_roles (user_id, area, nivel, role)
    VALUES (uid, 'direccion'::user_area, 'admin'::user_nivel, 'admin'::app_role);

    RAISE NOTICE 'Acceso listo: % (%)', cuenta.email, uid;
  END LOOP;
END $$;

-- ───────────────────────────────────────────────
-- Verificación
-- ───────────────────────────────────────────────
SELECT
  u.email,
  p.nombre_completo,
  ur.area,
  ur.nivel,
  ur.role,
  p.activo,
  u.email_confirmed_at IS NOT NULL AS correo_confirmado,
  EXISTS (
    SELECT 1 FROM auth.identities i
    WHERE i.user_id = u.id AND i.provider = 'email'
  ) AS identidad_email
FROM auth.users u
JOIN public.profiles p    ON p.id = u.id
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email IN ('jcaguilar@yoltik.mx', 'cruvalcaba@yoltik.mx')
ORDER BY u.email;
