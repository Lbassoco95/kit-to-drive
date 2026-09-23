-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260903000001_avisos_entre_areas.sql

CREATE OR REPLACE FUNCTION public.recibe_avisos_de(_area public.user_area, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
      LEFT JOIN public.profiles p ON p.id = ur.user_id
     WHERE ur.user_id = _user_id
       AND COALESCE(p.activo, true)
       AND (
         ur.area = _area
         -- Dirección ve todo, y el rol legado `admin` es su equivalente.
         OR ur.area = 'direccion'
         OR ur.role = 'admin'
       )
  );
$$;
