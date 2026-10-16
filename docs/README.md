# Documentación de GALCOA+

Punto de entrada a `docs/`. El producto vive en el PRD; las demás guías explican cómo se aplica al repositorio y no lo duplican.

| Documento | Para qué |
| --- | --- |
| [PRD de producto](exec-plans/GALCOA-PRD-v1.4.md) | Fuente de verdad: alcance P0, flujo, invariantes, pruebas. Versión interna 1.5; el nombre del archivo se conserva |
| [Arquitectura](architecture.md) | Estado real, arquitectura decidida, propiedad de archivos, contratos, preview local y condiciones para delegar frontend |
| [Fundaciones compartidas del MVP](design/mvp-shared-foundations.md) | Decisiones transversales de contratos, privacidad, transacciones y recuperación para los planes derivados; diseño objetivo |
| [Diseños técnicos](design/README.md) | Índice de fundaciones, datos/transacciones y manifiesto/HCS |
| [Specs del MVP](specs/README.md) | Comportamiento y aceptación detallados por dominio, sin duplicar el PRD |
| [Orden de ejecución y compatibilidad](execution/mvp-execution-guide.md) | Guía simple por tandas, segundo carril y recursos que no deben editarse en paralelo |
| [Plan de preparación para equipo](exec-plans/completed/team-workspace-readiness.md) | Implementación y evidencia de contratos, preview, pruebas y entrega (cerrado) |
| [Desarrollo y validación](development.md) | Comandos, qué validar según el cambio, secretos y seguridad |
| [Ficha de primera delegación](tasks/dashboard-presentation.md) | Borrador local del ticket de dashboard; no es un Issue publicado |
| [Deuda técnica](exec-plans/tech-debt-tracker.md) | Riesgos y desviaciones abiertas |
| [Plan maestro del MVP](exec-plans/active/mvp-master-plan.md) | Seguimiento de todas las tareas P0 (`MVP-NNN`), dependencias, estado y evidencia hasta el MVP desplegado; se actualiza por ID al completar cada tarea |
| [Catálogo de planes derivados del MVP](exec-plans/active/mvp/README.md) | Índice por plan de los 36 ExecPlans preparados (35 activos bajo `mvp/` que cubren 67 IDs pendientes y 1 archivado en `completed/`); documentación, no ejecución |
| [`exec-plans/active/`](exec-plans/active/README.md) | ExecPlans en curso y regla de actualización del maestro |
| [`exec-plans/completed/`](exec-plans/completed/team-workspace-readiness.md) | ExecPlans cerrados |

Reglas de este directorio:

- Un requisito o decisión vive en un solo lugar; los demás documentos lo referencian por ID (`REQ-xx`, `INV-xx`, `D-xx`).
- Cambios multiarchivo o de configuración importantes empiezan con un ExecPlan en `exec-plans/active/`, que se mueve a `completed/` al cerrar.
- Idioma: español, como el PRD.

Volver al [README](../README.md) · [AGENTS.md](../AGENTS.md)
