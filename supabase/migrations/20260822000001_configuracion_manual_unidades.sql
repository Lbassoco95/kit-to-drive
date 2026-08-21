-- ============================================================================
-- KIT-3 · Configuración manual de unidades, líneas de producto y stock
-- Baseline documental para el SQL editor de Supabase (dmhzhyeivvuliumcgsmm)
-- Fecha: 2026-08-22
--
-- ADVERTENCIA: Igual que el resto de este repo, este script es IDEMPOTENTE
-- pero está pensado para correrse directamente en el SQL editor de Supabase.
-- NO usar `supabase db push` / `db reset` / `migration up`.
--
-- Sustituye la Parte B del prompt KIT-3 original. La importación ya no
-- parea automáticamente (ver 20260821000001 y el fix de "importación sin
-- pareo"): chasis y motores entran como piezas disponibles, y fábrica arma
-- la unidad eligiendo la pareja a mano con configurar_unidad().
-- parear_unidades_contenedor y su función interna se quedan en la base sin
-- usarse; no se borran.
-- ============================================================================


-- ============================================================================
-- BLOQUE 1 · Catálogo de líneas de producto
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.modelos_producto (
  modelo      text PRIMARY KEY,
  linea       text NOT NULL DEFAULT 'motocarro'
              CHECK (linea IN ('motocarro','mototaxi','otro')),
  descripcion text,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.modelos_producto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autenticados leen modelos_producto" ON public.modelos_producto;
CREATE POLICY "autenticados leen modelos_producto" ON public.modelos_producto
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin escribe modelos_producto" ON public.modelos_producto;
CREATE POLICY "admin escribe modelos_producto" ON public.modelos_producto
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

-- Modelos del embarque 260316DZ. El DZ-K1 es un mototaxi: no entra al flujo
-- de armado de motocarros, pero sí se puede configurar como unidad y
-- remisionar/entregar (ver BLOQUE 3 y la app).
INSERT INTO public.modelos_producto (modelo, linea, descripcion) VALUES
  ('DZ200Q1','motocarro','Motocarro 200cc'),
  ('DZ300Q7','motocarro','Motocarro 300cc'),
  ('DZ-K1','mototaxi','Mototaxi — fuera del flujo de armado de motocarros')
ON CONFLICT (modelo) DO NOTHING;

-- Modelos legacy que ya tienen motocarros creados antes de este catálogo.
-- Se clasifican como motocarro para no sacar del flujo de armado unidades
-- que ya existían.
INSERT INTO public.modelos_producto (modelo, linea, descripcion) VALUES
  ('200cc 2026','motocarro','Modelo legado — motocarro 200cc'),
  ('300cc 2026','motocarro','Modelo legado — motocarro 300cc')
ON CONFLICT (modelo) DO NOTHING;


-- ============================================================================
-- BLOQUE 2 · Normalizar colores ya cargados en inglés
-- ============================================================================

UPDATE public.inventario_chasis SET color = 'BLANCO'  WHERE upper(color) IN ('WHITE','BLANC');
UPDATE public.inventario_chasis SET color = 'AZUL'    WHERE upper(color) = 'BLUE';
UPDATE public.inventario_chasis SET color = 'NARANJA' WHERE upper(color) = 'ORANGE';

-- inventario_colores queda con el contador viejo en inglés y el nuevo en
-- español duplicados (p.ej. AZUL y BLUE del mismo modelo). Se fusionan.
DO $$
DECLARE _r record;
BEGIN
  FOR _r IN
    SELECT modelo, upper_color, array_agg(id) AS ids, sum(cantidad_disponible) AS total
    FROM (
      SELECT id, modelo, cantidad_disponible,
             CASE upper(color)
               WHEN 'WHITE' THEN 'BLANCO' WHEN 'BLANC' THEN 'BLANCO'
               WHEN 'BLUE'  THEN 'AZUL'
               WHEN 'ORANGE' THEN 'NARANJA'
               ELSE upper(color)
             END AS upper_color
      FROM public.inventario_colores
    ) x
    GROUP BY modelo, upper_color
    HAVING count(*) > 1
  LOOP
    UPDATE public.inventario_colores
       SET color = _r.upper_color, cantidad_disponible = _r.total, updated_at = now()
     WHERE id = _r.ids[1];
    DELETE FROM public.inventario_colores WHERE id = ANY(_r.ids[2:]);
  END LOOP;
END $$;

UPDATE public.inventario_colores SET color = 'BLANCO'  WHERE upper(color) IN ('WHITE','BLANC');
UPDATE public.inventario_colores SET color = 'AZUL'    WHERE upper(color) = 'BLUE';
UPDATE public.inventario_colores SET color = 'NARANJA' WHERE upper(color) = 'ORANGE';


-- ============================================================================
-- BLOQUE 3 · Configurar unidad (chasis + motor, a mano, por fábrica)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.configurar_unidad(
  _chasis_id uuid, _motor_id uuid, _orden integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ch record; _mo record; _orden_final int; _moto_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede configurar unidades';
  END IF;

  SELECT * INTO _ch FROM inventario_chasis WHERE id = _chasis_id;
  IF _ch IS NULL THEN RAISE EXCEPTION 'Chasis no encontrado'; END IF;
  IF _ch.motocarro_id IS NOT NULL THEN
    RAISE EXCEPTION 'El chasis % ya está asignado a una unidad', _ch.numero_chasis;
  END IF;

  SELECT * INTO _mo FROM inventario_motor WHERE id = _motor_id;
  IF _mo IS NULL THEN RAISE EXCEPTION 'Motor no encontrado'; END IF;
  IF _mo.motocarro_id IS NOT NULL THEN
    RAISE EXCEPTION 'El motor % ya está asignado a una unidad', _mo.numero_motor;
  END IF;

  _orden_final := COALESCE(_orden, (SELECT COALESCE(max(orden_armado),0)+1 FROM motocarros));
  IF EXISTS (SELECT 1 FROM motocarros WHERE orden_armado = _orden_final) THEN
    RAISE EXCEPTION 'El orden de armado % ya está ocupado', _orden_final;
  END IF;

  INSERT INTO motocarros (orden_armado, modelo, color, ns_chasis, ns_motor,
                          contenedor_id, estatus_armado, estatus_entrega)
  VALUES (_orden_final, _ch.modelo, _ch.color, _ch.numero_chasis, _mo.numero_motor,
          _ch.contenedor_id, 'PENDIENTE', 'NO_APLICA')
  RETURNING id INTO _moto_id;

  UPDATE inventario_chasis SET motocarro_id = _moto_id, estatus = 'configurado',
         fecha_configuracion = now() WHERE id = _chasis_id;
  UPDATE inventario_motor  SET motocarro_id = _moto_id, estatus = 'configurado',
         fecha_configuracion = now() WHERE id = _motor_id;

  UPDATE contenedores c SET total_unidades =
    (SELECT count(*) FROM inventario_chasis ic
      WHERE ic.contenedor_id = c.id AND ic.motocarro_id IS NOT NULL)
  WHERE c.id = _ch.contenedor_id;

  RETURN jsonb_build_object('ok', true, 'motocarro_id', _moto_id,
    'orden_armado', _orden_final, 'ns_chasis', _ch.numero_chasis,
    'ns_motor', _mo.numero_motor,
    'modelos_coinciden', (_ch.modelo = _mo.modelo));
END; $$;

GRANT EXECUTE ON FUNCTION public.configurar_unidad(uuid, uuid, integer) TO authenticated;


-- ============================================================================
-- BLOQUE 4 · Desconfigurar unidad (corregir un error de captura)
-- ============================================================================

-- [VERIFICADO EN INFORMATION_SCHEMA — 2026-08-20] bitacora_eliminaciones NO
-- existe en la base real (la migración 20260819000010 nunca se aplicó tal
-- cual). No se registra ahí la liberación; si se crea esa tabla más
-- adelante, agregar el INSERT aquí antes del DELETE.
CREATE OR REPLACE FUNCTION public.desconfigurar_unidad(_motocarro_id uuid, _motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _m record;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede liberar unidades';
  END IF;
  IF _motivo IS NULL OR length(trim(_motivo)) < 5 THEN
    RAISE EXCEPTION 'Se requiere un motivo';
  END IF;

  SELECT * INTO _m FROM motocarros WHERE id = _motocarro_id;
  IF _m IS NULL THEN RAISE EXCEPTION 'Unidad no encontrada'; END IF;
  IF _m.remision_id IS NOT NULL THEN
    RAISE EXCEPTION 'La unidad ya está asignada a una remisión; no se puede liberar';
  END IF;
  IF _m.estatus_armado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'La unidad ya entró a armado; no se puede liberar';
  END IF;

  UPDATE inventario_chasis SET motocarro_id = NULL, estatus = 'disponible',
         fecha_configuracion = NULL WHERE motocarro_id = _motocarro_id;
  UPDATE inventario_motor  SET motocarro_id = NULL, estatus = 'disponible',
         fecha_configuracion = NULL WHERE motocarro_id = _motocarro_id;

  DELETE FROM motocarros WHERE id = _motocarro_id;

  UPDATE contenedores c SET total_unidades =
    (SELECT count(*) FROM inventario_chasis ic
      WHERE ic.contenedor_id = c.id AND ic.motocarro_id IS NOT NULL)
  WHERE c.id = _m.contenedor_id;

  RETURN jsonb_build_object('ok', true, 'liberada', _m.orden_armado);
END; $$;

GRANT EXECUTE ON FUNCTION public.desconfigurar_unidad(uuid, text) TO authenticated;


-- ============================================================================
-- BLOQUE 5 · Reordenar el armado, con el cambio registrado
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bitacora_orden_armado (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motocarro_id   uuid NOT NULL REFERENCES public.motocarros(id) ON DELETE CASCADE,
  orden_anterior integer,
  orden_nuevo    integer NOT NULL,
  motivo         text,
  cambiado_por   uuid REFERENCES auth.users(id),
  cambiado_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bitacora_orden_armado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autenticados leen bitacora_orden_armado" ON public.bitacora_orden_armado;
CREATE POLICY "autenticados leen bitacora_orden_armado" ON public.bitacora_orden_armado
  FOR SELECT TO authenticated USING (true);
-- Sin política de INSERT/UPDATE/DELETE para authenticated: sólo escribe la
-- RPC cambiar_orden_armado, que es SECURITY DEFINER.

CREATE INDEX IF NOT EXISTS idx_bitacora_orden_moto ON public.bitacora_orden_armado (motocarro_id, cambiado_at DESC);

-- orden_armado no tiene CHECK > 0 en la base real, así que el -1 temporal
-- del intercambio no truena. [VERIFICADO — 2026-08-20]
CREATE OR REPLACE FUNCTION public.cambiar_orden_armado(
  _motocarro_id uuid, _orden_nuevo integer, _motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _actual int; _ocupa uuid; _estatus_actual estatus_armado;
BEGIN
  IF NOT (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'fabrica'::app_role)) THEN
    RAISE EXCEPTION 'Solo admin/fábrica puede cambiar el orden';
  END IF;
  IF _orden_nuevo IS NULL OR _orden_nuevo < 1 THEN
    RAISE EXCEPTION 'Orden inválido';
  END IF;

  SELECT orden_armado, estatus_armado INTO _actual, _estatus_actual
    FROM motocarros WHERE id = _motocarro_id;
  IF _actual IS NULL THEN RAISE EXCEPTION 'Unidad no encontrada'; END IF;
  IF _estatus_actual NOT IN ('PENDIENTE','EN_PROCESO') THEN
    RAISE EXCEPTION 'La unidad ya entró a armado; no se puede reordenar';
  END IF;
  IF _actual = _orden_nuevo THEN
    RETURN jsonb_build_object('ok', true, 'sin_cambio', true);
  END IF;

  -- Si el orden destino está ocupado, se INTERCAMBIAN y se registran los dos
  SELECT id INTO _ocupa FROM motocarros WHERE orden_armado = _orden_nuevo;

  IF _ocupa IS NOT NULL THEN
    UPDATE motocarros SET orden_armado = -1, updated_at = now() WHERE id = _motocarro_id;
    UPDATE motocarros SET orden_armado = _actual, updated_at = now() WHERE id = _ocupa;
    UPDATE motocarros SET orden_armado = _orden_nuevo, updated_at = now() WHERE id = _motocarro_id;

    INSERT INTO bitacora_orden_armado (motocarro_id, orden_anterior, orden_nuevo, motivo, cambiado_por)
    VALUES (_ocupa, _orden_nuevo, _actual, COALESCE(_motivo,'intercambio'), auth.uid());
  ELSE
    UPDATE motocarros SET orden_armado = _orden_nuevo, updated_at = now() WHERE id = _motocarro_id;
  END IF;

  INSERT INTO bitacora_orden_armado (motocarro_id, orden_anterior, orden_nuevo, motivo, cambiado_por)
  VALUES (_motocarro_id, _actual, _orden_nuevo, _motivo, auth.uid());

  RETURN jsonb_build_object('ok', true, 'orden_anterior', _actual,
    'orden_nuevo', _orden_nuevo, 'intercambio_con', _ocupa);
END; $$;

GRANT EXECUTE ON FUNCTION public.cambiar_orden_armado(uuid, integer, text) TO authenticated;
