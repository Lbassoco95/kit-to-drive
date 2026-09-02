-- ============================================================================
-- ¿Qué scripts están aplicados de verdad en esta base?
--
-- Este proyecto no lleva tabla de migraciones: los scripts se pegan a mano en
-- el SQL editor. Cuando uno no se corre —o se corre y revienta a media página,
-- que en el SQL editor es lo mismo porque todo va en una transacción— no queda
-- rastro: la app compila igual, y el hueco sale semanas después como
-- «column ... does not exist» en una pantalla cualquiera.
--
-- Esto lo revisa al revés: por cada script, busca los objetos que ese script
-- debería haber dejado. Es de SOLO LECTURA — no modifica nada.
--
-- Cómo se usa: pégalo completo en el SQL editor de Supabase y corre.
--   · APLICADO  → el script está.
--   · FALTA     → hay que correr ese archivo de supabase/migrations/.
--   · PARCIAL   → quedó a medias; vuelve a correr el archivo completo
--                 (todos son idempotentes) y revisa el error que salga.
--
-- Para saber qué le falta a UN script antes de correrlo, hay revisiones
-- puntuales al lado de este archivo, p. ej.
-- supabase/revisar_antes_de_20260902000001.sql.
-- ============================================================================

WITH esperado(script, objeto) AS (VALUES
  ('20260629000005_remision_items_tipo_servicio', 'columna|remision_items.tipo_servicio'),
  ('20260713000001_finanzas_module',              'tabla|pagos'),
  ('20260714000002_crm_ventas',                   'tabla|crm_oportunidades'),
  ('20260714000002_crm_ventas',                   'tabla|crm_rutas'),
  ('20260717000003_clientes_expediente_digital',  'columna|clientes.rfc'),
  ('20260717000003_clientes_expediente_digital',  'columna|clientes.codigo_postal'),
  ('20260717000004_crm_fixes',                    'vista|v_reporte_pipeline'),
  ('20260717000004_crm_fixes',                    'columna|crm_oportunidades.limitante_notas'),
  ('20260819000001_parts_inventory',              'tabla|contenedor_partes'),
  ('20260819000004_inventario_chasis',            'tabla|inventario_chasis'),
  ('20260819000005_inventario_motor',             'tabla|inventario_motor'),
  ('20260819000007_inventario_colores',           'tabla|inventario_colores'),
  ('20260819000010_bitacora_eliminaciones',       'tabla|bitacora_eliminaciones'),

  -- KIT-1 · unidad = chasis + motor
  ('20260821000001_unidad_chasis_motor',          'columna|contenedores.total_chasis'),
  ('20260821000001_unidad_chasis_motor',          'funcion|importar_motores_inventario(uuid,text,jsonb)'),

  -- KIT-3 · configuración manual y nomenclatura comercial
  ('20260822000001_configuracion_manual_unidades','tabla|modelos_producto'),
  ('20260822000001_configuracion_manual_unidades','columna|modelos_producto.nombre_comercial'),
  ('20260822000001_configuracion_manual_unidades','tabla|bitacora_orden_armado'),
  ('20260822000001_configuracion_manual_unidades','funcion|desconfigurar_unidad(uuid,text)'),

  -- KIT-4 · incidencias, colores registrados, cierre con serial
  ('20260823000001_incidencias_chasis_colores_cierre','tabla|incidencias_chasis'),
  ('20260823000001_incidencias_chasis_colores_cierre','funcion|chasis_bloqueado(uuid)'),
  ('20260823000001_incidencias_chasis_colores_cierre','funcion|asignar_remision_items(uuid)'),
  ('20260823000001_incidencias_chasis_colores_cierre','columna|inventario_colores.piezas_total'),
  ('20260823000001_incidencias_chasis_colores_cierre','vista|v_stock_modelo_color'),
  ('20260823000001_incidencias_chasis_colores_cierre','trigger|motocarros.trg_exigir_serial_para_cerrar'),

  -- KIT-4b · captura de seriales ligando la pieza
  ('20260823000002_capturar_seriales_unidad',     'funcion|capturar_seriales_unidad(uuid,text,text)'),

  -- KIT-4c · color efectivo vs. color del VIN, y capacidad por color
  ('20260823000003_color_efectivo_capacidad',     'columna|inventario_chasis.color_original'),
  ('20260823000003_color_efectivo_capacidad',     'tabla|bitacora_color'),
  ('20260823000003_color_efectivo_capacidad',     'columna|inventario_colores.piezas_recibidas'),
  ('20260823000003_color_efectivo_capacidad',     'columna|v_stock_modelo_color.capacidad_color'),
  ('20260823000003_color_efectivo_capacidad',     'funcion|norm_color(text)'),
  ('20260823000003_color_efectivo_capacidad',     'funcion|cambiar_color_chasis(uuid,text,text)'),
  ('20260823000003_color_efectivo_capacidad',     'funcion|intercambiar_color_chasis(uuid,uuid,text)'),
  ('20260823000003_color_efectivo_capacidad',     'funcion|ajustar_capacidad_color(text,text,integer,text)'),
  ('20260823000003_color_efectivo_capacidad',     'funcion|configurar_unidad(uuid,uuid,integer,text)'),
  ('20260823000003_color_efectivo_capacidad',     'trigger|inventario_chasis.trg_chasis_color_original'),
  ('20260823000003_color_efectivo_capacidad',     'trigger|inventario_chasis.trg_verificar_capacidad_color'),

  -- KIT-4d · control financiero
  ('20260823000004_finanzas_ingresos_egresos',    'tabla|movimientos_financieros'),
  ('20260823000004_finanzas_ingresos_egresos',    'tabla|proveedores'),
  ('20260823000004_finanzas_ingresos_egresos',    'tabla|cuentas_financieras'),
  ('20260823000004_finanzas_ingresos_egresos',    'vista|v_saldos_cuentas'),

  -- Usuarios ÁREA × NIVEL y permisos
  -- Los OCHO helpers, no sólo es_area: este script dejaba pasar una base a la
  -- que le faltaba supervisa_area() y la reportaba como APLICADA, con lo que el
  -- hueco sólo salía cuando otro script se negaba a correr.
  ('20260823000005_usuarios_niveles_areas',       'columna|user_roles.area'),
  ('20260823000005_usuarios_niveles_areas',       'columna|user_roles.nivel'),
  ('20260823000005_usuarios_niveles_areas',       'funcion|nivel_rank(user_nivel)'),
  ('20260823000005_usuarios_niveles_areas',       'funcion|rol_legacy(user_area,user_nivel)'),
  ('20260823000005_usuarios_niveles_areas',       'funcion|mi_area()'),
  ('20260823000005_usuarios_niveles_areas',       'funcion|mi_nivel()'),
  ('20260823000005_usuarios_niveles_areas',       'funcion|es_area(uuid,user_area)'),
  ('20260823000005_usuarios_niveles_areas',       'funcion|nivel_al_menos(uuid,user_nivel)'),
  ('20260823000005_usuarios_niveles_areas',       'funcion|es_admin_area(uuid,user_area)'),
  ('20260823000005_usuarios_niveles_areas',       'funcion|es_admin_global(uuid)'),
  ('20260823000005_usuarios_niveles_areas',       'funcion|supervisa_area(uuid,user_area)'),
  ('20260824000001_remisiones_visibles_equipo_comercial','politica|remisiones.leer remisiones por rol'),
  ('20260824000002_comercial_lee_toda_la_bandeja','politica|remisiones.comercial lee remisiones'),
  ('20260824000002_comercial_lee_toda_la_bandeja','politica|motocarros.comercial lee motocarros'),
  ('20260824000003_usuario_activo_se_aplica',     'funcion|usuario_activo(uuid)'),
  -- La escalera de Comercial no es sólo el CRM: lo que más se nota es que el
  -- supervisor pueda capturar una remisión y sus renglones.
  ('20260825000001_comercial_escalera_de_permisos','politica|remisiones.crear remisiones|supervisa_area'),
  -- `remision_items_insert` NO se revisa aquí: 20260902000001 se hace cargo de
  -- ese permiso con `remision_items_insert_area`, y la política vieja deja de
  -- existir a propósito. Revisarla marcaría este script como PARCIAL para
  -- siempre.
  ('20260825000001_comercial_escalera_de_permisos','politica|crm_oportunidades.crm_oportunidades_insert_area'),
  ('20260825000001_comercial_escalera_de_permisos','politica|crm_actividades.crm_actividades_insert_area'),
  ('20260825000001_comercial_escalera_de_permisos','politica|crm_rutas.crm_rutas_insert_area'),

  -- Folios reutilizables en remisiones canceladas
  ('20260826000002_folio_reutilizable_canceladas','indice|idx_remisiones_folio_activas'),

  -- Asignación manual de motocarros a remisiones
  ('20260826000003_asignacion_manual_remisiones','funcion|asignar_motocarro_a_remision(uuid,uuid)'),
  ('20260826000003_asignacion_manual_remisiones','funcion|desasignar_motocarro_de_remision(uuid)'),

  -- Folio interno de clientes nuevos
  ('20260827000001_folio_interno_clientes_nuevos','columna|clientes.folio_interno'),
  ('20260827000001_folio_interno_clientes_nuevos','indice|idx_clientes_folio_interno_unico'),
  ('20260827000001_folio_interno_clientes_nuevos','secuencia|clientes_folio_interno_seq'),
  ('20260827000001_folio_interno_clientes_nuevos','funcion|generar_folio_interno_cliente()'),
  ('20260827000001_folio_interno_clientes_nuevos','trigger|clientes.trg_clientes_folio_interno'),

  -- Motocarro ya armado desde remisiones
  ('20260828000001_motocarro_ya_armado',          'funcion|crear_motocarro_ya_armado(text,text,text,text,uuid)'),

  -- El operador corrige y complementa sus remisiones, con motivo
  ('20260902000001_operador_edita_remisiones',    'funcion|rol_comercial(uuid)'),
  ('20260902000001_operador_edita_remisiones',    'funcion|puede_editar_remision(uuid,uuid)'),
  ('20260902000001_operador_edita_remisiones',    'funcion|puede_capturar_remision(uuid,uuid)'),
  ('20260902000001_operador_edita_remisiones',    'columna|remision_items.orden_linea'),
  ('20260902000001_operador_edita_remisiones',    'tabla|remisiones_bitacora'),
  ('20260902000001_operador_edita_remisiones',    'politica|remision_items.remision_items_update_area'),
  ('20260902000001_operador_edita_remisiones',    'politica|remision_items.remision_items_delete_area'),
  ('20260902000001_operador_edita_remisiones',    'politica|remision_items.remision_items_insert_area'),
  ('20260902000001_operador_edita_remisiones',    'politica|remisiones.comercial edita sus remisiones'),
  ('20260902000001_operador_edita_remisiones',    'politica|remisiones.comercial captura remisiones'),

  -- Avisos entre áreas y liberación de unidades
  ('20260903000001_avisos_entre_areas',           'tabla|avisos'),
  ('20260903000001_avisos_entre_areas',           'funcion|recibe_avisos_de(user_area,uuid)'),
  ('20260903000001_avisos_entre_areas',           'funcion|ajustar_unidades_remision(uuid,integer,text)'),
  ('20260903000001_avisos_entre_areas',           'trigger|avisos.trg_avisos_solo_acuse'),
  ('20260903000001_avisos_entre_areas',           'politica|avisos.leer avisos de mi area'),
  ('20260903000001_avisos_entre_areas',           'politica|avisos.mandar aviso'),
  ('20260903000001_avisos_entre_areas',           'politica|avisos.dar por visto'),

  -- Solicitudes a Fábrica cuando la unidad ya entró a armado
  ('20260904000001_solicitudes_a_fabrica',        'columna|avisos.requiere_respuesta'),
  ('20260904000001_solicitudes_a_fabrica',        'columna|avisos.estado'),
  ('20260904000001_solicitudes_a_fabrica',        'columna|avisos.accion'),
  ('20260904000001_solicitudes_a_fabrica',        'columna|avisos.usuario_destino'),
  ('20260904000001_solicitudes_a_fabrica',        'funcion|responder_solicitud(uuid,boolean,text)'),
  ('20260904000001_solicitudes_a_fabrica',        'politica|avisos.leer avisos de mi area|usuario_destino')
), revisado AS (
  SELECT e.script, e.objeto,
         split_part(e.objeto, '|', 1) AS tipo,
         split_part(e.objeto, '|', 2) AS nombre,
         -- Tercer campo opcional: texto que la política tiene que contener. Hace
         -- falta porque varios scripts REDEFINEN una política con el mismo
         -- nombre; que exista no dice cuál de las dos versiones quedó.
         NULLIF(split_part(e.objeto, '|', 3), '') AS detalle
    FROM esperado e
), resuelto AS (
  SELECT r.script, r.objeto, r.tipo, r.nombre,
    CASE r.tipo
      WHEN 'tabla' THEN
        to_regclass('public.' || quote_ident(r.nombre)) IS NOT NULL
      WHEN 'vista' THEN
        to_regclass('public.' || quote_ident(r.nombre)) IS NOT NULL
      WHEN 'columna' THEN
        EXISTS (SELECT 1 FROM information_schema.columns c
                 WHERE c.table_schema = 'public'
                   AND c.table_name  = split_part(r.nombre, '.', 1)
                   AND c.column_name = split_part(r.nombre, '.', 2))
      WHEN 'funcion' THEN
        to_regprocedure('public.' || r.nombre) IS NOT NULL
      WHEN 'trigger' THEN
        EXISTS (SELECT 1 FROM pg_trigger t
                  JOIN pg_class c ON c.oid = t.tgrelid
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public'
                   AND c.relname = split_part(r.nombre, '.', 1)
                   AND t.tgname  = split_part(r.nombre, '.', 2)
                   AND NOT t.tgisinternal)
      WHEN 'politica' THEN
        EXISTS (SELECT 1 FROM pg_policies p
                 WHERE p.schemaname = 'public'
                   AND p.tablename  = split_part(r.nombre, '.', 1)
                   AND p.policyname = split_part(r.nombre, '.', 2)
                   AND (r.detalle IS NULL
                        OR COALESCE(p.qual,'') || ' ' || COALESCE(p.with_check,'') LIKE '%' || r.detalle || '%'))
      WHEN 'indice' THEN
        to_regclass('public.' || quote_ident(r.nombre)) IS NOT NULL
      WHEN 'secuencia' THEN
        to_regclass('public.' || quote_ident(r.nombre)) IS NOT NULL
    END AS existe
  FROM revisado r
)
SELECT script,
       CASE
         WHEN bool_and(existe)     THEN 'APLICADO'
         WHEN bool_or(existe)      THEN 'PARCIAL  ←— vuelve a correr el archivo completo'
         ELSE                           'FALTA    ←— corre supabase/migrations/' || script || '.sql'
       END AS estado,
       count(*) FILTER (WHERE existe)     AS objetos_ok,
       count(*)                           AS objetos_esperados,
       string_agg(nombre, ', ') FILTER (WHERE NOT existe) AS lo_que_falta
  FROM resuelto
 GROUP BY script
 ORDER BY script;
