# Documentación de GALCOA+

Punto de entrada a `docs/`. El producto vive en el PRD; las demás guías explican cómo se aplica al repositorio y no lo duplican.

| Documento | Para qué |
| --- | --- |
| [PRD de producto](exec-plans/GALCOA-PRD-v1.4.md) | Fuente de verdad: alcance P0, flujo, invariantes, pruebas. Versión interna 1.5; el nombre del archivo se conserva |
| [Arquitectura](architecture.md) | Estado real, arquitectura decidida, propiedad de archivos, contratos, preview local y condiciones para delegar frontend |
| [Fundaciones compartidas del MVP](design/mvp-shared-foundations.md) | Decisiones transversales de contratos, privacidad, transacciones y recuperación para los planes derivados; diseño objetivo |
| [Diseños técnicos](design/README.md) | Índice de fundaciones, datos/transacciones y manifiesto/HCS |
| [Specs del MVP](specs/README.md) | Comportamiento y aceptación detallados por dominio, sin duplicar el PRD |
| [Orden de ejecución y compatibilidad](execution/mvp-execution-guide.md) | Hasta tres carriles compatibles y recursos que no deben editarse en paralelo |
| [Orden por persona](execution/team-ticket-order.md) | Nahuel, Gastón y Facu: responsabilidades y secuencia previa a publicar Issues |
| [Runbook de jurados](demo/jury-runbook.md) | Preparación, recorridos y ensayo final con datos ficticios; no afirma que el producto esté implementado |
| [Plan de preparación para equipo](exec-plans/completed/team-workspace-readiness.md) | Implementación y evidencia de contratos, preview, pruebas y entrega (cerrado) |
| [Desarrollo y validación](development.md) | Comandos, qué validar según el cambio, secretos y seguridad |
| [Ficha de primera delegación](tasks/dashboard-presentation.md) | Borrador local del ticket de dashboard; no es un Issue publicado |
| [Paquetes de presentación](tasks/README.md) | Contratos, escenarios y fichas para las cinco entregas frontend; no son Issues publicados |
| [Referencias de proveedores IA (`generated/`)](generated/gemini/README.md) · [Groq](generated/groq/README.md) | Copias de documentación pública (Gemini, Groq) aportadas por el usuario como consulta; no son fuente de verdad y pueden desactualizarse. Los ejemplos con `@ai-sdk/groq` no aplican: D-05 usa `groq-sdk` |
| [Deuda técnica](exec-plans/tech-debt-tracker.md) | Riesgos y desviaciones abiertas |
| [Plan maestro del MVP](exec-plans/active/mvp-master-plan.md) | Seguimiento de todas las tareas P0 (`MVP-NNN`), dependencias, estado y evidencia hasta el MVP desplegado; se actualiza por ID al completar cada tarea |
| [Catálogo de planes derivados del MVP](exec-plans/active/mvp/README.md) | Índice por plan de los ExecPlans preparados por adelantado y derivados del plan maestro; documentación, no ejecución |
| [`exec-plans/active/`](exec-plans/active/README.md) | ExecPlans en curso y regla de actualización del maestro |
| [`exec-plans/completed/`](exec-plans/completed/) | ExecPlans cerrados y archivados |

Reglas de este directorio:

- Un requisito o decisión vive en un solo lugar; los demás documentos lo referencian por ID (`REQ-xx`, `INV-xx`, `D-xx`).
- Cambios multiarchivo o de configuración importantes empiezan con un ExecPlan en `exec-plans/active/`, que se mueve a `completed/` al cerrar.
- Idioma: español, como el PRD.

Volver al [README](../README.md) · [AGENTS.md](../AGENTS.md)
