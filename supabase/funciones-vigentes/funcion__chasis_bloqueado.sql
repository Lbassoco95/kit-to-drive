-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public.chasis_bloqueado(_chasis_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.incidencias_chasis i
     WHERE i.chasis_id = _chasis_id
       AND ( i.estatus IN ('no_util','garantia')
          OR (i.estatus IN ('abierta','en_revision') AND i.retiene_chasis) )
  );
$$;
