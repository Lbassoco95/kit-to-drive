-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000003_color_efectivo_capacidad.sql

CREATE OR REPLACE FUNCTION public.configurar_unidad(
  _chasis_id uuid, _motor_id uuid, _orden integer DEFAULT NULL, _color text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _ch record; _mo record; _orden_final int; _moto_id uuid; _inc record;
  _col text; _color_cambiado boolean := false;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede configurar unidades';
  END IF;

  SELECT * INTO _ch FROM inventario_chasis WHERE id = _chasis_id;
  IF _ch IS NULL THEN RAISE EXCEPTION 'Chasis no encontrado'; END IF;
  IF _ch.motocarro_id IS NOT NULL THEN
    RAISE EXCEPTION 'El chasis % ya está asignado a una unidad', _ch.numero_chasis;
  END IF;

  IF public.chasis_bloqueado(_chasis_id) THEN
    SELECT folio, estatus, parte_afectada INTO _inc
      FROM incidencias_chasis
     WHERE chasis_id = _chasis_id
       AND (estatus IN ('no_util','garantia')
            OR (estatus IN ('abierta','en_revision') AND retiene_chasis))
     ORDER BY reportado_at DESC LIMIT 1;
    RAISE EXCEPTION 'El chasis % está detenido por la incidencia % (%)%: resuélvela antes de configurarlo',
      _ch.numero_chasis, _inc.folio, _inc.estatus, COALESCE(' — ' || _inc.parte_afectada, '');
  END IF;

  -- Color con el que se arma. Si es otro, tiene que haber juego libre de ese
  -- color: no se puede armar un azul si ya se usaron todos los juegos azules.
  _col := public.norm_color(_color);
  IF _col IS NOT NULL AND _col <> '' AND _col <> upper(_ch.color) THEN
    PERFORM public.cambiar_color_chasis(_chasis_id, _col,
      'Color asignado al armar la unidad (VIN decía ' || upper(COALESCE(_ch.color_original, _ch.color)) || ')');
    SELECT * INTO _ch FROM inventario_chasis WHERE id = _chasis_id;  -- releer el color nuevo
    _color_cambiado := true;
  END IF;

  SELECT * INTO _mo FROM inventario_motor WHERE id = _motor_id;
  IF _mo IS NULL THEN RAISE EXCEPTION 'Motor no encontrado'; END IF;
  IF _mo.motocarro_id IS NOT NULL THEN
    RAISE EXCEPTION 'El motor % ya está asignado a una unidad', _mo.numero_motor;
  END IF;

  _orden_final := COALESCE(_orden, (SELECT COALESCE(max(orden_armado),0)+1 FROM motocarros));
  IF EXISTS (SELECT 1 FROM motocarros WHERE orden_armado = _orden_final) THEN
    RAISE EXCEPTION 'El orden de armado % ya está ocupado', _orden_final;
  END IF;

  INSERT INTO motocarros (orden_armado, modelo, color, ns_chasis, ns_motor,
                          contenedor_id, estatus_armado, estatus_entrega)
  VALUES (_orden_final, _ch.modelo, _ch.color, _ch.numero_chasis, _mo.numero_motor,
          _ch.contenedor_id, 'PENDIENTE', 'NO_APLICA')
  RETURNING id INTO _moto_id;

  UPDATE inventario_chasis SET motocarro_id = _moto_id, estatus = 'configurado',
         fecha_configuracion = now() WHERE id = _chasis_id;
  UPDATE inventario_motor  SET motocarro_id = _moto_id, estatus = 'configurado',
         fecha_configuracion = now() WHERE id = _motor_id;

  -- El historial de la pieza viaja con la unidad (adaptaciones incluidas).
  UPDATE incidencias_chasis SET motocarro_id = _moto_id WHERE chasis_id = _chasis_id;
  UPDATE bitacora_color SET motocarro_id = _moto_id
   WHERE chasis_id = _chasis_id AND motocarro_id IS NULL;

  UPDATE contenedores c SET total_unidades =
    (SELECT count(*) FROM inventario_chasis ic
      WHERE ic.contenedor_id = c.id AND ic.motocarro_id IS NOT NULL)
  WHERE c.id = _ch.contenedor_id;

  PERFORM public.recalcular_inventario_colores();

  RETURN jsonb_build_object('ok', true, 'motocarro_id', _moto_id,
    'orden_armado', _orden_final, 'ns_chasis', _ch.numero_chasis,
    'ns_motor', _mo.numero_motor, 'color', _ch.color,
    'color_cambiado', _color_cambiado,
    'color_vin', upper(COALESCE(_ch.color_original, _ch.color)),
    'modelos_coinciden', (_ch.modelo = _mo.modelo),
    'incidencias_arrastradas', (SELECT count(*) FROM incidencias_chasis WHERE chasis_id = _chasis_id));
END; $$;
