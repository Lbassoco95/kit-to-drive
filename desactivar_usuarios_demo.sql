-- ═══════════════════════════════════════════════════════════════════════════
-- Dar de baja las cuentas de demostración
--
-- Requiere `20260824000003_usuario_activo_se_aplica.sql`. Antes de ese script
-- esto no servía de nada: `profiles.activo` no se validaba en ningún lado y un
-- usuario «inactivo» entraba igual. Ahora sí corta, en la app y en el RLS.
--
-- CUIDADO CON EL CORREO: no sirve filtrar por `@dazon.demo`. Las cuentas reales
-- del equipo usan ese mismo dominio — `atenea@dazon.demo` es una persona. Por
-- eso las cuentas demo se nombran una por una en vez de usar un patrón.
--
-- Es reversible: no borra nada, sólo apaga `activo`. Para revivir una, se
-- vuelve a encender desde Sistema → Usuarios o con el bloque del final.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Revisar ANTES de apagar nada ────────────────────────────────────────
-- Corre esto solo primero y confirma que la lista es exactamente la esperada:
-- deben salir seis cuentas demo y ninguna persona real.
SELECT p.nombre_completo, u.email, ur.area, ur.nivel, p.activo
  FROM public.profiles p
  LEFT JOIN auth.users u       ON u.id = p.id
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
 WHERE p.nombre_completo IN (
   'Administrador Demo',
   'Coordinador Demo',
   'Fábrica Demo',
   'Logística Demo',
   'Vendedor Demo',
   'Finanzas Demo'
 )
 ORDER BY p.nombre_completo;

-- ── 2. Apagarlas ───────────────────────────────────────────────────────────
UPDATE public.profiles
   SET activo = false
 WHERE nombre_completo IN (
   'Administrador Demo',
   'Coordinador Demo',
   'Fábrica Demo',
   'Logística Demo',
   'Vendedor Demo',
   'Finanzas Demo'
 );

-- ── 3. Perfiles sin rol asignado ───────────────────────────────────────────
-- No entran a ningún módulo (`ProtectedRoute` los manda a la pantalla de «tu
-- usuario aún no tiene permisos»), pero conviene verlos: suelen ser pruebas
-- olvidadas, como `test-scan@test.com`. Revisa la lista y decide.
SELECT p.nombre_completo, u.email, p.activo, p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
 WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id)
 ORDER BY p.created_at;

-- ── 4. Comprobar el resultado ──────────────────────────────────────────────
-- Los seis demo deben quedar en `activo_efectivo = false`, y las siete personas
-- reales (Lee, Polo, Edgar, Erika, Ana Karen, Atenea, Marco) en `true`.
SELECT p.nombre_completo, ur.area, ur.nivel, p.activo,
       public.usuario_activo(p.id) AS activo_efectivo
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
 ORDER BY p.activo DESC, ur.area, p.nombre_completo;

-- ── Para revertir una cuenta ───────────────────────────────────────────────
-- UPDATE public.profiles SET activo = true WHERE nombre_completo = 'Vendedor Demo';
