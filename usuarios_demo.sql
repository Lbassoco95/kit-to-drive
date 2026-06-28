-- =============================================================================
-- USUARIOS DEMO - Grupo Dazon Kit-to-Drive
-- Ejecutar DESPUÉS de crear los usuarios en Supabase Authentication > Users
-- Contraseña para todos: Dazon2026!
-- =============================================================================
--
-- PASO 1: Crear cada usuario en Supabase Dashboard:
--   Authentication > Users > Add user
--   Emails: admin@dazon.demo, fabrica@dazon.demo, logistica@dazon.demo,
--           ventas@dazon.demo, coordinador@dazon.demo
--   Password: Dazon2026! (marcar "Auto Confirm User")
--
-- PASO 2: Ejecutar este SQL en el SQL Editor
-- =============================================================================

-- Insertar / actualizar perfiles (nombre, código vendedor)
INSERT INTO public.profiles (id, nombre_completo, codigo_vendedor, activo)
SELECT
  u.id,
  CASE u.email
    WHEN 'admin@dazon.demo'       THEN 'Administrador Demo'
    WHEN 'fabrica@dazon.demo'     THEN 'Fábrica Demo'
    WHEN 'logistica@dazon.demo'   THEN 'Logística Demo'
    WHEN 'ventas@dazon.demo'      THEN 'Vendedor Demo'
    WHEN 'coordinador@dazon.demo' THEN 'Coordinador Demo'
  END as nombre_completo,
  CASE u.email
    WHEN 'ventas@dazon.demo'      THEN 'VEN001'
    WHEN 'coordinador@dazon.demo' THEN 'COORD01'
    ELSE NULL
  END as codigo_vendedor,
  true as activo
FROM auth.users u
WHERE u.email IN (
  'admin@dazon.demo',
  'fabrica@dazon.demo',
  'logistica@dazon.demo',
  'ventas@dazon.demo',
  'coordinador@dazon.demo'
)
ON CONFLICT (id) DO UPDATE SET
  nombre_completo = EXCLUDED.nombre_completo,
  codigo_vendedor = EXCLUDED.codigo_vendedor,
  activo = true;

-- Asignar roles
INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
  CASE u.email
    WHEN 'admin@dazon.demo'       THEN 'admin'
    WHEN 'fabrica@dazon.demo'     THEN 'fabrica'
    WHEN 'logistica@dazon.demo'   THEN 'logistica'
    WHEN 'ventas@dazon.demo'      THEN 'ventas'
    WHEN 'coordinador@dazon.demo' THEN 'coordinador'
  END::app_role as role
FROM auth.users u
WHERE u.email IN (
  'admin@dazon.demo',
  'fabrica@dazon.demo',
  'logistica@dazon.demo',
  'ventas@dazon.demo',
  'coordinador@dazon.demo'
)
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

-- Verificar resultado
SELECT
  u.email,
  p.nombre_completo,
  p.codigo_vendedor,
  ur.role,
  p.activo
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email LIKE '%dazon.demo'
ORDER BY ur.role;
