# Supabase / Base de datos

## Aviso importante sobre migraciones

Este proyecto **no usa `supabase db push`**. El historial de cambios de base de
datos se ha mantenido aplicando scripts idempotentes directamente en el SQL
editor de Supabase; no existe una tabla de migraciones reproducible por el CLI.

Los archivos bajo `supabase/migrations/` son la **línea base documental** del
esquema real, no migraciones ejecutables en secuencia. Si necesitas reproducir
el esquema en otro proyecto, copia el contenido del script al SQL editor y
ejecútalo de arriba a abajo revisando que no falle por objetos previos.

## Proyecto correcto

Producción: `dmhzhyeivvuliumcgsmm`.

El archivo `.env` ya no se versiona. Para trabajar localmente:

1. Copia `.env.example` a `.env`.
2. Pide a Polo los valores reales del proyecto y colócalos en tu `.env` local.
3. Nunca commitees URLs ni llaves de Supabase.

## Scripts

- `supabase/migrations/20260821000001_unidad_chasis_motor.sql` — KIT-1:
  esquema, contadores, funciones de importación y pareo 1:1 de chasis + motor.
  El pareo automático (`parear_unidades_contenedor`) quedó sin usarse desde
  KIT-3: la importación deja chasis y motores como piezas sueltas, y la
  unidad se configura a mano (ver siguiente script).
- `supabase/migrations/20260822000001_configuracion_manual_unidades.sql` —
  KIT-3: catálogo `modelos_producto` (línea motocarro/mototaxi/otro y
  `nombre_comercial`: código de fábrica DZ200Q1/DZ300Q7 vs. lo que pide
  ventas, "200cc 2026"/"300cc 2026"), normalización de datos ya cargados
  (colores en inglés, seriales de motor con espacios) y de la propia
  importación (`importar_vins_inventario` / `importar_motores_inventario`
  ahora sanean el serial con la misma regla que la captura manual),
  `configurar_unidad` / `desconfigurar_unidad` (chasis + motor a mano, por
  fábrica), `cambiar_orden_armado` con bitácora (`bitacora_orden_armado`)
  y `asignar_chasis_remision` corregida para cruzar por nombre comercial +
  color en vez de código de fábrica.
- `supabase/migrations/20260823000001_incidencias_chasis_colores_cierre.sql` —
  KIT-4, tres cosas que no cerraban el ciclo:
  1. **Colores registrados, no contados.** `inventario_colores` dejó de ser un
     contador que se incrementaba en la importación y se decrementaba a mano:
     ahora se recalcula de los datos reales (`recalcular_inventario_colores()`,
     disparada por triggers en `inventario_chasis` y `motocarros`) y lleva
     columnas nuevas (piezas detenidas, unidades configuradas / libres /
     comprometidas / entregadas). `incrementar_inventario_color` y
     `decrementar_inventario_color` quedan como envoltura del recálculo.
     La vista `v_stock_modelo_color` da la foto por **nombre comercial +
     color**: piezas disponibles, unidades libres (con serial), detenidas,
     comprometidas, demanda pendiente de remisiones NUEVA/PARCIAL y holgura.
  2. **El proceso no cierra sin serial.** El trigger
     `exigir_serial_para_cerrar` en `motocarros` impide pasar a ARMADO/LISTO,
     marcar ENTREGADA o asignar a una remisión sin NS chasis **y** NS motor.
     Se valida en la transición, así que las unidades legadas que ya están
     ARMADO sin serial siguen editables para poder capturárselo.
     `asignar_remision_items(_remision_id)` reemplaza el criterio viejo de
     asignación: cruza **línea por línea de `remision_items`** (modelo
     comercial + color), exige serial, salta chasis detenidos y devuelve el
     detalle del faltante. `reintentar_asignar_remision` y
     `asignar_chasis_remision` delegan / aplican los mismos filtros, y el
     trigger de alta de remisión ya no amarra unidades a ciegas cuando la
     remisión todavía no tiene modelo/color.
  3. **Incidencias de chasis.** `incidencias_chasis` +
     `incidencias_chasis_eventos` con folio `INC-####`: se levanta el reporte
     (`reportar_incidencia_chasis`), el chasis **no** se deshabilita salvo que
     se pida retenerlo, pasa a revisión (`revisar_incidencia_chasis`) y se
     cierra (`resolver_incidencia_chasis`) como *adaptación* (vuelve a servir,
     con el registro pegado a la pieza y a la unidad), *garantía* (identificado
     y fuera del disponible, con folio) o *no útil* (deja de contar, **nunca se
     elimina**). `reabrir_incidencia_chasis` permite que un chasis no útil al
     que después le dan garantía —o que sí se pudo adaptar— vuelva a revisión
     sin perder su historia.
