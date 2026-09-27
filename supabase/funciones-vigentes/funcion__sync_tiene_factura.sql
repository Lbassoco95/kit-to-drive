-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000004_finanzas_ingresos_egresos.sql

CREATE OR REPLACE FUNCTION public.sync_tiene_factura()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  mov uuid := coalesce(NEW.movimiento_id, OLD.movimiento_id);
BEGIN
  UPDATE public.movimientos_financieros m
     SET tiene_factura = EXISTS (
           SELECT 1 FROM public.movimiento_adjuntos a
            WHERE a.movimiento_id = mov AND a.tipo_documento = 'FACTURA'
         )
   WHERE m.id = mov;
  RETURN NULL;
END;
$$;
