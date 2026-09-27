-- Vigente. Lo regenera `npm run migraciones:sellar`. No lo edites a mano.
-- fuente: 20260823000004_finanzas_ingresos_egresos.sql

CREATE OR REPLACE FUNCTION public.log_movimiento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  accion  text;
  detalle jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    accion  := 'CREADO';
    detalle := jsonb_build_object(
      'tipo', NEW.tipo, 'monto', NEW.monto, 'moneda', NEW.moneda,
      'contraparte', NEW.contraparte_nombre, 'estatus', NEW.estatus);
  ELSE
    IF NEW.estatus <> OLD.estatus THEN
      accion  := CASE NEW.estatus
                   WHEN 'CONFIRMADO' THEN 'CONFIRMADO'
                   WHEN 'CANCELADO'  THEN 'CANCELADO'
                   ELSE 'ESTATUS' END;
      detalle := jsonb_build_object('de', OLD.estatus, 'a', NEW.estatus,
                                    'motivo', NEW.motivo_cancelacion);
    ELSIF NEW.comprobado AND NOT OLD.comprobado THEN
      accion  := 'COMPROBADO';
      detalle := jsonb_build_object('monto_comprobado', NEW.monto_comprobado,
                                    'monto_devuelto',  NEW.monto_devuelto);
    ELSE
      accion  := 'EDITADO';
      detalle := jsonb_strip_nulls(jsonb_build_object(
        'monto',       CASE WHEN NEW.monto <> OLD.monto THEN jsonb_build_object('de', OLD.monto, 'a', NEW.monto) END,
        'concepto',    CASE WHEN NEW.concepto <> OLD.concepto THEN jsonb_build_object('de', OLD.concepto, 'a', NEW.concepto) END,
        'contraparte', CASE WHEN NEW.contraparte_nombre <> OLD.contraparte_nombre
                            THEN jsonb_build_object('de', OLD.contraparte_nombre, 'a', NEW.contraparte_nombre) END
      ));
      IF detalle = '{}'::jsonb THEN RETURN NULL; END IF;   -- nada relevante cambió
    END IF;
  END IF;

  INSERT INTO public.movimiento_bitacora (movimiento_id, accion, usuario_id, detalle)
  VALUES (NEW.id, accion, auth.uid(), detalle);
  RETURN NULL;
END;
$$;
