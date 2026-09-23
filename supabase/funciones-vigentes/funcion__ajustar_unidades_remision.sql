-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260904000001_solicitudes_a_fabrica.sql

CREATE OR REPLACE FUNCTION public.ajustar_unidades_remision(
  _remision_id     uuid,
  _total_objetivo  integer,
  _motivo          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r           public.remisiones%ROWTYPE;
  _asignadas   integer;
  _sobran      integer;
  _liberadas   jsonb := '[]'::jsonb;
  _porPedir    jsonb := '[]'::jsonb;
  _ids_pedir   uuid[] := ARRAY[]::uuid[];
  _solicitud   uuid;
  _quien       text;
  _detalle     text;
BEGIN
  IF _total_objetivo IS NULL OR _total_objetivo < 0 THEN
    RAISE EXCEPTION 'El total objetivo no es válido';
  END IF;

  SELECT * INTO _r FROM public.remisiones WHERE id = _remision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Remisión no encontrada'; END IF;

  IF NOT public.puede_editar_remision(_remision_id) THEN
    RAISE EXCEPTION 'No tienes permiso para ajustar esta remisión';
  END IF;

  SELECT COUNT(*) INTO _asignadas FROM public.motocarros WHERE remision_id = _remision_id;
  _sobran := _asignadas - _total_objetivo;

  IF _sobran <= 0 THEN
    RETURN jsonb_build_object('liberadas', 0, 'unidades', '[]'::jsonb,
                              'solicitadas', 0, 'por_pedir', '[]'::jsonb, 'solicitud_id', NULL);
  END IF;

  SELECT COALESCE(p.nombre_completo, 'Comercial') INTO _quien
    FROM public.profiles p WHERE p.id = auth.uid();

  -- ── 1. Lo que todavía no se toca se suelta solo ──────────────────────────
  -- Se toman las de mayor orden de armado: son las últimas de la fila.
  WITH candidatas AS (
    SELECT id, orden_armado, ns_chasis, chasis_asignado,
           ROW_NUMBER() OVER (ORDER BY orden_armado DESC NULLS LAST) AS prioridad
      FROM public.motocarros
     WHERE remision_id = _remision_id
       AND estatus_armado = 'PENDIENTE'
       AND COALESCE(estatus_entrega::text,'NO_APLICA') NOT IN ('ENTREGADA','EN_RUTA')
  ), sueltas AS (
    UPDATE public.motocarros m
       SET remision_id = NULL, estatus_entrega = 'NO_APLICA'
      FROM candidatas c
     WHERE m.id = c.id AND c.prioridad <= _sobran
     RETURNING m.id, c.orden_armado, c.ns_chasis, c.chasis_asignado
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'orden_armado', s.orden_armado,
           'ns_chasis',    COALESCE(s.ns_chasis, s.chasis_asignado)
         ) ORDER BY s.orden_armado), '[]'::jsonb)
    INTO _liberadas
    FROM sueltas s;

  -- ── 2. Lo que ya entró a armado se pide, no se quita ─────────────────────
  _sobran := _sobran - jsonb_array_length(_liberadas);

  IF _sobran > 0 THEN
    WITH enArmado AS (
      SELECT id, orden_armado, ns_chasis, chasis_asignado, estatus_armado,
             ROW_NUMBER() OVER (
               ORDER BY CASE estatus_armado
                          WHEN 'EN_PROCESO' THEN 1
                          WHEN 'ATRASADO'   THEN 2
                          WHEN 'ARMADO'     THEN 3
                          WHEN 'LISTO'      THEN 4
                          ELSE 5
                        END,
                        orden_armado DESC NULLS LAST
             ) AS prioridad
        FROM public.motocarros
       WHERE remision_id = _remision_id
         AND estatus_armado <> 'PENDIENTE'
         AND COALESCE(estatus_entrega::text,'NO_APLICA') NOT IN ('ENTREGADA','EN_RUTA')
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'motocarro_id',   e.id,
             'orden_armado',   e.orden_armado,
             'ns_chasis',      COALESCE(e.ns_chasis, e.chasis_asignado),
             'estatus_armado', e.estatus_armado
           ) ORDER BY e.prioridad), '[]'::jsonb),
           COALESCE(array_agg(e.id ORDER BY e.prioridad), ARRAY[]::uuid[])
      INTO _porPedir, _ids_pedir
      FROM enArmado e
     WHERE e.prioridad <= _sobran;
  END IF;

  -- ── 3. El estatus de la remisión, con lo que quedó asignado ──────────────
  UPDATE public.remisiones r
     SET estatus = CASE
       WHEN (SELECT COUNT(*) FROM public.motocarros mm WHERE mm.remision_id = r.id) = 0
         THEN 'NUEVA'::estatus_remision
       WHEN (SELECT COUNT(*) FROM public.motocarros mm WHERE mm.remision_id = r.id) >= GREATEST(_total_objetivo, 1)
         THEN 'COMPLETA'::estatus_remision
       ELSE 'PARCIAL'::estatus_remision
     END
   WHERE r.id = _remision_id AND r.estatus <> 'CANCELADA';

  -- ── 4. Avisar lo que se soltó ────────────────────────────────────────────
  IF jsonb_array_length(_liberadas) > 0 THEN
    _detalle := format('%s bajó de %s a %s unidades. Se liberaron %s que aún no entraban a armado: %s.%s',
      COALESCE(_r.folio_remision,'La remisión'), _asignadas, _total_objetivo,
      jsonb_array_length(_liberadas),
      (SELECT string_agg(COALESCE(u->>'ns_chasis','#'||(u->>'orden_armado')), ', ')
         FROM jsonb_array_elements(_liberadas) u),
      CASE WHEN COALESCE(btrim(_motivo),'') = '' THEN '' ELSE ' Motivo: '||btrim(_motivo) END);

    INSERT INTO public.avisos (area_destino, tipo, titulo, cuerpo, remision_id, folio_remision,
                               datos, creado_por, nombre_creador)
    SELECT a, 'unidades_liberadas',
           format('%s liberó %s unidad(es)', COALESCE(_r.folio_remision,'Una remisión'), jsonb_array_length(_liberadas)),
           _detalle, _remision_id, _r.folio_remision,
           jsonb_build_object('antes',_asignadas,'despues',_total_objetivo,'unidades',_liberadas),
           auth.uid(), _quien
      FROM unnest(ARRAY['fabrica','almacen_logistica']::public.user_area[]) AS a;
  END IF;

  -- ── 5. Y pedir lo que ya no se puede quitar ──────────────────────────────
  IF jsonb_array_length(_porPedir) > 0 THEN
    _detalle := format('%s pide soltar %s unidad(es) que ya están en armado: %s.%s Si aceptas, vuelven al inventario; si no, la remisión se queda como está.',
      COALESCE(_r.folio_remision,'Una remisión'), jsonb_array_length(_porPedir),
      (SELECT string_agg(
                COALESCE(u->>'ns_chasis','#'||(u->>'orden_armado')) || ' (' || (u->>'estatus_armado') || ')', ', ')
         FROM jsonb_array_elements(_porPedir) u),
      CASE WHEN COALESCE(btrim(_motivo),'') = '' THEN '' ELSE ' Motivo: '||btrim(_motivo)||'.' END);

    INSERT INTO public.avisos (area_destino, tipo, titulo, cuerpo, remision_id, folio_remision,
                               datos, creado_por, nombre_creador,
                               requiere_respuesta, estado, accion)
    VALUES ('fabrica', 'solicitud_liberar',
            format('%s pide soltar %s unidad(es) en armado',
                   COALESCE(_r.folio_remision,'Una remisión'), jsonb_array_length(_porPedir)),
            _detalle, _remision_id, _r.folio_remision,
            jsonb_build_object('antes',_asignadas,'despues',_total_objetivo,'unidades',_porPedir),
            auth.uid(), _quien,
            true, 'pendiente',
            jsonb_build_object('tipo','liberar_unidades','motocarros', to_jsonb(_ids_pedir)))
    RETURNING id INTO _solicitud;
  END IF;

  RETURN jsonb_build_object(
    'liberadas',    jsonb_array_length(_liberadas),
    'unidades',     _liberadas,
    'solicitadas',  jsonb_array_length(_porPedir),
    'por_pedir',    _porPedir,
    'solicitud_id', _solicitud
  );
END;
$$;
