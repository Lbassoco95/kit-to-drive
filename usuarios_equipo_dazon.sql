-- =============================================================================
-- USUARIOS EQUIPO GRUPO DAZON — Kit-to-Drive
-- =============================================================================
-- PASO 1: Crear cada usuario en Supabase Authentication > Users > Add user
--         con correo corporativo y contraseña ÚNICA entregada por canal seguro
--         (1Password / reset por correo). NUNCA documentar passwords aquí.
--         Marcar "Auto Confirm User".
--
-- PASO 2: Ejecutar este SQL en Supabase SQL Editor
-- =============================================================================

-- 1) Perfiles
INSERT INTO public.profiles (id, nombre_completo, codigo_vendedor, activo)
SELECT
  u.id,
  CASE u.email
    WHEN 'lee@dazon.demo'       THEN 'Lee'
    WHEN 'marco@dazon.demo'     THEN 'Marco'
    WHEN 'anakaren@dazon.demo'  THEN 'Ana Karen'
    WHEN 'edgar@dazon.demo'     THEN 'Edgar'
    WHEN 'erika@dazon.demo'     THEN 'Erika'
  END,
  CASE u.email
    WHEN 'marco@dazon.demo'    THEN 'VEN-MARCO'
    WHEN 'anakaren@dazon.demo' THEN 'VEN-AK'
    ELSE NULL
  END,
  true
FROM auth.users u
WHERE u.email IN (
  'lee@dazon.demo', 'marco@dazon.demo', 'anakaren@dazon.demo',
  'edgar@dazon.demo', 'erika@dazon.demo'
)
ON CONFLICT (id) DO UPDATE SET
  nombre_completo = EXCLUDED.nombre_completo,
  codigo_vendedor = EXCLUDED.codigo_vendedor,
  activo = true;

-- 2) Roles
DELETE FROM public.user_roles
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email IN (
    'lee@dazon.demo', 'marco@dazon.demo', 'anakaren@dazon.demo',
    'edgar@dazon.demo', 'erika@dazon.demo'
  )
);

INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
  CASE u.email
    WHEN 'lee@dazon.demo'      THEN 'admin'
    WHEN 'marco@dazon.demo'    THEN 'ventas'
    WHEN 'anakaren@dazon.demo' THEN 'ventas'
    WHEN 'edgar@dazon.demo'    THEN 'fabrica'
    WHEN 'erika@dazon.demo'    THEN 'fabrica'
  END::app_role
FROM auth.users u
WHERE u.email IN (
  'lee@dazon.demo', 'marco@dazon.demo', 'anakaren@dazon.demo',
  'edgar@dazon.demo', 'erika@dazon.demo'
);

-- 3) Verificar
SELECT u.email, p.nombre_completo, ur.role, p.activo
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email LIKE '%dazon.demo'
  AND u.email NOT LIKE '%@%@%'
ORDER BY ur.role;
