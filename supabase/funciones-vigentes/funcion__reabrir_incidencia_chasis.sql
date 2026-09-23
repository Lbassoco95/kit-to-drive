-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public.reabrir_incidencia_chasis(
  _incidencia_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _i record; _estatus_chasis text;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede reabrir incidencias';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Se requiere un motivo (mínimo 5 caracteres)';
  END IF;

  SELECT * INTO _i FROM incidencias_chasis WHERE id = _incidencia_id;
  IF _i IS NULL THEN RAISE EXCEPTION 'Incidencia no encontrada'; END IF;
  IF _i.estatus IN ('abierta','en_revision') THEN
    RAISE EXCEPTION 'La incidencia % ya está abierta', _i.folio;
  END IF;
  IF EXISTS (SELECT 1 FROM incidencias_chasis
              WHERE chasis_id = _i.chasis_id AND estatus IN ('abierta','en_revision')) THEN
    RAISE EXCEPTION 'El chasis % ya tiene otro reporte abierto', _i.ns_chasis;
  END IF;

  UPDATE incidencias_chasis
     SET estatus = 'en_revision', retiene_chasis = true,
         resuelto_por = NULL, resuelto_at = NULL,
         revisado_por = auth.uid(), revisado_at = now()
   WHERE id = _incidencia_id;

  INSERT INTO incidencias_chasis_eventos (incidencia_id, estatus_anterior, estatus_nuevo, nota, actor)
  VALUES (_incidencia_id, _i.estatus, 'en_revision', trim(_motivo), auth.uid());

  _estatus_chasis := public._sincronizar_estatus_chasis(_i.chasis_id);
  PERFORM public.recalcular_inventario_colores();

  RETURN jsonb_build_object('ok', true, 'folio', _i.folio, 'estatus_chasis', _estatus_chasis);
END; $$;
