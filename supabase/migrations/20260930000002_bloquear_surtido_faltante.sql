-- Bloquear surtido cuando hay faltante reportado.
-- Almacén no puede liberar una partida en faltante; la remisión queda en
-- contingencia con área Ventas hasta que Ventas confirme sin existencia o
-- cancele la pieza. Así no pasa a logística ni queda "surtida" una pieza
-- que se dijo que no había.

CREATE OR REPLACE FUNCTION public.recalcular_etapa_remision_refaccion(_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _abierta boolean;
  _hay_faltante boolean;
  _hay_surtida boolean;
  _hay_sin boolean;
  _entregada timestamptz;
  _etapa text;
  _area text;
BEGIN
  SELECT entregada_at INTO _entregada
  FROM public.remisiones_refacciones
  WHERE id = _id;

  SELECT
    bool_or(estatus IN ('bloqueada', 'faltante')),
    bool_or(estatus = 'faltante'),
    bool_or(cantidad_surtida > 0),
    bool_or(estatus = 'sin_existencia')
  INTO _abierta, _hay_faltante, _hay_surtida, _hay_sin
  FROM public.remision_refaccion_items
  WHERE remision_id = _id;

  IF NOT FOUND OR _abierta IS NULL THEN
    _etapa := 'cancelada';
    _area := 'ventas';
    _abierta := false;
  ELSIF _abierta AND _hay_faltante THEN
    -- Faltante abierto: Almacén ya reportó; espera a Ventas.
    _etapa := 'contingencia';
    _area := 'ventas';
  ELSIF _abierta THEN
    _etapa := 'almacen';
    _area := 'almacen';
  ELSIF coalesce(_hay_surtida, false) AND _entregada IS NOT NULL THEN
    _etapa := 'entregada';
    _area := 'logistica';
    _abierta := false;
  ELSIF coalesce(_hay_surtida, false) THEN
    _etapa := 'logistica';
    _area := 'logistica';
    _abierta := false;
  ELSIF coalesce(_hay_sin, false) THEN
    _etapa := 'contingencia';
    _area := 'ventas';
    _abierta := false;
  ELSE
    _etapa := 'cancelada';
    _area := 'ventas';
    _abierta := false;
  END IF;

  UPDATE public.remisiones_refacciones
  SET etapa = _etapa,
      area_actual = _area,
      abierta = coalesce(_abierta, false),
      lista_logistica_at = CASE
        WHEN _etapa IN ('logistica', 'entregada') THEN coalesce(lista_logistica_at, now())
        ELSE lista_logistica_at
      END
  WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalcular_etapa_remision_refaccion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalcular_etapa_remision_refaccion(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.liberar_refaccion_remision(_item_id UUID, _cantidad INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.remision_refaccion_items%ROWTYPE;
  v_stock INTEGER;
  v_folio TEXT;
  v_bloqueada INTEGER;
  v_estatus TEXT;
BEGIN
  IF NOT public.puede_operar_almacen_refacciones() THEN
    RAISE EXCEPTION 'Sólo almacén puede liberar una remisión de refacciones';
  END IF;

  SELECT * INTO v_item
  FROM public.remision_refaccion_items
  WHERE id = _item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la partida';
  END IF;

  -- Hay faltante reportado. No se puede surtir hasta que Ventas actualice.
  IF v_item.estatus = 'faltante' OR coalesce(v_item.cantidad_faltante, 0) > 0 THEN
    RAISE EXCEPTION
      'Hay faltante reportado. No se puede surtir hasta que Ventas confirme que no hay existencia o quite la pieza del pedido.';
  END IF;

  IF v_item.estatus <> 'bloqueada' THEN
    RAISE EXCEPTION 'Esta partida ya no tiene piezas apartadas';
  END IF;
  IF _cantidad IS NULL OR _cantidad < 1 OR _cantidad > v_item.cantidad_bloqueada THEN
    RAISE EXCEPTION 'La cantidad a liberar no es válida';
  END IF;

  SELECT stock INTO v_stock
  FROM public.almacen_refacciones_productos
  WHERE id = v_item.producto_id
  FOR UPDATE;

  IF coalesce(v_stock, 0) < _cantidad THEN
    RAISE EXCEPTION
      'La existencia (%) no cubre lo que se quiere liberar (%). Reporta el faltante. El inventario no puede quedar en negativo.',
      coalesce(v_stock, 0), _cantidad;
  END IF;

  UPDATE public.almacen_refacciones_productos
  SET stock = stock - _cantidad
  WHERE id = v_item.producto_id
    AND stock >= _cantidad;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El inventario de refacciones no puede quedar en negativo';
  END IF;

  v_bloqueada := v_item.cantidad_bloqueada - _cantidad;
  v_estatus := CASE WHEN v_bloqueada = 0 THEN 'surtida' ELSE 'bloqueada' END;

  UPDATE public.remision_refaccion_items
  SET cantidad_bloqueada = v_bloqueada,
      cantidad_surtida = cantidad_surtida + _cantidad,
      cantidad_faltante = 0,
      estatus = v_estatus,
      nota_almacen = NULL
  WHERE id = _item_id;

  SELECT folio INTO v_folio FROM public.remisiones_refacciones WHERE id = v_item.remision_id;

  INSERT INTO public.almacen_refacciones_movimientos (
    producto_id, tipo, cantidad, precio_unitario, cliente_id, notas, created_by
  )
  SELECT v_item.producto_id, 'venta', -_cantidad, v_item.precio_unitario, r.cliente_id,
         'Salida por remisión ' || r.folio, auth.uid()
  FROM public.remisiones_refacciones r
  WHERE r.id = v_item.remision_id;

  INSERT INTO public.remision_refaccion_eventos (
    remision_id, item_id, area, accion, detalle, usuario_id
  ) VALUES (
    v_item.remision_id, _item_id, 'almacen', 'liberar',
    'Almacén liberó ' || _cantidad || ' de ' || v_item.codigo_nuevo || ' (' || coalesce(v_folio, '') || '). La existencia bajó.',
    auth.uid()
  );

  PERFORM public.recalcular_etapa_remision_refaccion(v_item.remision_id);
END;
$$;

REVOKE ALL ON FUNCTION public.liberar_refaccion_remision(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liberar_refaccion_remision(UUID, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirmar_sin_existencia_refaccion(_item_id UUID, _nota TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.remision_refaccion_items%ROWTYPE;
  v_stock INTEGER;
  v_soltar INTEGER;
  v_baja INTEGER;
  v_bloqueada INTEGER;
  v_estatus TEXT;
  v_detalle text;
  v_vendedor UUID;
  v_creador UUID;
  v_rol text;
  v_area text;
BEGIN
  IF nullif(trim(_nota), '') IS NULL OR char_length(trim(_nota)) < 3 THEN
    RAISE EXCEPTION 'Describe por qué ya no hay existencia (mínimo 3 caracteres)';
  END IF;

  SELECT * INTO v_item
  FROM public.remision_refaccion_items
  WHERE id = _item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la partida';
  END IF;
  IF v_item.estatus NOT IN ('bloqueada', 'faltante') THEN
    RAISE EXCEPTION 'Esta partida ya no está en revisión';
  END IF;

  SELECT vendedor_id, created_by INTO v_vendedor, v_creador
  FROM public.remisiones_refacciones
  WHERE id = v_item.remision_id;

  -- Tras faltante, sólo Ventas (misma regla que cancelar) desbloquea.
  -- Sin faltante, Almacén puede confirmar en el momento.
  IF v_item.estatus = 'faltante' OR coalesce(v_item.cantidad_faltante, 0) > 0 THEN
    v_rol := public.rol_comercial();
    IF NOT (
      v_rol IN ('global', 'supervisor')
      OR (v_rol = 'operador' AND (v_vendedor = auth.uid() OR v_creador = auth.uid()))
    ) THEN
      RAISE EXCEPTION
        'Hay faltante reportado. Sólo Ventas puede confirmar que no hay existencia.';
    END IF;
    v_area := 'ventas';
  ELSE
    IF NOT public.puede_operar_almacen_refacciones() THEN
      RAISE EXCEPTION 'Sólo almacén puede confirmar que no hay existencia';
    END IF;
    v_area := 'almacen';
  END IF;

  v_soltar := LEAST(
    CASE WHEN v_item.cantidad_faltante > 0 THEN v_item.cantidad_faltante ELSE v_item.cantidad_bloqueada END,
    v_item.cantidad_bloqueada
  );
  IF v_soltar < 1 THEN
    RAISE EXCEPTION 'No hay piezas apartadas que confirmar';
  END IF;

  SELECT stock INTO v_stock
  FROM public.almacen_refacciones_productos
  WHERE id = v_item.producto_id
  FOR UPDATE;

  v_baja := LEAST(v_soltar, GREATEST(coalesce(v_stock, 0), 0));
  IF v_baja > 0 THEN
    IF coalesce(v_stock, 0) - v_baja < 0 THEN
      RAISE EXCEPTION 'El inventario de refacciones no puede quedar en negativo';
    END IF;
    UPDATE public.almacen_refacciones_productos
    SET stock = stock - v_baja
    WHERE id = v_item.producto_id;

    INSERT INTO public.almacen_refacciones_movimientos (
      producto_id, tipo, cantidad, precio_unitario, cliente_id, notas, created_by
    )
    SELECT v_item.producto_id, 'ajuste', -v_baja, v_item.precio_unitario, r.cliente_id,
           'Ajuste por faltante de remisión ' || r.folio || '. ' || trim(_nota),
           auth.uid()
    FROM public.remisiones_refacciones r
    WHERE r.id = v_item.remision_id;
  END IF;

  v_bloqueada := v_item.cantidad_bloqueada - v_soltar;
  v_estatus := CASE
    WHEN v_bloqueada = 0 AND v_item.cantidad_surtida > 0 THEN 'surtida'
    WHEN v_bloqueada = 0 THEN 'sin_existencia'
    ELSE 'bloqueada'
  END;

  UPDATE public.remision_refaccion_items
  SET cantidad_bloqueada = v_bloqueada,
      cantidad_faltante = 0,
      estatus = v_estatus,
      nota_almacen = trim(_nota)
  WHERE id = _item_id;

  v_detalle := CASE WHEN v_area = 'ventas' THEN 'Ventas' ELSE 'Almacén' END
    || ' confirma que no hay ' || v_soltar || ' de ' || v_item.codigo_nuevo
    || '. Existencia corregida en ' || v_baja || '. ' || trim(_nota);

  INSERT INTO public.remision_refaccion_eventos (
    remision_id, item_id, area, accion, detalle, usuario_id
  ) VALUES (
    v_item.remision_id, _item_id, v_area, 'confirmar_sin_existencia',
    v_detalle, auth.uid()
  );

  PERFORM public.avisar_faltante_refaccion(v_item.remision_id, _item_id, v_detalle);
  PERFORM public.recalcular_etapa_remision_refaccion(v_item.remision_id);
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_sin_existencia_refaccion(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_sin_existencia_refaccion(UUID, TEXT) TO authenticated, service_role;

-- Remisiones ya en contingencia abierta: área pasa a Ventas.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.remisiones_refacciones
    WHERE etapa = 'contingencia' AND abierta = true
  LOOP
    PERFORM public.recalcular_etapa_remision_refaccion(r.id);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
