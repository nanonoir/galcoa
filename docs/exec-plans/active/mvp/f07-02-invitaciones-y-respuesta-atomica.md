# F7-02 — Invitaciones, lectura pública y respuesta atómica

**Estado: planificado (no iniciado).** Ninguna tarea de este plan está implementada ni validada.

Tareas del maestro: `MVP-072`, `MVP-073`, `MVP-074`

Referencias: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3.8–3.10, §5, §8, §10, §11, §12.8–9, 12.12) · [arquitectura](../../../architecture.md) · [fundaciones](../../../design/mvp-shared-foundations.md) (SH-02, SH-04, SH-07) · [desarrollo](../../../development.md#checks-según-el-cambio) · [maestro](../mvp-master-plan.md).

## 1. Alcance

Capacidad pública individual por tercero y revisión: emitir el token, leer el snapshot sin consumirlo y recibir una única respuesta (confirmar o rechazar) de forma atómica e idempotente.

**Dentro:** generación y hash del token, invitaciones por tercero/revisión, servicio y lectura pública (DTO mínimo propio), RPC de respuesta, ruta de carga de `confirm/[token]` (sin UI final) y adapter de respuesta.

**Fuera:** estado agregado, rechazo-impide-finalizar a nivel de revisión y límite de abuso (`MVP-075`, [f07-03](f07-03-estado-agregado-y-pantalla-publica.md)); pantalla pública final (`MVP-076`); UI del autor y compartir (`MVP-077/078`). No hay envío automático de invitaciones (REQ-14, D-08).

**Esta fase no espera a `MVP-112`.** `MVP-072` solo depende de `MVP-070` y `MVP-011`; ninguna tarea de este plan consume presentación del colaborador.

## 2. Dependencias y entrada exacta

| Tarea | Depende de (maestro) | Entrada requerida antes del checkpoint |
| --- | --- | --- |
| `MVP-072` | `MVP-070`, `MVP-011` | Revisión congelada con snapshot/hash ([f07-01](f07-01-revision-congelada-y-confirmacion-autor.md)); decisión documentada de vigencia, límite de abuso y reemisión (`MVP-011`, vía [RQ-C4](#8-referencias-a-completar)) |
| `MVP-073` | `MVP-072` | Invitaciones emitidas y lectura por hash del token |
| `MVP-074` | `MVP-073` | Lectura pública funcionando; contratos de comando/resultado de `MVP-021` |

Entradas no formales: base Postgres/Supabase local real (`MVP-023/024`; harness `MVP-120` si existe). Sin ella los checks de BD quedan «no ejecutado».

## 3. Requisitos e invariantes aplicables

REQ-12, REQ-13, REQ-16, REQ-17. INV-11 (token no da acceso a chat/evidencias), INV-12, INV-13, INV-14, INV-15 (acceso distinto del verificador). Diseño: [SH-02](../../../design/mvp-shared-foundations.md#sh-02--contratos-versionados-y-proyecciones-explícitas) (DTO público por allowlist), [SH-04](../../../design/mvp-shared-foundations.md#sh-04--autoridad-transaccional-y-respuestas-idempotentes) (idempotencia, RPC restringidas, GET sin consumo), [SH-07](../../../design/mvp-shared-foundations.md#sh-07--capas-auth-y-ownership-de-archivos) (capacidad acotada, sin sesión Supabase del tercero, sin caché ni fuga por logs/referrer).

## 4. Objetivo y aceptación por ID

**`MVP-072` — Tokens individuales.**

- [ ] Un token por tercero seleccionado y revisión; generado con CSPRNG del servidor; solo se almacena su hash; el texto plano se entrega una única vez al autor y nunca se registra.
- [ ] Longitud/entropía, algoritmo de hash, vigencia y política de reemisión/revocación son **los de `MVP-011`**; no se fijan aquí (PD-01).
- [ ] La invitación referencia `revisionId` + `snapshotId` + hash, tipo de tercero y estado (`vigente/consumida/revocada/vencida/sustituida`); constraint compuesta que impide mezclar documento, revisión, snapshot y tercero.
- [ ] Emitir de nuevo para el mismo tercero y revisión no deja dos tokens vigentes: la reemisión revoca el anterior (semántica final de `MVP-011`).
- [ ] La invitación no concede acceso al documento privado, chat ni evidencias; no hay sesión Supabase de tercero.
- [ ] Solo el propietario con revisión activa puede emitir/revocar; auditoría en la misma transacción.

**`MVP-073` — Lectura pública (GET sin consumo).**

- [ ] `confirm/[token]` entrega el snapshot **idéntico y completo** (operación + advertencias seguras + selección por roles) al que ve el autor, sin chat, evidencias, rutas, URLs firmadas, IDs privados ni tokens de otros terceros.
- [ ] El GET nunca consume, confirma ni modifica estado de la invitación; repetirlo es seguro.
- [ ] Vencida, revocada, sustituida o consumida: el DTO indica disponibilidad no respondible. Un token inexistente produce la misma respuesta externa que uno no disponible (sin enumerar).
- [ ] Respuestas con `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `noindex`, sin recursos de terceros; el token no aparece en logs, errores ni telemetría.
- [ ] El DTO se construye por allowlist y valida con esquema estricto (no spread/omit de un registro privado).

**`MVP-074` — Respuesta atómica e idempotente.**

- [ ] Ambas decisiones exigen nombre completo autodeclarado válido (INV-13). Confirmar exige casilla marcada; rechazar exige casilla desmarcada y ratificación explícita, no conformidad. Un comando incoherente se rechaza en servidor aunque la UI lo permita.
- [ ] Respuesta, consumo del token y auditoría se persisten en **una** transacción; el agregado se actualiza según [f07-03](f07-03-estado-agregado-y-pantalla-publica.md) (ver §5.3).
- [ ] Doble clic, reintento o petición concurrente con la misma clave devuelven la **misma** respuesta persistida; misma clave con huella distinta → conflicto; token consumido con otra decisión → error estable sin crear otra decisión.
- [ ] Confirmar y rechazar concurrentes sobre el mismo token producen **una** respuesta ganadora.
- [ ] Una respuesta tardía no revive una revisión sustituida ni una invitación vencida o revocada.
- [ ] Se guardan revisión, snapshot exacto y hash mostrados, decisión, casilla, nombre declarado en toda respuesta, ratificación para rechazo y tiempo del servidor (INV-13). El nombre no se trata como identidad verificada.

## 5. Rutas, propiedad y fronteras

Todo lo sensible es del líder; **no se delega** (público, tokens). Rutas propuestas; los endpoints exactos se fijan al ejecutar.

| Superficie | Contenido |
| --- | --- |
| `src/lib/documents/invitations/` (propuesta, `server-only`) | Emisión, hash, lectura pública y respuesta; el hash usa `node:crypto` (permitido en servidor, vedado en presentación) |
| `src/lib/contracts/` | Esquemas de invitación pública y comando/resultado: de `MVP-021`; faltantes se solicitan, no se definen aquí |
| `src/lib/supabase/` | Adapter para RPC; capacidad de token validada en el adapter y revalidada por la función SQL |
| `supabase/migrations/` | Migración con RPC de emisión/revocación/lectura/respuesta; `anon` sin acceso a tablas ni a funciones genéricas privilegiadas; funciones con permisos mínimos y `search_path` seguro (RQ-C2) |
| `src/app/confirm/[token]/page.tsx` (propuesta) | Server Component: carga vía servicio, no por HTTP propio; **versión mínima de solo lectura** hasta que `MVP-076` ([f07-03](f07-03-estado-agregado-y-pantalla-publica.md)) la reemplace por el container |
| `src/app/api/confirm/` (propuesta) | Route Handler de respuesta; token en el cuerpo (no en la ruta) para no registrarlo en logs de acceso |
| `tests/server/`, `tests/e2e/` | Vitest y Playwright; fixtures ficticias solo en tests |

### 5.3 Coordinación con `MVP-075`

SH-04 pide respuesta + consumo + agregado/auditoría en la misma transacción. MVP-074 implementa desde el inicio el cálculo SQL autoritativo definido por el diseño de datos y la matriz del motor MVP-060; lo devuelve y lo persiste si el modelo guarda un agregado. No se deja una función vacía ni un estado incoherente esperando MVP-075. Este último reutiliza el cálculo para exponer avance y estados, sin reimplementar otra verdad. Hasta disponer del límite de abuso de MVP-075 y la validación MVP-130, los endpoints no se despliegan públicamente.

**DTO.** Lectura: `PublicInvitationDTO` (`schemaVersion`, identificadores opacos de revisión/snapshot, hash, rol propio, selección por roles, `FrozenOperation` completa, disponibilidad). Respuesta: `{ token, expectedSnapshotHash, decision, checkbox, declaredName, ratification?, idempotencyKey }` → resultado persistido o error estable; `declaredName` siempre requerido para tercero. Nunca se reutiliza un DTO privado «recortado en cliente».

## 6. Pasos ejecutables

1. **C072-0 Verificar entrada.** `MVP-070` integrada; `MVP-011` documentada (parámetros). Sin `MVP-011` no se escriben valores: bloquear solo `MVP-072`.
2. **C072-1 Generador y hash.** Módulo puro con CSPRNG y hash; los parámetros se leen de configuración definida por `MVP-011`. Tests: unicidad, formato, que el servicio nunca persista ni devuelva el hash donde corresponde plaintext, ni al revés.
3. **C072-2 RPC de emisión/revocación/reemisión.** Transacción con propiedad, revisión activa, unicidad vigente por tercero y auditoría. La repetición del mismo comando devuelve metadatos **sin** plaintext (el token no es recuperable) y un código estable que indica reemisión (PD-02).
4. **C072-3 Servicio y adapter autenticado.** Solo propietario; entrega el plaintext una vez en la respuesta de emisión.
5. **C073-0 Lectura por hash.** RPC/consulta de solo lectura que resuelve la capacidad; sin escritura; sin consumo.
6. **C073-1 Proyección pública.** Construir `PublicInvitationDTO` por allowlist desde el snapshot persistido (no desde el borrador). Test de igualdad estricta de la `FrozenOperation` entre autor y cada tercero y de ausencia de campos privados (centinelas).
7. **C073-2 Página/handler de carga.** Cabeceras de privacidad; mismo resultado para token inexistente/no disponible; sin logs del token.
8. **C074-0 RPC `respond_to_invitation`.** Bloqueo en orden estable documento → revisión → invitación (el token se resuelve sin bloqueo y se revalida bajo bloqueo). Valida coherencia casilla/decisión/ratificación; escribe respuesta, consumo y auditoría; registra clave de idempotencia + huella.
9. **C074-1 Servicio y handler.** Normaliza errores; no devuelve información de otras decisiones; no confía en estado de UI.
10. **C074-2 Pruebas de concurrencia reales.** Ver §7.

## 7. Validación (ejecución pendiente — no ejecutado)

| Check | Cobertura | Estado |
| --- | --- | --- |
| `npm run lint`, `typecheck`, `test`, `test:boundaries` | Barreras (`server-only`, sin SDK/env en presentación) | no ejecutado |
| Vitest Node | Generador/hash, allowlist del DTO público, igualdad autor/terceros para las **4 selecciones** (un enlace distinto por tercero), huella de comando | no ejecutado |
| Vitest contra **Postgres local real** con conexiones independientes | Confirmar vs. rechazar simultáneos (una respuesta); N reintentos con la misma clave (una fila); consumo y respuesta en una transacción (fallo forzado intermedio no deja token consumido sin respuesta); respuesta tardía sobre revisión sustituida/vencida/revocada rechazada; `anon` sin acceso directo a tablas; GET repetido no cambia estado | no ejecutado |
| `npm run build` | Se tocan rutas | no ejecutado |
| Playwright (`npm run test:e2e`) | Carga de `confirm/[token]` sobre Next con base local: contenido idéntico, GET no consume (recargar N veces y luego responder), cabeceras, token ausente de la URL de red de segundo plano y de la consola. La interacción de la UI final se prueba en `MVP-076` | no ejecutado |

No se usan credenciales ni proveedores externos. Las claves del Supabase local son efímeras de test (SH-09).

## 8. Referencias a completar

Documentos objetivo **disponibles** y enlazados; los parámetros operativos (entropía, vigencia, cuotas, límites, perfil y tiempos) siguen siendo propuestas **no aprobadas** hasta que F1 (`MVP-011/012/013`) los registre. Este plan consume los documentos y no los reescribe.

| ID | Documento | Qué necesita este plan |
| --- | --- | --- |
| RQ-C1 | [`review-confirmation`](../../../specs/review-confirmation.md) | Reglas de coherencia casilla/decisión/ratificación; longitud y formato del nombre autodeclarado; texto de estados de disponibilidad |
| RQ-C2 | [`data-transactions`](../../../design/data-transactions.md) | RPC de emisión/lectura/respuesta, permisos de `anon`, claves de idempotencia, orden de bloqueo, retención de huellas |
| RQ-C4 | [`public-capabilities`](../../../specs/public-capabilities.md) (registro abierto de `MVP-011`, §8) | Entropía/longitud, vigencia, límite de abuso, reemisión y revocación. **Valores propuestos, no aprobados**, hasta que `MVP-011` los fije |

## 9. Decisiones pendientes

- **PD-01** Todos los parámetros numéricos del token y del límite de abuso dependen de `MVP-011`; no hay valores en este plan.
- **PD-02** Recuperar un enlace ya emitido: al almacenarse solo el hash, solo es posible reemitir. UX y política de reemisión → `MVP-011`/RQ-C1 y [f07-04](f07-04-ui-autor-seleccion-y-compartir.md).
- **PD-03** Si el algoritmo de hash usa una clave secreta de servidor (pepper), requiere nueva variable de entorno: decisión de `MVP-011`; no se agrega por iniciativa propia.

## 10. Rollback y recuperación

- Antes de integrar: descartar la rama y recrear la base local.
- Migraciones ya aplicadas: no se editan; corregir con migración posterior. Una emisión errónea se **revoca** (no se borra): invitaciones y respuestas persistidas son historia de auditoría.
- Si se descubre fuga de token en logs durante la ejecución: revocar los tokens afectados mediante la RPC de revocación, corregir el registro de logs y documentar el incidente antes de continuar.
- Recuperación de una respuesta con resultado de red perdido: reintentar con la **misma** clave (devuelve lo persistido); no generar otra clave para el mismo gesto.

## 11. Cierre

Con la implementación integrada y evidencia real, actualizar solo las filas `MVP-072`, `MVP-073` y `MVP-074` y el recuento del §3 del maestro, y archivar este plan al cerrar las tres. Documentar no marca ninguna. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

[Maestro](../mvp-master-plan.md) · [PRD](../../GALCOA-PRD-v1.4.md) · [Arquitectura](../../../architecture.md)
