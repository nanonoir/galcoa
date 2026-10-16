# Copias de Issues y registro de publicación

Los grupos `foundations`, `flow` y `delivery` contienen copias revisadas de las Issues publicadas, preparadas desde los ExecPlans. Las Issues publicadas coordinan asignación y ejecución; el maestro conserva la autoridad sobre progreso e invariantes. Este directorio no duplica estados de implementación.

## Plantilla común

1. Resultado esperado e IDs MVP.
2. Responsable y condición de acceso.
3. Antes de comenzar: dependencias por ID integrado y checkpoints.
4. Lecturas obligatorias con enlaces a `develop` y secciones concretas.
5. Archivos permitidos y prohibidos; contratos existentes y responsabilidad compartida.
6. Implementación por pasos y decisiones ya resueltas.
7. Aceptación verificable.
8. Validación: comandos, evidencia y límites de llamadas reales.
9. Entrega Git autónoma y resolución de conflictos.
10. Cierre y mensaje breve para la persona ejecutora.

## Reglas para redactar

- No crear Issues ni ejecutar Git desde los agentes redactores.
- Usar enlaces absolutos `https://github.com/nanonoir/galcoa/blob/develop/...` en los cuerpos. No inventar números de Issues.
- Cada grupo incluye `manifest.json`: array de objetos `{key,title,bodyFile,plan,ids,owner,kind}`. `bodyFile` es relativo a la raíz del repo; `plan` es la ruta del ExecPlan; `owner` es `nahuel`, `gaston` o `facu`; `kind` es `implementation` o `external`. Los IDs se escriben como lista explícita, sin rangos.
- Un archivo Markdown por Issue. Ningún ID pendiente aparece en dos tickets. No crear Issues del maestro, índices o planes completados.
- Facu se limita a MVP-111…115. Gastón recibe proveedores/agentes/streaming, evidencias/extracción y dataset/runner. Nahuel mantiene SQL/RLS, auth, persistencia/auditoría, reglas críticas, confirmaciones, finalización, Hedera, composición, seguridad y validación final.
- Todos ejecutan una tarea a la vez. Tres carriles solo con archivos disjuntos. La invitación pendiente de Gastón bloquea su ejecución, no la preparación ni el trabajo de otros.
- Evitar un `Closes #...` que cierre un ticket con checkpoints antes de completar todos sus IDs. No cerrar el plan compartido de presentación desde la primera entrega.
- El CI es señal, no una puerta obligatoria universal. Fallos no sensibles que no impiden el recorrido principal pueden entregarse con advertencia visible al ejecutor; secretos, permisos, pérdida de datos o finalización sin confirmaciones impiden mergear.
- Las Issues autorizan cambios Git de su alcance, no llamadas reales a IA, Supabase, Hedera o despliegues salvo permiso específico. Evaluación real final: una única sesión con datos ficticios sobre `develop` integrado.

## Correcciones del orquestador antes de publicar

- Acceso por persona: Facu puede iniciar su presentación aunque `MVP-007` continúe abierto por Gastón.
- Preview: excepción explícita para la entrada y tests de cada componente; Facu es único escritor y no espera un segundo ticket de cableado.
- Tests de servidor: el Vitest global actual no descubre `tests/server/**`. Los módulos de Gastón incluyen permiso para una configuración Node local de su suite hasta que el harness publique el descubrimiento oficial; no se cuenta una regresión general como prueba de una suite ignorada.
- Dependencias por ID integrado, no por cierre de Issue completo. No se agregan relaciones nativas que generen ciclos artificiales entre planes con checkpoints.

<!-- ISSUE-INDEX:BEGIN -->
## Issues publicadas

35 Issues cubren los 60 IDs abiertos de los 31 planes activos. El plan de presentación se entrega en cinco Issues completas. Son copias revisadas y un inventario de publicación, no otro tablero de estados. Las dependencias por ID están en cada Issue y el progreso canónico en el maestro.

Asignaciones confirmadas al publicar: Nahuel 24 Issues, Facu 5; Gastón tiene 6 previstas, sin asignación formal hasta aceptar la invitación. El checkpoint de acceso de Facu ya está cumplido.