- `supabase/migrations/20260823000002_capturar_seriales_unidad.sql` — KIT-4b:
  `capturar_seriales_unidad()`. KIT-4 exige los dos seriales para cerrar el
  proceso, pero la captura manual escribía nada más en `motocarros`: si el
  serial teclado SÍ estaba en el embarque, la pieza se quedaba en `disponible` y
  fábrica podía volver a configurarla en otra unidad (inventario contado doble).
  Ahora la captura liga la pieza, libera la anterior si se corrigió un serial
  mal capturado, respeta el estatus de una pieza en garantía (no la "lava" a
  `configurado`) y recalcula colores. Producción → Editar ya usa esta RPC.

- `supabase/migrations/20260823000003_color_efectivo_capacidad.sql` — KIT-4c:
  el color se puede cambiar en fábrica, pero no se puede inventar.
  · `inventario_chasis.color_original` guarda lo que declaró el VIN (un trigger
    lo llena en cada importación) y `color` es el color efectivo con el que se
    arma.
  · La **capacidad** de un color son los juegos de piezas que llegaron:
    se deriva del VIN + `inventario_colores.piezas_extra` (ajuste manual con
    bitácora), así que una importación futura la sube sola.
  · `cambiar_color_chasis()` usa un juego libre; `intercambiar_color_chasis()`
    permuta el color de dos chasis del mismo modelo (neutro en capacidad — es
    la operación de piso cuando todos los colores están a tope);
    `ajustar_capacidad_color()` registra juegos que llegaron fuera del VIN.
    Ninguna deja cambiar el color de una unidad ya remisionada o entregada: ahí
    el color es parte del pedido.
  · `configurar_unidad()` recibe un 4º parámetro opcional `_color` para armar en
    otro color en ese momento (valida la capacidad igual).
  · Red de seguridad: el trigger `trg_verificar_capacidad_color` tumba cualquier
    movimiento —incluido un UPDATE directo por RLS— que deje un color con más
    chasis que juegos.
  · `v_stock_modelo_color` agrega `capacidad_color`, `juegos_usados`,
    `capacidad_libre` y `piezas_recoloreadas`.
- `supabase/migrations/20260823000004_finanzas_ingresos_egresos.sql` — KIT-4d:
  Control Financiero deja de ser una lista de gastos y pasa a ser un libro
  mayor de caja. `pagos` queda **obsoleta** (se conserva de respaldo, con
  `migrado_a_movimiento` apuntando al registro nuevo).
  · `movimientos_financieros` lleva ingresos y egresos en la misma línea de
    tiempo: folio `ING-######` / `EGR-######`, estatus
    (BORRADOR → PENDIENTE → CONFIRMADO / CANCELADO — solo lo CONFIRMADO afecta
    saldo) y `monto_mxn` como columna generada para poder sumar monedas.
  · **La contraparte se amarra al catálogo**, no es texto libre:
    `contraparte_tipo` + el FK que corresponda (`cliente_id`, `proveedor_id`,
    `empleado_id`) o «OTRO» con el nombre a mano. El CHECK `chk_contraparte`
    impide declarar un tipo y apuntar al catálogo equivocado.
  · **Quién pagó ≠ quién trajo el dinero.** `via` distingue DIRECTO (el cliente
    vino a caja / le pagamos al proveedor) de INTERMEDIARIO (alguien trajo el
    efectivo o alguien lo llevó a pagar), con `intermediario_id` /
    `intermediario_nombre` y `recibido_por`.
  · **Comprobación de efectivo.** `marcar_comprobacion_movimiento` enciende
    `requiere_comprobacion` cuando es EGRESO + EFECTIVO + INTERMEDIARIO: el
    movimiento queda abierto hasta que hay `monto_comprobado` y
    `monto_devuelto`. Es la cuenta que se le lleva a quien se le dio el
    efectivo para que fuera a pagar.
  · `proveedores` (RFC, banco, CLABE, días de crédito) y
    `cuentas_financieras` + `v_saldos_cuentas` (saldo real por caja y banco).
    `validar_moneda_cuenta` impide meter un movimiento en dólares a una caja
    en pesos, que si no el saldo mezcla monedas.
  · `movimiento_adjuntos`: expediente de N documentos por movimiento
    clasificados por tipo (factura, recibo, comprobante, vale de efectivo,
    foto del efectivo…) en el bucket privado `finanzas-docs`. Un trigger
    mantiene `tiene_factura` al día. Las sentencias de `storage` van aisladas
    en bloques `DO` que atrapan `insufficient_privilege`: el SQL editor manda
    todo en una transacción, y sin aislarlas un error de permisos sobre
    `storage.objects` revertía el módulo completo.
  · `movimiento_bitacora`: trigger que registra alta, edición, confirmación,
    cancelación y comprobación. Los borrados van a `bitacora_eliminaciones`.
  · RLS con **separación de funciones**: `finanzas` captura y edita lo suyo
    mientras esté PENDIENTE, pero **no** puede confirmar ni cancelar; eso es de
    `admin_financiero`. Las vistas llevan `security_invoker = true` para que
    respeten el RLS de las tablas base en lugar de saltárselo.
  · Los folios usan secuencia, así que **pueden tener huecos** si un insert se
    rechaza. Es a propósito: un contador sin huecos obliga a serializar la
    captura.
