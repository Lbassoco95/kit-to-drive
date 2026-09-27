-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000004_finanzas_ingresos_egresos.sql

CREATE OR REPLACE FUNCTION public.set_folio_movimiento()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.folio IS NULL OR btrim(NEW.folio) = '' THEN
    IF NEW.tipo = 'INGRESO' THEN
      NEW.folio := 'ING-' || lpad(nextval('public.seq_folio_ingreso')::text, 6, '0');
    ELSE
      NEW.folio := 'EGR-' || lpad(nextval('public.seq_folio_egreso')::text, 6, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
