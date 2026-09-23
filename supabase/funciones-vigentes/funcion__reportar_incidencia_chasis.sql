-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000001_incidencias_chasis_colores_cierre.sql

CREATE OR REPLACE FUNCTION public.reportar_incidencia_chasis(
  _chasis_id      uuid,
  _tipo_falla     text,
  _descripcion    text,
  _parte_afectada text    DEFAULT NULL,
  _severidad      text    DEFAULT 'mayor',
  _retiene        boolean DEFAULT false,
  _evidencia_url  text    DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ch record; _id uuid; _folio text; _estatus_chasis text;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)
          OR has_role(auth.uid(),'coordinador'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica/coordinador puede levantar reportes de chasis';
  END IF;
  IF _descripcion IS NULL OR length(trim(_descripcion)) < 5 THEN
    RAISE EXCEPTION 'Describe la falla (mínimo 5 caracteres)';
  END IF;

  SELECT * INTO _ch FROM inventario_chasis WHERE id = _chasis_id;
  IF _ch IS NULL THEN RAISE EXCEPTION 'Chasis no encontrado'; END IF;

  IF EXISTS (SELECT 1 FROM incidencias_chasis
              WHERE chasis_id = _chasis_id AND estatus IN ('abierta','en_revision')) THEN
    RAISE EXCEPTION 'El chasis % ya tiene un reporte abierto — resuélvelo o agrégale una nota',
      _ch.numero_chasis;
  END IF;

  INSERT INTO incidencias_chasis (
    chasis_id, ns_chasis, modelo, color, motocarro_id,
    tipo_falla, parte_afectada, descripcion, severidad,
    estatus, retiene_chasis, evidencia_url, reportado_por)
  VALUES (
    _chasis_id, _ch.numero_chasis, _ch.modelo, _ch.color, _ch.motocarro_id,
    _tipo_falla, NULLIF(trim(COALESCE(_parte_afectada,'')),''), trim(_descripcion),
    COALESCE(_severidad,'mayor'),
    'abierta', COALESCE(_retiene,false), _evidencia_url, auth.uid())
  RETURNING id, folio INTO _id, _folio;

  INSERT INTO incidencias_chasis_eventos (incidencia_id, estatus_anterior, estatus_nuevo, nota, actor)
  VALUES (_id, NULL, 'abierta', trim(_descripcion), auth.uid());

  _estatus_chasis := public._sincronizar_estatus_chasis(_chasis_id);
  PERFORM public.recalcular_inventario_colores();

  RETURN jsonb_build_object('ok', true, 'incidencia_id', _id, 'folio', _folio,
    'ns_chasis', _ch.numero_chasis, 'estatus_chasis', _estatus_chasis,
    'retiene_chasis', COALESCE(_retiene,false), 'motocarro_id', _ch.motocarro_id);
END; $$;
