# Documentación de GALCOA+

Punto de entrada a `docs/`. El producto vive en el PRD; las demás guías explican cómo se aplica al repositorio y no lo duplican.

| Documento | Para qué |
| --- | --- |
| [PRD de producto](exec-plans/GALCOA-PRD-v1.4.md) | Fuente de verdad: alcance P0, flujo, invariantes, pruebas. Versión interna 1.5; el nombre del archivo se conserva |
| [Arquitectura](architecture.md) | Límites objetivo (PRD) frente al estado real del código |
| [Desarrollo y validación](development.md) | Comandos, qué validar según el cambio, secretos y seguridad |
| [Deuda técnica](exec-plans/tech-debt-tracker.md) | Riesgos y desviaciones abiertas |
| [`exec-plans/active/`](exec-plans/active/) | ExecPlans en curso |
| [`exec-plans/completed/`](exec-plans/completed/lint-types-audit-hardening.md) | ExecPlans cerrados |

Reglas de este directorio:

- Un requisito o decisión vive en un solo lugar; los demás documentos lo referencian por ID (`REQ-xx`, `INV-xx`, `D-xx`).
- Cambios multiarchivo o de configuración importantes empiezan con un ExecPlan en `exec-plans/active/`, que se mueve a `completed/` al cerrar.
- Idioma: español, como el PRD.

Volver al [README](../README.md) · [AGENTS.md](../AGENTS.md)