| Issue | IDs | Responsable | Plan |
| --- | --- | --- | --- |
| [#3 — Confirmar acceso de colaboradores y registrar MVP-007](https://github.com/nanonoir/galcoa/issues/3) | `MVP-007` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f00-acceso-colaborador.md) |
| [#4 — Obtener dictamen jurídico externo sobre confirmación y privacidad](https://github.com/nanonoir/galcoa/issues/4) | `MVP-014` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f01-revision-juridica.md) |
| [#5 — Implementar esquema SQL, migraciones y aislamiento RLS/Storage local](https://github.com/nanonoir/galcoa/issues/5) | `MVP-022`, `MVP-023`, `MVP-024` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/completed/f02-esquema-migraciones-rls.md) |
| [#6 — Implementar clientes Supabase server-only y configuración perezosa](https://github.com/nanonoir/galcoa/issues/6) | `MVP-025` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f02-clientes-supabase.md) |
| [#7 — Preparar y verificar Supabase remoto de desarrollo/demo con permiso específico](https://github.com/nanonoir/galcoa/issues/7) | `MVP-026` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f02-entorno-supabase-remoto.md) |
| [#8 — Implementar sesión SSR verificada y guardas privadas reutilizables](https://github.com/nanonoir/galcoa/issues/8) | `MVP-030` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f03-sesiones-y-guardas.md) |
| [#9 — Conectar registro, acceso, logout y recuperación completos con Auth local](https://github.com/nanonoir/galcoa/issues/9) | `MVP-031` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f03-auth-flujos-reales.md) |
| [#10 — Persistir documentos, mensajes originales y auditoría solo-agregar](https://github.com/nanonoir/galcoa/issues/10) | `MVP-040`, `MVP-041`, `MVP-044` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f04-documents-chat-audit.md) |
| [#11 — Implementar carga privada de evidencias y extracción con procedencia](https://github.com/nanonoir/galcoa/issues/11) | `MVP-042`, `MVP-043` | Gastón (@grancobud, acceso pendiente) | [ExecPlan](../../exec-plans/active/mvp/f04-evidence-upload-extraction.md) |
| [#12 — Gemini de servidor con AI SDK — MVP-050](https://github.com/nanonoir/galcoa/issues/12) | `MVP-050` | Gastón (@grancobud, acceso pendiente) | [ExecPlan](../../exec-plans/active/mvp/f05-gemini-provider.md) |
| [#13 — Agente 1: borrador autónomo con procedencia — MVP-051](https://github.com/nanonoir/galcoa/issues/13) | `MVP-051` | Gastón (@grancobud, acceso pendiente) | [ExecPlan](../../exec-plans/active/mvp/f05-agent1-drafting.md) |
| [#14 — Streaming, cancelación y reintento del turno — MVP-052](https://github.com/nanonoir/galcoa/issues/14) | `MVP-052` | Gastón (@grancobud, acceso pendiente) | [ExecPlan](../../exec-plans/active/mvp/f05-chat-streaming-retry.md) |
| [#15 — Agente 2: contraste textual Groq sin veto — MVP-053](https://github.com/nanonoir/galcoa/issues/15) | `MVP-053` | Gastón (@grancobud, acceso pendiente) | [ExecPlan](../../exec-plans/active/mvp/f05-agent2-groq-contrast.md) |
| [#16 — Conectar chat, carga de adjuntos, streaming y contraste persistido](https://github.com/nanonoir/galcoa/issues/16) | `MVP-054` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f04-connected-chat.md) |
| [#17 — Motor determinista y advertencias no bloqueantes — MVP-060, MVP-061, MVP-062](https://github.com/nanonoir/galcoa/issues/17) | `MVP-060`, `MVP-061`, `MVP-062` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f06-rules-and-warnings.md) |
| [#18 — Revisión congelada y confirmación del autor — MVP-070, MVP-071](https://github.com/nanonoir/galcoa/issues/18) | `MVP-070`, `MVP-071` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f07-01-revision-congelada-y-confirmacion-autor.md) |
| [#19 — Invitaciones, GET seguro y respuesta atómica — MVP-072, MVP-073, MVP-074](https://github.com/nanonoir/galcoa/issues/19) | `MVP-072`, `MVP-073`, `MVP-074` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f07-02-invitaciones-y-respuesta-atomica.md) |
| [#20 — Agregado y pantalla pública de confirmación — MVP-075, MVP-076](https://github.com/nanonoir/galcoa/issues/20) | `MVP-075`, `MVP-076` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f07-03-estado-agregado-y-pantalla-publica.md) |
| [#21 — Revisión del autor y compartir manual — MVP-077, MVP-078](https://github.com/nanonoir/galcoa/issues/21) | `MVP-077`, `MVP-078` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f07-04-ui-autor-seleccion-y-compartir.md) |
| [#22 — Finalización durable y PDF canónico — MVP-080, MVP-081](https://github.com/nanonoir/galcoa/issues/22) | `MVP-080`, `MVP-081` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f08-01-finalizacion-durable-y-pdf-canonico.md) |
| [#23 — Manifiesto privado, publicación inmutable y v2 — MVP-082, MVP-083, MVP-084](https://github.com/nanonoir/galcoa/issues/23) | `MVP-082`, `MVP-083`, `MVP-084` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f08-02-manifiesto-version-inmutable-y-nueva-version.md) |
| [#24 — HCS exclusivamente Testnet y reconciliación — MVP-090, MVP-091, MVP-092, MVP-093](https://github.com/nanonoir/galcoa/issues/24) | `MVP-090`, `MVP-091`, `MVP-092`, `MVP-093` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f09-01-hedera-hcs-testnet.md) |
| [#25 — Verificador público de integridad — MVP-100, MVP-101](https://github.com/nanonoir/galcoa/issues/25) | `MVP-100`, `MVP-101` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f10-01-verificador-publico.md) |
| [#26 — MVP-111 · Presentación completa del dashboard](https://github.com/nanonoir/galcoa/issues/26) | `MVP-111` | Facu (@jfacundoayala) | [ExecPlan](../../exec-plans/active/mvp/f11-frontend-presentation-tickets.md) |
| [#27 — MVP-112 · Snapshot completo y advertencias](https://github.com/nanonoir/galcoa/issues/27) | `MVP-112` | Facu (@jfacundoayala) | [ExecPlan](../../exec-plans/active/mvp/f11-frontend-presentation-tickets.md) |
| [#28 — MVP-113 · Historial de versiones de solo lectura](https://github.com/nanonoir/galcoa/issues/28) | `MVP-113` | Facu (@jfacundoayala) | [ExecPlan](../../exec-plans/active/mvp/f11-frontend-presentation-tickets.md) |
| [#29 — MVP-114 · Landing y navegación responsive](https://github.com/nanonoir/galcoa/issues/29) | `MVP-114` | Facu (@jfacundoayala) | [ExecPlan](../../exec-plans/active/mvp/f11-frontend-presentation-tickets.md) |
| [#30 — MVP-115 · Cuatro formularios de acceso como presentación](https://github.com/nanonoir/galcoa/issues/30) | `MVP-115` | Facu (@jfacundoayala) | [ExecPlan](../../exec-plans/active/mvp/f11-frontend-presentation-tickets.md) |
| [#31 — MVP-116 / MVP-118 · Integración del producto y revisión transversal](https://github.com/nanonoir/galcoa/issues/31) | `MVP-116`, `MVP-118` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f11-product-ui-integration-and-review.md) |
| [#32 — MVP-120 · Harness local de servidor y puente de tests](https://github.com/nanonoir/galcoa/issues/32) | `MVP-120` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f12-server-test-harness.md) |
| [#33 — MVP-121 · Matriz de 15 casos y E2E compuesto de cuatro selecciones](https://github.com/nanonoir/galcoa/issues/33) | `MVP-121` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f12-critical-flow-matrix-and-e2e.md) |
| [#34 — MVP-122 / MVP-123 · Dataset etiquetado y runner de evaluación](https://github.com/nanonoir/galcoa/issues/34) | `MVP-122`, `MVP-123` | Gastón (@grancobud, acceso pendiente) | [ExecPlan](../../exec-plans/active/mvp/f12-ai-evaluation-dataset-and-runner.md) |
| [#35 — MVP-130 / MVP-131 · Seguridad transversal y CI ampliado](https://github.com/nanonoir/galcoa/issues/35) | `MVP-130`, `MVP-131` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f13-release-security-and-ci.md) |
| [#36 — MVP-132 / MVP-133 · Despliegue autorizado y preparación de demo](https://github.com/nanonoir/galcoa/issues/36) | `MVP-132`, `MVP-133` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f13-deploy-and-demo.md) |
| [#37 — MVP-134 / MVP-135 / MVP-136 · Validación real final y cierre honesto](https://github.com/nanonoir/galcoa/issues/37) | `MVP-134`, `MVP-135`, `MVP-136` | Nahuel (@nanonoir) | [ExecPlan](../../exec-plans/active/mvp/f13-live-validation-and-closure.md) |

[Orden por persona](../../execution/team-ticket-order.md) · [Protocolo común](execution-protocol.md) · [Inventario JSON](published.json). Los cuerpos incluyen el protocolo completo; no dependen de herramientas del orquestador. No se crearon relaciones nativas de bloqueo por Issue completa que impidan consumir checkpoints parciales.

<!-- ISSUE-INDEX:END -->
