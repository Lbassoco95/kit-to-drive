-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260827000001_folio_interno_clientes_nuevos.sql

CREATE OR REPLACE FUNCTION public.generar_folio_interno_cliente()
RETURNS TEXT AS $$
DECLARE
  anio INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  seq  INTEGER;
BEGIN
  seq := nextval('public.clientes_folio_interno_seq');
  RETURN 'CLI-' || anio || '-' || LPAD(seq::TEXT, 3, '0');
END;
$$
