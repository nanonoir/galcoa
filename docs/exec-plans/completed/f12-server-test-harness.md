# F12 · Harness de tests de servidor

**Estado: completado e integrado.** PR #79 mergeado en `develop` (`c865be2eed21abfaae863e678fbbfbd5a2706593`), tras PR #42/#45/#68. ExecPlan derivado del [plan maestro](../active/mvp-master-plan.md), fila `MVP-120`. Los checkpoints de §8 conservan su estado histórico; el resultado definitivo figura al final.

Tareas del maestro: `MVP-120`

Producto: [PRD v1.5](../GALCOA-PRD-v1.4.md) (REQ-18; §12). Fundaciones: [mvp-shared-foundations](../../design/mvp-shared-foundations.md) (SH-04, SH-05, SH-09). Costuras de tests: [data-transactions §7](../../design/data-transactions.md#7-costuras-de-tests-y-evidencia). Evidencia: [release-validation](../../specs/release-validation.md). Arquitectura: [herramientas y próximas integraciones](../../architecture.md#herramientas-de-la-base-y-próximas-integraciones). Checks: [desarrollo](../../development.md#checks-según-el-cambio).

## 1. Objetivo y alcance

Entregar la **infraestructura de pruebas** que usan las tareas de servidor y la matriz [`f12-critical-flow-matrix-and-e2e`](../active/mvp/f12-critical-flow-matrix-and-e2e.md): base local de pruebas reproducible sin credenciales, dobles de Gemini, Groq, Storage y HCS, y constructores de datos ficticios. Se ejecuta **primero**; la matriz completa (`MVP-121`) depende de este plan, no al revés, para evitar ciclos.

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

Todo es del **Líder** (config de tests y `tests/`, ver [arquitectura](../../architecture.md#árbol-objetivo-y-propiedad)). El colaborador no participa.

| Zona | Contenido |
| --- | --- |
| `vitest.config.ts` (proyecto Node de servidor) y scripts de `package.json` | Proyectos separados: dobles (sin Docker) y base local (con Supabase local). El alias de `server-only` a un centinela vacío vive **solo** en esta configuración de test |
| `supabase/config.toml` (solo configuración **local**) | Si no existe aún, se crea; la configuración de Auth cloud no se toca aquí |
| `tests/server/` | Setup, builders, dobles de proveedores, el entrypoint y el build programático Vite del puente Node para Playwright ([§7 del diseño](../../design/data-transactions.md#puente-node-para-playwright-bundle-exclusivo-de-test)) y los tests del propio harness. **Los helpers de dos usuarios/RLS y el script RLS los posee `MVP-024`** (`tests/server/rls/`, ver [`f02-esquema-migraciones-rls`](f02-esquema-migraciones-rls.md)); `MVP-120` los reutiliza y amplía, sin duplicar helper ni crear otra convención |
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

H1–H7 completados. Los pendientes históricos de §8 quedaron resueltos por el checkpoint 3 y la integración de PR #79.

- [x] **H1 · Proyectos Vitest de servidor** (← `MVP-002`). Entorno Node, resolución de `@/*`, setup propio; `npm test` por defecto no exige Docker ni credenciales. Casos negativos que prueban que un test falla cuando debe. *Hecho:* proyecto `server` en `vitest.config.ts` (alias de `server-only` solo ahí) y `vitest.server-local.config.ts` para la base real (script `test:server:local`).
- [x] **H2 · Dobles de proveedores** (← H1). Implementan el mismo contrato que el servicio real; comportamientos configurables por test (éxito, fallo, latencia, cancelación, salida inválida contra Zod, resultado incierto de HCS). Sin red y sin credenciales; verificar con un test que ningún doble hace `fetch`/importa SDK real. *Hecho:* motor `ScriptedBehavior`, reloj, bloqueo de red y dobles contra los puertos reales: `scriptedGeminiModel` (MVP-050), `scriptedGroqClient` (`createClient` de `createGroqStructuredPort`, MVP-053), `createInMemoryEvidenceStorage` (`EvidenceStorage`, MVP-042/043; `failNext`, `put` para objeto ya presente o subida sin commit), `scriptedHcsTransport` (`HcsTransport` de `createHcsClient`: recibo, rechazo terminal, timeout incierto con efecto aplicado) y `scriptedMirrorFetch` (`fetch` de `createMirrorReader`: coincide, 404, 5xx, red caída, respuesta inválida, retraso con reloj). Tests en `tests/server/harness/provider-doubles.test.ts`; el test de aislamiento recorre también los dobles nuevos. Límite: el doble de Storage cumple el puerto, no prueba el adaptador real de Supabase Storage (MVP-083).
- [x] **H3 · Base Supabase local efímera** (← `MVP-023`, H1). Procedimiento reproducible para levantar y reiniciar el stack local, aplicar migraciones desde cero y sembrar. Las claves son efímeras de la herramienta local (no se leen `.env` ni proyectos remotos). Prerrequisitos del entorno (CLI de Supabase y Docker) documentados; si faltan, el proyecto de base local **falla explícitamente**, no se omite en silencio. Config local de Auth (p. ej. confirmación de email desactivada **solo en local**) separada de cloud, que mantiene su valor por defecto. *Hecho:* reutiliza `supabase/config.toml`, `db reset` y el globalSetup de `MVP-024`; prueba de fallo explícito sin prerrequisitos (`tests/server/harness/local-failfast.test.ts`).
- [x] **H4 · Usuarios y builders** (← H3). *Hecho:* helpers de `tests/server/rls/harness.ts` reutilizados sin cambios; builders validados con los contratos Zod en `tests/server/builders/`. Reutilizar el seed y los helpers de usuarios A/B/`anon` y el script RLS de `MVP-024` (ampliarlos, no duplicarlos ni introducir otra convención); builders deterministas con datos ficticios, IDs/fechas estables.
- [x] **H5 · Concurrencia real** (← H2, H3). *Hecho sin dependencia nueva:* `tests/server/local/concurrency.ts` lanza un `psql` independiente por llamada (helper de `MVP-024`); el test exige backends distintos (`pg_backend_pid`) y una sola decisión bajo contención del índice único. Helper que lanza N llamadas independientes (clientes/conexiones distintas) y devuelve resultados para afirmar una sola decisión; no `Promise.all` sobre un único doble en memoria. Decisión local abierta: si las aserciones directas contra Postgres necesitan una dependencia de desarrollo nueva (cliente SQL), requiere aprobación del líder; alternativa sin dependencia nueva: aserciones vía API y RPC de la propia pila local.
- [x] **H6 · Puente Node para Playwright** (← H2, H4). Implementado conforme a [data-transactions §7](../../design/data-transactions.md#puente-node-para-playwright-bundle-exclusivo-de-test): Vite 8.3.4 programático, salida ESM Node/SSR aislada, alias exclusivos de test, factories reales cableadas a puertos explícitos, guards de grafo/artefacto y smoke en Node limpio. Los tests usan un `cacheRoot` propio por caso/archivo; teardown solo elimina hijos directos dentro del caché del puente. El pendiente histórico de cookies/Auth local y la lista permitida de SDK Supabase se resolvieron en checkpoint 3. No hay flag productivo, clon, UID inventado ni servidor HTTP alternativo; SDK/adapters reales de IA/HCS y composición Next siguen rechazados.
- [x] **H7 · Documentar y validar** (← H4, H5, H6). Documentado en `docs/development.md`; instalación limpia sin `.env`, checks y revalidación local/RLS completados (§8 y resultado final). Casos negativos de barreras y build Next sin alias conservan `server-only`.

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

Integrado en `develop` vía PR #42 (merge 7f130e5). MVP-120 sigue **en_curso**: H2, H6 y H7 parciales; este PR no cierra el Issue #32.

Revisión independiente posterior y fix acotado, 2026-10-16 · rama `fix/server-harness-review`: (1) el test de aislamiento escaneaba texto crudo y daba falso positivo con un comentario de `src/lib/documents/ports.ts` (CI de `develop`, run 38918967900); ahora analiza solo imports/exports/`require`/`import()` reales con el parser de TypeScript ya instalado, con regresión (comentario aceptado, import real rechazado); (2) el build del puente usa `envDir: false` en lugar de `envFile: false` (marcado `@deprecated` en los tipos de Vite 8.3.4 instalado); (3) `@react-pdf` se agrega a los módulos prohibidos, simétrico con los externos, con casos negativos. Checks: `vitest --project server` 97 pasan, `npm test` 342 pasan, `test:boundaries` 67, `lint`, `typecheck` y `build` sin errores. No se re-ejecutó `test:server:local` ni `test:rls` (sin DB local; el fix no toca fixtures ni SQL). Límite: la revisión fue verificación focal de los hallazgos, no una nueva revisión independiente.

Checkpoint 2, 2026-10-16 · rama `flow/32-harness` (base fd3139e) · worktree nuevo sin `.env`, `npm.cmd ci` desde el lockfile · Node v24.18.0, Vitest 5.0.5 · sin red de proveedores ni Supabase: `npx vitest run --project server` 377 pasan (20 archivos, 3 ejecuciones consecutivas); `npm test` 689 pasan (36 archivos); `test:boundaries` 67; `lint`, `typecheck` y `build` sin errores. No ejecutado: `test:server:local` y `test:rls` (no se levantó Docker/Supabase local, recurso compartido); no se probó el helper de Auth (pendiente). Hallazgo: dos archivos de test que construyen en el mismo caché del puente compiten con la comparación antes/después de `bridge.test.ts`; por eso las pruebas del entry viven en ese mismo archivo.

No acredita `MVP-121`, el transporte HTTP de Next (`MVP-134`) ni cloud/proveedores.

### Checkpoint 3 · Issue #32 H6/H7 (2026-10-16)

Base actualizada por `git fetch origin && git merge origin/develop` (fast-forward a `5eed6e1`), sin reset ni cambios SQL. Auth #9 ya estaba integrado por PR #70/#75. No se tocó su plan completado.

Resultado final tras añadir la fixture negativa de composición Auth/Next: `npm test` **925/925**, puente focal **26/26**, eslint focal correcto. `supabase stop` ejecutado: únicamente siguen activos los dos contenedores `entrenar-*` ajenos. Sin procesos ni stack de esta tarea pendientes.

- Resuelto el pendiente técnico H6: `entry.ts` exporta `createLocalAuthContext({ url, publishableKey, cookies }) → { session, cookieChanges, cookieHeaders }`, usando **las mismas** factories nombradas de `auth.ts`/`session.ts`. El primer intento con Vite funcionó: tree-shaking elimina helpers Next y el guard efectivo rechaza tanto `next/headers` directo como `getCurrentSession` (fixture de composición productiva). Se permite explícitamente `@supabase/ssr` junto a `@supabase/supabase-js` solo para runtime Auth/RPC local. No fue necesario separar módulos productores de MVP-025/030 (Issues #6/#8); **cero cambios `src/**`**, cero duplicación de lógica Auth, cero dependencia nueva.
- URL restringida a loopback IPv4/puerto 54321, sin credenciales/ruta/query/hash, y clave pública comprobada antes del cliente/fetch. Configuración del CLI local inyectada mediante `EnvReader`; no se lee `.env`, no se acepta UID, ni se pasa `service_role` al pipeline. La clave privilegiada solo permanece en el helper de seed compartido de MVP-024.
- `tests/server/local/auth-bridge.test.ts` reutiliza `createTestUser` y `readLocalStack`: cookies SSR reales de A/B adaptadas por `createSessionClient`, ESM ejercido en procesos Node limpios, dominio `createEvidenceService` a través de `createBridgeHandlers` (A permitido, B no disponible, sin cookies no sesión), cookies corruptas/token inválido, cookie vencida con refresco real y devolución de cookies/headers. Indisponibilidad usa respuesta 500 de transporte **explícitamente simulada** sobre el cliente real, conserva `AUTH_UNAVAILABLE` y caché por request; no acredita caída real de Auth. Almacén de dominio en memoria explícito: no se presenta como persistencia SQL.
- H7: este worktree nuevo ya tenía `npm ci` sin `.env` (checkpoint 2); comprobaciones actuales sin copiar entorno: `test:server:local` **8/8** (2 archivos; reset local desde las cuatro migraciones integradas), `test:rls` **119/119**, `npm test` **924/924** (49 archivos, antes de añadir la última fixture negativa), `test:boundaries` **67/67**, lint/typecheck/build correctos. Tras la última fixture, puente focal **26/26**. Build Next normal conserva `server-only`; no se modificaron alias productivos ni guardas Next/IA/HCS. Autorrevisión focal, sin revisor independiente: aceptación corresponde al coordinador.
- Docker inspeccionado antes de arrancar: solo `entrenar-*` ajenos, intactos. Esta tarea arrancó únicamente Supabase `galcoa`, reseteó solo su DB local y lo detiene al terminar. Sin cloud, Gemini/Groq/Hedera ni email real. Pendiente de revisión/integración del nuevo PR; **MVP-120 sigue en_curso**, sin cierre de #32/#6/#8 ni archivado.

## 9. Referencias a completar y decisiones locales

- **RQ-D1** → [release-validation](../../specs/release-validation.md) (§1–§2): qué acredita cada nivel de evidencia (doble vs local real vs remoto) y aislamiento del entorno; este plan las consume sin duplicarlas.
- **RQ-D2** → no aplica.
- **Ubicación de los dobles (resuelta):** los dobles de Gemini, Groq, Storage y HCS/Mirror viven en `tests/server/`, no en `src/mocks/`, porque la barrera de `src/mocks/**` solo permite importar contratos. Se comprueba con casos positivos y negativos de barrera, sin relajar reglas globales.
- **E2E del flujo crítico (resuelto por diseño):** el mecanismo es el puente de bundle de test de [data-transactions §7](../../design/data-transactions.md#puente-node-para-playwright-bundle-exclusivo-de-test) (H6); la composición y su límite transparente los consume la matriz de `MVP-121` ([`f12-critical-flow-matrix-and-e2e`](../active/mvp/f12-critical-flow-matrix-and-e2e.md)). No se inventa otro.
- **`server-only` bajo Vitest (resuelto por diseño):** alias a centinela vacío solo en la configuración de test de Vitest; el runner Node de Playwright usa el bundle de H6, no hereda ese alias.

## 10. Rollback y límites

- Reversible: configuración y carpetas de tests; revertir el cambio no afecta código de producto. Nada se despliega ni se persiste fuera de la pila local efímera.
- Límites: sin `.env`, sin cloud, sin proveedores; sin dependencias nuevas sin aprobación del líder; sin commit/push/merge sin autorización.

## 11. Cierre

Aceptación completada con PR #79 integrado en `develop`; fila `MVP-120` y recuento del maestro reconciliados. Archivado bajo `completed/`, con referencias actualizadas. No acredita `MVP-121` ni REQ-18 completo; el plan global de ejecución sigue activo.

## Resultado de implementación

### Implementado

H1–H7: runner sin Docker por defecto, dobles de todos los puertos externos, builders, pila local reutilizando MVP-024 y concurrencia con conexiones independientes. Puente ESM exclusivo de tests con factories reales, cookies verificadas por `getUser` contra Auth local, refresco y propagación de cookies, guards de grafo/artefacto y teardown acotado. Sin cambios de producto, alias productivos, secretos ni proveedores reales.

### Desviaciones del diseño

No fue necesario separar módulos Auth productores: imports nombrados de las factories existentes y tree-shaking eliminan la composición Next. Los guards y la fixture negativa de composición Auth/Next protegen ese límite. Se permiten explícitamente los SDK Supabase para Auth/RPC local; no se relajan los guards de IA/HCS. La indisponibilidad de Auth se simula en transporte y el almacén del smoke de dominio es en memoria: no acreditan caída real ni persistencia SQL.

### Validación

Evidencia del implementador, commit `626c6a1`, integrada por PR #79: **925 unitarios, 26 del puente focal, 8 servidor local, 119 RLS y 67 barreras**; lint, typecheck y build correctos. Instalación `npm ci` en worktree nuevo sin `.env`. Los 26 focales no se suman al total unitario. Pila propia detenida; contenedores ajenos `entrenar-*` preservados.

Revisión independiente `ses_eb9e9b4a3ffeMEzYFAGccx2Lo1`: **PASS WITH FINDINGS**, sin bloqueantes; reejecutó únicamente los 26 tests del puente, en lectura y sin DB. Se usan los conteos del implementador, no los conteos locales/RLS intercambiados en el párrafo final del revisor. CI `validate` de PR #79 verde antes del merge. Este cierre documental no reejecuta suites ni proveedores.

Hallazgos menores: siete negativos locales comprueban rechazo sin fijar siempre el mensaje exacto (el puente cubre validaciones focales y clave privilegiada); JWT `anon` sin firma aceptado solo para Auth local, sin elevar privilegios; tree-shaking respaldado por guard del artefacto. No requieren deuda nueva ni bloquean la aceptación.

Validación documental del cierre: JSON de publicación/manifest válidos; 73 IDs (22 completados, 27 en curso, 24 pendientes), solo fila MVP-120 modificada; catálogo de 36 planes (27 activos y 9 archivados). Comprobados 111 Markdown no generados y 887 enlaces relativos: sin roturas del harness; quedan dos enlaces F2 preexistentes en clientes Supabase y entorno remoto, fuera de alcance. El enlace F2 propio se resolvió al mover este plan. `git diff --check` correcto. PRD, specs y diseño ya alineados, sin cambios canónicos de comportamiento.

### Seguimiento

MVP-121 conserva matriz y evidencia compuesta de navegador Next + handlers; MVP-131, CI servidor/RLS ampliado; MVP-134, transporte HTTP Next íntegro con adapters reales y autorización específica. No se cierra REQ-18 ni otros IDs. Issue #32 se cierra operativamente solo después del merge documental, por el coordinador.
