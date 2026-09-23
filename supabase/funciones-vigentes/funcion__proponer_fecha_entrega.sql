-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260503192333_cb78101f-581a-4ca7-ba6c-2917c43edb25.sql

CREATE OR REPLACE FUNCTION public.proponer_fecha_entrega(
  _motocarro_id uuid,
  _fecha date,
  _notas text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'coordinador'::app_role)
    OR EXISTS (
      SELECT 1 FROM motocarros m
      JOIN remisiones r ON r.id = m.remision_id
      WHERE m.id = _motocarro_id AND r.vendedor_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'No autorizado para proponer fecha de entrega';
  END IF;

  UPDATE motocarros
  SET fecha_propuesta_entrega = _fecha,
      propuesta_entrega_notas = _notas,
      propuesta_entrega_por = auth.uid(),
      propuesta_entrega_at = now(),
      confirmada_fabrica_at = NULL, confirmada_fabrica_por = NULL,
      confirmada_logistica_at = NULL, confirmada_logistica_por = NULL
  WHERE id = _motocarro_id;
END; $$;
