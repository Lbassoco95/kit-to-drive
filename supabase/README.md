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

## Verificación manual recomendada

Después de aplicar KIT-1 o importar datos:

```sql
SELECT count(*) FROM inventario_chasis;
SELECT count(*) FROM inventario_motor;
SELECT count(*) FROM motocarros;
SELECT id, folio_contenedor, total_chasis, total_motores, total_unidades, estatus_carga
  FROM contenedores ORDER BY fecha_arribo DESC;
```
