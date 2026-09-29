# Reglas del proyecto

## Rama y despliegue de producción

- La fuente de verdad es `origin/main`; producción es `https://kit-to-drive.vercel.app` y Vercel despliega automáticamente cada actualización de `main`.
- Antes de comenzar cualquier trabajo, ejecutar `git fetch origin` y comprobar que la rama de trabajo parte de la versión más reciente de `origin/main`. No sobrescribir ni revertir módulos existentes al integrar cambios.
- Antes de integrar o desplegar, ejecutar `npm run typecheck`, `npm run test` y `npm run build`.
- No desplegar manualmente un checkout antiguo ni promover a producción un deployment de un commit anterior a `origin/main`.
- Al terminar cambios aprobados, integrar y subirlos a `main`; después verificar que el estado de Vercel para el SHA de `origin/main` sea exitoso y que `https://kit-to-drive.vercel.app` apunte a ese deployment.
- Los módulos de almacén y remisiones de refacciones forman parte de la versión base y no deben eliminarse durante merges o resolución de conflictos.
