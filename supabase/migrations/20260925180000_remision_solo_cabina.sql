-- Venta de cabina sin motocarro.
-- Una remisión puede quedar sólo con renglones de cabina (y servicios).
-- asignar_remision_items no debe inventar un motocarro ni marcarla COMPLETA
-- porque total_unidades_solicitadas es 0.
-- Aplicar en el SQL editor de Supabase.

CREATE OR REPLACE FUNCTION public.asignar_remision_items(_remision_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _r record; _linea record; _n int; _total int := 0;
  _ya int; _faltan int; _disp int; _sin_serial int; _detenidas int;
  _detalle jsonb := '[]'::jsonb; _hay_items boolean; _solo_cabina boolean;
BEGIN
  IF NOT (
    has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role) OR
    EXISTS (SELECT 1 FROM remisiones rr WHERE rr.id = _remision_id AND rr.vendedor_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'No autorizado para asignar unidades a esta remisión';
  END IF;

  SELECT * INTO _r FROM remisiones WHERE id = _remision_id;
  IF _r IS NULL THEN RAISE EXCEPTION 'Remisión no encontrada'; END IF;

  -- solo_cabina: hay cabina y ningún motocarro. No se asignan unidades.
  -- Sin este corte, «no hay renglón motocarro» cae al fallback del encabezado
  -- y, con total_unidades_solicitadas en 0, la remisión quedaría COMPLETA.
  SELECT
    EXISTS (
      SELECT 1 FROM remision_items
       WHERE remision_id = _remision_id AND tipo_servicio = 'cabina'
    )
    AND NOT EXISTS (
      SELECT 1 FROM remision_items
       WHERE remision_id = _remision_id AND tipo_servicio = 'motocarro'
    )
  INTO _solo_cabina;

  IF _solo_cabina THEN
    RETURN jsonb_build_object(
      'ok', true,
      'asignadas', 0,
      'pedido_capturado', true,
      'solo_cabina', true,
      'detalle', '[]'::jsonb
    );
  END IF;


  SELECT EXISTS (SELECT 1 FROM remision_items
                  WHERE remision_id = _remision_id AND tipo_servicio = 'motocarro')
    INTO _hay_items;

  FOR _linea IN
    -- Con configuración del pedido: una línea por modelo comercial + color.
    SELECT upper(COALESCE(NULLIF(trim(ri.modelo),''), '')) AS modelo,
           upper(COALESCE(NULLIF(trim(ri.color),''), ''))  AS color,
           sum(GREATEST(ri.cantidad,0))::int               AS cantidad
      FROM remision_items ri
     WHERE _hay_items AND ri.remision_id = _remision_id AND ri.tipo_servicio = 'motocarro'
     GROUP BY 1, 2
    UNION ALL
    -- Sin configuración: se cae a lo que traiga la remisión (comportamiento
    -- viejo), pero se avisa en el detalle que el pedido no está capturado.
    SELECT upper(COALESCE(NULLIF(trim(_r.modelo_solicitado),''), '')),
           upper(COALESCE(NULLIF(trim(_r.color_solicitado),''), '')),
           _r.total_unidades_solicitadas
     WHERE NOT _hay_items
  LOOP
    -- Lo que ya está asignado a esta remisión y cuadra con la línea.
    SELECT count(*) INTO _ya
      FROM motocarros m
      LEFT JOIN modelos_producto mp ON mp.modelo = m.modelo
     WHERE m.remision_id = _remision_id
       AND (_linea.color  = '' OR upper(m.color) = _linea.color)
       AND (_linea.modelo = '' OR upper(COALESCE(mp.nombre_comercial, m.modelo)) = _linea.modelo);

    _faltan := GREATEST(_linea.cantidad - _ya, 0);

    IF _faltan > 0 THEN
      WITH candidatos AS (
        SELECT m.id
          FROM motocarros m
          LEFT JOIN modelos_producto mp ON mp.modelo = m.modelo
          LEFT JOIN inventario_chasis ic ON ic.numero_chasis = m.ns_chasis
         WHERE m.remision_id IS NULL
           AND m.estatus_armado IN ('PENDIENTE','EN_PROCESO','ARMADO','LISTO')
           AND m.estatus_entrega <> 'ENTREGADA'
           -- El proceso no cierra sin serial: una unidad sin NS no se vende.
           AND NULLIF(trim(COALESCE(m.ns_chasis,'')),'') IS NOT NULL
           AND NULLIF(trim(COALESCE(m.ns_motor ,'')),'') IS NOT NULL
           -- Ni una unidad cuyo chasis está detenido por una incidencia.
           AND (ic.id IS NULL OR NOT public.chasis_bloqueado(ic.id))
           AND (_linea.color  = '' OR upper(m.color) = _linea.color)
           AND (_linea.modelo = '' OR upper(COALESCE(mp.nombre_comercial, m.modelo)) = _linea.modelo)
         ORDER BY m.orden_armado ASC
         LIMIT _faltan
         FOR UPDATE OF m SKIP LOCKED
      )
      UPDATE motocarros m
         SET remision_id = _remision_id,
             estatus_entrega = CASE WHEN m.estatus_entrega = 'NO_APLICA'
                                    THEN 'PROGRAMADA' ELSE m.estatus_entrega END
        FROM candidatos c
       WHERE m.id = c.id;

      GET DIAGNOSTICS _n = ROW_COUNT;
    ELSE
      _n := 0;
    END IF;

    _total := _total + _n;

    -- Qué queda para esa combinación, para poder explicar el faltante. Una
    -- unidad cuyo chasis está detenido por una incidencia no cuenta como
    -- disponible: se reporta aparte para que se sepa por qué falta.
    SELECT count(*) FILTER (WHERE NULLIF(trim(COALESCE(m.ns_chasis,'')),'') IS NOT NULL
                              AND NULLIF(trim(COALESCE(m.ns_motor ,'')),'') IS NOT NULL
                              AND (ic.id IS NULL OR NOT public.chasis_bloqueado(ic.id))),
           count(*) FILTER (WHERE NULLIF(trim(COALESCE(m.ns_chasis,'')),'') IS NULL
                               OR NULLIF(trim(COALESCE(m.ns_motor ,'')),'') IS NULL),
           count(*) FILTER (WHERE ic.id IS NOT NULL AND public.chasis_bloqueado(ic.id))
      INTO _disp, _sin_serial, _detenidas
      FROM motocarros m
      LEFT JOIN modelos_producto mp ON mp.modelo = m.modelo
      LEFT JOIN inventario_chasis ic ON ic.numero_chasis = m.ns_chasis
     WHERE m.remision_id IS NULL
       AND m.estatus_entrega <> 'ENTREGADA'
       AND (_linea.color  = '' OR upper(m.color) = _linea.color)
       AND (_linea.modelo = '' OR upper(COALESCE(mp.nombre_comercial, m.modelo)) = _linea.modelo);

    _detalle := _detalle || jsonb_build_object(
      'modelo', NULLIF(_linea.modelo,''), 'color', NULLIF(_linea.color,''),
      'solicitadas', _linea.cantidad, 'ya_asignadas', _ya,
      'asignadas_ahora', _n, 'faltan', GREATEST(_faltan - _n, 0),
      'disponibles_con_serial', _disp, 'unidades_sin_serial', _sin_serial,
      'unidades_detenidas', _detenidas,
      'piezas_por_configurar', (
        SELECT count(*) FROM inventario_chasis ic
        LEFT JOIN modelos_producto mp2 ON mp2.modelo = ic.modelo
         WHERE ic.motocarro_id IS NULL AND ic.estatus = 'disponible'
           AND (_linea.color  = '' OR upper(ic.color) = _linea.color)
           AND (_linea.modelo = '' OR upper(COALESCE(mp2.nombre_comercial, ic.modelo)) = _linea.modelo)
      ));
  END LOOP;

  UPDATE remisiones r
     SET estatus = CASE
       WHEN (SELECT count(*) FROM motocarros mm WHERE mm.remision_id = r.id) >= r.total_unidades_solicitadas
         THEN 'COMPLETA'::estatus_remision
       WHEN (SELECT count(*) FROM motocarros mm WHERE mm.remision_id = r.id) > 0
         THEN 'PARCIAL'::estatus_remision
       ELSE 'NUEVA'::estatus_remision END
   WHERE r.id = _remision_id;

  RETURN jsonb_build_object('ok', true, 'asignadas', _total,
    'pedido_capturado', _hay_items, 'detalle', _detalle);
END; $$;

