# F9-01 — Hedera HCS Testnet: cliente, sello, reconciliación y Mirror Node

**Estado: planificado (no iniciado).** Ninguna tarea de este plan está implementada ni validada. No se hace ninguna llamada a Hedera ni a Mirror Node al redactar ni como parte de la preparación.

Tareas del maestro: `MVP-090`, `MVP-091`, `MVP-092`, `MVP-093`

Referencias: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3.11, §5, §9, §12.6, 12.13, REQ-10, REQ-16) · [arquitectura](../../../architecture.md) · [fundaciones](../../../design/mvp-shared-foundations.md) (SH-05, SH-06, SH-07, SH-09) · [desarrollo](../../../development.md#checks-según-el-cambio) · [maestro](../mvp-master-plan.md).

## 1. Alcance

Cliente HCS exclusivo de Testnet en servidor; sello posterior a la finalización con intención persistida antes de enviar; reconciliación bajo resultado incierto antes de cualquier reintento; lectura y comparación vía Mirror Node. Reutiliza siempre el mismo PDF/hash y el mismo `manifestHash`.

**Fuera:** crear la versión o el PDF (F8); verificación pública (F10); creación/aprovisionamiento del topic y credenciales reales (acción *live* de `MVP-134`); HCS por confirmación (no existe en P0).

## 2. Dependencias y entrada exacta

| Tarea | Depende de (maestro) | Entrada requerida |
| --- | --- | --- |
| `MVP-090` | `MVP-012`, `MVP-021` | Decisión `MVP-012` ([RQ-C3](#8-referencias-a-completar)): forma del payload, identificador opaco, criterios de recibo/Mirror; contratos de sello de `MVP-021` |
| `MVP-093` | `MVP-090` | Cliente y configuración de red; esquema de lectura de Mirror; `manifestHash` esperado como entrada (fixture hasta que exista una versión real) |
| `MVP-091` | `MVP-090`, `MVP-083` | Versión publicada con `manifestHash` y envelope ([f08-02](f08-02-manifiesto-version-inmutable-y-nueva-version.md)); tablas de intento/registro de `MVP-022/023` |
| `MVP-092` | `MVP-091`, `MVP-093` | Sello con intención persistida y lector de Mirror |

**Orden interno recomendado:** `090` → `093` → `091` → `092`. `090` y `093` pueden avanzar sin la versión real, antes de `MVP-083`; solo `091` espera a F8. Esto evita ciclos: este plan depende de [f08-02](f08-02-manifiesto-version-inmutable-y-nueva-version.md) solo por `091/092`, y f08-02 no depende de este plan.

Entradas no formales: Postgres local real; el paquete `@hiero-ledger/sdk` ya está en `package.json` (su presencia no es una integración). Verificar la API de la versión instalada y la documentación oficial al implementar; no copiar recetas de otra versión.

## 3. Requisitos e invariantes aplicables

REQ-10, REQ-11 (preparación), REQ-15, REQ-16. INV-03, INV-04 (sin herramienta de envío para agentes), INV-05, INV-06 (solo hashes e identificadores opacos), INV-08, INV-18. [SH-06](../../../design/mvp-shared-foundations.md#sh-06--manifiesto-privado-prueba-pública-y-hcs-incierto) (intención antes de enviar, resultado incierto, reconciliación) y [SH-05](../../../design/mvp-shared-foundations.md#sh-05--finalización-durable-sin-infraestructura-adicional) (sello posterior, su fallo no revierte).

## 4. Objetivo y aceptación por ID

**`MVP-090` — Cliente HCS Testnet.**

- [ ] `src/lib/hedera/` con `server-only` encapsula el SDK; **rechaza cualquier red distinta de `testnet`** (incluidas `mainnet` y `previewnet`, y ausencia o valor mal formado) con error técnico explícito.
- [ ] Inicialización perezosa al atender la operación: nada se inicializa al importar ni durante `next build`. La falta de configuración produce un error técnico, nunca éxito simulado ni datos ficticios.
- [ ] El mensaje se construye con `schemaVersion` + referencia opaca + `manifestHash` (forma exacta de RQ-C3); no admite campos libres ni datos privados. Ninguna ruta del código acepta texto arbitrario.
- [ ] Credenciales y claves solo desde el entorno del servidor (`HEDERA_NETWORK`, `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`, `HEDERA_TOPIC_ID`); nunca en logs, errores, fixtures ni cliente. Sin herramienta abierta para agentes (INV-04).
- [ ] Doble de test del cliente en `tests/server/` solo para tests (nunca fallback productivo); `src/mocks/` queda reservado a escenarios DTO dependientes solo de contratos.

**`MVP-093` — Lectura y verificación vía Mirror Node.**

- [ ] Recupera el mensaje del topic por localizador (transacción/secuencia) y compara su contenido con el compromiso esperado; el resultado es tipado: `coincide`, `no_coincide`, `aun_no_disponible`, `indisponible`, `posible_reinicio_de_red`.
- [ ] Maneja indisponibilidad (timeout, 5xx, límites de tasa) y retraso del Mirror sin presentarlos como éxito ni como ausencia concluyente; todas las llamadas con tiempo límite y reintentos acotados (valores en RQ-C3).
- [ ] La respuesta se valida con Zod; el mensaje se decodifica sin confiar en su forma; contenido inesperado ⇒ `no_coincide`/error, no excepción sin controlar.
- [ ] Reinicio de Testnet (tema/secuencia inexistente o inconsistente respecto a lo persistido) se comunica como límite de verificabilidad, nunca como permanencia de producción.
- [ ] Sin registros adicionales por confirmación; la dirección base del Mirror se configura (la variable nueva, si hace falta, se añade a `.env.example` por el líder; PD-02).

**`MVP-091` — Sello posterior a la finalización.**

- [ ] Solo para versiones finalizadas (publicadas); ninguna ruta lo invoca antes de que existan todas las confirmaciones, el PDF y el manifiesto.
- [ ] **Antes de enviar**, una transacción persiste la intención: ID de transacción, payload exacto y su hash, topic y red, ventana de validez, con un claim durable de intento (único intento activo por versión). El envío ocurre fuera de la transacción SQL.
- [ ] Persiste topic, transacción, secuencia y marca de consenso **comprobados**; el estado `registrado` solo se asigna con el criterio de RQ-C3, nunca por haber ejecutado `send`.
- [ ] Estados `no_iniciado / pendiente / registrado / fallido`; un fallo deja «finalizada; sello pendiente» con el mismo PDF/hash. `fallido` describe un intento, no el estado de la versión.
- [ ] Cada intento y su resultado se auditan. Un fallo no revierte la finalización ni regenera el PDF.
- [ ] Disparo: tras publicar la versión dentro del límite de ejecución si cabe, o por `POST` autenticado del propietario; no hay cron ni cola.

**`MVP-092` — Reconciliación y reintento.**

- [ ] Un resultado incierto (timeout, caída tras enviar, respuesta desconocida) se reconcilia **antes** de cualquier reintento, por transacción/topic y payload opaco exactos, sin escanear contenido privado.
- [ ] La ausencia inicial en el Mirror (retraso) no autoriza reenviar. Un nuevo envío requiere evidencia suficiente de ausencia según los criterios de RQ-C3; hasta entonces queda `pendiente` con reintento de reconciliación disponible.
- [ ] Encontrado y coincidente ⇒ persistir secuencia/consenso y `registrado`. Encontrado y distinto ⇒ error técnico sin reenviar. Concluyente ausente ⇒ nuevo intento con **el mismo payload** y claim; cada intento auditado.
- [ ] Dos reintentos simultáneos producen un solo intento activo (constraint + claim).
- [ ] Nunca se regenera el PDF ni se afirma registro sin comprobarlo.

## 5. Rutas, propiedad y fronteras

Todo del líder; sin delegación.

| Superficie | Contenido |
| --- | --- |
| `src/lib/hedera/client.ts`, `submit.ts`, `mirror.ts` (propuesta, `server-only`) | Cliente, envío con ID de transacción previo, lector Mirror con Zod |
| `src/lib/documents/sealing/` (propuesta, `server-only`) | Servicio de sello y reconciliación, coordinación con persistencia (no SQL en UI) |
| `src/lib/supabase/` | Adapter de RPC de intención, resultado y reconciliación (RQ-C2) |
| `supabase/migrations/` | Migración con restricciones: intento activo único por versión; inmutabilidad de resultados comprobados; sin borrado de intentos |
| `src/lib/contracts/` | Esquemas de sello, intento y resultado: de `MVP-021` |
| `src/app/api/documents/[id]/versions/[versionId]/seal/` (propuesta) | `POST` (iniciar/reintentar/reconciliar) y `GET` estado; handlers delgados |
| `tests/server/` | Dobles de Hedera y Mirror; tests. No se ubican proveedores simulados en `src/mocks/` |
| `.env.example`, `next.config` | Cambios (p. ej. URL de Mirror) los hace el líder; el plan no los asume aprobados |

**DTO.** Estado del sello: `{ status, attempts: [{ outcome, retryable, at }], locators? }`, sin claves ni payload completo hacia el navegador del autor salvo lo necesario para mostrar localizadores públicos. Cliente nunca elige red, topic ni payload.

## 6. Pasos ejecutables

1. **C090-0 Verificar entrada.** Leer RQ-C3 (`MVP-012`) y los contratos de `MVP-021`; leer la documentación oficial de la versión instalada del SDK y de HCS (límite de tamaño de mensaje, vigencia de transacción, recibos, topic con o sin clave de envío) y dejar las conclusiones en el documento de diseño o en este plan, sin asumir números.
2. **C090-1 Config y guarda de red.** Función pura de validación de configuración con tests de red inválida y de ausencia de variables.
3. **C090-2 Constructor de mensaje.** Esquema estricto del payload; test de que ningún campo privado puede entrar.
4. **C090-3 Cliente y doble.** Cliente perezoso; doble determinista en `tests/server/` con modos: éxito, rechazo definitivo, timeout tras enviar, respuesta ambigua.
5. **C093-0 Lector Mirror.** `fetch` con `AbortSignal`, reintentos acotados, parseo Zod, clasificación de resultados. Tests con respuestas simuladas: 200 coincidente, 200 distinto, 404 por retraso, 5xx, timeout, tema inexistente.
6. **C091-0 Verificar entrada F8.** Versión publicada con `manifestHash` persistido ([f08-02](f08-02-manifiesto-version-inmutable-y-nueva-version.md)).
7. **C091-1 Intención y claim.** RPC transaccional; test con dos solicitudes simultáneas ⇒ un intento.
8. **C091-2 Envío y resultado.** Enviar fuera de transacción; persistir resultado con criterios de RQ-C3; auditoría en la transacción de resultado; errores definitivos vs. inciertos clasificados por tabla de RQ-C3.
9. **C092-0 Reconciliación.** Algoritmo que consulta el lector Mirror y, si el diseño de RQ-C3 lo prevé, el recibo del SDK; decide `registrar / permanecer incierto / reintentar / error`.
10. **C092-1 Reintento.** Solo tras ausencia concluyente; nuevo intento con claim y mismo payload; matriz de tests.
11. **C092-2 Endpoint y estado.** `POST` reconciliar/reintentar y `GET`; mensajes que no afirman registro sin comprobación.

## 7. Validación (ejecución pendiente — no ejecutado)

Ninguna validación utiliza credenciales ni red real; el smoke real es `MVP-134` con autorización expresa.

| Check | Cobertura | Estado |
| --- | --- | --- |
| `lint`, `typecheck`, `test`, `test:boundaries`, `build` | `server-only`, `build` sin inicializar el SDK | no ejecutado |
| Vitest Node con dobles (cliente y Mirror) | Red inválida rechazada; payload sin datos privados; clasificación definitivo/incierto; Mirror con retraso/indisponible/mismatch/reinicio; el estado `registrado` solo con criterio completo; mismo PDF/hash en todos los reintentos | no ejecutado |
| Vitest contra **Postgres local real**, conexiones independientes | Intención persistida antes de enviar; un solo intento activo bajo concurrencia; caída simulada tras enviar ⇒ intento incierto conservado y reconciliable; intentos sin borrado; la versión finalizada no cambia ante el fallo | no ejecutado |
| Playwright | No aplica en este plan; la UI del sello pertenece a `MVP-077/116` y el flujo completo a `MVP-121` | no aplica |
| Smoke real Testnet | `MVP-134` (autorización y credenciales fuera del repo); **no se ejecuta aquí** | no ejecutado |

Una prueba que usa dobles no acredita el comportamiento de Hedera real; esa evidencia llega solo con `MVP-134`.

## 8. Referencias a completar

Documentos objetivo **disponibles** y enlazados; los parámetros operativos (entropía, vigencia, cuotas, límites, perfil y tiempos) siguen siendo propuestas **no aprobadas** hasta que F1 (`MVP-011/012/013`) los registre. Este plan consume los documentos y no los reescribe.

| ID | Documento | Qué necesita este plan |
| --- | --- | --- |
| RQ-C3 | [`manifest-hcs`](../../../design/manifest-hcs.md) | Payload exacto del mensaje y su versionado; identificador opaco; criterio de recibo/Mirror para `registrado`; tabla de errores definitivos vs. inciertos; criterios de ausencia concluyente y de ventana de validez; tiempos y reintentos acotados del Mirror; tratamiento de reinicio de Testnet; si el topic usa clave de envío |
| RQ-C2 | [`data-transactions`](../../../design/data-transactions.md) | Tablas de intento/registro, claim de intento único, RPC de intención y resultado, permisos |

## 9. Decisiones pendientes

- **PD-01** Los criterios de ausencia concluyente y las ventanas/tiempos son de `MVP-012` (RQ-C3); no se inventan.
- **PD-02** El origen Mirror pertenece a la configuración de confianza versionada de RQ-C3 (`mirrorOrigin`), no al visitante. Al implementar se fija su nombre de configuración/variable, si hace falta; no se deja abierta la decisión de aceptar URLs arbitrarias.
- **PD-03** Creación del topic y fondeo de la cuenta de Testnet son acciones live sujetas a autorización (`MVP-134`); este plan asume `HEDERA_TOPIC_ID` ya provisto.
- **PD-04** RQ-C3 exige topic con submit key controlada por servidor; quedan pendientes su aprovisionamiento/custodia y el material de configuración, no la decisión estructural de restringir escritura.

## 10. Rollback y recuperación

- Antes de integrar: descartar rama; sin efectos externos (todo con dobles).
- Tras integrar: revertir el código; intentos y registros ya persistidos **no se borran**. No hay rollback de mensajes en HCS (son inmutables en la red): por eso el envío exige intención persistida y reconciliación previa a cualquier reintento.
- Si un intento queda incierto sin evidencia: mantener `pendiente`, repetir reconciliación; nunca enviar otra transacción “por si acaso”.
- Credenciales comprometidas o expuestas por error: rotar fuera del repo y documentar el incidente sin copiar valores.

## 11. Cierre

Con integración y evidencia real (los criterios que exigen red real los acredita `MVP-134`), actualizar solo las filas `MVP-090`, `MVP-091`, `MVP-092` y `MVP-093` y el recuento del §3 del maestro; archivar al cerrar las cuatro. Documentar no marca nada. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

[Maestro](../mvp-master-plan.md) · [PRD](../../GALCOA-PRD-v1.4.md) · [Arquitectura](../../../architecture.md)