- `supabase/migrations/20260824000001_remisiones_visibles_equipo_comercial.sql` —
  **Bandeja de remisiones compartida para el equipo comercial.** Antes el rol
  `ventas` sólo podía leer las remisiones con `vendedor_id = auth.uid()`: un
  vendedor recién dado de alta abría Remisiones y veía la bandeja vacía, y dos
  vendedores nunca veían la misma información.
  · `leer remisiones por rol` y `leer motocarros por rol` ahora incluyen
    `has_role(auth.uid(),'ventas')`, igual que admin / coordinador / fábrica /
    logística / finanzas. Se conserva el `OR vendedor_id = auth.uid()` para
    cualquier usuario sin rol operativo.
  · **La escritura no cambia**: `crear remisiones` y `actualizar remisiones`
    siguen exigiendo `vendedor_id = auth.uid()` para `ventas`, así que cada
    vendedor sólo captura, edita, cancela y sube comprobantes de lo suyo. La
    lectura es compartida; la responsabilidad sigue siendo individual.
  · `remision_items_select` se re-crea (`USING (true)`, sólo `authenticated`)
    por idempotencia, en caso de que se hubiera endurecido a mano.
  · En la app, `src/pages/Remisiones.tsx` muestra la bandeja completa con un
    selector **Todo el equipo / Solo las mías** y marca con la etiqueta «Tuya»
    las remisiones del usuario en sesión.

## Cómo se propaga un cambio de permisos

Los dos lados no se comportan igual, y conviene tenerlo claro antes de tocar
roles o políticas:

- **La base es inmediata.** El rol no viaja en el JWT: `has_role()` consulta
  `user_roles` en cada query. Un cambio de política o de rol aplica en la
  siguiente petición, sin cerrar sesión ni recargar.
- **La app revisa sola.** `AuthContext` vuelve a leer el rol al recuperar el
  foco de la pestaña, al volver a ella y cada dos minutos mientras está
  visible. Si detecta un cambio actualiza el menú y avisa con un toast
  («Tus permisos cambiaron»). Antes el rol se leía una sola vez por sesión y
  había que pedirle a la persona que recargara a mano.
- Un error de red en esa revisión **no** borra el rol vigente: se conserva y se
  reintenta en el siguiente ciclo, para no degradar permisos por un tropiezo
  de conexión.

## Verificación manual recomendada

Después de aplicar KIT-1 o importar datos:

```sql
SELECT count(*) FROM inventario_chasis;
SELECT count(*) FROM inventario_motor;
SELECT count(*) FROM motocarros;
SELECT id, folio_contenedor, total_chasis, total_motores, total_unidades, estatus_carga
  FROM contenedores ORDER BY fecha_arribo DESC;
```

Después de aplicar KIT-3:

```sql
SELECT modelo, linea, nombre_comercial FROM modelos_producto ORDER BY linea, modelo;
SELECT DISTINCT color FROM inventario_chasis;             -- no debe quedar WHITE/BLUE/ORANGE
SELECT DISTINCT color FROM inventario_colores;
SELECT count(*) FROM inventario_motor
  WHERE numero_motor <> regexp_replace(upper(numero_motor),'[^A-Z0-9-]','','g');  -- debe ser 0
SELECT count(*) FROM inventario_chasis WHERE motocarro_id IS NULL;   -- "por configurar"
SELECT count(*) FROM motocarros m JOIN modelos_producto mp
  ON mp.modelo = m.modelo AND mp.linea = 'motocarro';                -- "programadas"

-- Cruce por nombre comercial: una unidad DZ300Q7 BLANCO debe salir aquí para
-- una remisión que pida "300cc 2026" BLANCO.
SELECT m.id, m.modelo, mp.nombre_comercial, m.color
  FROM motocarros m LEFT JOIN modelos_producto mp ON mp.modelo = m.modelo
 WHERE m.remision_id IS NULL AND upper(coalesce(mp.nombre_comercial, m.modelo)) = '300CC 2026' AND m.color = 'BLANCO';
```

