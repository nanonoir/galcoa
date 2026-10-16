# Planes de ejecución activos

| Plan | Estado |
| --- | --- |
| [Plan maestro del MVP P0](mvp-master-plan.md) | Activo. Tablero único de seguimiento del MVP (`MVP-NNN`) hasta el despliegue validado |
| [Catálogo de planes derivados](mvp/README.md) | Índice (no es un ExecPlan) de los 36 planes derivados (35 activos bajo `mvp/` que cubren 67 IDs pendientes + 1 archivado en `completed/`) |
| [Dependencias IA y `server-only`](../completed/deps-ai-sdk-server-only.md) | Cerrado y archivado. Instaló dependencias IA y `server-only`; entrega autorizada pendiente de commit en `develop`. No cambia estados del maestro |
| [Preparación de los planes del MVP](../completed/mvp-planning-pack.md) | Cerrado y archivado. Trabajo documental completado; preparó los 36 planes derivados, specs y diseños |
| [Integración de base y CI remoto](../completed/f00-integracion-base-ci.md) | Cerrado y archivado. Completó MVP-006: base integrada en `develop` y CI remoto en Linux verificado |

Regla de actualización: el plan maestro se edita **solo por fila de ID** al completar una tarea con evidencia real (protocolo en §8 de ese plan). Por autorización del usuario se preparan todos los planes derivados por adelantado; viven bajo `mvp/` mientras estén pendientes/abiertos y se ejecutan solo al cumplir dependencias y permisos. Al cerrar se archivan en [`../completed/`](../completed/) y se actualizan sus enlaces. Si un ExecPlan derivado avanza, actualiza los IDs que cubre en el maestro; no se copia su estado aquí ni se marca completado por haberlo redactado.

Cuando se inicie un cambio importante fuera del maestro, se redactará un plan nuevo en este directorio siguiendo [`AGENTS.md`](../../../AGENTS.md).
