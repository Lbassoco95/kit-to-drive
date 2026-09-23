-- ============================================================================
-- Cerrar accesos que cualquier sesión autenticada podía usar
-- Fecha: 2026-09-23
--
-- Qué estaba pasando
-- ------------------
-- 1. Un usuario dado de baja seguía pudiendo cambiar `profiles.activo` a
--    true (la política «actualizar mi profile» es por fila, no por columna)
--    y `mi_area()` / `mi_nivel()` no consultaban `usuario_activo()`, así que
--    un administrador de área desactivado seguía administrando roles.
-- 2. Un administrador de área podía cambiar su propia fila de `user_roles`
--    (o borrar e insertar otra) y subir a Dirección. El RLS compara el área
--    nueva contra `mi_area()`, que lee la misma tabla que se está escribiendo.
-- 3. `bitacora_eliminaciones` se leía y se escribía con `USING (true)`: el
--    nombre de la política decía «solo admin» y el predicado dejaba pasar a
--    cualquiera. Ahí queda el JSON de lo borrado (remisiones, finanzas).
-- 4. `bitacora_eventos` aceptaba INSERT de cualquier sesión, así que se
--    podían inventar eventos. Quien escribe de verdad son los triggers
--    SECURITY DEFINER, que no pasan por RLS.
-- 5. Varias lecturas operativas (clientes, inventario, chasis, proveedores,
--    renglones de remisión) eran `USING (true)`. Con el alta pública de Auth
--    prendida, una cuenta sin rol leía el padrón y los seriales. Quien ya
--    tiene rol y está activo sigue viendo lo mismo: las pantallas cruzan
--    áreas (una remisión enseña al cliente).
-- 6. Quien está en la allowlist del almacén de refacciones podía editar la
--    propia allowlist y meter a quien quisiera.
-- 7. El bucket `comentarios-fotos` aceptaba subidas de cualquier sesión.
--
-- ADVERTENCIA: idempotente, para el SQL editor de Supabase. NO usar
-- `supabase db push`. Si después se vuelve a correr
-- `20260823000005_usuarios_niveles_areas.sql`, hay que volver a correr este
-- archivo: aquel redefine `mi_area()` y `mi_nivel()` sin el corte de baja.
-- ============================================================================

DO $preflight$
DECLARE _faltan text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    _faltan := _faltan || 'tabla profiles'::text;
  END IF;
  IF to_regclass('public.user_roles') IS NULL THEN
    _faltan := _faltan || 'tabla user_roles'::text;
  END IF;
  IF to_regprocedure('public.usuario_activo(uuid)') IS NULL THEN
    _faltan := _faltan || 'funcion usuario_activo(uuid) (corre 20260824000003_usuario_activo_se_aplica.sql)'::text;
  END IF;
  IF to_regprocedure('public.es_admin_global(uuid)') IS NULL THEN
    _faltan := _faltan || 'funcion es_admin_global(uuid) (corre 20260823000005_usuarios_niveles_areas.sql)'::text;
  END IF;
  IF to_regprocedure('public.mi_nivel()') IS NULL THEN
    _faltan := _faltan || 'funcion mi_nivel() (corre 20260823000005_usuarios_niveles_areas.sql)'::text;
  END IF;
  IF to_regclass('public.bitacora_eliminaciones') IS NULL THEN
    _faltan := _faltan || 'tabla bitacora_eliminaciones (corre 20260819000010_bitacora_eliminaciones.sql)'::text;
  END IF;
  IF to_regclass('public.bitacora_eventos') IS NULL THEN
    _faltan := _faltan || 'tabla bitacora_eventos'::text;
  END IF;
  IF array_length(_faltan, 1) > 0 THEN
    RAISE EXCEPTION 'No se modificó nada. Falta: %.', array_to_string(_faltan, ' | ');
  END IF;
END $preflight$;


-- ============================================================================
-- 1. Un usuario dado de baja deja de contar como admin de su área
-- ============================================================================
-- `usuario_activo` ya corta has_role / es_area / es_admin_*. Estas dos se
-- quedaron fuera y son justo las que usa la política de gestionar usuarios.

CREATE OR REPLACE FUNCTION public.mi_area()
RETURNS public.user_area
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT area
    FROM public.user_roles
   WHERE user_id = auth.uid()
     AND public.usuario_activo(auth.uid())
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.mi_nivel()
RETURNS public.user_nivel
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nivel
    FROM public.user_roles
   WHERE user_id = auth.uid()
     AND public.usuario_activo(auth.uid())
   LIMIT 1
$$;

