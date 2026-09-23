-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000003_color_efectivo_capacidad.sql

CREATE OR REPLACE FUNCTION public.intercambiar_color_chasis(
  _chasis_a uuid, _chasis_b uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _a record; _b record; _ma record; _mb record; _col_a text; _col_b text;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede intercambiar colores';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Se requiere un motivo (mínimo 5 caracteres)';
  END IF;
  IF _chasis_a = _chasis_b THEN
    RAISE EXCEPTION 'Son el mismo chasis';
  END IF;

  SELECT * INTO _a FROM inventario_chasis WHERE id = _chasis_a;
  SELECT * INTO _b FROM inventario_chasis WHERE id = _chasis_b;
  IF _a IS NULL OR _b IS NULL THEN RAISE EXCEPTION 'Chasis no encontrado'; END IF;

  IF upper(_a.color) = upper(_b.color) THEN
    RAISE EXCEPTION 'Los dos chasis ya son % — no hay nada que intercambiar', upper(_a.color);
  END IF;

  -- Los juegos de piezas son por modelo: una cabina de 200cc no va en un 300cc.
  IF _a.modelo <> _b.modelo THEN
    RAISE EXCEPTION 'No se puede intercambiar entre modelos distintos (% y %): los juegos de piezas no son compatibles',
      _a.modelo, _b.modelo;
  END IF;

  -- Ninguno puede estar ya comprometido con un cliente.
  IF _a.motocarro_id IS NOT NULL THEN
    SELECT * INTO _ma FROM motocarros WHERE id = _a.motocarro_id;
    IF _ma.remision_id IS NOT NULL OR _ma.estatus_entrega = 'ENTREGADA' THEN
      RAISE EXCEPTION 'La unidad #% (chasis %) ya está comprometida con un cliente', _ma.orden_armado, _a.numero_chasis;
    END IF;
  END IF;
  IF _b.motocarro_id IS NOT NULL THEN
    SELECT * INTO _mb FROM motocarros WHERE id = _b.motocarro_id;
    IF _mb.remision_id IS NOT NULL OR _mb.estatus_entrega = 'ENTREGADA' THEN
      RAISE EXCEPTION 'La unidad #% (chasis %) ya está comprometida con un cliente', _mb.orden_armado, _b.numero_chasis;
    END IF;
  END IF;

  _col_a := upper(_a.color);
  _col_b := upper(_b.color);

  -- Los dos colores se mueven en UNA sola sentencia: hacerlo en dos dejaría un
  -- instante con los dos chasis del mismo color, y la verificación de capacidad
  -- (que corre por sentencia) tumbaría el intercambio con razón.
  UPDATE inventario_chasis
     SET color = CASE WHEN id = _chasis_a THEN _col_b ELSE _col_a END
   WHERE id IN (_chasis_a, _chasis_b);

  UPDATE motocarros
     SET color = CASE WHEN id = _a.motocarro_id THEN _col_b ELSE _col_a END,
         updated_at = now()
   WHERE id IN (_a.motocarro_id, _b.motocarro_id);

  INSERT INTO bitacora_color (tipo, chasis_id, ns_chasis, motocarro_id, modelo,
                              color_anterior, color_nuevo, motivo, actor)
  VALUES ('cambio_chasis', _chasis_a, _a.numero_chasis, _a.motocarro_id, _a.modelo,
          _col_a, _col_b, trim(_motivo) || ' (intercambio con ' || _b.numero_chasis || ')', auth.uid()),
         ('cambio_chasis', _chasis_b, _b.numero_chasis, _b.motocarro_id, _b.modelo,
          _col_b, _col_a, trim(_motivo) || ' (intercambio con ' || _a.numero_chasis || ')', auth.uid());

  PERFORM public.recalcular_inventario_colores();

  RETURN jsonb_build_object('ok', true,
    'chasis_a', jsonb_build_object('ns', _a.numero_chasis, 'antes', _col_a, 'ahora', _col_b),
    'chasis_b', jsonb_build_object('ns', _b.numero_chasis, 'antes', _col_b, 'ahora', _col_a));
END; $$;
