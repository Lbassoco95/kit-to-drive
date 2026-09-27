-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public.asignar_chasis_remision(
  _remision_id uuid, _cantidad integer, _color text DEFAULT NULL::text, _modelo text DEFAULT NULL::text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE asignados integer := 0;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'fabrica') OR
    EXISTS (SELECT 1 FROM public.remisiones r WHERE r.id = _remision_id AND r.vendedor_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'No autorizado para asignar chasis a esta remisión';
  END IF;

  WITH candidatos AS (
    SELECT m.id
      FROM public.motocarros m
      LEFT JOIN public.modelos_producto mp ON mp.modelo = m.modelo
      LEFT JOIN public.inventario_chasis ic ON ic.numero_chasis = m.ns_chasis
     WHERE m.remision_id IS NULL
       AND m.estatus_armado IN ('PENDIENTE','EN_PROCESO','ARMADO','LISTO')
       AND m.estatus_entrega <> 'ENTREGADA'
       AND NULLIF(trim(COALESCE(m.ns_chasis,'')),'') IS NOT NULL
       AND NULLIF(trim(COALESCE(m.ns_motor ,'')),'') IS NOT NULL
       AND (ic.id IS NULL OR NOT public.chasis_bloqueado(ic.id))
       AND (_color  IS NULL OR upper(m.color) = upper(_color))
       AND (_modelo IS NULL OR upper(COALESCE(mp.nombre_comercial, m.modelo)) = upper(_modelo))
     ORDER BY m.orden_armado ASC
     LIMIT _cantidad
     FOR UPDATE OF m SKIP LOCKED
  )
  UPDATE public.motocarros m
     SET remision_id = _remision_id,
         estatus_entrega = CASE WHEN m.estatus_entrega = 'NO_APLICA'
                                THEN 'PROGRAMADA' ELSE m.estatus_entrega END
    FROM candidatos c
   WHERE m.id = c.id;

  GET DIAGNOSTICS asignados = ROW_COUNT;

  UPDATE public.remisiones r
     SET estatus = CASE
       WHEN (SELECT COUNT(*) FROM public.motocarros mm WHERE mm.remision_id = r.id) >= r.total_unidades_solicitadas
         THEN 'COMPLETA'::estatus_remision
       WHEN (SELECT COUNT(*) FROM public.motocarros mm WHERE mm.remision_id = r.id) > 0
         THEN 'PARCIAL'::estatus_remision
       ELSE 'NUEVA'::estatus_remision END
   WHERE r.id = _remision_id;

  RETURN asignados;
END; $$;
