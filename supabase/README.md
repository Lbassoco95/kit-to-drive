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
  KIT-3: catálogo `modelos_producto` (línea motocarro/mototaxi/otro),
  normalización de datos ya cargados (colores en inglés, seriales de motor
  con espacios) y de la propia importación (`importar_vins_inventario` /
  `importar_motores_inventario` ahora sanean el serial con la misma regla
  que la captura manual), `configurar_unidad` / `desconfigurar_unidad`
  (chasis + motor a mano, por fábrica) y `cambiar_orden_armado` con
  bitácora (`bitacora_orden_armado`).

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
SELECT modelo, linea FROM modelos_producto ORDER BY linea, modelo;
SELECT DISTINCT color FROM inventario_chasis;             -- no debe quedar WHITE/BLUE/ORANGE
SELECT DISTINCT color FROM inventario_colores;
SELECT count(*) FROM inventario_motor
  WHERE numero_motor <> regexp_replace(upper(numero_motor),'[^A-Z0-9-]','','g');  -- debe ser 0
SELECT count(*) FROM inventario_chasis WHERE motocarro_id IS NULL;   -- "por configurar"
SELECT count(*) FROM motocarros m JOIN modelos_producto mp
  ON mp.modelo = m.modelo AND mp.linea = 'motocarro';                -- "programadas"
```
