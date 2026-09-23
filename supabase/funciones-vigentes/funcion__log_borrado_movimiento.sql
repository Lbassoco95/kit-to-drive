-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000004_finanzas_ingresos_egresos.sql

CREATE OR REPLACE FUNCTION public.log_borrado_movimiento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.bitacora_eliminaciones (tabla, registro_id, eliminado_por, motivo, datos_eliminados)
  VALUES ('movimientos_financieros', OLD.id, auth.uid(),
          coalesce(OLD.motivo_cancelacion, 'Eliminado desde Control Financiero'),
          to_jsonb(OLD));
  RETURN OLD;
END;
$$;
