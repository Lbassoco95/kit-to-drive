-- Cómo dar acceso a Martín (u otra persona) al almacén de refacciones
-- ---------------------------------------------------------------------------
-- 1) Crear el usuario en Supabase Auth (email + contraseña, Auto Confirm).
-- 2) Asignarle perfil y rol como cualquier usuario del equipo.
-- 3) Correr esto (cambia el correo si no es martin@…):

INSERT INTO public.almacen_refacciones_acceso (email, nombre, user_id, activo)
SELECT lower(u.email), coalesce(p.nombre_completo, 'Martín'), u.id, true
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = lower('martin@dazon.demo')   -- <-- correo real de Martín
ON CONFLICT (email) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  nombre = EXCLUDED.nombre,
  activo = true;

-- Verificar:
SELECT email, nombre, activo, user_id IS NOT NULL AS vinculado
FROM public.almacen_refacciones_acceso
ORDER BY email;
