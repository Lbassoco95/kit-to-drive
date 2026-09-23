-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public.desconfigurar_unidad(_motocarro_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _m record; _chasis_ids uuid[];
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede liberar unidades';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Se requiere un motivo';
  END IF;

  SELECT * INTO _m FROM motocarros WHERE id = _motocarro_id;
  IF _m IS NULL THEN RAISE EXCEPTION 'Unidad no encontrada'; END IF;
  IF _m.remision_id IS NOT NULL THEN
    RAISE EXCEPTION 'La unidad ya está asignada a una remisión; no se puede liberar';
  END IF;
  IF _m.estatus_armado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'La unidad ya entró a armado; no se puede liberar';
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO _chasis_ids
    FROM inventario_chasis WHERE motocarro_id = _motocarro_id;

  UPDATE inventario_chasis SET motocarro_id = NULL, estatus = 'disponible',
         fecha_configuracion = NULL WHERE motocarro_id = _motocarro_id;
  UPDATE inventario_motor  SET motocarro_id = NULL, estatus = 'disponible',
         fecha_configuracion = NULL WHERE motocarro_id = _motocarro_id;

  DELETE FROM motocarros WHERE id = _motocarro_id;

  -- Reponer el estatus que le corresponde al chasis según sus incidencias:
  -- un chasis con garantía abierta no debe volver a 'disponible'.
  IF array_length(_chasis_ids,1) IS NOT NULL THEN
    PERFORM public._sincronizar_estatus_chasis(cid) FROM unnest(_chasis_ids) AS cid;
  END IF;

  UPDATE contenedores c SET total_unidades =
    (SELECT count(*) FROM inventario_chasis ic
      WHERE ic.contenedor_id = c.id AND ic.motocarro_id IS NOT NULL)
  WHERE c.id = _m.contenedor_id;

  PERFORM public.recalcular_inventario_colores();

  RETURN jsonb_build_object('ok', true, 'liberada', _m.orden_armado);
END; $$;
