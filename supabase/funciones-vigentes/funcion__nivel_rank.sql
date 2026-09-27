-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000005_usuarios_niveles_areas.sql

CREATE OR REPLACE FUNCTION public.nivel_rank(_nivel public.user_nivel)
RETURNS INTEGER LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE _nivel WHEN 'operador' THEN 1 WHEN 'supervisor' THEN 2 WHEN 'admin' THEN 3 END
$$;
