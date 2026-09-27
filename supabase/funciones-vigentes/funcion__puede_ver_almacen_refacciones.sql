-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260922000001_almacen_refacciones.sql

CREATE OR REPLACE FUNCTION public.puede_ver_almacen_refacciones(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.almacen_refacciones_acceso a
    WHERE a.activo
      AND (
        a.user_id = _user_id
        OR lower(a.email) = lower(coalesce(
          (SELECT email FROM auth.users WHERE id = _user_id),
          ''
        ))
      )
  );
$$;
