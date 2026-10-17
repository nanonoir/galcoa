# Cómo ejecutar el MVP por planes sin pisarse

**Guía operativa del equipo.** Las [Issues publicadas](../tasks/issue-rollout/README.md#issues-publicadas) cubren todos los planes abiertos y el [orden por persona](team-ticket-order.md) indica por dónde empezar. El [maestro](../exec-plans/active/mvp-master-plan.md) decide dependencias y progreso. Cada plan tiene su alcance; esta guía permite combinar carriles, no saltarse sus precondiciones.

## Camino simple

1. **Preparar la base de integración (hecho).** La base técnica y documental quedó publicada e integrada en `develop` mediante MVP-006 con CI remoto verificado en Linux. `main` se conserva estable.
2. **Resolver F1 (hecho).** Las decisiones documentales de ingesta/modelos (MVP-010, MVP-013) y de confirmación/sello (MVP-011, MVP-012) quedaron resueltas formalmente y archivadas en `completed/`. Solo MVP-014 (revisión jurídica) permanece pendiente de dictamen externo fuera del repo.
3. **Integrar contratos F2 y paquete F11 (hecho).** Contratos de dominio (MVP-020, MVP-021) y paquete de delegación frontend (MVP-110) completados y publicados en `origin/develop`, con validación registrada en sus planes archivados.
4. **Abrir carriles (hasta tres, condicionales).** Núcleo (Nahuel), un módulo (Gastón) y UI (Facu), solo cuando sus archivos son disjuntos y tienen sus entradas. No son cuatro ni hace falta usar siempre dos. Orden por persona: [`team-ticket-order.md`](team-ticket-order.md).
5. **Integrar cada entrega.** PR a `develop`, merge autónomo dentro del alcance del Issue y tests relevantes sobre el resultado; los fallos se reportan, no se ocultan. Recién entonces actualizar sus IDs como completados.
6. **Cerrar conjuntos funcionales y producto.** Probar documentos/chat; después confirmaciones/versiones/HCS; finalmente verificador, seguridad, despliegue y smoke real autorizado.

No crear 36 worktrees de antemano ni lanzar todos los planes de una fase. Hay **tres flujos de implementación como máximo** (núcleo, módulo, UI), y un flujo extra solo existe si hay archivos disjuntos. Tomás no tiene cuenta de agente y no cuenta como carril. Cuatro redactores documentales no implican cuatro implementadores simultáneos.

## Orden práctico y segundo carril

Estas son tandas orientativas, **no una agenda obligatoria**. El maestro y los checkpoints mandan. Una pareja necesita además pasar la matriz de archivos de la sección siguiente.

| Momento | Carril principal | Segundo carril posible |
| --- | --- | --- |
| Base | [Integración/CI](../exec-plans/completed/f00-integracion-base-ci.md) (completado) | [Acceso del colaborador](../exec-plans/completed/f00-acceso-colaborador.md), gestión humana sin escribir código |
| Decisiones | [Ingesta y modelos](../exec-plans/completed/f01-decisiones-ingesta-y-modelos.md) (completado) | [Confirmaciones y sello](../exec-plans/completed/f01-decisiones-confirmacion-y-sello.md) (completado) |
| Contratos | [Contratos de dominio](../exec-plans/completed/f02-contratos-dominio.md) (completado) | Checkpoint MVP-122 del [dataset](../exec-plans/active/mvp/f12-ai-evaluation-dataset-and-runner.md), una vez decidido MVP-013; sin tocar contratos globales |
| Servicios base | [SQL, migraciones y RLS](../exec-plans/completed/f02-esquema-migraciones-rls.md) | [Proveedor Gemini](../exec-plans/active/mvp/f05-gemini-provider.md), si manifiestos/configuración se reservaron antes al líder |
| Sesiones | [Clientes Supabase](../exec-plans/active/mvp/f02-clientes-supabase.md) → [guardas](../exec-plans/active/mvp/f03-sesiones-y-guardas.md) | [Paquete frontend](../exec-plans/completed/f11-frontend-delegation-package.md) (completado), sin tocar clientes/rutas |
| Documentación | [Documentos, mensajes y auditoría](../exec-plans/active/mvp/f04-documents-chat-audit.md) → [evidencias/extracción](../exec-plans/active/mvp/f04-evidence-upload-extraction.md) | [Presentaciones frontend](../exec-plans/completed/f11-frontend-presentation-tickets.md), completadas con fixtures; su integración de producto conserva tareas propias |
| IA | [Redacción](../exec-plans/active/mvp/f05-agent1-drafting.md); luego [streaming](../exec-plans/active/mvp/f05-chat-streaming-retry.md) y [contraste](../exec-plans/active/mvp/f05-agent2-groq-contrast.md) | Streaming y contraste pueden ir juntos solo con módulos/fixtures y manifiestos separados; si no, secuenciarlos o continuar frontend |
| Preparar revisión | [Chat conectado](../exec-plans/active/mvp/f04-connected-chat.md), [reglas](../exec-plans/active/mvp/f06-rules-and-warnings.md) y revisión según sus IDs | Checkpoints MVP-090/093 del [cliente HCS/Mirror](../exec-plans/active/mvp/f09-01-hedera-hcs-testnet.md), sin enviar nada real ni cerrar MVP-091/092 todavía |
| Confirmaciones | [Congelar/autor](../exec-plans/active/mvp/f07-01-revision-congelada-y-confirmacion-autor.md) → [invitaciones](../exec-plans/active/mvp/f07-02-invitaciones-y-respuesta-atomica.md) → [agregado/pantalla pública](../exec-plans/active/mvp/f07-03-estado-agregado-y-pantalla-publica.md) | Frontend pendiente o pruebas con módulos propios; no otra migración/RPC sobre las mismas revisiones |
| Finalización | [PDF durable](../exec-plans/active/mvp/f08-01-finalizacion-durable-y-pdf-canonico.md) → [manifiesto/versiones](../exec-plans/active/mvp/f08-02-manifiesto-version-inmutable-y-nueva-version.md) → restantes MVP-091/092 de HCS | UI/compartir o dataset/runner si tienen todas sus entradas; no modificar simultáneamente los servicios de finalización |
| Integración | [UI del autor/compartir](../exec-plans/active/mvp/f07-04-ui-autor-seleccion-y-compartir.md), [composición del producto](../exec-plans/active/mvp/f11-product-ui-integration-and-review.md) y [verificador](../exec-plans/active/mvp/f10-01-verificador-publico.md), respetando checkpoints | Backend del verificador y composición solo si no comparten rutas/contratos; la revisión transversal MVP-118 espera a todas sus pantallas |
| Validación final | [Matriz crítica/E2E](../exec-plans/active/mvp/f12-critical-flow-matrix-and-e2e.md) → [seguridad/CI](../exec-plans/active/mvp/f13-release-security-and-ci.md) → [despliegue/demo](../exec-plans/active/mvp/f13-deploy-and-demo.md) → [smoke/evaluación/cierre](../exec-plans/active/mvp/f13-live-validation-and-closure.md) | Dataset/runner y remediaciones aisladas cuando no cambien aquello que se está validando; no abrir cambios de contratos durante una validación de release |

[Auth real](../exec-plans/completed/f03-auth-flujos-reales.md) quedó integrada tras las presentaciones de acceso, sin esperar al resto del frontend. El [harness de servidor](../exec-plans/completed/f12-server-test-harness.md) quedó completado por PR #79 y reutiliza los helpers RLS de MVP-024. El [proyecto Supabase remoto](../exec-plans/active/mvp/f02-entorno-supabase-remoto.md) y la [revisión jurídica](../exec-plans/active/mvp/f01-revision-juridica.md) son gestiones autorizadas aparte; la revisión jurídica no frena la demo ficticia.

## Matriz de compatibilidad y recursos compartidos

**Verde:** candidato si ambos cumplen entradas y archivos disjuntos. **Amarillo:** requiere separar archivos y publicar el contrato/configuración común primero. **Rojo:** secuenciar; el worktree no elimina el conflicto.

| Pareja / recurso | Clase | Regla operativa |
| --- | --- | --- |
| Presentación con props cerrados + backend en otro dominio | Verde | El frontend no cambia contratos, rutas, primitivas, estilos globales ni mocks compartidos |
| Dataset/etiquetas + componente visual | Verde | Solo archivos propios; sin editar scripts/npm ni reglas compartidas |
| Cliente HCS/Mirror MVP-090/093 + frontend | Verde | No incluir aún publicación de versión/sello ni tocar la configuración del preview |
| Proveedor Gemini + SQL/RLS | Amarillo | El líder incorpora dependencias/scripts comunes antes; separar `tests/server/ai/` de `tests/server/rls/` y no editar el mismo workflow |
| Streaming + contraste Groq | Amarillo | Contratos y puertos cerrados; ficheros de turno/stream y contraste separados; un solo responsable conecta la orquestación final en MVP-054 |
| Evidencias/extracción + redacción | Amarillo | Separar adapters/módulos de extracción y redacción; contrato de fuentes integrado. Si ambos necesitan la misma migración o barrel, secuenciar |
| UI integrada + verificador público | Amarillo | Rutas de dominios distintas; no editar a la vez `layout`, CSS, navegación compartida, configuración Playwright ni helpers globales |
| Dos planes sobre `package.json` / lockfile / config / `.env.example` / workflows | Rojo | Un único dueño o un commit de preparación integrado antes; no resolver conflictos regenerando lockfiles a ciegas |
| Dos planes que cambian contratos compartidos o cálculo de estados | Rojo | Cerrar y publicar el contrato/motor primero; consumidores lo importan sin versiones locales alternativas |
| Dos planes con nuevas migraciones/RPC de revisión o finalización | Rojo por defecto | Una cola de migraciones bajo el líder, orden validado desde cero; separar solo con revisión explícita de tablas, locks y firmas |
| Congelar/confirmar/sustituir/finalizar sobre las mismas invariantes | Rojo | Implementación secuencial de productores; después pruebas concurrentes reales, no dos diseños simultáneos |
| Chat MVP-054 + composición MVP-116 sobre `documents/[id]/page.tsx` | Rojo si ambos la editan | MVP-054 entrega su container; la página y montaje son de MVP-116. Ningún cambio simultáneo de la página |
| Cualquier implementación + release/smoke que pretende validarla | Rojo | Validar una referencia estable; integrar el cambio y volver a ejecutar el gate afectado |

Las carpetas amplias de los planes no prueban independencia. Antes de abrir la pareja se escriben **archivos concretos** y salidas/contratos que cada agente puede modificar. Si hay duda o un archivo compartido no resuelto, se ejecuta un solo plan.

## Rama, worktree y PR por plan

- Crear la rama (y worktree) solo al iniciar el plan, desde un `origin/develop` recién traído, tras integrar dependencias. El Issue asignado autoriza rama, commits, push, PR y merge dentro de su alcance; no se trabaja directo sobre `develop` salvo instrucción explícita. Usar nombres vinculados al plan (`plan/<nombre-corto>`); cada plan tiene un único dueño activo.
- Un plan con checkpoints puede entregar PRs parciales coherentes sobre su misma rama. Solo sus IDs realmente integrados se completan; el plan permanece abierto hasta cerrar todos. No borrar su rama/worktree a mitad de los checkpoints.
- Tras un PR parcial, sincronizar la rama con `develop` según la estrategia de merge acordada; no dar por incluido código eliminado por squash ni reescribir ramas publicadas con force-push.
- Cada worktree conserva sus propios artefactos/dependencias generadas. Servidores y suites browser concurrentes necesitan puertos/configuración separados; no reutilizar procesos ajenos. Si no hay aislamiento preparado, ejecutar navegador/build en serie.
- Datos y claves privadas se configuran solo con autorización. No compartir ni versionar `.env` por crear un worktree. Los planes locales con dobles no necesitan credenciales cloud.
- Revisar el diff y la evidencia antes del push; PR hacia `develop`. No hay aprobaciones humanas ni checks obligatorios (se prioriza la velocidad aceptando el riesgo): se ejecutan los tests relevantes. Un test fallido se intenta corregir; si el fallo no es sensible y no impide el recorrido principal, se puede mergear con advertencia visible avisando al compañero que ejecuta (Facu/Gastón). Si implica secretos, permisos, pérdida de datos o finalizar sin confirmaciones, no se mergea: se informa al ejecutor y se escala al líder. El CI existe y se conserva; no se falsean resultados ni se desactivan CI o controles de seguridad. Nunca force-push ni imprimir tokens o `.env`.
- Conflictos: los resuelve Claude. Si el comportamiento resultante fuera incompatible, se explican las opciones y sus consecuencias en lenguaje para un niño de 6 años y el compañero decide; si la decisión viola el PRD o la seguridad, se escala al líder.
- El agente actualiza solo sus IDs y evidencia. El líder consolida el resumen y los contadores globales del maestro al integrar ramas paralelas: no aceptar un total desactualizado de otra rama.
- El archivado de planes compartidos (de `active/mvp/` a `completed/`, con la corrección de enlaces relativos y entrantes del maestro/catálogo) lo consolida el líder.
- Procedimientos exclusivamente externos (acceso o dictamen jurídico) los realiza una persona; no justifican lanzar un agente de código. Solo hace falta una rama documental si hay cambios de evidencia que entregar.

## Antes de lanzar un carril adicional

- [ ] Dependencias por ID integradas en la base; decisiones requeridas resueltas.
- [ ] Un responsable y allowlist por plan; sin escritores simultáneos de los recursos rojos.
- [ ] Contratos, fixtures y firmas de servicios compartidos disponibles.
- [ ] No se necesita una autorización externa todavía ausente para ese checkpoint.
- [ ] Worktrees, puertos y pruebas aislados; no dos sesiones trabajando en el mismo worktree.
- [ ] PRs y validación de integración previstos; nunca marcar completo por terminar solo la rama.

Si no hay candidatos seguros adicionales, **uno solo es la ejecución correcta**. El objetivo es integrar producto válido, no mantener agentes ocupados.
