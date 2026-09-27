-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000004_finanzas_ingresos_egresos.sql

CREATE OR REPLACE FUNCTION public.validar_moneda_cuenta()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  moneda_cuenta text;
BEGIN
  IF NEW.cuenta_id IS NULL THEN RETURN NEW; END IF;
  SELECT moneda INTO moneda_cuenta FROM public.cuentas_financieras WHERE id = NEW.cuenta_id;
  IF moneda_cuenta IS NOT NULL AND moneda_cuenta <> NEW.moneda THEN
    RAISE EXCEPTION 'El movimiento está en % pero la cuenta maneja %', NEW.moneda, moneda_cuenta
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
