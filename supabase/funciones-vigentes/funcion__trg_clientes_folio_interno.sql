-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260827000001_folio_interno_clientes_nuevos.sql

CREATE OR REPLACE FUNCTION public.trg_clientes_folio_interno()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_erp IS NULL AND NEW.folio_interno IS NULL THEN
    NEW.folio_interno := public.generar_folio_interno_cliente();
  END IF;
  RETURN NEW;
END;
$$
