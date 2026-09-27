-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260822000001_configuracion_manual_unidades.sql

CREATE OR REPLACE FUNCTION public.cambiar_orden_armado(
  _motocarro_id uuid, _orden_nuevo integer, _motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _actual int; _ocupa uuid; _estatus_actual estatus_armado;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede cambiar el orden';
  END IF;
  IF _orden_nuevo IS NULL OR _orden_nuevo < 1 THEN
    RAISE EXCEPTION 'Orden inválido';
  END IF;

  SELECT orden_armado, estatus_armado INTO _actual, _estatus_actual
    FROM motocarros WHERE id = _motocarro_id;
  IF _actual IS NULL THEN RAISE EXCEPTION 'Unidad no encontrada'; END IF;
  IF _estatus_actual NOT IN ('PENDIENTE','EN_PROCESO') THEN
    RAISE EXCEPTION 'La unidad ya entró a armado; no se puede reordenar';
  END IF;
  IF _actual = _orden_nuevo THEN
    RETURN jsonb_build_object('ok', true, 'sin_cambio', true);
  END IF;

  -- Si el orden destino está ocupado, se INTERCAMBIAN y se registran los dos
  SELECT id INTO _ocupa FROM motocarros WHERE orden_armado = _orden_nuevo;

  IF _ocupa IS NOT NULL THEN
    UPDATE motocarros SET orden_armado = -1, updated_at = now() WHERE id = _motocarro_id;
    UPDATE motocarros SET orden_armado = _actual, updated_at = now() WHERE id = _ocupa;
    UPDATE motocarros SET orden_armado = _orden_nuevo, updated_at = now() WHERE id = _motocarro_id;

    INSERT INTO bitacora_orden_armado (motocarro_id, orden_anterior, orden_nuevo, motivo, cambiado_por)
    VALUES (_ocupa, _orden_nuevo, _actual, COALESCE(_motivo,'intercambio'), auth.uid());
  ELSE
    UPDATE motocarros SET orden_armado = _orden_nuevo, updated_at = now() WHERE id = _motocarro_id;
  END IF;

  INSERT INTO bitacora_orden_armado (motocarro_id, orden_anterior, orden_nuevo, motivo, cambiado_por)
  VALUES (_motocarro_id, _actual, _orden_nuevo, _motivo, auth.uid());

  RETURN jsonb_build_object('ok', true, 'orden_anterior', _actual,
    'orden_nuevo', _orden_nuevo, 'intercambio_con', _ocupa);
END; $$;
