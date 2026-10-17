# Planes de ejecución activos

| Plan | Estado |
| --- | --- |
| [Plan maestro del MVP P0](mvp-master-plan.md) | Activo. Tablero único de seguimiento del MVP (`MVP-NNN`) hasta el despliegue validado |
| [Catálogo de planes derivados](mvp/README.md) | Índice (no es un ExecPlan) de los 36 planes derivados (26 activos bajo `mvp/` + 10 archivados en `completed/`); estados por ID únicamente en el maestro |
| [Dependencias IA y `server-only`](../completed/deps-ai-sdk-server-only.md) | Cerrado y archivado. Instaló dependencias IA y `server-only`; entrega autorizada pendiente de commit en `develop`. No cambia estados del maestro |
| [Preparación de los planes del MVP](../completed/mvp-planning-pack.md) | Cerrado y archivado. Trabajo documental completado; preparó los 36 planes derivados, specs y diseños |
| [Integración de base y CI remoto](../completed/f00-integracion-base-ci.md) | Cerrado y archivado. Completó MVP-006: base integrada en `develop` y CI remoto en Linux verificado |
| [Decisiones de ingesta y modelos](../completed/f01-decisiones-ingesta-y-modelos.md) | Cerrado y archivado. Completó MVP-010 y MVP-013: límites de ingesta, pipeline de extracción y parámetros de modelos/calidad |
| [Decisiones de confirmación y sello](../completed/f01-decisiones-confirmacion-y-sello.md) | Cerrado y archivado. Completó MVP-011 y MVP-012: capacidades públicas, rate limit Postgres, perfil JCS y reconciliación HCS |
| [Contratos de dominio](../completed/f02-contratos-dominio.md) | Cerrado y archivado. Completó MVP-020 y MVP-021: contratos del núcleo documental, revisión, confirmación, versión y DTO públicos entregados en `origin/develop` |
| [Paquete de delegación frontend](../completed/f11-frontend-delegation-package.md) | Cerrado y archivado. Completó MVP-110: props, escenarios Zod, registro preview y allowlists entregados en `origin/develop` |
| [Primera tanda de la hackathon](../completed/hackathon-team-first-wave.md) | Cerrado y archivado. Consolidó las bases de F1, contratos F2, paquete F11, guías de equipo y validación |
| [Segunda tanda: Issues ejecutables](../completed/hackathon-issue-rollout.md) | Cerrado y archivado. Publicó 35 Issues para 60 IDs abiertos de 31 planes; no completa implementaciones. Entrega Git documental pendiente |

Regla de actualización: el plan maestro se edita **solo por fila de ID** al completar una tarea con evidencia real (protocolo en §8 de ese plan). Por autorización del usuario se preparan todos los planes derivados por adelantado; viven bajo `mvp/` mientras estén pendientes/abiertos y se ejecutan solo al cumplir dependencias y permisos. Al cerrar se archivan en [`../completed/`](../completed/) y se actualizan sus enlaces. Si un ExecPlan derivado avanza, actualiza los IDs que cubre en el maestro; no se copia su estado aquí ni se marca completado por haberlo redactado.

Cuando se inicie un cambio importante fuera del maestro, se redactará un plan nuevo en este directorio siguiendo [`AGENTS.md`](../../../AGENTS.md).
