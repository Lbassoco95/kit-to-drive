-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260826000003_asignacion_manual_remisiones.sql

CREATE OR REPLACE FUNCTION public.desasignar_motocarro_de_remision(
  _motocarro_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _m public.motocarros%ROWTYPE;
  _remision_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'fabrica')
  ) THEN
    RAISE EXCEPTION 'Solo admin o fábrica puede desasignar unidades';
  END IF;

  SELECT * INTO _m FROM public.motocarros WHERE id = _motocarro_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Motocarro no encontrado'; END IF;
  IF _m.remision_id IS NULL THEN
    RAISE EXCEPTION 'El motocarro no está asignado a ninguna remisión';
  END IF;
  IF _m.estatus_entrega = 'ENTREGADA' THEN
    RAISE EXCEPTION 'No se puede desasignar una unidad ya entregada';
  END IF;

  _remision_id := _m.remision_id;

  UPDATE public.motocarros
     SET remision_id = NULL,
         estatus_entrega = 'NO_APLICA'
   WHERE id = _motocarro_id;

  UPDATE public.remisiones
     SET estatus = CASE
       WHEN (SELECT COUNT(*) FROM public.motocarros mm WHERE mm.remision_id = _remision_id) = 0
         THEN 'NUEVA'::estatus_remision
       WHEN (SELECT COUNT(*) FROM public.motocarros mm WHERE mm.remision_id = _remision_id) >= total_unidades_solicitadas
         THEN 'COMPLETA'::estatus_remision
       ELSE 'PARCIAL'::estatus_remision
     END
   WHERE id = _remision_id;
END;
$$;
