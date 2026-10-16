# Diseños técnicos compartidos del MVP

Estos documentos describen arquitectura objetivo, no servicios implementados. El [PRD](../exec-plans/GALCOA-PRD-v1.4.md) define producto y el [maestro](../exec-plans/active/mvp-master-plan.md) registra ejecución.

| Diseño | Responsabilidad |
| --- | --- |
| [Fundaciones](mvp-shared-foundations.md) | Identidades, DTO, privacidad, autoridad y fronteras transversales SH-01…10 |
| [Datos y transacciones](data-transactions.md) | Modelo, RPC, permisos, locks, idempotencia, recuperación y costura de pruebas |
| [Manifiesto y HCS](manifest-hcs.md) | Compromiso privado/público, perfil canónico propuesto, confianza, vectores y reconciliación |

Los valores y perfiles señalados como **propuestos / NO APROBADOS** se resuelven al ejecutar las decisiones de F1, antes de implementar sus consumidores. El diseño no modifica los estados de tareas ni autoriza llamadas reales, migraciones remotas o acceso a secretos.

[Specs](../specs/README.md) · [Planes](../exec-plans/active/mvp/README.md) · [Índice general](../README.md)
