-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260826000003_asignacion_manual_remisiones.sql

CREATE OR REPLACE FUNCTION public.asignar_motocarro_a_remision(
  _motocarro_id uuid,
  _remision_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _m public.motocarros%ROWTYPE;
  _r public.remisiones%ROWTYPE;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'fabrica')
  ) THEN
    RAISE EXCEPTION 'Solo admin o fábrica puede asignar unidades';
  END IF;

  SELECT * INTO _m FROM public.motocarros WHERE id = _motocarro_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Motocarro no encontrado'; END IF;
  IF _m.remision_id IS NOT NULL THEN
    RAISE EXCEPTION 'El motocarro % ya está asignado a otra remisión', _m.orden_armado;
  END IF;
  IF _m.estatus_armado NOT IN ('PENDIENTE','EN_PROCESO','ARMADO','LISTO') THEN
    RAISE EXCEPTION 'La unidad no está disponible para asignación';
  END IF;

  SELECT * INTO _r FROM public.remisiones WHERE id = _remision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Remisión no encontrada'; END IF;

  UPDATE public.motocarros
     SET remision_id = _remision_id,
         estatus_entrega = CASE WHEN estatus_entrega = 'NO_APLICA' THEN 'PROGRAMADA' ELSE estatus_entrega END
   WHERE id = _motocarro_id;

  UPDATE public.remisiones
     SET estatus = CASE
       WHEN (SELECT COUNT(*) FROM public.motocarros mm WHERE mm.remision_id = _r.id) >= _r.total_unidades_solicitadas
         THEN 'COMPLETA'::estatus_remision
       ELSE 'PARCIAL'::estatus_remision
     END
   WHERE id = _remision_id;
END;
$$;
