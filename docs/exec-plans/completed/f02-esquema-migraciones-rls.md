# ExecPlan F2 — Esquema SQL, migraciones y RLS/Storage con prueba de dos usuarios

**Estado: implementado (MVP-022/023/024), rama `issue/5-esquema-rls`.** Estados en el [maestro](../active/mvp-master-plan.md).

Tareas del maestro: `MVP-022`, `MVP-023`, `MVP-024`

Requisitos PRD: REQ-17 y REQ-01 (aislamiento), REQ-15 (auditoría); [§8 y §12.1](../GALCOA-PRD-v1.4.md); INV-05, INV-08, INV-11–14, INV-18.

Referencias: [fundaciones SH-01, SH-04, SH-05, SH-07, SH-09](../../design/mvp-shared-foundations.md) · [arquitectura](../../architecture.md) · [desarrollo](../../development.md) · [plan de contratos](f02-contratos-dominio.md) · [decisiones de confirmación y sello](f01-decisiones-confirmacion-y-sello.md).

## Precondiciones y checkpoints

- `MVP-022` depende en el maestro de `MVP-021`, `MVP-011` y `MVP-012`: con `MVP-021` integrada se puede **bosquejar** el SQL de C1, pero empezar la implementación de `MVP-022`/`MVP-023` exige además `MVP-011` y `MVP-012` documentadas; no se marcan ni se inician como ejecución antes. `MVP-022` → `MVP-023` → `MVP-024` en cadena.
- Parte del diseño **RQ-A1** ([data-transactions](../../design/data-transactions.md), ya disponible; ver abajo) antes de `MVP-022`: define tablas, locks, permisos de RPC, staging y leases.
- Checkpoints por migración (aditivos): **C1 núcleo** (`documents`, `messages`, `evidences`/extracciones, `drafts`, `verification_reports`, `audit_events`, claves de idempotencia) se bosqueja con `MVP-021` + RQ-A1, y su implementación espera a `MVP-011/012`; **C2 revisión** (revisiones, snapshots, solicitudes y respuestas) usa el registro de `MVP-011` para columnas de capacidad; **C3 versión y sello** (versiones, finalización durable/staging, `hedera_registrations` e intentos) usa `MVP-012`.
- Si `MVP-011` o `MVP-012` no están documentadas, no se inicia la implementación de `MVP-022/023` (solo el bosquejo de C1 y el diseño RQ-A1). Una vez ambas existan, las migraciones siguen siendo aditivas por checkpoint y las tres tareas no pasan a `completada` hasta cubrir C1–C3. Las RPC y consumidores posteriores traen su propia migración; no se concentra DDL grande en este plan.
- Todo es local: Supabase **local** con credenciales efímeras de la propia instancia; ningún proyecto remoto y ninguna credencial privada (el remoto es [`MVP-026`](../active/mvp/f02-entorno-supabase-remoto.md)).

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-022 | Diseño con las tablas del PRD §8 (revisiones y snapshots separados de versiones; invitaciones y respuestas con constraint/FK compuesta documento-revisión-snapshot-participante), inmutabilidad de versiones finalizadas, auditoría solo-agregar, claves de idempotencia (actor/recurso/acción + fingerprint), permisos mínimos de RPC y `search_path` seguro. Documentado en RQ-A1 solo lo que elimina ambigüedad. |
| MVP-023 | `supabase/migrations/` aplicable desde cero en la base local. Constraints y triggers de inmutabilidad/append-only con casos negativos probados: update/delete de auditoría y de versiones finalizadas rechazados; unicidad de respuesta por invitación y versión por revisión; mezcla de documento/revisión/snapshot rechazada. |
| MVP-024 | RLS activo en toda tabla expuesta y políticas de Storage privado; buckets no públicos. Con base real local, el usuario A no ve documentos, archivos ni respuestas de B (ni `anon`), y no puede listar, leer ni escribir objetos ajenos (PRD §12.1). |

## Alcance, roles y carpetas

- Rol: **Líder** (zona sensible: Auth/RLS, migraciones). Sin colaborador.
- Permitido: `supabase/` (configuración local y `migrations/`), `tests/server/rls/` y su configuración de Vitest, un script npm de pruebas con base (p. ej. `test:rls`, propuesta), `docs/design/data-transactions.md` solo si el líder pide ajustar RQ-A1, `docs/development.md` (flujo local).
- Prohibido: clientes de aplicación (`MVP-025`), código de servicios/RPC de negocio de otras tareas (cada una trae su migración), proyectos remotos, `.env*`, fixtures de producto, relajar barreras.
- Una migración aplicada no se edita: se corrige con otra nueva. Las RPC de confirmar/finalizar nacen con sus tareas (`MVP-070+`) siguiendo las convenciones de RQ-A1.

## Contratos

- Insumos: contratos de `MVP-020/021`, PRD §8, SH-01/04/05. Salidas: migraciones versionadas, políticas, buckets privados, helpers de prueba con dos usuarios reutilizables por `MVP-120`.
- Credenciales: las genera/expone la instancia local en cada ejecución y se consumen en proceso (variables de entorno de la sesión o salida de la CLI); no se versionan ni se leen de archivos `.env` privados.

## Pasos