Después de aplicar KIT-4:

```sql
-- 1. Colores: el conteo tiene que cuadrar con los datos reales.
SELECT public.recalcular_inventario_colores();
SELECT modelo, color, cantidad_disponible, piezas_en_revision, piezas_garantia,
       piezas_no_util, unidades_configuradas, unidades_libres, unidades_comprometidas
  FROM inventario_colores ORDER BY modelo, color;

-- Debe dar 0 filas: el disponible por color siempre es el conteo de chasis sanos.
SELECT ic.modelo, ic.color, ic.cantidad_disponible, c.reales
  FROM inventario_colores ic
  JOIN (SELECT modelo, upper(color) AS color, count(*) AS reales
          FROM inventario_chasis
         WHERE motocarro_id IS NULL AND estatus = 'disponible'
         GROUP BY 1,2) c ON c.modelo = ic.modelo AND c.color = ic.color
 WHERE ic.cantidad_disponible <> c.reales;

-- 2. La foto por color que ve dirección (disponible vs. comprometido vs. demanda).
SELECT * FROM v_stock_modelo_color ORDER BY modelo_comercial, color;

-- 3. Cierre de proceso: no debe existir una unidad cerrada sin los dos seriales.
SELECT orden_armado, estatus_armado, estatus_entrega, ns_chasis, ns_motor
  FROM motocarros
 WHERE (estatus_armado IN ('ARMADO','LISTO') OR estatus_entrega = 'ENTREGADA'
        OR remision_id IS NOT NULL)
   AND (ns_chasis IS NULL OR ns_motor IS NULL);
-- (Las filas que salgan aquí son de antes de KIT-4: el trigger sólo valida
--  la transición. Captúrales el serial desde Producción → Editar.)

-- 4. Incidencias abiertas y chasis detenidos.
SELECT folio, ns_chasis, parte_afectada, estatus, retiene_chasis, folio_garantia
  FROM incidencias_chasis ORDER BY reportado_at DESC;
SELECT estatus, count(*) FROM inventario_chasis GROUP BY estatus ORDER BY 1;
```

Después de aplicar KIT-4b y KIT-4c:

```sql
-- 1. Capacidad de color: cuántos juegos llegaron, cuántos se usan, cuántos quedan.
SELECT modelo, color, piezas_recibidas AS juegos, piezas_extra AS extra,
       juegos_usados AS usados, piezas_recibidas - juegos_usados AS libres
  FROM inventario_colores ORDER BY modelo, color;

-- 2. Debe dar 0 filas: ningún color puede tener más chasis que juegos.
WITH usados AS (SELECT modelo, upper(color) AS color, count(*) n FROM inventario_chasis GROUP BY 1,2),
     vin    AS (SELECT modelo, upper(COALESCE(color_original,color)) AS color, count(*) n
                  FROM inventario_chasis GROUP BY 1,2)
SELECT u.modelo, u.color, u.n AS usados,
       COALESCE(v.n,0) + COALESCE(ic.piezas_extra,0) AS capacidad
  FROM usados u
  LEFT JOIN vin v ON v.modelo = u.modelo AND v.color = u.color
  LEFT JOIN inventario_colores ic ON ic.modelo = u.modelo AND ic.color = u.color
 WHERE u.n > COALESCE(v.n,0) + COALESCE(ic.piezas_extra,0);

-- 3. Chasis que se armaron en un color distinto al del VIN (con su bitácora).
SELECT numero_chasis, color_original AS vin, color AS efectivo
  FROM inventario_chasis
 WHERE upper(COALESCE(color_original, color)) <> upper(color)
 ORDER BY numero_chasis;

SELECT tipo, ns_chasis, modelo, color_anterior, color_nuevo,
       cantidad_antes, cantidad_nueva, motivo, creado_at
  FROM bitacora_color ORDER BY creado_at DESC;

-- 4. Debe dar 0 filas: ninguna pieza usada por una unidad puede seguir
--    contándose como disponible (lo que arregla KIT-4b).
SELECT ic.numero_chasis, ic.estatus, m.orden_armado
  FROM inventario_chasis ic
  JOIN motocarros m ON m.ns_chasis = ic.numero_chasis
 WHERE ic.motocarro_id IS NULL;

SELECT im.numero_motor, im.estatus, m.orden_armado
  FROM inventario_motor im
  JOIN motocarros m ON m.ns_motor = im.numero_motor
 WHERE im.motocarro_id IS NULL;
```

