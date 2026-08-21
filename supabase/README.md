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
