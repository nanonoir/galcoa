# F4 — Chat conectado: container, rutas y adjuntos

Tareas del maestro: `MVP-054`

**Estado: en curso (checkpoint de presentación; container bloqueado por Route Handlers ausentes).** Fuentes: [maestro](../mvp-master-plan.md), [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3, §10, REQ-02/03/04/05), [fundaciones](../../../design/mvp-shared-foundations.md) (`SH-02`, `SH-03`, `SH-07`, `SH-09`), [arquitectura](../../../architecture.md) (dependencias y contratos), [desarrollo](../../../development.md).

## 1. Objetivo y estado de partida

Pantalla de documento con chat, adjuntos y streaming **sobre servicios reales**: presentación sin red ni SDK, container cliente con las peticiones, y estados de error visibles. Conecta además el contraste del Agente 2 (`MVP-053`) al flujo: tras la redacción/stream y tras la extracción de adjuntos, el consumer invoca el contraste persistido para que `MVP-053` no quede sin llamada. `MVP-054` entrega `src/features/chat/` (containers, consumers/adapters de API y pruebas de contrato); **no** toca `src/app/(app)/documents/[id]/page.tsx`, cuyo dueño es solo `MVP-116`. Es trabajo del líder (el maestro, F11, lo excluye de la delegación).

**Estado real verificado:** no existen rutas `(app)`, `src/features/chat/`, containers ni componentes de chat. El preview solo cubre el dashboard.

## 2. Criterios y dependencias

| Tarea | REQ / INV | Aceptación (resumen) |
| --- | --- | --- |
| `MVP-054` | REQ-02, REQ-03, REQ-04, REQ-05 | Chat + adjuntos + streaming sobre servicios reales; presentación sin red ni SDK; errores visibles |

**Entrada (por ID):** `MVP-040` (documentos), `MVP-042` (carga de evidencias), `MVP-052` (streaming) y `MVP-053` (contraste con Groq; trae consigo `MVP-043` y `MVP-051` por sus propias dependencias). El cierre no se hace con `MVP-053` como opcional. **Salida:** `MVP-116` (integración de rutas y navegación), `MVP-130` (seguridad) y `MVP-121` (E2E).

## 3. Decisiones y pendientes

- **Alcance de pantalla:** historial de mensajes, composer, adjuntos con progreso y errores técnicos, streaming con cancelar y reintentar. La vista de borrador, advertencias y revisión pertenece a `MVP-077/112`; aquí solo se muestran los mensajes del asistente y referencias a artefactos.
- **Propiedad de la página (resuelta):** `src/app/(app)/documents/[id]/page.tsx` es solo de `MVP-116`, que monta el container de chat y depende de `MVP-054`. `MVP-054` posee `src/features/chat/` (containers, consumers de API/adapters, contratos y pruebas de contrato) y no edita la página.
- **Endpoints:** los define cada plan productor (`MVP-040/041` documentos y mensajes; `MVP-042` carga y extracción; `MVP-052` turno de chat; `MVP-053` contraste). Este plan los consume tal como queden implementados, sin crear endpoints nuevos ni acciones fuera del PRD, y respetando las fuentes de [sources-and-ai](../../../specs/sources-and-ai.md).
- **Presentación escrita por el líder** en `src/features/chat/components/` con contrato de props en `src/features/chat/contracts/` (patrón del dashboard); no se delega, no se abre Issue.
- **`@ai-sdk/react`** se usa solo en el container; está en `SERVER_PACKAGES` para presentación (barrera). Verificar la API de la versión instalada con su documentación.

## 4. Rutas y propiedad

| Zona | Permitido (Líder) | Prohibido |
| --- | --- | --- |
| `src/features/chat/containers/` | Container cliente: red, `useChat`, carga de adjuntos, estados | Claves, SDK de proveedores de servidor, Supabase |
| `src/features/chat/components/`, `contracts/` | Componentes y props serializables (sin red, Auth, SDK) | Importar `app/`, containers, mocks, servicios |
| `src/app/(app)/documents/[id]/` | **Ninguno**: la página es de `MVP-116`, que monta el container de `MVP-054` | Editar `page.tsx` desde este plan |
| `src/features/chat/fixtures/`, `preview/` | Escenarios ficticios y entrada de preview (opcional) | Importar fixtures desde producto |
| `tests/` | Pruebas de componentes y container | Presentarlas como E2E real |

