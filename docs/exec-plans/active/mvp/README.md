# Catálogo de ExecPlans derivados del MVP

Índice por plan de los ExecPlans preparados por adelantado, derivados del [plan maestro](../mvp-master-plan.md). **No es un ExecPlan** ni cuenta como tal. No guarda estados: el estado, las dependencias y la evidencia de cada tarea viven solo en el maestro. Que un plan exista no autoriza ejecutarlo; antes deben cumplirse sus dependencias y autorizaciones.

Cobertura: **36 planes** preparados (27 activos bajo este directorio + 9 completados y archivados en [`completed/`](../../completed/)). Algunos planes activos contienen checkpoints ya completados y otros pendientes: el estado por ID vive únicamente en el maestro. Los índices y este catálogo no son ExecPlans. Cada plan declara sus IDs en la línea `Tareas del maestro:`.

Grupos: A = F0–F3 (4 activos + 7 archivados), B = F4–F6 (8 activos), C = F7–F10 (8 activos), D = F11–F13 (7 activos + 2 archivados).

| Plan | Grupo | IDs del maestro | Título |
| --- | --- | --- | --- |
| [f00-acceso-colaborador](../../completed/f00-acceso-colaborador.md) | A | MVP-007 | Acceso del colaborador al repositorio (acción externa; completado y archivado) |
| [f00-integracion-base-ci](../../completed/f00-integracion-base-ci.md) | A | MVP-006 | Integrar la base y obtener el primer run remoto de CI (completado y archivado) |
| [f01-decisiones-confirmacion-y-sello](../../completed/f01-decisiones-confirmacion-y-sello.md) | A | MVP-011…012 | Decisiones de capacidades públicas (tokens) y de manifiesto/reconciliación HCS (completado y archivado) |
| [f01-decisiones-ingesta-y-modelos](../../completed/f01-decisiones-ingesta-y-modelos.md) | A | MVP-010, MVP-013 | Decisiones de adjuntos/extracción y de modelos, coste y calidad (completado y archivado) |
| [f01-revision-juridica](f01-revision-juridica.md) | A | MVP-014 | Revisión jurídica externa del lenguaje de confirmación y la privacidad |
| [f02-clientes-supabase](f02-clientes-supabase.md) | A | MVP-025 | Clientes Supabase de servidor y de sesión |
| [f02-contratos-dominio](../../completed/f02-contratos-dominio.md) | A | MVP-020…021 | Contratos de dominio: núcleo documental, revisión, confirmación, versión y DTO públicos (completado y archivado) |
| [f02-entorno-supabase-remoto](f02-entorno-supabase-remoto.md) | A | MVP-026 | Entorno Supabase de desarrollo/demo con migraciones aplicadas (remoto) |
| [f02-esquema-migraciones-rls](../../completed/f02-esquema-migraciones-rls.md) | A | MVP-022…024 | Esquema SQL, migraciones y RLS/Storage con prueba de dos usuarios (completado y archivado) |
| [f03-auth-flujos-reales](../../completed/f03-auth-flujos-reales.md) | A | MVP-031 | Registro, login, logout y recuperación reales (completado y archivado) |
| [f03-sesiones-y-guardas](f03-sesiones-y-guardas.md) | A | MVP-030 | Sesiones por cookies y guardas de acceso |
| [f04-connected-chat](f04-connected-chat.md) | B | MVP-054 | Chat conectado: container, rutas y adjuntos |
| [f04-documents-chat-audit](f04-documents-chat-audit.md) | B | MVP-040…041, MVP-044 | Documentos, mensajes persistentes y auditoría solo-agregar |
| [f04-evidence-upload-extraction](f04-evidence-upload-extraction.md) | B | MVP-042…043 | Evidencias: carga privada, hash y extracción de texto |
| [f05-agent1-drafting](f05-agent1-drafting.md) | B | MVP-051 | Agente 1: extracción de hechos y redacción autónoma |
| [f05-agent2-groq-contrast](f05-agent2-groq-contrast.md) | B | MVP-053 | Agente 2: contraste con Groq y fuentes textuales independientes |
| [f05-chat-streaming-retry](f05-chat-streaming-retry.md) | B | MVP-052 | Chat en streaming, cancelación y reintento |
| [f05-gemini-provider](f05-gemini-provider.md) | B | MVP-050 | Proveedor Gemini con AI SDK (solo servidor) |
| [f06-rules-and-warnings](f06-rules-and-warnings.md) | B | MVP-060…062 | Motor determinista, controles ALCOA+ y consolidación de advertencias |
| [f07-01-revision-congelada-y-confirmacion-autor](f07-01-revision-congelada-y-confirmacion-autor.md) | C | MVP-070…071 | Revisión congelada y confirmación del autor |
| [f07-02-invitaciones-y-respuesta-atomica](f07-02-invitaciones-y-respuesta-atomica.md) | C | MVP-072…074 | Invitaciones, lectura pública y respuesta atómica |
| [f07-03-estado-agregado-y-pantalla-publica](f07-03-estado-agregado-y-pantalla-publica.md) | C | MVP-075…076 | Estado agregado de confirmaciones y pantalla pública |
| [f07-04-ui-autor-seleccion-y-compartir](f07-04-ui-autor-seleccion-y-compartir.md) | C | MVP-077…078 | UI de revisión del autor y compartir manual |
| [f08-01-finalizacion-durable-y-pdf-canonico](f08-01-finalizacion-durable-y-pdf-canonico.md) | C | MVP-080…081 | Orquestación de finalización durable y PDF canónico |
| [f08-02-manifiesto-version-inmutable-y-nueva-version](f08-02-manifiesto-version-inmutable-y-nueva-version.md) | C | MVP-082…084 | Manifiesto, versión inmutable y nueva versión |
| [f09-01-hedera-hcs-testnet](f09-01-hedera-hcs-testnet.md) | C | MVP-090…093 | Hedera HCS Testnet: cliente, sello, reconciliación y Mirror Node |
| [f10-01-verificador-publico](f10-01-verificador-publico.md) | C | MVP-100…101 | Verificador público |
| [f11-frontend-delegation-package](../../completed/f11-frontend-delegation-package.md) | D | MVP-110 | Paquete de delegación frontend (completado y archivado) |
| [f11-frontend-presentation-tickets](f11-frontend-presentation-tickets.md) | D | MVP-111…115 | Presentación delegable: dashboard, snapshot, historial, landing y formularios de acceso |
| [f11-product-ui-integration-and-review](f11-product-ui-integration-and-review.md) | D | MVP-116, MVP-118 | Integración de dashboard, historial y documento; revisión transversal de accesibilidad y responsive |
| [f12-ai-evaluation-dataset-and-runner](f12-ai-evaluation-dataset-and-runner.md) | D | MVP-122…123 | Dataset de evaluación de IA y runner |
| [f12-critical-flow-matrix-and-e2e](f12-critical-flow-matrix-and-e2e.md) | D | MVP-121 | Matriz del PRD §12 y E2E del flujo crítico |
| [f12-server-test-harness](../../completed/f12-server-test-harness.md) | D | MVP-120 | Harness de tests de servidor (completado y archivado) |
| [f13-deploy-and-demo](f13-deploy-and-demo.md) | D | MVP-132…133 | Despliegue en Vercel y datos y cuentas de demo |
| [f13-live-validation-and-closure](f13-live-validation-and-closure.md) | D | MVP-134…136 | Smoke real integrado, evaluación de IA real y cierre del MVP |
| [f13-release-security-and-ci](f13-release-security-and-ci.md) | D | MVP-130…131 | Seguridad y privacidad transversal, y CI ampliado con protección de ramas |

[Maestro](../mvp-master-plan.md) · [Planes activos](../README.md) · [Índice](../../../README.md)
