-- =============================================================================
-- USUARIOS PRODUCCIÓN - Grupo Dazon Kit-to-Drive
-- Sprint 4 — Acceso real
--
-- INSTRUCCIONES:
--   1. En Supabase Dashboard → Authentication → Users:
--      Crear cada usuario con "Invite User" o "Add User".
--      Usar los correos exactamente como aparecen abajo.
--      Contraseña: generar una única por usuario y entregarla por canal seguro.
--      Forzar cambio al primer inicio (debe_cambiar_password / app_metadata).
--
--   2. Sustituye los valores PLACEHOLDER antes de ejecutar:
--        NOMBRE_FABRICA_1 / EMAIL_FABRICA_1 → nombre y correo real
--        etc.
--
--   3. Ejecuta este script en Supabase Dashboard → SQL Editor.
-- =============================================================================

-- ───────────────────────────────────────────────
-- 1. PERFILES
-- ───────────────────────────────────────────────
INSERT INTO public.profiles (id, nombre_completo, codigo_vendedor, activo)
SELECT u.id,
  CASE u.email
    -- Fábrica
    WHEN 'EMAIL_FABRICA_1'          THEN 'NOMBRE_FABRICA_1'
    WHEN 'EMAIL_FABRICA_2'          THEN 'NOMBRE_FABRICA_2'
    -- Ventas
    WHEN 'EMAIL_VENTAS_GERENTE'     THEN 'NOMBRE_VENTAS_GERENTE'
    WHEN 'EMAIL_VENTAS_COORD'       THEN 'NOMBRE_VENTAS_COORD'
    -- Logística
    WHEN 'EMAIL_LOGISTICA_GERENTE'  THEN 'NOMBRE_LOGISTICA_GERENTE'
    WHEN 'EMAIL_LOGISTICA_COORD_1'  THEN 'NOMBRE_LOGISTICA_COORD_1'
    WHEN 'EMAIL_LOGISTICA_COORD_2'  THEN 'NOMBRE_LOGISTICA_COORD_2'
    -- Dirección / Admin
    WHEN 'EMAIL_DIRECCION_1'        THEN 'NOMBRE_DIRECCION_1'
    WHEN 'EMAIL_DIRECCION_2'        THEN 'NOMBRE_DIRECCION_2'
    -- Cumplimiento
    WHEN 'EMAIL_CUMPLIMIENTO'       THEN 'NOMBRE_CUMPLIMIENTO'
  END,
  CASE u.email
    -- Solo ventas lleva código de vendedor
    WHEN 'EMAIL_VENTAS_GERENTE'     THEN 'VEN-GTE'   -- ajusta si hay código ERP
    WHEN 'EMAIL_VENTAS_COORD'       THEN 'VEN-COORD'
    ELSE NULL
  END,
  true
FROM auth.users u
WHERE u.email IN (
  'EMAIL_FABRICA_1', 'EMAIL_FABRICA_2',
  'EMAIL_VENTAS_GERENTE', 'EMAIL_VENTAS_COORD',
  'EMAIL_LOGISTICA_GERENTE', 'EMAIL_LOGISTICA_COORD_1', 'EMAIL_LOGISTICA_COORD_2',
  'EMAIL_DIRECCION_1', 'EMAIL_DIRECCION_2',
  'EMAIL_CUMPLIMIENTO'
)
ON CONFLICT (id) DO UPDATE SET
  nombre_completo = EXCLUDED.nombre_completo,
  codigo_vendedor = EXCLUDED.codigo_vendedor,
  activo = true;

-- ───────────────────────────────────────────────
-- 2. ROLES
-- ───────────────────────────────────────────────
-- Limpiar roles previos (seguro si aún no existían)
DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email IN (
    'EMAIL_FABRICA_1', 'EMAIL_FABRICA_2',
    'EMAIL_VENTAS_GERENTE', 'EMAIL_VENTAS_COORD',
    'EMAIL_LOGISTICA_GERENTE', 'EMAIL_LOGISTICA_COORD_1', 'EMAIL_LOGISTICA_COORD_2',
    'EMAIL_DIRECCION_1', 'EMAIL_DIRECCION_2',
    'EMAIL_CUMPLIMIENTO'
  )
);

INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
  CASE u.email
    WHEN 'EMAIL_FABRICA_1'          THEN 'fabrica'
    WHEN 'EMAIL_FABRICA_2'          THEN 'fabrica'
    WHEN 'EMAIL_VENTAS_GERENTE'     THEN 'ventas'
    WHEN 'EMAIL_VENTAS_COORD'       THEN 'coordinador'
    WHEN 'EMAIL_LOGISTICA_GERENTE'  THEN 'logistica'
    WHEN 'EMAIL_LOGISTICA_COORD_1'  THEN 'logistica'
    WHEN 'EMAIL_LOGISTICA_COORD_2'  THEN 'logistica'
    WHEN 'EMAIL_DIRECCION_1'        THEN 'admin'
    WHEN 'EMAIL_DIRECCION_2'        THEN 'admin'
    WHEN 'EMAIL_CUMPLIMIENTO'       THEN 'admin'  -- visibilidad total para cumplimiento
  END::app_role
FROM auth.users u
WHERE u.email IN (
  'EMAIL_FABRICA_1', 'EMAIL_FABRICA_2',
  'EMAIL_VENTAS_GERENTE', 'EMAIL_VENTAS_COORD',
  'EMAIL_LOGISTICA_GERENTE', 'EMAIL_LOGISTICA_COORD_1', 'EMAIL_LOGISTICA_COORD_2',
  'EMAIL_DIRECCION_1', 'EMAIL_DIRECCION_2',
  'EMAIL_CUMPLIMIENTO'
);

-- ───────────────────────────────────────────────
-- 3. VERIFICACIÓN
-- ───────────────────────────────────────────────
SELECT
  u.email,
  p.nombre_completo,
  ur.role,
  p.codigo_vendedor,
  p.activo
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email IN (
  'EMAIL_FABRICA_1', 'EMAIL_FABRICA_2',
  'EMAIL_VENTAS_GERENTE', 'EMAIL_VENTAS_COORD',
  'EMAIL_LOGISTICA_GERENTE', 'EMAIL_LOGISTICA_COORD_1', 'EMAIL_LOGISTICA_COORD_2',
  'EMAIL_DIRECCION_1', 'EMAIL_DIRECCION_2',
  'EMAIL_CUMPLIMIENTO'
)
ORDER BY ur.role, p.nombre_completo;
