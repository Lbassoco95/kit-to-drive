-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000004_finanzas_ingresos_egresos.sql

CREATE OR REPLACE FUNCTION public.marcar_comprobacion_movimiento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tipo = 'EGRESO' AND NEW.metodo_pago = 'EFECTIVO' AND NEW.via = 'INTERMEDIARIO' THEN
    NEW.requiere_comprobacion := true;
  END IF;
  IF NEW.comprobado AND NEW.comprobado_at IS NULL THEN
    NEW.comprobado_at := now();
  END IF;
  RETURN NEW;
END;
$$;
