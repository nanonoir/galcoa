# Orden de tickets por persona

Orden **orientativo** basado en los planes activos de [`mvp/`](../exec-plans/active/mvp/README.md) y los archivados en `completed/`. No hay números de Issue todavía: se crean después, uno por tarea completa y acotada. Las dependencias y el estado reales viven en el [maestro](../exec-plans/active/mvp-master-plan.md). Las decisiones documentales de F1 (MVP-010…013) y los contratos de F2 (MVP-020, MVP-021) ya están completados; en F1 solo la revisión jurídica externa (MVP-014) permanece pendiente fuera del repo.

Reglas de colaboración: [`AGENTS.md`](../../AGENTS.md#equipo-y-colaboración). Compatibilidad entre carriles: [matriz de la guía](mvp-execution-guide.md#matriz-de-compatibilidad-y-recursos-compartidos).

## Carriles

Máximo tres, condicionales a archivos disjuntos: núcleo (Nahuel), un módulo (Gastón) y UI (Facu). Tomás no tiene cuenta de agente y participa sin carril. Si no hay un carril seguro, se trabaja uno solo.

Identidades: Facu es `@jfacundoayala` en GitHub; el handle de Gastón está pendiente y no se inventa.

## Nahuel — núcleo (líder)

Dueño de contratos compartidos, configuración, migraciones y dependencias.

1. [Decisiones de ingesta y modelos](../exec-plans/completed/f01-decisiones-ingesta-y-modelos.md) y [de confirmación y sello](../exec-plans/completed/f01-decisiones-confirmacion-y-sello.md): completadas y archivadas (MVP-010…013 decididas documentalmente).
2. [Contratos de dominio](../exec-plans/completed/f02-contratos-dominio.md): completado y archivado (MVP-020 y MVP-021 integrados en `develop` local, commit `fd3502c`; pending push conjunto autorizado).
3. [Esquema, migraciones y RLS](../exec-plans/active/mvp/f02-esquema-migraciones-rls.md) → [clientes Supabase](../exec-plans/active/mvp/f02-clientes-supabase.md) → [sesiones y guardas](../exec-plans/active/mvp/f03-sesiones-y-guardas.md).
4. [Revisión congelada y confirmación del autor](../exec-plans/active/mvp/f07-01-revision-congelada-y-confirmacion-autor.md) → [invitaciones y respuesta atómica](../exec-plans/active/mvp/f07-02-invitaciones-y-respuesta-atomica.md) → [estado agregado](../exec-plans/active/mvp/f07-03-estado-agregado-y-pantalla-publica.md).
5. [Finalización y PDF](../exec-plans/active/mvp/f08-01-finalizacion-durable-y-pdf-canonico.md) → [manifiesto y versiones](../exec-plans/active/mvp/f08-02-manifiesto-version-inmutable-y-nueva-version.md).
6. [Hedera HCS Testnet](../exec-plans/active/mvp/f09-01-hedera-hcs-testnet.md).
7. [Harness de servidor](../exec-plans/active/mvp/f12-server-test-harness.md), [seguridad y CI](../exec-plans/active/mvp/f13-release-security-and-ci.md), [despliegue y demo](../exec-plans/active/mvp/f13-deploy-and-demo.md) y [validación final](../exec-plans/active/mvp/f13-live-validation-and-closure.md).
8. Gestiones externas: [acceso del colaborador](../exec-plans/active/mvp/f00-acceso-colaborador.md), [Supabase remoto](../exec-plans/active/mvp/f02-entorno-supabase-remoto.md) y [revisión jurídica](../exec-plans/active/mvp/f01-revision-juridica.md).

## Gastón — módulo funcional (IA y documentos)

Entra cuando los contratos y la configuración de F2 ya estén publicados por el líder.

1. [Documentos, mensajes y auditoría](../exec-plans/active/mvp/f04-documents-chat-audit.md) → [evidencias y extracción](../exec-plans/active/mvp/f04-evidence-upload-extraction.md).
2. [Proveedor Gemini](../exec-plans/active/mvp/f05-gemini-provider.md) → [Agente 1: redacción](../exec-plans/active/mvp/f05-agent1-drafting.md).
3. [Streaming y reintento](../exec-plans/active/mvp/f05-chat-streaming-retry.md) y [Agente 2: contraste Groq](../exec-plans/active/mvp/f05-agent2-groq-contrast.md), con módulos y fixtures separados.
4. [Reglas y advertencias](../exec-plans/active/mvp/f06-rules-and-warnings.md) y [chat conectado](../exec-plans/active/mvp/f04-connected-chat.md).
5. [Dataset y runner de evaluación de IA](../exec-plans/active/mvp/f12-ai-evaluation-dataset-and-runner.md).

## Facu — interfaz de usuario

Solo presentación, con ticket y allowlist; no toca contratos, rutas, primitivas ni estilos globales. Puede empezar sin esperar al backend.

1. [Paquete de delegación frontend](../exec-plans/completed/f11-frontend-delegation-package.md): completado y archivado (MVP-110 integrado en `develop` local, commit `37a915f`; pending push conjunto autorizado).
2. [Presentaciones: dashboard, snapshot, historial, landing y formularios de acceso](../exec-plans/active/mvp/f11-frontend-presentation-tickets.md) (MVP-111…115; un único responsable por entrega, futuras, según Gastón o Facu).
3. [UI del autor: selección y compartir](../exec-plans/active/mvp/f07-04-ui-autor-seleccion-y-compartir.md).
4. Entregar al líder las presentaciones de acceso para que **Nahuel** implemente [auth real](../exec-plans/active/mvp/f03-auth-flujos-reales.md). Facu no implementa sesiones, recuperación ni permisos.
5. Apoyar solo en ajustes de presentación de [composición y revisión transversal](../exec-plans/active/mvp/f11-product-ui-integration-and-review.md) y [verificador público](../exec-plans/active/mvp/f10-01-verificador-publico.md), mediante una allowlist explícita. Containers, rutas, verificación y conexión de servicios quedan a cargo de Nahuel o de una delegación técnica expresa a Gastón.

## Tomás

Sin cuenta de agente: apoya con pruebas manuales, revisión de textos y decisiones de producto cuando se le consulten. No ocupa carril.

## Pendientes de definir

- Los números de Issue y las asignaciones definitivas no existen aún; el handle de GitHub de Gastón tampoco.
- Matriz crítica/E2E ([MVP-121](../exec-plans/active/mvp/f12-critical-flow-matrix-and-e2e.md)): propietario por decidir al llegar a validación final.
- Los contratos de dominio (MVP-020, MVP-021) y el paquete de delegación frontend (MVP-110) ya están completados e integrados por el líder en `develop` local; los carriles de Gastón y Facu avanzan sobre esas bases una vez publicados los contratos y autorizados los tickets.
- La validación real con 12 casos ficticios se ejecuta **una sola vez al final**, sobre `develop` integrado; no ahora ni duplicada en local.
