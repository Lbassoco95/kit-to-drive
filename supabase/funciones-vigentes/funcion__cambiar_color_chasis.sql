-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000003_color_efectivo_capacidad.sql

CREATE OR REPLACE FUNCTION public.cambiar_color_chasis(
  _chasis_id uuid, _color_nuevo text, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _ch record; _m record; _col text; _libre int; _cap int; _usados int;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede cambiar el color de un chasis';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Se requiere un motivo (mínimo 5 caracteres)';
  END IF;

  _col := public.norm_color(_color_nuevo);
  IF _col IS NULL OR _col !~ '^[A-ZÁÉÍÓÚÑ ]{3,20}$' THEN
    RAISE EXCEPTION 'Color inválido: %', _color_nuevo;
  END IF;

  SELECT * INTO _ch FROM inventario_chasis WHERE id = _chasis_id;
  IF _ch IS NULL THEN RAISE EXCEPTION 'Chasis no encontrado'; END IF;

  IF upper(_ch.color) = _col THEN
    RETURN jsonb_build_object('ok', true, 'sin_cambio', true, 'color', _col);
  END IF;

  -- Si ya está comprometido con un cliente, el color es parte del pedido:
  -- cambiarlo aquí dejaría la remisión pidiendo una cosa y la unidad siendo otra.
  IF _ch.motocarro_id IS NOT NULL THEN
    SELECT * INTO _m FROM motocarros WHERE id = _ch.motocarro_id;
    IF _m.remision_id IS NOT NULL THEN
      RAISE EXCEPTION 'La unidad #% ya está asignada a una remisión: el color es parte del pedido. Libera la unidad o corrige la remisión antes de cambiarlo',
        _m.orden_armado;
    END IF;
    IF _m.estatus_entrega = 'ENTREGADA' THEN
      RAISE EXCEPTION 'La unidad #% ya fue entregada; no se le cambia el color', _m.orden_armado;
    END IF;
  END IF;

  -- La regla del embarque: no hay más unidades de un color que juegos de ese color.
  _libre := public.capacidad_color_libre(_ch.modelo, _col);
  IF _libre <= 0 THEN
    SELECT count(*) INTO _usados
      FROM inventario_chasis WHERE modelo = _ch.modelo AND upper(color) = _col;
    _cap := _usados + _libre;   -- capacidad real = usados + libres
    RAISE EXCEPTION 'No hay juegos % libres para %: hay % juegos y ya están ocupados %. Intercambia el color con otro chasis (intercambiar_color_chasis) o registra las piezas extra (ajustar_capacidad_color)',
      _col, _ch.modelo, _cap, _usados;
  END IF;

  UPDATE inventario_chasis SET color = _col WHERE id = _chasis_id;

  -- La unidad ya armada (sin remisión) se mueve con su chasis.
  IF _ch.motocarro_id IS NOT NULL THEN
    UPDATE motocarros SET color = _col, updated_at = now() WHERE id = _ch.motocarro_id;
  END IF;

  INSERT INTO bitacora_color (tipo, chasis_id, ns_chasis, motocarro_id, modelo,
                              color_anterior, color_nuevo, motivo, actor)
  VALUES ('cambio_chasis', _chasis_id, _ch.numero_chasis, _ch.motocarro_id, _ch.modelo,
          upper(_ch.color), _col, trim(_motivo), auth.uid());

  PERFORM public.recalcular_inventario_colores();

  RETURN jsonb_build_object('ok', true,
    'ns_chasis', _ch.numero_chasis,
    'color_anterior', upper(_ch.color), 'color_nuevo', _col,
    'color_vin', upper(COALESCE(_ch.color_original, _ch.color)),
    'motocarro_id', _ch.motocarro_id,
    'capacidad_libre_restante', public.capacidad_color_libre(_ch.modelo, _col));
END; $$;