1. Comprobar que la CLI `supabase` (devDependency) y su runtime de contenedores están disponibles y confirmar sus subcomandos con la ayuda de la versión instalada; no asumir comandos.
2. Leer RQ-A1 ([data-transactions](../../design/data-transactions.md)) y revisar contra los contratos de `MVP-021`.
3. `MVP-022` (con `MVP-021`, `MVP-011` y `MVP-012` disponibles): cerrar el diseño por checkpoints C1–C3 sin copiar el DDL completo en el documento.
4. `MVP-023` C1 (solo tras `MVP-022`, que exige `MVP-011/012`): inicializar `supabase/` y escribir las migraciones del núcleo; probar aplicar desde cero y reaplicar tras reset.
5. `MVP-023` C2/C3 cuando cumplan precondiciones; añadir triggers de inmutabilidad y pruebas negativas.
6. `MVP-024`: habilitar RLS y políticas por propietario; buckets privados para evidencias y PDF finales; sin acceso `anon` a tablas privadas.
7. Pruebas: crear usuarios A y B en la instancia local y comprobar tablas y Storage; añadir un chequeo de catálogo que falle si una tabla expuesta no tiene RLS.
8. Decidir con el líder cómo corre esta suite: proyecto Vitest propio y script aparte para que `npm test` no falle sin base; coordinar con `MVP-120` y `MVP-131` para CI.

## Pruebas

Postgres/Supabase local real (SH-09): migración desde cero, RLS y Storage con dos usuarios y `anon`, inmutabilidad, append-only, unicidad y FK compuestas. Las pruebas concurrentes de confirmar/rechazar/finalizar se escriben con sus RPC (`MVP-074`, `MVP-080`) usando conexiones reales independientes, no `Promise.all` sobre mocks. Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries` y la suite con base local.

## Seguridad, permisos y rollback

- Sin secretos; sin llamadas remotas. Funciones privilegiadas solo con alcance explícito y permisos mínimos; ninguna como bypass general de RLS (SH-04).
- Rollback: en local, reset de la base; el historial de migraciones es solo hacia adelante y toda corrección es otra migración. Cambios destructivos requieren confirmación del líder.

## Riesgos

- Falta de runtime de contenedores en el equipo: bloquea la verificación real local; no se sustituye por mocks para cerrar `MVP-024`.
- Un superusuario puede deshabilitar triggers: documentarlo; la protección es contra roles de aplicación.
- Implementar `MVP-022/023` sin `MVP-011/012`: se evita con la precondición del maestro; antes solo se bosqueja C1.
- Tests con base que afecten a `npm test` por defecto: separar script.

## Decisiones pendientes

- Estructura exacta de tablas de revisión/snapshot, staging de finalización y nombres de buckets: RQ-A1 fija el modelo y los límites; los nombres exactos los cierra `MVP-022` (SH-01 los deja ahí).
- Cómo se ejecuta la suite con base en CI: `MVP-131`.

## Referencias a completar

- **RQ-A1** — Diseño [data-transactions](../../design/data-transactions.md): modelo y propiedad de las escrituras, locks y orden de bloqueo, catálogo de comandos y permisos, claves de idempotencia, finalización durable/fencing, RLS/Storage, costuras de tests (§7) y ownership de migraciones (§8). Documento objetivo disponible; los parámetros operativos pendientes (`MVP-010/011/012/013/014/025/026`) siguen abiertos. Consumidor: este plan y luego `MVP-040`, `MVP-044`, `MVP-070…075`, `MVP-080…083`, `MVP-091/092`.

## Checklist

- [x] `MVP-011` y `MVP-012` documentadas (precondición para implementar `MVP-022/023`).
- [x] RQ-A1 (documento disponible) revisado contra los contratos de `MVP-021`.
- [x] `MVP-022` cerrado (C1, C2, C3).
- [x] Migraciones C1 aplicables desde cero.
- [x] Migraciones C2 y C3 con pruebas negativas.
- [x] RLS y buckets privados con prueba de dos usuarios y `anon`.
- [x] Chequeo de catálogo de RLS y suite documentada.
- [x] Filas de `MVP-022`, `MVP-023`, `MVP-024` actualizadas.

## Progreso y evidencia

2026-10-16, Supabase local (CLI 2.121.0, Docker). Migraciones aditivas: `20261016000100_c1_core`, `20261016000200_c2_revision`, `20261016000300_c3_version_seal`, `20261016000400_rls_storage`. RLS en las 24 tablas; `authenticated` solo SELECT por propietario; `anon` y `service_role` sin grants; tablas solo-servidor sin lectura; buckets privados `evidences-private` y `versions-private`.

Evidencia: `npm run test:rls` 3 archivos, 119 tests (reset desde cero en cada ejecución); `npm run lint` y `npm run typecheck` OK; `npm test` 224; `npm run test:boundaries` 66.

Integración: PR #38 mergeado en `develop` (`fbd4c75`).

Revisión independiente posterior (sesión `ses_ebaeed9a9ffeccyZyQQgy7716a`, tras el merge): PASS WITH FINDINGS. Ejecutó `npm run lint`, `npm run typecheck`, 224 tests, 66 de barreras y `npm run build` (PASS); inspeccionó el SQL (24 tablas con RLS y sus políticas) y los 119 tests de la base. **No volvió a ejecutar la suite RLS** (la base local estaba apagada). Único hallazgo: error documental en el maestro (`pendiente` sustituido por `completada` en tres textos), corregido en una rama posterior. Esta revisión no fue previa al merge.

Límites: la revisión independiente fue posterior al merge y sin re-ejecución de la suite con base; un superusuario puede deshabilitar triggers; `SET ROLE` no prueba escalada de roles (se verifica en catálogo); el CI de la suite RLS queda en MVP-131; `galcoa_executor` sin permisos hasta las RPC de cada tarea.

## Cierre

Actualizar **solo** las filas `MVP-022`, `MVP-023` y `MVP-024` (evidencia con comandos reales, rama/PR) y recontar §3 tras integrar. Archivar en [`completed/`](). Dobles o tests sin base real no acreditan `MVP-024`. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
