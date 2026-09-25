-- =============================================================================
-- USUARIOS DEMO - Grupo Dazon Kit-to-Drive
-- Ejecutar DESPUÉS de crear los usuarios en Supabase Authentication > Users
-- con contraseñas únicas (NO documentar passwords en este repo).
-- =============================================================================

-- 1) Perfiles
INSERT INTO public.profiles (id, nombre_completo, codigo_vendedor, activo)
SELECT
  u.id,
  CASE u.email
    WHEN 'admin@dazon.demo'       THEN 'Administrador Demo'
    WHEN 'fabrica@dazon.demo'     THEN 'Fábrica Demo'
    WHEN 'logistica@dazon.demo'   THEN 'Logística Demo'
    WHEN 'ventas@dazon.demo'      THEN 'Vendedor Demo'
    WHEN 'coordinador@dazon.demo' THEN 'Coordinador Demo'
  END,
  CASE u.email
    WHEN 'ventas@dazon.demo'      THEN 'VEN001'
    WHEN 'coordinador@dazon.demo' THEN 'COORD01'
    ELSE NULL
  END,
  true
FROM auth.users u
WHERE u.email IN (
  'admin@dazon.demo','fabrica@dazon.demo','logistica@dazon.demo',
  'ventas@dazon.demo','coordinador@dazon.demo'
)
ON CONFLICT (id) DO UPDATE SET
  nombre_completo = EXCLUDED.nombre_completo,
  codigo_vendedor = EXCLUDED.codigo_vendedor,
  activo = true;

-- 2) Roles: borrar los existentes y reinsertar para evitar conflictos de constraint
DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email IN (
    'admin@dazon.demo','fabrica@dazon.demo','logistica@dazon.demo',
    'ventas@dazon.demo','coordinador@dazon.demo'
  )
);

INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
  CASE u.email
    WHEN 'admin@dazon.demo'       THEN 'admin'
    WHEN 'fabrica@dazon.demo'     THEN 'fabrica'
    WHEN 'logistica@dazon.demo'   THEN 'logistica'
    WHEN 'ventas@dazon.demo'      THEN 'ventas'
    WHEN 'coordinador@dazon.demo' THEN 'coordinador'
  END::app_role
FROM auth.users u
WHERE u.email IN (
  'admin@dazon.demo','fabrica@dazon.demo','logistica@dazon.demo',
  'ventas@dazon.demo','coordinador@dazon.demo'
);

-- 3) Verificar
SELECT u.email, p.nombre_completo, ur.role, p.activo
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email LIKE '%dazon.demo'
ORDER BY ur.role;
