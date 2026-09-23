-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000003_color_efectivo_capacidad.sql

CREATE OR REPLACE FUNCTION public.ajustar_capacidad_color(
  _modelo text, _color text, _piezas_recibidas integer, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _col text; _antes int; _usados int; _vin int;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede ajustar la capacidad de color';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Se requiere un motivo (mínimo 5 caracteres)';
  END IF;
  IF _piezas_recibidas IS NULL OR _piezas_recibidas < 0 THEN
    RAISE EXCEPTION 'La cantidad de piezas no puede ser negativa';
  END IF;

  _col := public.norm_color(_color);

  SELECT count(*) INTO _usados
    FROM inventario_chasis WHERE modelo = _modelo AND upper(color) = _col;
  IF _piezas_recibidas < _usados THEN
    RAISE EXCEPTION 'No puedes dejar la capacidad en % : ya hay % chasis armados con % en %',
      _piezas_recibidas, _usados, _col, _modelo;
  END IF;

  -- Se guarda el DELTA contra lo que dijo el VIN, no el absoluto: así una
  -- importación posterior suma su capacidad sin borrar este ajuste.
  SELECT count(*) INTO _vin
    FROM inventario_chasis
   WHERE modelo = _modelo AND upper(COALESCE(color_original, color)) = _col;

  SELECT COALESCE(piezas_recibidas, 0) INTO _antes
    FROM inventario_colores WHERE modelo = _modelo AND color = _col;
  _antes := COALESCE(_antes, 0);

  INSERT INTO inventario_colores (modelo, color, piezas_extra, piezas_recibidas, umbral_alerta, updated_at)
  VALUES (_modelo, _col, _piezas_recibidas - _vin, _piezas_recibidas, 3, now())
  ON CONFLICT (modelo, color) DO UPDATE
    SET piezas_extra = _piezas_recibidas - _vin,
        piezas_recibidas = _piezas_recibidas,
        updated_at = now();

  INSERT INTO bitacora_color (tipo, modelo, color_nuevo, cantidad_antes, cantidad_nueva, motivo, actor)
  VALUES ('ajuste_capacidad', _modelo, _col, _antes, _piezas_recibidas, trim(_motivo), auth.uid());

  PERFORM public.recalcular_inventario_colores();

  RETURN jsonb_build_object('ok', true, 'modelo', _modelo, 'color', _col,
    'antes', COALESCE(_antes,0), 'ahora', _piezas_recibidas,
    'capacidad_libre', public.capacidad_color_libre(_modelo, _col));
END; $$;
