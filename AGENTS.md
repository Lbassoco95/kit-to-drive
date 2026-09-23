# Agentes

La base no se migra con `supabase db push`. Los scripts de `supabase/migrations/` se pegan en el SQL editor y **un archivo que ya está en `main` no se vuelve a escribir**.

Cada mejora de esquema es un archivo nuevo, posterior al último, sellado en el mismo commit:

```bash
npm run migracion:nueva -- descripcion_corta
npm run migraciones:sellar
npm test
```

La versión que manda de cada función está en `supabase/funciones-vigentes/`. Al hacer `CREATE OR REPLACE`, se parte de ese cuerpo. Si el cuerpo nuevo quita líneas, el script lleva `-- acepto-reemplazo: nombre_funcion`.

En un merge se conservan los scripts de los dos lados. El detalle está en `.cursor/rules/migraciones-aditivas.mdc` y en `docs/no-romper-produccion.md`.