Después de aplicar KIT-4d (Control Financiero):

```sql
-- 1. Cajas y catálogo sembrados.
SELECT nombre, tipo, moneda, saldo_inicial, saldo_actual
  FROM v_saldos_cuentas ORDER BY orden;
SELECT tipo, count(*) FROM categorias_financieras GROUP BY tipo;   -- 8 ingreso / 10 egreso

-- 2. El bucket del expediente y sus políticas (si dio 0, créalos en Storage
--    → New bucket: «finanzas-docs», privado, 20 MB).
SELECT (SELECT count(*) FROM storage.buckets WHERE id = 'finanzas-docs') AS bucket,
       (SELECT count(*) FROM pg_policies
         WHERE tablename = 'objects' AND policyname LIKE 'finanzas_docs%') AS politicas;

-- 3. Los `pagos` viejos quedaron migrados: no debe haber ninguno sin su
--    movimiento equivalente.
SELECT count(*) FROM pagos WHERE migrado_a_movimiento IS NULL;      -- debe ser 0

-- 4. Efectivo entregado que nadie ha comprobado (la cuenta abierta).
SELECT folio, fecha_movimiento, concepto, contraparte_nombre,
       COALESCE(intermediario_nombre, '(del equipo)') AS se_le_dio_a, monto
  FROM movimientos_financieros
 WHERE requiere_comprobacion AND NOT comprobado AND estatus <> 'CANCELADO'
 ORDER BY fecha_movimiento;

-- 5. Debe dar 0 filas: una comprobación cerrada tiene que cuadrar.
SELECT folio, monto, monto_comprobado, monto_devuelto,
       monto - COALESCE(monto_comprobado,0) - COALESCE(monto_devuelto,0) AS diferencia
  FROM movimientos_financieros
 WHERE comprobado
   AND monto - COALESCE(monto_comprobado,0) - COALESCE(monto_devuelto,0) <> 0;

-- 6. Debe dar 0 filas: ningún movimiento en una cuenta de otra moneda.
SELECT m.folio, m.moneda, c.nombre, c.moneda
  FROM movimientos_financieros m JOIN cuentas_financieras c ON c.id = m.cuenta_id
 WHERE m.moneda <> c.moneda;

-- 7. Estado de cuenta por cliente (lo que nos ha pagado cada uno).
SELECT nombre_comercial, pagos_registrados, total_pagado_mxn, ultimo_pago
  FROM v_estado_cuenta_cliente
 WHERE pagos_registrados > 0 ORDER BY total_pagado_mxn DESC;
```

Después de aplicar `20260824000001_remisiones_visibles_equipo_comercial.sql`
(entrar con un usuario de `ventas`, p. ej. Atenea / Marco / Ana Karen):

```sql
-- 1. Las tres políticas de lectura deben mencionar 'ventas'.
SELECT tablename, policyname, qual LIKE '%ventas%' AS incluye_ventas
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('remisiones','motocarros','remision_items')
   AND cmd = 'SELECT';

-- 2. La escritura NO debe haberse abierto: 'crear remisiones' y
--    'actualizar remisiones' siguen amarradas a vendedor_id = auth.uid().
SELECT policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'remisiones' AND cmd <> 'SELECT';

-- 3. Cuántas remisiones debería ver el equipo comercial (todas las no
--    canceladas) contra cuántas son de un vendedor en particular.
SELECT count(*) FILTER (WHERE estatus <> 'CANCELADA') AS activas_totales,
       count(*) FILTER (WHERE estatus <> 'CANCELADA'
                          AND vendedor_id = (SELECT id FROM profiles
                                              WHERE nombre_completo ILIKE '%Atenea%')) AS activas_de_atenea
  FROM remisiones;
```

En la app, con sesión de `ventas`: la cabecera debe decir
«N remisiones registradas — todo el equipo · M tuyas», el selector **Ver**
debe alternar entre *Todo el equipo* y *Solo las mías*, y en las remisiones de
otro vendedor **no** deben aparecer los botones de asignar chasis / subir PDF /
proponer fecha / cancelar: la tarjeta queda de sólo lectura (folio, cliente,
avance, chasis y entregas).
