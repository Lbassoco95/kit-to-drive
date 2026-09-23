-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260904000001_solicitudes_a_fabrica.sql

CREATE OR REPLACE FUNCTION public.responder_solicitud(
  _aviso_id  uuid,
  _aceptar   boolean,
  _respuesta text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _a         public.avisos%ROWTYPE;
  _ids       uuid[];
  _liberadas jsonb := '[]'::jsonb;
  _quien     text;
BEGIN
  SELECT * INTO _a FROM public.avisos WHERE id = _aviso_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La solicitud no existe'; END IF;
  IF NOT _a.requiere_respuesta THEN RAISE EXCEPTION 'Ese aviso no es una solicitud'; END IF;
  IF _a.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'Esa solicitud ya fue contestada (%)', _a.estado;
  END IF;
  IF NOT public.recibe_avisos_de(_a.area_destino) THEN
    RAISE EXCEPTION 'Sólo % puede contestar esta solicitud', _a.area_destino;
  END IF;

  SELECT COALESCE(p.nombre_completo, 'Fábrica') INTO _quien
    FROM public.profiles p WHERE p.id = auth.uid();

  IF _aceptar AND COALESCE(_a.accion->>'tipo','') = 'liberar_unidades' THEN
    SELECT COALESCE(array_agg((v)::uuid), ARRAY[]::uuid[]) INTO _ids
      FROM jsonb_array_elements_text(COALESCE(_a.accion->'motocarros','[]'::jsonb)) v;

    -- Se vuelve a comprobar el estado: entre la petición y el sí, la unidad
    -- pudo haberse entregado o haber cambiado de remisión.
    WITH sueltas AS (
      UPDATE public.motocarros m
         SET remision_id = NULL, estatus_entrega = 'NO_APLICA'
       WHERE m.id = ANY(_ids)
         AND m.remision_id = _a.remision_id
         AND COALESCE(m.estatus_entrega::text,'NO_APLICA') NOT IN ('ENTREGADA','EN_RUTA')
       RETURNING m.orden_armado, m.ns_chasis, m.chasis_asignado
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'orden_armado', s.orden_armado,
             'ns_chasis',    COALESCE(s.ns_chasis, s.chasis_asignado)
           ) ORDER BY s.orden_armado), '[]'::jsonb)
      INTO _liberadas FROM sueltas s;

    UPDATE public.remisiones r
       SET estatus = CASE
         WHEN (SELECT COUNT(*) FROM public.motocarros mm WHERE mm.remision_id = r.id) = 0
           THEN 'NUEVA'::estatus_remision
         WHEN (SELECT COUNT(*) FROM public.motocarros mm WHERE mm.remision_id = r.id)
              >= GREATEST(COALESCE(r.total_unidades_solicitadas,1),1)
           THEN 'COMPLETA'::estatus_remision
         ELSE 'PARCIAL'::estatus_remision
       END
     WHERE r.id = _a.remision_id AND r.estatus <> 'CANCELADA';
  END IF;

  UPDATE public.avisos
     SET estado         = CASE WHEN _aceptar THEN 'aceptada' ELSE 'rechazada' END,
         respuesta      = NULLIF(btrim(COALESCE(_respuesta,'')), ''),
         respondido_por = auth.uid(),
         respondido_at  = now(),
         visto_por      = auth.uid(),
         visto_at       = now()
   WHERE id = _aviso_id;

  -- La respuesta de vuelta, dirigida a quien la pidió.
  INSERT INTO public.avisos (area_destino, tipo, titulo, cuerpo, remision_id, folio_remision,
                             datos, creado_por, nombre_creador, usuario_destino, estado)
  VALUES ('comercial',
          CASE WHEN _aceptar THEN 'solicitud_aceptada' ELSE 'solicitud_rechazada' END,
          format('Fábrica %s soltar %s unidad(es) de %s',
                 CASE WHEN _aceptar THEN 'aceptó' ELSE 'no aceptó' END,
                 jsonb_array_length(COALESCE(_a.datos->'unidades','[]'::jsonb)),
                 COALESCE(_a.folio_remision,'la remisión')),
          CASE WHEN _aceptar
               THEN format('Se liberaron %s unidad(es) y volvieron al inventario.', jsonb_array_length(_liberadas))
               ELSE 'Las unidades siguen asignadas a la remisión.' END
          || CASE WHEN COALESCE(btrim(_respuesta),'') = '' THEN '' ELSE ' ' || btrim(_respuesta) END,
          _a.remision_id, _a.folio_remision,
          jsonb_build_object('aceptada', _aceptar, 'liberadas', _liberadas),
          auth.uid(), _quien, _a.creado_por, 'pendiente');

  RETURN jsonb_build_object('aceptada', _aceptar, 'liberadas', jsonb_array_length(_liberadas));
END;
$$;