-- Sesión con rol y de alta. Sirve para las lecturas que antes eran
-- `USING (true)`: el equipo sigue viendo los catálogos; una cuenta sin rol
-- (alta pública de Auth) o dada de baja, no.
CREATE OR REPLACE FUNCTION public.usuario_operativo(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.usuario_activo(_user_id)
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

COMMENT ON FUNCTION public.usuario_operativo(UUID) IS
  'TRUE si el usuario está de alta y tiene fila en user_roles. Lo usan las lecturas que antes estaban abiertas a cualquier sesión autenticada.';

REVOKE EXECUTE ON FUNCTION public.mi_area() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mi_nivel() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.usuario_operativo(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mi_area() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mi_nivel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuario_operativo(UUID) TO authenticated;


-- ============================================================================
-- 2. Nadie se reactiva solo, ni cambia el id de su perfil
-- ============================================================================

CREATE OR REPLACE FUNCTION public.proteger_profile_activo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'No se puede cambiar el id del perfil';
  END IF;

  IF NEW.activo IS NOT DISTINCT FROM OLD.activo THEN
    RETURN NEW;
  END IF;

  -- La service role (alta de usuarios) no trae auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.usuario_activo(auth.uid()) THEN
    RAISE EXCEPTION 'Un usuario inactivo no puede cambiar su estado';
  END IF;

  IF public.es_admin_global(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF public.mi_nivel() = 'admin'
     AND OLD.id IS DISTINCT FROM auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = OLD.id
          AND ur.area = public.mi_area()
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'No puedes cambiar el estado activo de este usuario';
END;
$$;

COMMENT ON FUNCTION public.proteger_profile_activo() IS
  'Impide que alguien se reactive solo. El alta y la baja de activo las hace un administrador vigente del área, o Dirección.';

REVOKE ALL ON FUNCTION public.proteger_profile_activo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_proteger_profile_activo ON public.profiles;
CREATE TRIGGER trg_proteger_profile_activo
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.proteger_profile_activo();


-- ============================================================================
-- 3. Un administrador de área no se asciende ni toca otra área
-- ============================================================================
-- El RLS ya intenta esto, pero la comprobación lee la misma fila que se está
-- escribiendo. El trigger compara contra OLD y contra el rol del caller, que
-- no es la fila tocada cuando el cambio es sobre otra persona.

CREATE OR REPLACE FUNCTION public.impedir_escalada_rol()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  _caller uuid := auth.uid();
  _area_caller public.user_area;
  _nivel_caller public.user_nivel;
BEGIN
  IF _caller IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Antes que el atajo de Dirección: ni el administrador global se reescribe
  -- el rol en la misma sesión. Si la comprobación de «soy global» viera la
  -- fila nueva, cambiarse el área a Dirección se aprobaría solo.
  IF TG_OP = 'DELETE' AND OLD.user_id = _caller THEN
    RAISE EXCEPTION 'No puedes quitarte tu propio rol';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.user_id = _caller THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'No puedes asignarte un rol';
    END IF;
    IF NEW.area IS DISTINCT FROM OLD.area OR NEW.nivel IS DISTINCT FROM OLD.nivel THEN
      RAISE EXCEPTION 'No puedes cambiar tu propio rol';
    END IF;
  END IF;

  IF NOT public.usuario_activo(_caller) THEN
    RAISE EXCEPTION 'Un usuario inactivo no puede cambiar roles';
  END IF;

  IF public.es_admin_global(_caller) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT area, nivel INTO _area_caller, _nivel_caller
    FROM public.user_roles
   WHERE user_id = _caller
   LIMIT 1;

  IF _nivel_caller IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar roles';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.area IS DISTINCT FROM _area_caller THEN
      RAISE EXCEPTION 'Solo puedes administrar usuarios de tu área';
    END IF;
    IF OLD.area = 'direccion' AND OLD.nivel = 'admin' THEN
      RAISE EXCEPTION 'No puedes modificar al administrador global';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.area IS DISTINCT FROM _area_caller THEN
    RAISE EXCEPTION 'Solo puedes asignar usuarios de tu área';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.area IS DISTINCT FROM _area_caller THEN
    RAISE EXCEPTION 'Solo puedes administrar usuarios de tu área';
  END IF;

  IF (TG_OP = 'UPDATE' AND OLD.area = 'direccion' AND OLD.nivel = 'admin')
     OR (NEW.area = 'direccion' AND NEW.nivel = 'admin') THEN
    RAISE EXCEPTION 'No puedes modificar al administrador global';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.impedir_escalada_rol() IS
  'Un administrador de área no cambia su propio rol, no sale de su área y no toca al administrador de Dirección. La service role (edge function) no trae auth.uid() y sigue pudiendo asignar.';

REVOKE ALL ON FUNCTION public.impedir_escalada_rol() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_impedir_escalada_rol ON public.user_roles;
CREATE TRIGGER trg_impedir_escalada_rol
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.impedir_escalada_rol();


-- ============================================================================
-- 4. Bitácoras: leer las borradas es de administradores; los eventos
--    los escriben los triggers, no el cliente
-- ============================================================================

DROP POLICY IF EXISTS "solo admin lee bitacora" ON public.bitacora_eliminaciones;
CREATE POLICY "solo admin lee bitacora" ON public.bitacora_eliminaciones
  FOR SELECT TO authenticated
  USING (public.usuario_activo(auth.uid()) AND public.mi_nivel() = 'admin');

DROP POLICY IF EXISTS "sistema escribe bitacora" ON public.bitacora_eliminaciones;
CREATE POLICY "sistema escribe bitacora" ON public.bitacora_eliminaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    eliminado_por = auth.uid()
    AND public.usuario_activo(auth.uid())
    AND public.mi_nivel() = 'admin'
  );

DROP POLICY IF EXISTS "insertar bitacora autenticados" ON public.bitacora_eventos;


-- ============================================================================
-- 5. Lecturas que estaban abiertas a cualquier JWT autenticado
-- ============================================================================
-- ALTER (y no DROP/CREATE) para no perder otros predicados si el nombre
-- coincide. Si la política no está, se avisa y se sigue: el archivo no
-- debe revertirse entero por una tabla que esa base todavía no tiene.

DO $politicas$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('clientes',                          'leer clientes'),
      ('contenedores',                      'leer contenedores'),
      ('config_general',                    'leer config'),
      ('inventario_chasis',                 'leer inventario chasis'),
      ('inventario_partes',                 'leer inventario partes'),
      ('inventario_colores',                'leer inventario colores'),
      ('inventario_motor',                  'leer inventario motor'),
      ('contenedor_partes',                 'leer partes contenedor'),
      ('modelos_producto',                  'autenticados leen modelos_producto'),
      ('bitacora_color',                    'autenticados leen bitacora_color'),
      ('bitacora_orden_armado',             'autenticados leen bitacora_orden_armado'),
      ('incidencias_chasis',                'autenticados leen incidencias_chasis'),
      ('incidencias_chasis_eventos',        'autenticados leen incidencias_eventos'),
      ('proveedores',                       'proveedores_select'),
      ('remision_items',                    'remision_items_select')
    ) AS v(tabla, politica)
  LOOP
    IF to_regclass('public.' || r.tabla) IS NULL THEN
      RAISE NOTICE 'PENDIENTE: no existe public.% — se omite la política %.', r.tabla, r.politica;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = r.tabla AND policyname = r.politica
    ) THEN
      RAISE NOTICE 'PENDIENTE: no existe la política % en %.', r.politica, r.tabla;
      CONTINUE;
    END IF;
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (public.usuario_operativo(auth.uid()))',
      r.politica, r.tabla
    );
  END LOOP;
