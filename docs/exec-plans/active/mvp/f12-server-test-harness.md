# F12 · Harness de tests de servidor

**Estado: en curso (checkpoint parcial H1–H5 y build del puente H6 en la rama `issue/32-server-test-harness`; ver §6 y §8).** ExecPlan derivado del [plan maestro](../mvp-master-plan.md) (fila de `MVP-120`). El maestro conserva IDs, estados y evidencia; este plan no los modifica.

Tareas del maestro: `MVP-120`

Producto: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (REQ-18; §12). Fundaciones: [mvp-shared-foundations](../../../design/mvp-shared-foundations.md) (SH-04, SH-05, SH-09). Costuras de tests: [data-transactions §7](../../../design/data-transactions.md#7-costuras-de-tests-y-evidencia). Evidencia: [release-validation](../../../specs/release-validation.md). Arquitectura: [herramientas y próximas integraciones](../../../architecture.md#herramientas-de-la-base-y-próximas-integraciones). Checks: [desarrollo](../../../development.md#checks-según-el-cambio).

## 1. Objetivo y alcance

Entregar la **infraestructura de pruebas** que usan las tareas de servidor y la matriz [`f12-critical-flow-matrix-and-e2e`](f12-critical-flow-matrix-and-e2e.md): base local de pruebas reproducible sin credenciales, dobles de Gemini, Groq, Storage y HCS, y constructores de datos ficticios. Se ejecuta **primero**; la matriz completa (`MVP-121`) depende de este plan, no al revés, para evitar ciclos.

Entra: configuración Vitest para servidor, arranque/reinicio de Supabase **local** efímero, seed de dos usuarios, dobles, builders, helpers de concurrencia real, documentación del comando. No entra: los 15 casos del PRD §12 (`MVP-121`), pruebas de cada servicio (cada tarea trae las suyas), CI (`MVP-131`), Supabase cloud, proveedores reales.

## 2. Trazabilidad

| Fuente | Aplicación |
| --- | --- |
| REQ-18; PRD §12.1–§12.15 | Base técnica para los tests de servidor y RLS |
| SH-09 | Separación: Vitest con dobles vs Postgres/Supabase local real; tests concurrentes con conexiones reales independientes, no `Promise.all` contra mocks |
| SH-04, SH-05 | Necesidad de probar RPC concurrentes, claim/lease, fallos entre checkpoints |
| INV-04, INV-06 | Los dobles de HCS/IA no habilitan herramientas abiertas ni envían datos privados |

## 3. Dependencias

- Del maestro: `MVP-023` (migraciones aplicables desde cero), `MVP-002` (Vitest, Playwright, barreras; completada heredada).
- Habilita: `MVP-121`, `MVP-131` (CI ampliado) y los tests concurrentes de F7–F9. No bloquea a las tareas que usan solo dobles: pueden adoptar los dobles desde H2 sin esperar a la base local (H3).
- Por paso: H1 ← `MVP-002`; H2 ← H1; H3 ← `MVP-023`, H1; H4 ← H3; H5 ← H2, H3; H6 ← H2, H4 (y las factories de handlers/Auth de los planes productores para el smoke del import); H7 ← H4, H5, H6.

## 4. Archivos: propiedad y límites

Todo es del **Líder** (config de tests y `tests/`, ver [arquitectura](../../../architecture.md#árbol-objetivo-y-propiedad)). El colaborador no participa.

| Zona | Contenido |
| --- | --- |
| `vitest.config.ts` (proyecto Node de servidor) y scripts de `package.json` | Proyectos separados: dobles (sin Docker) y base local (con Supabase local). El alias de `server-only` a un centinela vacío vive **solo** en esta configuración de test |
| `supabase/config.toml` (solo configuración **local**) | Si no existe aún, se crea; la configuración de Auth cloud no se toca aquí |
| `tests/server/` | Setup, builders, dobles de proveedores, el entrypoint y el build programático Vite del puente Node para Playwright ([§7 del diseño](../../../design/data-transactions.md#puente-node-para-playwright-bundle-exclusivo-de-test)) y los tests del propio harness. **Los helpers de dos usuarios/RLS y el script RLS los posee `MVP-024`** (`tests/server/rls/`, ver [`f02-esquema-migraciones-rls`](f02-esquema-migraciones-rls.md)); `MVP-120` los reutiliza y amplía, sin duplicar helper ni crear otra convención |
| `src/mocks/` | Solo escenarios de contratos; **no** alberga dobles de proveedores (la barrera solo permite contratos allí) |
| `src/lib/**` | **Sin cambios por este plan**; los servicios con consumidor real reciben dependencias explícitas por constructor/factory local al dominio (diseño §7), no una bandera de mock ni un contenedor DI genérico; esas factories las introduce cada plan productor |

Principio: **no hay fallback mock en producción** (maestro §2). Los dobles se inyectan desde el test; ningún código de producto elige un doble por variable de entorno, flag productivo, ruta de pruebas ni clon de la aplicación.

## 5. Insumos y salidas

| Insumo | Salida |
| --- | --- |
| Migraciones `supabase/migrations/` (`MVP-023`) | Base local reproducible: migraciones aplicadas desde cero antes del suite |
| Contratos Zod (`MVP-020/021`) | Builders de documento, mensaje, evidencia, borrador, revisión, snapshot, invitación, respuesta, versión |
| Interfaces de servicios (`MVP-050/053/083/090`) | Dobles: Gemini (streaming, fallo, cancelación), Groq (tres resultados, salida inválida), Storage (subida OK/commit fallido/objeto ya presente), HCS y Mirror (éxito, timeout incierto, retraso, indisponibilidad) |
| — | Helpers: reutiliza los de usuario A/B/anon de `MVP-024` (`tests/server/rls/`); añade ejecución concurrente sobre **conexiones independientes**, reloj controlable |

## 6. Pasos y checkpoints

H1, H3, H4 y H5 hechos; H2, H6 y H7 parciales (el motivo y lo pendiente están en cada paso). Ningún paso se marca hecho si depende de un puerto o factory que aún no existe en `develop`.

- [x] **H1 · Proyectos Vitest de servidor** (← `MVP-002`). Entorno Node, resolución de `@/*`, setup propio; `npm test` por defecto no exige Docker ni credenciales. Casos negativos que prueban que un test falla cuando debe. *Hecho:* proyecto `server` en `vitest.config.ts` (alias de `server-only` solo ahí) y `vitest.server-local.config.ts` para la base real (script `test:server:local`).
- [ ] **H2 · Dobles de proveedores** (← H1). *Parcial:* hecho el motor `ScriptedBehavior` (éxito, fallo, inválido, latencia con reloj de test, cuelgue hasta cancelar, resultado incierto), el reloj, el bloqueo de red y `scriptedGeminiModel` contra el puerto real de MVP-050. **Pendiente:** dobles de Groq, Storage y HCS/Mirror; sus puertos (`MVP-053/083/090`) no existen en `develop` y no se inventan contratos. Implementan el mismo contrato que el servicio real; comportamientos configurables por test (éxito, fallo, latencia, cancelación, salida inválida contra Zod, resultado incierto de HCS). Sin red y sin credenciales; verificar con un test que ningún doble hace `fetch`/importa SDK real.
- [x] **H3 · Base Supabase local efímera** (← `MVP-023`, H1). Procedimiento reproducible para levantar y reiniciar el stack local, aplicar migraciones desde cero y sembrar. Las claves son efímeras de la herramienta local (no se leen `.env` ni proyectos remotos). Prerrequisitos del entorno (CLI de Supabase y Docker) documentados; si faltan, el proyecto de base local **falla explícitamente**, no se omite en silencio. Config local de Auth (p. ej. confirmación de email desactivada **solo en local**) separada de cloud, que mantiene su valor por defecto. *Hecho:* reutiliza `supabase/config.toml`, `db reset` y el globalSetup de `MVP-024`; prueba de fallo explícito sin prerrequisitos (`tests/server/harness/local-failfast.test.ts`).
- [x] **H4 · Usuarios y builders** (← H3). *Hecho:* helpers de `tests/server/rls/harness.ts` reutilizados sin cambios; builders validados con los contratos Zod en `tests/server/builders/`. Reutilizar el seed y los helpers de usuarios A/B/`anon` y el script RLS de `MVP-024` (ampliarlos, no duplicarlos ni introducir otra convención); builders deterministas con datos ficticios, IDs/fechas estables.
- [x] **H5 · Concurrencia real** (← H2, H3). *Hecho sin dependencia nueva:* `tests/server/local/concurrency.ts` lanza un `psql` independiente por llamada (helper de `MVP-024`); el test exige backends distintos (`pg_backend_pid`) y una sola decisión bajo contención del índice único. Helper que lanza N llamadas independientes (clientes/conexiones distintas) y devuelve resultados para afirmar una sola decisión; no `Promise.all` sobre un único doble en memoria. Decisión local abierta: si las aserciones directas contra Postgres necesitan una dependencia de desarrollo nueva (cliente SQL), requiere aprobación del líder; alternativa sin dependencia nueva: aserciones vía API y RPC de la propia pila local.
- [ ] **H6 · Puente Node para Playwright** (← H2, H4). Implementar lo decidido en [data-transactions §7](../../../design/data-transactions.md#puente-node-para-playwright-bundle-exclusivo-de-test): build programático Vite con `configFile:false` y configuración inline, salida ESM Node/SSR en un directorio aislado por ejecución, alias `@/`→`src/` y `server-only`→centinela **solo en este bundle**, puertos de Gemini/Groq/Storage/HCS/Mirror recibidos de `tests/server/`, helper de contexto de Auth que valida cookies contra Auth **local** (sin `next/headers` ni `userId` inventado), guards de grafo/artefacto (rechaza `src/app/`, `next/headers`, composición productiva y adapters/SDK reales de IA/HCS) y teardown que elimina solo su directorio. Comprobar opciones exactas contra el Vite instalado y ejecutar un smoke del import ESM antes de declarar el harness funcional; un fallo del prestep es explícito. Sin mecanismo de inyección abierto, flag productivo, clon de la app ni servidor HTTP alternativo. *Parcial:* hecho `tests/server/bridge/` (build Vite 8.3.4 programático, guards sobre el grafo y los externos, smoke ESM en proceso Node limpio, teardown acotado, casos negativos). **Pendiente:** importar en `entry.ts` las factories de handlers y el helper de contexto de Auth (cookies validadas contra Auth local) que deben aportar los planes productores; no existen en `develop` y `src/lib/**` no se toca aquí. La detección de «composición productiva» hoy cubre `src/app`, `next/*` y SDK/adapters reales; se afinará con los nombres reales de esas composiciones.
- [ ] **H7 · Documentar y validar** (← H4, H5, H6). *Parcial:* documentado en `docs/development.md` («Harness de tests de servidor»), con barreras (`src/` no importa `tests/`, `server-only` conservado en Next) y checks ejecutados (§8). **Pendiente:** reproducción desde un clon limpio sin `.env` y revalidación tras completar H2/H6. Sección en `docs/development.md` (edición del líder, acotada a estos comandos) con cómo correr cada proyecto; ejecutar `npm run lint`, `typecheck`, `test`, `test:boundaries` y el proyecto de base local; reproducir desde un clon limpio **sin** `.env`; incluir los casos negativos de barreras (producto no importa `tests/`, build Next sin alias conserva `server-only`).

## 7. Validación

| Qué | Cómo | Qué NO prueba |
| --- | --- | --- |
| Dobles y builders | Vitest sin Docker | RLS, proveedores reales |
| Base local | Proyecto separado con Supabase local: migraciones desde cero, seed A/B | Cloud Supabase, Auth con SMTP real, Vercel |
| Concurrencia | Conexiones independientes, repetible | Carga de producción |
| Puente Node del bundle de test | Smoke del import ESM y guards de grafo/artefacto | El cableado HTTP de todas las mutaciones Next ni un E2E Next íntegro con adapters reales (`MVP-134`) |

CI no se modifica aquí; `MVP-131` incorpora estos proyectos. Sin llamadas a proveedores ni a servicios remotos.

## 8. Evidencia

Checkpoint parcial, 2026-10-16 · rama `issue/32-server-test-harness` (base `origin/develop` d78dd78) · Node v24.18.0, Docker 29.6.1, Supabase CLI 2.121.0, Vite 8.3.4 · Windows 11 · sin `.env` ni llamadas remotas:

- `npm run lint`: sin errores. `npm run typecheck`: sin errores. `npm test`: 16 archivos, 282 tests pasan (incluye el proyecto `server`: 52 tests). `npm run test:boundaries`: 67 pasan (incluye el caso nuevo «producto no importa `tests/`»). `npm run build`: correcto.
- `npm run test:server:local` (con `npx supabase start`; `db reset` desde cero): 3 tests pasan, dos ejecuciones. `npm run test:rls`: 119 pasan (sin regresión).
- El bundle rechazó con error de prestep, por la razón esperada: adapter real de Gemini (`@ai-sdk/google`), `src/app`, `next/headers` y dependencia fuera de la lista; no queda directorio generado tras el fallo.

Rama/PR/commit: se registran al integrar. No acredita `MVP-121`, el transporte HTTP de Next (`MVP-134`) ni cloud/proveedores.

## 9. Referencias a completar y decisiones locales

- **RQ-D1** → [release-validation](../../../specs/release-validation.md) (§1–§2): qué acredita cada nivel de evidencia (doble vs local real vs remoto) y aislamiento del entorno; este plan las consume sin duplicarlas.
- **RQ-D2** → no aplica.
- **Ubicación de los dobles (resuelta):** los dobles de Gemini, Groq, Storage y HCS/Mirror viven en `tests/server/`, no en `src/mocks/`, porque la barrera de `src/mocks/**` solo permite importar contratos. Se comprueba con casos positivos y negativos de barrera, sin relajar reglas globales.
- **E2E del flujo crítico (resuelto por diseño):** el mecanismo es el puente de bundle de test de [data-transactions §7](../../../design/data-transactions.md#puente-node-para-playwright-bundle-exclusivo-de-test) (H6); la composición y su límite transparente los consume la matriz de `MVP-121` ([`f12-critical-flow-matrix-and-e2e`](f12-critical-flow-matrix-and-e2e.md)). No se inventa otro.
- **`server-only` bajo Vitest (resuelto por diseño):** alias a centinela vacío solo en la configuración de test de Vitest; el runner Node de Playwright usa el bundle de H6, no hereda ese alias.

## 10. Rollback y límites

- Reversible: configuración y carpetas de tests; revertir el cambio no afecta código de producto. Nada se despliega ni se persiste fuera de la pila local efímera.
- Límites: sin `.env`, sin cloud, sin proveedores; sin dependencias nuevas sin aprobación del líder; sin commit/push/merge sin autorización.

## 11. Cierre

Se completa cuando el harness está **integrado**, reproducible desde un clon limpio sin credenciales y con evidencia real registrada en la fila `MVP-120`. Luego: recuento del §3 del maestro. No acredita `MVP-121` ni REQ-18 completo. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
