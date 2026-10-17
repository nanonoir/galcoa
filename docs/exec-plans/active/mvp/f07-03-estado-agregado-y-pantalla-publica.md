# F7-03 — Estado agregado de confirmaciones y pantalla pública

**Estado: planificado (no iniciado).** Ninguna tarea de este plan está implementada ni validada.

Tareas del maestro: `MVP-075`, `MVP-076`

Referencias: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3.9–3.10, §5, §10, §12.3, 12.8, 12.11–12) · [arquitectura](../../../architecture.md) · [fundaciones](../../../design/mvp-shared-foundations.md) (SH-03, SH-04, SH-07, SH-09) · [desarrollo](../../../development.md#checks-según-el-cambio) · [maestro](../mvp-master-plan.md).

## 1. Alcance

Calcular en servidor el estado agregado de confirmaciones (`pendiente/parcial/completa/rechazada/sustituida`), asegurar que el rechazo impide finalizar esa revisión y permite otra, limitar el abuso en endpoints públicos y entregar la pantalla pública accesible de confirmación/rechazo, sin login.

**Dentro:** función determinista de agregado (TS) y su contraparte de autoridad en SQL, límite de abuso, container y presentación pública, tests de componentes y de navegador.

**Fuera:** emisión/lectura/respuesta ([f07-02](f07-02-invitaciones-y-respuesta-atomica.md)); UI del autor ([f07-04](f07-04-ui-autor-seleccion-y-compartir.md)); finalización (F8). La pantalla pública **no se delega** al colaborador inicial (superficie pública sensible; PRD §13, [arquitectura](../../../architecture.md#condición-para-delegar-y-primeros-candidatos)).

## 2. Dependencias y entrada exacta

| Tarea | Depende de (maestro) | Entrada requerida |
| --- | --- | --- |
| `MVP-075` | `MVP-074`, `MVP-071` | Respuesta atómica del tercero ([f07-02](f07-02-invitaciones-y-respuesta-atomica.md)); confirmación del autor ([f07-01](f07-01-revision-congelada-y-confirmacion-autor.md)). Parámetros de abuso de `MVP-011` ([RQ-C4](#8-referencias-a-completar)) |
| `MVP-076` | `MVP-074`, `MVP-075` | Endpoint de respuesta e invitación pública funcionales; estado agregado disponible; texto de interfaz de [RQ-C1](#8-referencias-a-completar) |

Entradas no formales: base Postgres local real; Docker/Supabase local para Playwright. Sin ellas los checks quedan «no ejecutado».

## 3. Requisitos e invariantes aplicables

REQ-08, REQ-13, REQ-16, REQ-17. INV-02 (advertencias no bloquean), INV-11, INV-12, INV-13, INV-14. PRD §5 (lenguaje prohibido: sin «certificado», «firma digital», «identidad verificada») y §10 (casilla vacía, rechazo visible, modal). Diseño: [SH-03](../../../design/mvp-shared-foundations.md#sh-03--tiempo-hashes-y-significado-de-los-estados) (advertencia ≠ error técnico), [SH-04](../../../design/mvp-shared-foundations.md#sh-04--autoridad-transaccional-y-respuestas-idempotentes).

## 4. Objetivo y aceptación por ID

**`MVP-075` — Estado agregado, rechazo y supersede.**

- [ ] Función pura en `src/lib/rules/` (mismos eventos → mismo resultado) y contraparte SQL de autoridad; una matriz compartida de casos verifica que ambas coinciden. La ausencia de advertencias nunca produce «aprobado».
- [ ] Semántica según [review-confirmation §4](../../../specs/review-confirmation.md) (RQ-C1; el líder la confirma al ejecutar): `pendiente` = ninguna respuesta; `parcial` = ≥ 1 confirmación y faltan otras sin rechazo; `completa` = todos los seleccionados (siempre autor) confirmaron **el mismo snapshot**; `rechazada` = ≥ 1 rechazo; `sustituida` = otra revisión la reemplazó. Se aplica a las 4 selecciones, incluido solo-autor con su única confirmación (PD-01).
- [ ] Un rechazo impide finalizar esa revisión (la condición de claim de F8 lo comprueba) y permite congelar otra con confirmaciones desde cero.
- [ ] Un estado calculado se atribuye a su `revisionId`/`snapshotId`; no se traspasa a la revisión nueva (SH-03).
- [ ] El cálculo se hace en servidor; la UI y el cliente no deciden el estado.
- [ ] Endpoints públicos con límite de abuso conforme a `MVP-011`, sin Redis/colas (PD-02) y sin que el límite bloquee a un participante legítimo de forma permanente ni revele existencia de tokens.
- [ ] Reutilizar el cálculo autoritativo y transaccional ya presente en MVP-074; exponer el avance y verificar paridad con el motor puro. Si hace falta otra migración para la proyección, no reemplaza ni posterga las validaciones atómicas de la respuesta.

**`MVP-076` — Pantalla pública de confirmación.**

- [ ] Casilla **inicialmente vacía** (sin precarga ni restauración automática del navegador); nombre completo autodeclarado; **«Confirmar»** solo habilitado con casilla marcada y nombre válido.
- [ ] **«No coincide / Rechazar»** visible, accesible y sin dificultad deliberada con la casilla desmarcada y nombre declarado válido; abre un modal que exige ratificar o cancelar. Cancelar no envía ni consume nada. No se exige marcar conformidad para rechazar.
- [ ] Contenido idéntico al snapshot del autor, incluidas advertencias; sin chat ni evidencias; distingue hechos respaldados, declarados y no verificables según el DTO.
- [ ] Estados: cargando, error de red con reintento (misma clave), no disponible (vencida/revocada/sustituida/ya respondida), éxito con resultado persistido. Doble clic y reintento no duplican.
- [ ] Textos sin afirmar verdad, identidad ni firma; se muestra «Confirmado mediante enlace» o equivalente de RQ-C1. Sin login, sin recursos de terceros, `noindex`, sin `referrer`.
- [ ] Teclado completo, foco gestionado en el modal (atrapa y devuelve el foco, Escape = cancelar), nombres accesibles, contraste y responsive móvil/escritorio.

## 5. Rutas, propiedad y fronteras

Todo del líder.

| Superficie | Contenido |
| --- | --- |
| `src/lib/rules/confirmations.ts` (propuesta) | Función pura del agregado. Si `MVP-060` ya definió un módulo equivalente, reutilizarlo en vez de duplicar |
| `supabase/migrations/` | Contraparte SQL, constraints y ajustes de la RPC de respuesta (nueva migración) |
| `src/lib/documents/` (`server-only`) | Servicio de estado agregado; consulta para el autor |
| `src/features/corroborations/containers/` | Container cliente: estado de interacción, idempotency key por intención, llamadas al endpoint; sin claves ni SDK |
| `src/features/corroborations/components/` | Presentación pública; props y callbacks; sin red ni autoridad. Primera entrega del líder, no del colaborador |
| `src/components/ui/` | Se dispone de `alert-dialog`, `dialog`, `input`, `label`, `button`, `alert`; **no hay checkbox**: incorporar el componente shadcn con la CLI (decisión del líder, cambio de primitiva) o un input nativo accesible |
| `src/app/confirm/[token]/page.tsx` | Reemplaza la versión mínima de [f07-02](f07-02-invitaciones-y-respuesta-atomica.md) por Server Component + container, pasando solo DTO |
| `tests/e2e/`, `tests/server/` | Playwright y Vitest |

**DTO.** La presentación recibe `PublicInvitationDTO` y callbacks `onConfirm({ declaredName })` / `onReject({ declaredName, ratified })`; la clave de idempotencia y la red las gestiona el container. Props exactos de `MVP-021`/del contrato de presentación, con nombre obligatorio en ambas respuestas.

## 6. Pasos ejecutables

1. **C075-0 Verificar entrada.** `MVP-074` y `MVP-071` integradas; parámetros de `MVP-011`.
2. **C075-1 Función pura + matriz.** Tabla de casos (4 selecciones × combinaciones de respuestas × sustitución) como fixture compartida entre TS y SQL.
3. **C075-2 Contraparte SQL y RPC.** Migración nueva; la condición «todas confirmadas y ninguna negativa» queda disponible para el claim de [f08-01](f08-01-finalizacion-durable-y-pdf-canonico.md).
4. **C075-3 Servicio y lectura para el autor.** Devuelve estado con `revisionId`/`snapshotId` de referencia.
5. **C075-4 Límite de abuso.** Implementar el mecanismo que fije `MVP-011` con la infraestructura existente (Postgres); no añadir servicios. Tests con reloj controlado.
6. **C076-0 Preparar primitivas.** Verificar/añadir checkbox y revisar `alert-dialog`/`dialog` para foco y Escape; lee la guía local de Next relevante antes de escribir Server Components/Route Handlers (`node_modules/next/dist/docs/`).
7. **C076-1 Presentación + container.** Estados descritos en §4; la clave de idempotencia se crea al iniciar la intención y se **reutiliza** en reintentos y doble clic; se desactiva el envío mientras está pendiente.
8. **C076-2 Tests de componente** (Vitest jsdom + user-event): casilla vacía deshabilita; marcado habilita; rechazo abre modal; cancelar no llama al callback; ratificar sí; foco; errores.
9. **C076-3 Playwright** contra Next con base local: flujo confirmar, flujo rechazar (y cancelar el modal), doble clic, reintento tras corte de red simulado, enlaces no disponibles, teclado y viewport móvil/escritorio; verificar que no hay peticiones a hosts externos.

## 7. Validación (ejecución pendiente — no ejecutado)

| Check | Cobertura | Estado |
| --- | --- | --- |
| `lint`, `typecheck`, `test`, `test:boundaries`, `build` | Barreras: presentación sin red/SDK/env; reglas puras | no ejecutado |
| Vitest Node: matriz del agregado (TS) | PRD §12.5 (determinismo), 12.9, 12.11 | no ejecutado |
| Vitest contra Postgres local real: paridad TS/SQL; rechazo ⇒ claim de finalización imposible; revisión nueva sin herencia; carrera rechazar vs. confirmar; límite de abuso | PRD §12.3, 12.8, 12.11, 12.12 | no ejecutado |
| Vitest jsdom (componentes) | PRD §12.12 | no ejecutado |
| Playwright (`npm run test:e2e`) | PRD §12.9, 12.12, 12.14 (acceso público separado); la revisión transversal de accesibilidad es `MVP-118` | no ejecutado |

Las pruebas de navegador no sustituyen pruebas de permisos/RLS. No hay credenciales ni proveedores externos.

## 8. Referencias a completar

Documentos objetivo **disponibles** y enlazados; los parámetros operativos (entropía, vigencia, cuotas, límites, perfil y tiempos) siguen siendo propuestas **no aprobadas** hasta que F1 (`MVP-011/012/013`) los registre. Este plan consume los documentos y no los reescribe.

| ID | Documento | Qué necesita este plan |
| --- | --- | --- |
| RQ-C1 | [`review-confirmation`](../../../specs/review-confirmation.md) | Semántica final de `pendiente/parcial/…`; relación agregado ↔ estado de documento (`esperando_confirmaciones`, `revision_rechazada`, `revision_sustituida`); textos de la pantalla pública (confirmar, rechazar, modal, estados no disponibles, éxito) y vocabulario prohibido |
| RQ-C2 | [`data-transactions`](../../../design/data-transactions.md) | Contraparte SQL del agregado, enganche con la RPC de respuesta, soporte del contador de abuso |
| RQ-C4 | [`public-capabilities`](../../../specs/public-capabilities.md) (registro abierto de `MVP-011`, §8) | Mecanismo y límites de abuso; **valores propuestos, no aprobados** |

## 9. Decisiones pendientes

- **PD-01** Definición exacta de `pendiente` frente a `parcial` (el PRD no la fija): la tabla de [review-confirmation §4](../../../specs/review-confirmation.md) la concreta; la propuesta de §4 de este plan coincide con ella y se confirma con el líder al ejecutar.
- **PD-02** Mecanismo de límite de abuso compatible con P0 sin Redis (contador en Postgres, configuración de plataforma u otro): lo decide `MVP-011`.
- **PD-03** Revisión jurídica del lenguaje de confirmación (`MVP-014`, externa): no bloquea la demo con datos ficticios; bloquea uso con documentos reales.

## 10. Rollback y recuperación

- Antes de integrar: descartar la rama. Migraciones locales no aplicadas fuera: eliminar y recrear.
- Tras integrar: revertir container/presentación sin tocar datos; el agregado en SQL se retira con migración correctiva. Las respuestas persistidas permanecen (auditoría).
- Si el límite de abuso bloquea a usuarios legítimos en pruebas: la configuración de umbral se ajusta por la decisión de `MVP-011`, nunca desactivando la comprobación de token.
- Un fallo de red durante la respuesta se recupera reintentando con la misma clave; la UI no marca éxito hasta recibir el resultado persistido.

## 11. Cierre

Con integración y evidencia real, actualizar solo las filas `MVP-075` y `MVP-076` y el recuento del §3 del maestro; archivar al cerrar ambas. Documentar no marca nada. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

[Maestro](../mvp-master-plan.md) · [PRD](../../GALCOA-PRD-v1.4.md) · [Arquitectura](../../../architecture.md)
