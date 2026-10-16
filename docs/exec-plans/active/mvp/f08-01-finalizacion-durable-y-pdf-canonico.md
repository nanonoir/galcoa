# F8-01 — Orquestación de finalización durable y PDF canónico

**Estado: planificado (no iniciado).** Ninguna tarea de este plan está implementada ni validada.

Tareas del maestro: `MVP-080`, `MVP-081`

Referencias: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3.10–3.11, §5, §9, §12.3, 12.13, REQ-09, REQ-16) · [arquitectura](../../../architecture.md) · [fundaciones](../../../design/mvp-shared-foundations.md) (SH-04, SH-05, SH-07, SH-09) · [desarrollo](../../../development.md#checks-según-el-cambio) · [maestro](../mvp-master-plan.md).

## 1. Alcance

Reclamar la finalización solo cuando todas las confirmaciones del mismo snapshot estén persistidas, coordinar una operación recuperable con checkpoints en Postgres (sin Redis, colas, cron ni microservicio) y generar —**solo después del claim**— las constancias, el anexo y **un único PDF canónico** persistido una vez en staging durable.

**Fuera:** manifiesto, hashes de manifiesto, subida a Storage privado y publicación inmutable de la versión (`MVP-082/083`, [f08-02](f08-02-manifiesto-version-inmutable-y-nueva-version.md)); HCS (F9); UI de avance (`MVP-077`). Este plan nunca marca `finalizado`.

## 2. Dependencias y entrada exacta

| Tarea | Depende de (maestro) | Entrada requerida |
| --- | --- | --- |
| `MVP-080` | `MVP-071`, `MVP-075` | Confirmación del autor ([f07-01](f07-01-revision-congelada-y-confirmacion-autor.md)); estado agregado y condición «todas confirmadas, ninguna negativa» ([f07-03](f07-03-estado-agregado-y-pantalla-publica.md)); diseño SQL de operación durable, fases y lease ([RQ-C2](#8-referencias-a-completar)) |
| `MVP-081` | `MVP-080` | Operación con claim vigente y entradas exactas; constancias de respuestas persistidas |

Entradas no formales: tablas de operación y de staging de artefactos de `MVP-022/023`; Postgres local real; la guía de Next relevante para ejecutar `@react-pdf/renderer` en el servidor (leer `node_modules/next/dist/docs/` y la configuración de paquetes externos de servidor antes de tocar `next.config`).

## 3. Requisitos e invariantes aplicables

REQ-08, REQ-09, REQ-16. INV-03 (no confiar en cliente ni IA), INV-05, INV-11, INV-13, INV-17, INV-18. [SH-04](../../../design/mvp-shared-foundations.md#sh-04--autoridad-transaccional-y-respuestas-idempotentes) (reclamar finalización), [SH-05](../../../design/mvp-shared-foundations.md#sh-05--finalización-durable-sin-infraestructura-adicional) (contrato de recuperación completo), [SH-03](../../../design/mvp-shared-foundations.md#sh-03--tiempo-hashes-y-significado-de-los-estados) (tiempo del servidor, bytes concretos).

## 4. Objetivo y aceptación por ID

**`MVP-080` — Orquestación.**

- [ ] El claim exige en una sola unidad atómica: propiedad, revisión/snapshot activos, **todas** las confirmaciones seleccionadas persistidas del mismo snapshot, ninguna negativa. No consulta veredictos del cliente ni de la IA.
- [ ] El claim reserva `versionId`, identidad de objetos y las entradas exactas (snapshot + constancias + versión de renderer) y crea **una** operación durable por revisión; repetir el POST reanuda esa operación, no crea otra versión ni reserva otra identidad.
- [ ] Lease con vencimiento y *fencing*: una petición tardía o de un worker superado no avanza fases ni sustituye al ganador; no basta un booleano `processing`.
- [ ] Antes del claim no existe PDF, anexo ni mensaje HCS. Una revisión con respuesta negativa o confirmaciones faltantes no puede reclamarse (conflicto estable).
- [ ] Mientras hay claim vigente, la revisión no se sustituye por congelación nueva (la comprobación se añade a la RPC de congelar con migración nueva); seguir editando el borrador no altera la entrada. Un abandono explícito antes de publicar invalida claim y escrituras tardías, sin crear confirmación heredada.
- [ ] `GET` de estado de la operación (fase, «en curso / requiere reintento / error recuperable») y `POST` autenticado de reanudación; un timeout HTTP no se toma como fallo ni como permiso para duplicar trabajo.
- [ ] Cada fase termina antes del límite de ejecución del despliegue; si la operación mínima no cabe, se registra la limitación (PD-02), no se simula finalización asíncrona garantizada.
- [ ] Eventos de auditoría en cada transición crítica (claim, abandono, error).

**`MVP-081` — Constancias, anexo y PDF final.**

- [ ] El PDF se renderiza con `@react-pdf/renderer` en servidor desde el **snapshot persistido** (no desde el borrador, la IA ni datos reenviados por el navegador). El contenido de operación del PDF es el acordado, sin cambios.
- [ ] El anexo de constancias se compone **después** de las confirmaciones, de las respuestas persistidas (nombre autodeclarado, decisión, casilla, tiempo del servidor); no altera la operación y no añade constancias tardías a un PDF ya persistido.
- [ ] Lenguaje sin «certificado», «validado regulatoriamente», «garantizado verdadero», «firma digital» ni «identidad verificada»; las confirmaciones se describen como declaraciones realizadas mediante enlace. El caso solo-autor se rotula como declaración sin corroboración de terceros.
- [ ] Los **bytes canónicos** (PDF) se guardan una vez en staging durable con hash SHA-256 y longitud bajo claim vigente; ningún reintento los regenera. La adopción de un artefacto exige claim/fencing vigente.
- [ ] No se promete «exactly once» del render previo al guardado: tras una caída sin bytes guardados puede repetirse un render transitorio sin identidad publicada.
- [ ] Un fallo del renderer o del staging es un impedimento técnico informado, no un éxito ni un PDF parcial; la fase queda reintentable.

## 5. Rutas, propiedad y fronteras

Todo del líder; no se delega.

| Superficie | Contenido |
| --- | --- |
| `src/lib/documents/finalization/` (propuesta, `server-only`) | Servicio de claim/reanudación, máquina de fases, constancias, renderer |
| `src/lib/documents/pdf/` (propuesta, `server-only`) | Componentes `@react-pdf/renderer` y composición de anexo; no se importan desde presentación |
| `src/lib/supabase/` | Adapter de las RPC `claim_finalization`, `advance_phase`, `abandon_finalization` (nombres provisionales, RQ-C2) |
| `supabase/migrations/` | Migraciones nuevas: RPC, tablas/columnas de staging y fencing si no existen en `MVP-022/023`; reemplazo de la RPC de congelar |
| `src/app/api/documents/[id]/revisions/[revisionId]/finalization/` (propuesta) | `GET` estado, `POST` reanudar, `POST` abandonar; handlers delgados |
| `tests/server/`, `tests/e2e/` | Vitest (Postgres local) y navegador mínimo del estado |

**Proveedores.** No hay proveedores externos en este plan: el renderer corre local. No se llama a Storage real; en tests se usa Storage local o un doble propio del adaptador (la subida real es [f08-02](f08-02-manifiesto-version-inmutable-y-nueva-version.md)).

**DTO.** Estado de operación: `{ operationId, phase, status: en_curso | requiere_reintento | error_recuperable | publicada, retryable, correlationId }`; sin rutas ni hashes privados. Los contratos se solicitan a `MVP-021`/RQ-C2.

## 6. Pasos ejecutables

1. **C080-0 Verificar entrada.** Agregado de `MVP-075` integrado; RQ-C2 define tabla de operación (fase, lease, fencing, entradas, artefacto canónico, error). Si falta, bloquear solo esta tarea y avanzar lo puro (máquina de fases, constructor de constancias).
2. **C080-1 Máquina de fases pura.** Tabla de transiciones permitidas y resultado idempotente por fase; sin E/S. Tests exhaustivos de transiciones inválidas.
3. **C080-2 RPC de claim.** Orden de bloqueo estable documento → revisión → operación. Atomicidad de las condiciones del §4. Test con dos conexiones: dos claims simultáneos → un ganador, el otro recibe la operación existente.
4. **C080-3 Lease y fencing.** El claim emite un número de fencing monótono; cada avance de fase lo compara; vencimiento permite recuperación por otra petición. Valor del lease: configurable, definido en RQ-C2 (PD-01).
5. **C080-4 Servicio y handlers.** `GET`/`POST`/abandono; sin confiar en datos del cliente más allá de los identificadores; errores estables.
6. **C080-5 Ajuste de congelar.** Nueva migración que añade a `freeze_revision` la comprobación de claim vigente; test de carrera congelar vs. claim (ver [f07-01](f07-01-revision-congelada-y-confirmacion-autor.md) §6.3).
7. **C081-0 Constancias.** Construir el modelo de constancias desde respuestas persistidas; ordenado de forma determinista.
8. **C081-1 Renderer.** Componentes PDF que muestran el snapshot exacto y, aparte, el anexo; verificar fuentes y caracteres en español; revisar configuración de Next necesaria para el paquete (guía local, sin añadir sin necesidad).
9. **C081-2 Staging canónico.** Bajo claim vigente, `INSERT` de bytes/hash/longitud con unicidad por operación; un segundo intento detecta los bytes existentes y los reutiliza. Fase siguiente: «PDF en staging» (entrega a `MVP-083`).
10. **C081-3 Revisión humana de muestra.** Generar un PDF con datos ficticios y revisar visualmente operación vs. anexo (adjuntar solo evidencia ficticia).

## 7. Validación (ejecución pendiente — no ejecutado)

| Check | Cobertura | Estado |
| --- | --- | --- |
| `lint`, `typecheck`, `test`, `test:boundaries`, `build` | `server-only` en módulos nuevos; `build` sin inicializar renderer ni Supabase | no ejecutado |
| Vitest Node: máquina de fases, constancias, lenguaje prohibido (búsqueda de términos en el texto del PDF/anexo), determinismo del modelo de constancias | PRD §12.5, 12.13 | no ejecutado |
| Vitest contra **Postgres local real**, conexiones independientes: claims concurrentes; claim sin todas las confirmaciones, con rechazo o con revisión sustituida → rechazado; ningún PDF antes del claim; lease vencido y recuperación por otra petición; worker tardío con fencing viejo no escribe; abandono invalida el claim; congelar vs. claim; reintento tras staging reutiliza los mismos bytes | PRD §12.3, 12.11, 12.13; SH-09 | no ejecutado |
| Vitest PDF con dobles de Storage | Mismos bytes y hash en reintento; fallo de staging no avanza fase; un byte distinto en conflicto → error técnico | no ejecutado |
| Playwright | Mínimo: estado de finalización visible y separado (la UI completa llega con `MVP-077`/`MVP-121`) | no ejecutado |

## 8. Referencias a completar

Documentos objetivo **disponibles** y enlazados; los parámetros operativos (entropía, vigencia, cuotas, límites, perfil y tiempos) siguen siendo propuestas **no aprobadas** hasta que F1 (`MVP-011/012/013`) los registre. Este plan consume los documentos y no los reescribe.

| ID | Documento | Qué necesita este plan |
| --- | --- | --- |
| RQ-C1 | [`review-confirmation`](../../../specs/review-confirmation.md) | Contenido y rotulado del anexo de constancias; orden y campos; redacción del caso solo-autor; vocabulario permitido |
| RQ-C2 | [`data-transactions`](../../../design/data-transactions.md) | Tabla de operación (fases, lease, fencing, artefacto canónico, error), RPC de claim/avance/abandono, política de staging y limpieza de huérfanos, permisos mínimos |

## 9. Decisiones pendientes

- **PD-01** Duración del lease y política de reintento: configuración definida en RQ-C2; no se fijan valores aquí.
- **PD-02** Límite de ejecución del despliegue elegido (`MVP-132`) frente a la duración del render: se verifica con documentación oficial de la versión del plan contratado. Si no cabe, se documenta la limitación, no se inventa asincronía garantizada.
- **PD-03** Cota de tamaño del PDF para staging en Postgres: la define RQ-C2; no se inventa aquí.
- **PD-04** Mecanismo con el que una finalización interrumpida se reanuda cuando nadie vuelve a abrir la pantalla: en P0 solo por petición del usuario; cualquier otro (cron, cola) está fuera de P0.

## 10. Rollback y recuperación

- Antes de integrar: descartar la rama; recrear base local. Migraciones no aplicadas fuera de local: eliminar. Aplicadas en entorno compartido: migración correctiva, nunca editar.
- Una operación atascada por lease vencido se recupera por una nueva petición `POST` con fencing; una operación irrecuperable se abandona con la RPC de abandono, que invalida claim y escrituras tardías; la revisión queda disponible para otro intento o para una nueva revisión.
- Los bytes en staging nunca se borran si hay referencia; los huérfanos se limpian solo por el procedimiento de RQ-C2.
- Tras integrar: revertir el código; las operaciones y artefactos ya persistidos se conservan (auditoría).

## 11. Cierre

Con integración y evidencia real, actualizar solo las filas `MVP-080` y `MVP-081` y el recuento del §3 del maestro; archivar al cerrar ambas. Documentar no marca nada. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

[Maestro](../mvp-master-plan.md) · [PRD](../../GALCOA-PRD-v1.4.md) · [Arquitectura](../../../architecture.md)
