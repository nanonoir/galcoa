# F8-02 — Manifiesto, versión inmutable y nueva versión

**Estado: planificado (no iniciado).** Ninguna tarea de este plan está implementada ni validada.

Tareas del maestro: `MVP-082`, `MVP-083`, `MVP-084`

Referencias: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3.11–3.12, §5, §8, §9, §12.2, 12.6–7, 12.10–11, 12.13, REQ-09) · [arquitectura](../../../architecture.md) · [fundaciones](../../../design/mvp-shared-foundations.md) (SH-01, SH-03, SH-05, SH-06, SH-09) · [desarrollo](../../../development.md#checks-según-el-cambio) · [maestro](../mvp-master-plan.md).

## 1. Alcance

Sobre los bytes canónicos del PDF ya en staging ([f08-01](f08-01-finalizacion-durable-y-pdf-canonico.md)): construir el manifiesto de dos niveles y sus hashes, persistir PDF y versión de forma inmutable y durable (Storage privado + Postgres), y encadenar versiones posteriores en el mismo chat sin tocar las anteriores.

**Fuera:** claim, constancias y render (plan anterior); HCS (F9); verificación pública (F10). Este plan **no** envía nada a Hedera.

## 2. Dependencias y entrada exacta

| Tarea | Depende de (maestro) | Entrada requerida |
| --- | --- | --- |
| `MVP-082` | `MVP-081`, `MVP-012` | PDF canónico en staging con hash/longitud; **decisión `MVP-012` documentada** ([RQ-C3](#8-referencias-a-completar)): perfil de canonicalización, forma del compromiso público, nonce, vectores de prueba |
| `MVP-083` | `MVP-082`, `MVP-024` | Manifiesto y hashes; bucket privado y políticas de Storage con prueba de dos usuarios (`MVP-024`) |
| `MVP-084` | `MVP-083`, `MVP-070` | Versión v1 publicada; revisión/snapshot ([f07-01](f07-01-revision-congelada-y-confirmacion-autor.md)) para una modificación posterior |

Entradas no formales: Postgres y Storage **locales** (CLI de Supabase local) para los tests; no se usa el proyecto remoto de `MVP-026`.

## 3. Requisitos e invariantes aplicables

REQ-09, REQ-16, REQ-03 (contexto del chat), REQ-10 (preparación del vínculo). INV-05, INV-06, INV-07, INV-15, INV-17, INV-18. [SH-06](../../../design/mvp-shared-foundations.md#sh-06--manifiesto-privado-prueba-pública-y-hcs-incierto) (dos niveles, nonce, no publicar detalle), [SH-05](../../../design/mvp-shared-foundations.md#sh-05--finalización-durable-sin-infraestructura-adicional) (un solo PDF; upload ok/commit fallido; sin overwrite), [SH-01](../../../design/mvp-shared-foundations.md#sh-01--identidades-y-ciclo-de-vida-separados) (`versionId`/`previousVersionId`).

## 4. Objetivo y aceptación por ID

**`MVP-082` — Manifiesto canónico y hashes.**

- [ ] SHA-256 sobre los **bytes persistidos del PDF**; nunca sobre texto extraído ni JSON serializado incidentalmente.
- [ ] Estructura de dos niveles (SH-06): detalle privado (snapshot/revisión, evidencias, reportes, constancias, antecedente y sus hashes, nonce aleatorio privado persistido) → `privateDetailHash`; compromiso público `{ schemaVersion, pdfHash, privateDetailHash, referencia pública opaca }` → `manifestHash`. No son dos raíces alternativas; el hash no entra en su propio preimage.
- [ ] Serialización canónica versionada según el perfil de `MVP-012`; los vectores de prueba de ese perfil pasan.
- [ ] Mismos datos + mismo nonce persistido ⇒ mismo manifiesto y hashes (reproducible). El nonce se genera una vez, se persiste **antes** de calcular y no cambia en reintentos.
- [ ] El detalle privado relaciona PDF, evidencias, reporte, constancias y la versión anterior (PRD §9); no incluye IDs de usuario/documento ni nombres en el compromiso público.
- [ ] La referencia pública es opaca y distinta de token de invitación y de PK privada.

**`MVP-083` — Persistencia inmutable de la versión.**

- [ ] Subida al bucket privado con nombre reservado y **sin sobrescritura**; antes de referenciar se comprueba hash y longitud contra el staging.
- [ ] Publicación bajo claim vigente en una RPC: inserta la versión inmutable (PDF, hashes, manifiesto privado y envelope público, antecedente), marca finalización y audita; no vuelve a modificar la operación.
- [ ] Caso upload ok / commit fallido: el reintento inspecciona el objeto reservado, compara hash/longitud con el staging y lo referencia sin volver a renderizar. Si falta el objeto, sube los mismos bytes. Si los bytes difieren: error técnico, nunca overwrite silencioso.
- [ ] Un fallo de Storage o de la RPC no deja `finalizado` ni `hcsStatus` alterado; la versión no existe hasta publicarse.
- [ ] UPDATE/DELETE de versión, PDF, hashes y manifiesto rechazados por BD (INV-05, INV-18); un worker tardío con fencing viejo no puede publicar.
- [ ] El sello HCS queda en `no_iniciado` al publicar; su inicio y fallos pertenecen a F9. La versión es válida aunque el sello falle luego.
- [ ] Los huérfanos (objetos sin referencia) se tratan según RQ-C2 y nunca se borra un artefacto referenciado.

**`MVP-084` — Nueva versión en el mismo chat.**

- [ ] Una modificación posterior sigue el flujo normal (borrador → revisión → confirmaciones) y produce v2 con `previousVersionId` = v1, con v1 byte a byte intacta (PDF, hashes, manifiesto, constancias).
- [ ] El antecedente se resuelve **bajo el bloqueo del claim** como última versión finalizada del documento (no al congelar), con unicidad que impide bifurcaciones.
- [ ] Una devolución o anexo posterior crea otra versión; el historial no reescribe el relato de la entrega original (PRD §12.2, 12.10).
- [ ] El documento conserva el mismo chat/`documentId`; el historial lista versiones en orden con finalización y sello como estados independientes. Una versión histórica finalizada coexiste con un nuevo borrador sin que se le atribuya el estado de la revisión nueva (SH-03).

## 5. Rutas, propiedad y fronteras

Todo del líder.

| Superficie | Contenido |
| --- | --- |
| `src/lib/documents/manifest/` (propuesta, `server-only`) | Canonicalizador versionado, nonce, `privateDetailHash`, envelope público y `manifestHash`; funciones puras donde sea posible |
| `src/lib/documents/versions/` (propuesta, `server-only`) | Publicación, recuperación upload/commit, encadenamiento de antecedente |
| `src/lib/supabase/` | Adapter de Storage privado (sin overwrite) y RPC `publish_version` (provisional) |
| `supabase/migrations/` | Tablas/constraints de versión inmutable, unicidad de antecedente, columnas de envelope público y localizadores; nueva migración |
| `src/lib/contracts/` | Esquemas de versión y de envelope público: de `MVP-021` |
| `src/app/api/documents/[id]/versions/` (propuesta) | Lectura de historial (solo propietario); descarga mediante URL firmada **breve** al propietario si se requiere |
| `tests/server/`, `tests/contracts/` | Vitest, vectores canónicos, BD y Storage locales |

**DTO.** Historial: id/antecedente, revisión/snapshot, estado de finalización, estado de sello, sin rutas ni URLs persistentes. El envelope público se persiste para F10 pero no lo expone este plan.

## 6. Pasos ejecutables

1. **C082-0 Verificar entrada.** `MVP-012` documentado con vectores; PDF en staging disponible. Sin `MVP-012`, bloquear solo `MVP-082` y avanzar el esquema de versión y el adaptador de Storage.
2. **C082-1 Canonicalizador.** Implementar el perfil exacto de RQ-C3; ejecutar sus vectores como tests; casos de Unicode, números, nulos y orden de colecciones.
3. **C082-2 Nonce y detalle privado.** Generación única y persistida antes del cálculo; construcción desde datos persistidos (no recibidos del navegador).
4. **C082-3 Envelope y `manifestHash`.** Calcular en servidor; test de reproducibilidad y de que un cambio de un byte del PDF cambia `pdfHash` y `manifestHash`.
5. **C083-0 Adaptador de Storage.** Subida sin sobrescritura; lectura para verificación hash/longitud; errores técnicos estables.
6. **C083-1 RPC de publicación.** Claim + fencing vigentes; inserción inmutable, transición final y auditoría en una transacción. Constraints/triggers de inmutabilidad (probados con casos negativos).
7. **C083-2 Matriz de recuperación.** Implementar y probar cada caso: caída antes de staging, staging sin upload, upload sin commit, objeto con bytes distintos, worker tardío.
8. **C083-3 Orfandad.** Procedimiento acotado de RQ-C2; test de que no borra referenciados.
9. **C084-0 Encadenamiento.** Resolución del antecedente bajo bloqueo; restricción única; test de dos claims de revisiones distintas del mismo documento.
10. **C084-1 Nueva versión extremo a extremo (servidor).** Fixture: v1 finalizada → modificación → v2; comprobar v1 intacta, historial ordenado, escenario de devolución (PRD §12.10).
11. **C084-2 Historial.** Proyección para la UI de historial (`MVP-116` la consume).

## 7. Validación (ejecución pendiente — no ejecutado)

| Check | Cobertura | Estado |
| --- | --- | --- |
| `lint`, `typecheck`, `test`, `test:boundaries`, `build` | Módulos nuevos `server-only`; `build` sin inicializar proveedores | no ejecutado |
| Vitest Node: vectores canónicos, reproducibilidad, un byte cambia los hashes, ausencia de PII/identificadores privados en el envelope público | PRD §12.7, 12.13 | no ejecutado |
| Vitest contra **Postgres + Storage locales reales**: inmutabilidad (UPDATE/DELETE rechazados), publicación concurrente (una gana), fencing, upload ok/commit fallido, bytes distintos ⇒ error, antecedente único bajo concurrencia, usuario B sin acceso a archivos de A | PRD §12.1–2, 12.6, 12.10–11 | no ejecutado |
| Vitest con dobles | Fallo de Storage: no `finalizado`; no hay HCS ni PDF anticipados | no ejecutado |
| Playwright | Opcional en este plan; el historial se verifica con `MVP-116/121` | no ejecutado |

No hay llamadas a Hedera ni a proveedores de IA.

## 8. Referencias a completar

Documentos objetivo **disponibles** y enlazados; los parámetros operativos (entropía, vigencia, cuotas, límites, perfil y tiempos) siguen siendo propuestas **no aprobadas** hasta que F1 (`MVP-011/012/013`) los registre. Este plan consume los documentos y no los reescribe.

| ID | Documento | Qué necesita este plan |
| --- | --- | --- |
| RQ-C3 | [`manifest-hcs`](../../../design/manifest-hcs.md) | Perfil canónico con vectores, forma exacta del envelope, nonce, referencia pública, versionado de esquema (decisión `MVP-012`) |
| RQ-C2 | [`data-transactions`](../../../design/data-transactions.md) | Tablas de versión y artefactos, RPC de publicación, unicidad de antecedente, limpieza de huérfanos, permisos y `search_path` |
| RQ-C1 | [`review-confirmation`](../../../specs/review-confirmation.md) | Cómo se inicia una modificación posterior desde una versión (PD-02) y rotulado de devoluciones |

## 9. Decisiones pendientes

- **PD-01** Todo el perfil canónico depende de `MVP-012`; hasta entonces `MVP-082` no puede cerrarse.
- **PD-02** Cómo nace el borrador de una modificación posterior (copiar la operación de v1 como propuesta inicial u otro mecanismo) lo comparten F4/F5 y RQ-C1; este plan prueba el encadenamiento con borradores de fixture y **no** define el comportamiento del chat.
- **PD-03** Cota de tamaño del PDF y política de retención de huérfanos: RQ-C2.

## 10. Rollback y recuperación

- Antes de integrar: descartar rama y recrear base/Storage locales.
- Migraciones aplicadas en entorno compartido: no se editan; corrección con migración nueva. Versiones ya publicadas **no se borran ni reescriben**: un error se corrige con una versión posterior.
- Un fallo parcial se recupera por la matriz de §6 (reintento idempotente que inspecciona staging y objeto reservado).
- Ante sospecha de bytes divergentes entre staging y objeto: detener la finalización, conservar ambos artefactos, abandonar la operación por la RPC de f08-01 y reportar; no sobrescribir.

## 11. Cierre

Con integración y evidencia real, actualizar solo las filas `MVP-082`, `MVP-083` y `MVP-084` y el recuento del §3 del maestro; archivar al cerrar las tres. Documentar no marca nada. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

[Maestro](../mvp-master-plan.md) · [PRD](../../GALCOA-PRD-v1.4.md) · [Arquitectura](../../../architecture.md)
