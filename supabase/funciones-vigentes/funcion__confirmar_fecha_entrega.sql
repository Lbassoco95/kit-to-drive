-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260503192333_cb78101f-581a-4ca7-ba6c-2917c43edb25.sql

CREATE OR REPLACE FUNCTION public.confirmar_fecha_entrega(
  _motocarro_id uuid,
  _area text  -- 'fabrica' | 'logistica'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _area = 'fabrica' THEN
    IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
      RAISE EXCEPTION 'Solo fábrica/admin puede confirmar este lado';
    END IF;
    UPDATE motocarros SET confirmada_fabrica_at = now(), confirmada_fabrica_por = auth.uid()
    WHERE id = _motocarro_id;
  ELSIF _area = 'logistica' THEN
    IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'logistica'::app_role)) THEN
      RAISE EXCEPTION 'Solo logística/admin puede confirmar este lado';
    END IF;
    UPDATE motocarros
    SET confirmada_logistica_at = now(),
        confirmada_logistica_por = auth.uid(),
        fecha_estimada_entrega = COALESCE(fecha_propuesta_entrega, fecha_estimada_entrega),
        estatus_entrega = CASE WHEN estatus_entrega IN ('NO_APLICA','PROGRAMADA') THEN 'PROGRAMADA'::estatus_entrega ELSE estatus_entrega END
    WHERE id = _motocarro_id;
  ELSE
    RAISE EXCEPTION 'Área inválida';
  END IF;
END; $$;