Los callbacks ordinarios nacen en el container cliente; no se pasan funciones del servidor al cliente ni se introducen Server Actions (`SH-07`). Leer antes `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.

## 5. Pasos

- [ ] Verificar `MVP-040`, `MVP-042`, `MVP-052` y `MVP-053` integradas; leer los endpoints reales resultantes. *(2026-10-16: los servicios están integrados —`src/lib/documents/{messages,turns,evidence,contrast}`—, pero `src/app/api/` no existe: ningún Route Handler. Pendiente.)*
- [x] Contrato de props de chat en `src/features/chat/contracts/` y escenarios ficticios (historial, vacío, streaming, error de proveedor, adjunto rechazado, carga en curso) validados con Zod.
- [x] Componentes de presentación: lista de mensajes, composer, adjunto con estado, mensajes de error técnico con acción de reintentar; región viva accesible para el streaming, foco predecible, teclado completo, responsive.
- [ ] Container: historial inicial recibido como DTO del servidor; envío con `clientMessageId` (idempotencia de `MVP-052`); cancelar con `AbortController`; reintentar el mismo turno sin crear otro mensaje; carga de adjuntos con la clave de idempotencia de `MVP-042` y manejo de motivos de rechazo estables.
- [ ] Pipeline completo en el consumer: tras una carga exitosa invocar la extracción de `MVP-042/043`; tras la redacción/stream de `MVP-052` y tras la extracción, invocar el contraste persistido de `MVP-053` (Groq) automáticamente. Si una etapa falla, el adjunto o el contraste quedan en estado de error técnico visible («cargado sin extracción», «contraste no disponible») sin afirmar lo contrario ni bloquear el chat.
- [ ] Estados de error visibles que distinguen impedimento técnico (red, proveedor, almacenamiento, permisos) de advertencias de contenido; nunca mensajes de éxito si el servidor no confirmó.
- [ ] Texto de interfaz sin «certificado», «verificado visualmente», «validado», «firma digital» ni «identidad verificada» (PRD §5, §11).
- [ ] Exportar el container con su contrato para que `MVP-116` lo monte en la página (sin editarla aquí) y, opcionalmente, registrar escenarios en el preview del líder.

## 6. Casos de test por aceptación

| Aceptación | Caso |
| --- | --- |
| Presentación sin red ni SDK | `test:boundaries` y lint: sin imports de `ai`, `@ai-sdk/*`, Supabase ni `fetch` en `components/` |
| Chat sobre servicios reales | Container con respuestas de red simuladas por el test: envío, stream, cancelación, reintento sin duplicado; **no** equivale a integración real |
| Contraste conectado | El consumer, con respuestas simuladas, invoca el contraste tras el stream y tras la extracción de un adjunto; fallo del contraste visible y sin bloquear; no equivale a integración real |
| Adjuntos | Rechazo técnico visible con el motivo; progreso; reintento; adjunto aceptado listado |
| Estados de error visibles | Fallo de proveedor, de red y de permisos renderizan mensaje distinto y accesible; sin éxito falso |
| Accesibilidad | Región viva, foco tras enviar/cancelar, navegación por teclado (jsdom) y revisión manual en móvil/escritorio |
| Flujo real conectado | Pendiente para `MVP-121`/`MVP-134`: requiere Supabase local y dobles de servidor; se declara no ejecutado hasta entonces |

## 6.1 Avance del checkpoint (2026-10-16, rama `flow/16-chat`)

Entregado sin tocar red ni rutas: `src/features/chat/contracts/chat-view.ts` (esquemas Zod del estado y props), `components/chat-reference.tsx` (presentación pura), `fixtures/chat-scenarios.ts` (6 escenarios ficticios) y pruebas `components/chat-reference.test.tsx` + `tests/contracts/chat-view.test.ts`. Pasos 2 y 3 de §5 cumplidos; **no** se implementó el container (pasos 1, 4, 5, 6 y 7 de §5 y los casos «chat sobre servicios reales» y «contraste conectado» de §6).

**Bloqueo para el container:** existen `createChatTurnHandler` (`src/lib/documents/turns/http.ts`, NDJSON con `TurnEvent`) y los servicios de mensajes, evidencias y contraste, pero no hay Route Handlers que los expongan ni rutas definidas para historial, carga/extracción y contraste. Se necesita de los productores: ruta del turno (`MVP-052`), ruta de carga y extracción (`MVP-042/043`), ruta del contraste (`MVP-053`) y lectura del historial (`MVP-040/041`), con sus errores estables. No se inventaron rutas.

## 7. Validación, evidencia y rollback

`lint`, `typecheck`, `npm test`, `test:boundaries`, `build` y `npm run test:e2e` (si se agregan rutas navegables). **Evidencia del checkpoint (presentación, sin integración real):** `eslint` limpio, `typecheck` sin errores, `npm test` 704/704, `test:boundaries` 67/67; `build` no ejecutado (sin rutas nuevas). Container, streaming real, adjuntos y contraste: no ejecutado. Playwright contra servicios reales no corre aquí sin autorización; no hay fallback mock en rutas de producto. Rollback: revertir `src/features/chat/` en la rama (este plan no modifica la página).

## 8. Cierre

Con `MVP-053` ya integrada, tras integrar y repetir checks sobre la integración: actualizar solo `MVP-054` (y recuento) y archivar. Este documento no marca el estado. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

## 9. Pendientes y solicitudes

**Referencias:** `RQ-B2` — [data-transactions](../../../design/data-transactions.md): contratos de lectura del historial y de operaciones de turno; `RQ-B1` — [sources-and-ai](../../../specs/sources-and-ai.md) (§4 y §7): textos de errores técnicos y límites de adjuntos que la UI debe mostrar; sus valores (`MVP-010/013`) siguen propuestos, no aprobados.

**Solicitudes:** a `MVP-116` (montar el container en `page.tsx`, de su propiedad); a `MVP-052`, `MVP-042`, `MVP-053`, `MVP-040/041` (contratos de endpoint y errores estables); a `MVP-118` (revisión de accesibilidad).

**Decisiones pendientes:** ninguna que impida avanzar.

[Maestro](../mvp-master-plan.md) · [Arquitectura](../../../architecture.md) · Previo: [Streaming](f05-chat-streaming-retry.md)
