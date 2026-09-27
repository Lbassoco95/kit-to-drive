-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public.resolver_incidencia_chasis(
  _incidencia_id  uuid,
  _resultado      text,
  _resolucion     text,
  _folio_garantia text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _i record; _m record; _estatus_chasis text; _retiene boolean;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede resolver incidencias';
  END IF;
  IF _resultado NOT IN ('adaptacion','garantia','no_util','descartada') THEN
    RAISE EXCEPTION 'Resultado inválido: %', _resultado;
  END IF;
  IF _resolucion IS NULL OR length(trim(_resolucion)) < 5 THEN
    RAISE EXCEPTION 'Escribe qué se hizo (mínimo 5 caracteres)';
  END IF;
  IF _resultado = 'garantia' AND (_folio_garantia IS NULL OR length(trim(_folio_garantia)) = 0) THEN
    RAISE EXCEPTION 'Una garantía necesita folio o referencia del reclamo';
  END IF;

  SELECT * INTO _i FROM incidencias_chasis WHERE id = _incidencia_id;
  IF _i IS NULL THEN RAISE EXCEPTION 'Incidencia no encontrada'; END IF;

  -- Sacar de circulación una pieza que ya es parte de una unidad vendida no
  -- es una decisión de captura: primero hay que liberar o reasignar la unidad.
  IF _resultado IN ('no_util','garantia') AND _i.motocarro_id IS NOT NULL THEN
    SELECT * INTO _m FROM motocarros WHERE id = _i.motocarro_id;
    IF _m.remision_id IS NOT NULL THEN
      RAISE EXCEPTION 'El chasis % está en la unidad #% ya asignada a una remisión — libérala primero (Producción → Liberar unidad)',
        _i.ns_chasis, _m.orden_armado;
    END IF;
  END IF;

  _retiene := (_resultado IN ('no_util','garantia'));

  UPDATE incidencias_chasis
     SET estatus = _resultado,
         retiene_chasis = _retiene,
         resolucion = trim(_resolucion),
         folio_garantia = COALESCE(NULLIF(trim(COALESCE(_folio_garantia,'')),''), folio_garantia),
         resuelto_por = auth.uid(), resuelto_at = now()
   WHERE id = _incidencia_id;

  INSERT INTO incidencias_chasis_eventos (incidencia_id, estatus_anterior, estatus_nuevo, nota, actor)
  VALUES (_incidencia_id, _i.estatus, _resultado, trim(_resolucion), auth.uid());

  _estatus_chasis := public._sincronizar_estatus_chasis(_i.chasis_id);
  PERFORM public.recalcular_inventario_colores();

  RETURN jsonb_build_object('ok', true, 'folio', _i.folio, 'resultado', _resultado,
    'ns_chasis', _i.ns_chasis, 'estatus_chasis', _estatus_chasis);
END; $$;
