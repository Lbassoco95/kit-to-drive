-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260824000003_usuario_activo_se_aplica.sql

CREATE OR REPLACE FUNCTION public.supervisa_area(_user_id UUID, _area public.user_area)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.usuario_activo(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id
          AND public.nivel_rank(nivel) >= 2
          AND (area = _area OR (area = 'direccion' AND nivel = 'admin'))
     )
$$;