END $politicas$;

-- El propio perfil se sigue leyendo aunque esté dado de baja: si no, la
-- pantalla no puede explicar por qué no entra (activo = false se vería como
-- perfil ausente y la app lo trata como activo).
DO $profiles$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'profiles'
       AND policyname = 'leer profiles autenticados'
  ) THEN
    ALTER POLICY "leer profiles autenticados" ON public.profiles
      USING (
        id = auth.uid()
        OR public.usuario_operativo(auth.uid())
      );
  END IF;
END $profiles$;


-- ============================================================================
-- 6. La allowlist de refacciones solo la escribe Dirección
-- ============================================================================
-- Ver el catálogo sigue siendo de quien está en la lista. Meter o sacar
-- gente de la lista no: con la política anterior, cualquiera de la lista
-- podía agregarse cuentas.

DO $refacciones$
BEGIN
  IF to_regclass('public.almacen_refacciones_acceso') IS NULL THEN
    RAISE NOTICE 'PENDIENTE: no existe almacen_refacciones_acceso.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "ref_acceso_leer" ON public.almacen_refacciones_acceso;
  CREATE POLICY "ref_acceso_leer" ON public.almacen_refacciones_acceso
    FOR SELECT TO authenticated
    USING (
      public.es_admin_global(auth.uid())
      OR user_id = auth.uid()
      OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );

  DROP POLICY IF EXISTS "ref_acceso_escribir" ON public.almacen_refacciones_acceso;
  CREATE POLICY "ref_acceso_escribir" ON public.almacen_refacciones_acceso
    FOR ALL TO authenticated
    USING (public.es_admin_global(auth.uid()))
    WITH CHECK (public.es_admin_global(auth.uid()));
END $refacciones$;


-- ============================================================================
-- 7. Fotos de comentarios: solo quien ya puede comentar en producción
-- ============================================================================
-- El bucket es de storage. Si el editor no tiene permiso sobre
-- storage.objects, se avisa y el resto del archivo ya quedó aplicado.

DO $fotos$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'PENDIENTE MANUAL: no se alcanzó storage.objects.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "subir foto comentario" ON storage.objects;
  CREATE POLICY "subir foto comentario"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'comentarios-fotos'
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'fabrica')
        OR public.has_role(auth.uid(), 'logistica')
        OR public.has_role(auth.uid(), 'ventas')
        OR public.has_role(auth.uid(), 'coordinador')
      )
    );

  DROP POLICY IF EXISTS "leer foto comentario" ON storage.objects;
  CREATE POLICY "leer foto comentario"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'comentarios-fotos'
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'fabrica')
        OR public.has_role(auth.uid(), 'logistica')
        OR public.has_role(auth.uid(), 'ventas')
        OR public.has_role(auth.uid(), 'coordinador')
      )
    );
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'PENDIENTE MANUAL: las políticas de comentarios-fotos hay que ajustarlas en Storage → Policies (solo admin, fábrica, logística, ventas y coordinador).';
END $fotos$;
