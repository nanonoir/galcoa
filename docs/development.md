# Desarrollo, validación y seguridad

La [arquitectura](architecture.md) define límites y propiedad. Esta guía explica cómo desarrollar presentación sin credenciales; no acredita integraciones reales del PRD.

## Inicio desde un clon limpio

1. Usar Node **24.18.0** (`.nvmrc`) y npm **>=11**; lockfile generado con npm 11.16.0.
2. Ejecutar `npm ci`. No copiar `.env` para desarrollar presentación.
3. Ejecutar `npm run preview:ui` y abrir la URL de loopback indicada por Vite.
4. Elegir un escenario ficticio y trabajar solo en los archivos autorizados por la tarea.
5. Ejecutar los checks relevantes y entregar resultados reales, no supuestos.

La aplicación Next se inicia por separado con `npm run dev`; aún muestra la plantilla, no el dashboard del preview. Vite sirve exclusivamente la previsualización local, Vitest ejecuta unidades/componentes y Playwright prueba navegador/E2E. Ninguna herramienta exige un agente específico.

## Escenarios y autoridad

`src/mocks/dashboard.ts` contiene ocho escenarios: carga, error, vacío, entrega comercial contradictoria, medición sin unidad, confirmaciones pendientes y versión finalizada con HCS pendiente/registrado. Sus DTO se validan con Zod. Props de la presentación en `src/features/dashboard/contracts/dashboard-view.ts`.

Los callbacks del preview solo muestran eventos locales y no persisten. Rechazo, confirmación, finalización y HCS reales se implementarán en servidor. No llevar fixtures a rutas de producto ni simular éxito cuando falle un proveedor. Contratos y registro del preview los cambia el líder; el colaborador pide ampliación del ticket si los necesita modificar.

## Checks según el cambio

| Cambio | Validación |
| --- | --- |
| Solo Markdown | Enlaces locales, coherencia y diff sin secretos |
| Contratos, escenarios, componentes o utilidades | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries` |
| Rutas, configuración, dependencias o CSS global | Los anteriores y `npm run build` |
| Interacciones o preview/navegación | Los anteriores y `npm run test:e2e` |
| Lógica crítica futura | Tests deterministas del PRD §12, con proveedores simulados; integración real solo cuando esté autorizada |

`npm test` es finito. `npm run test:watch` solo se usa localmente. Vitest no verifica Server Components asíncronos ni aislamiento RLS real; Playwright y pruebas de integración cubrirán los flujos al implementarlos. La evaluación de IA sigue separada, sin llamadas a modelos en cada PR.

`typecheck` ejecuta `next typegen` antes de TypeScript: genera `next-env.d.ts` y tipos de rutas como `LayoutProps` desde un clon limpio, sin depender de un build/dev previo ni versionar archivos generados.

## Base local, migraciones y RLS

Requiere Docker. Las migraciones están en `supabase/migrations/` (aditivas; una migración integrada no se edita, se corrige con otra) y la configuración local en `supabase/config.toml`.

1. `npx supabase start`: levanta Postgres/Auth/Storage locales con claves efímeras propias de la instancia (no se versionan ni se leen de `.env`).
2. `npm run test:rls`: suite con base real (`vitest.rls.config.ts`, `tests/server/rls/`). Ejecuta `supabase db reset --local --no-seed` antes de correr (migración desde cero) y comprueba catálogo (RLS en toda tabla, buckets privados, grants), aislamiento entre usuarios A/B/`anon` y triggers de inmutabilidad/append-only. `RLS_SKIP_RESET=1` omite el reset al iterar. No forma parte de `npm test`.
3. `npx supabase stop` al terminar.

Límites: un superusuario puede deshabilitar triggers (la protección es contra los roles de aplicación); la simulación de roles con `SET ROLE` no prueba escalada de roles, por eso el catálogo verifica los roles alcanzables desde `authenticator`; el rol `galcoa_executor` (NOLOGIN, sin permisos) se completa con las RPC de cada tarea; la suite en CI es de `MVP-131`. Los helpers de `tests/server/rls/harness.ts` los reutiliza `MVP-120`.

## Harness de tests de servidor (MVP-120)

Tres niveles, cada uno con su comando y lo que **no** acredita:

| Comando | Qué ejecuta | Requiere |
| --- | --- | --- |
| `npm test` (proyecto `server`; solo: `npx vitest run --project server`) | `tests/server/**` salvo `rls/` y `local/`: dobles guionados (`tests/server/doubles/`), reloj y bloqueo de red (`support/`), builders validados con Zod (`builders/`), puente de test (`bridge/`) y guards | Nada: sin Docker ni credenciales |
| `npm run test:server:local` | `tests/server/local/**` contra Postgres/Auth locales reales: usuarios A/B/`anon` y concurrencia con conexiones independientes (un `psql` o cliente por llamada, aserciones por `pg_backend_pid`). Hace `supabase db reset --local --no-seed` antes | Docker + `npx supabase start` |
| `npm run test:rls` | Suite RLS/grants/inmutabilidad de `MVP-024` | Docker + `npx supabase start` |

Si falta Docker o la pila local, `test:server:local` y `test:rls` **fallan** con un mensaje explícito (globalSetup compartido); nunca se omiten en silencio. `RLS_SKIP_RESET=1` omite el reset. Una base real acredita SQL/RLS locales, no Supabase cloud, SMTP ni proveedores; los dobles no acreditan integración.

- **`server-only`** se sustituye por `tests/server/support/server-only-sentinel.ts` solo en `vitest.config.ts` (proyecto `server`), `vitest.server-local.config.ts` y el bundle del puente. Next y el producto conservan el import real (hay tests que lo comprueban); `eslint` prohíbe que `src/` importe `tests/`.
- **Dobles**: `scriptedGeminiModel` se inyecta en `createModel` del puerto real; `ScriptedBehavior` (éxito, fallo, salida inválida, latencia con reloj de test, cuelgue hasta cancelar, resultado incierto) es la base de los dobles de Groq (`scriptedGroqClient`, `createClient` del puerto), Storage (`createInMemoryEvidenceStorage`, puerto `EvidenceStorage`), HCS (`scriptedHcsTransport`) y Mirror (`scriptedMirrorFetch`), todos contra los puertos reales y sin SDK ni red. Cada doble acredita el comportamiento del puerto, no el adaptador real.
- **Puente Node para Playwright** (`tests/server/bridge/build.ts`): `buildTestBridge({ entry })` compila con la API programática de Vite (`configFile:false`, `envDir:false`, SSR/ESM, alias `@/` y `server-only` solo ahí) a `node_modules/.cache/galcoa-tests/<runId>/handlers.mjs`; aplica los guards (`guards.ts`) y lanza si el grafo incluye `src/app`, `next/*`, SDK reales de IA/HCS o dependencias fuera de la lista permitida; `smokeImportBridge` importa el ESM en un proceso Node limpio; `cleanup()` borra solo su directorio. `entry.ts` expone `createBridgeHandlers`, que cablea las factories reales de servicio/handler a dependencias explícitas. No es un servidor ni un clon de la app y no acredita el transporte HTTP de Next (`MVP-134`).
- **Auth del puente:** `createLocalAuthContext({ url, publishableKey, cookies })` acepta exclusivamente `http://127.0.0.1:54321` (sin credenciales, query ni rutas), la clave pública efímera obtenida del CLI y cookies `{ name, value }` efectivas de la petición. Rechaza URLs ajenas y claves privilegiadas antes de crear el cliente. Devuelve `{ session, cookieChanges, cookieHeaders }`; pasa `session` a las factories y propaga cambios de cookies/headers a la respuesta interceptada. Usa las mismas `createSessionClient` y `createSessionPort` de producto (`auth.getUser()`, caché por petición), con `EnvReader` explícito; no acepta UID ni lee `.env`. Solo `@supabase/ssr` y `@supabase/supabase-js` habilitan el runtime Auth/RPC real; los imports nombrados permiten eliminar helpers Next no usados y los guards siguen rechazando su composición de petición. `local/auth-bridge.test.ts` ejerce el ESM en Node limpio contra Auth local, A/B/sin sesión/cookies inválidas/refresco; el almacén de dominio es memoria explícita (no acredita persistencia). Concurrencia SQL y RLS mantienen sus suites reales separadas.

## Navegador y CI

Instalar Chromium antes de la primera ejecución: `npx playwright install chromium`. Linux/CI: `npx playwright install --with-deps chromium`. Playwright arranca y limpia sus servidores propios; si el puerto ya está ocupado, resolver la colisión sin terminar procesos ajenos. No reutilizar una instancia desconocida para obtener un resultado verde.

El workflow `.github/workflows/ci.yml` define `npm ci`, lint, tipos, Vitest, barreras, build y Playwright en Ubuntu, sin secretos de aplicación. Descargas de npm, Chromium y fuentes de `next/font` requieren red pública; no son llamadas a Supabase, IA o Hedera con credenciales. Evidencia browser fallida tiene retención de siete días y debe contener únicamente datos ficticios.

La ejecución base de Linux en GitHub Actions fue comprobada verde en el PR de integración y push a `develop` (ver [f00-integracion-base-ci](exec-plans/completed/f00-integracion-base-ci.md)). Un workflow y `CODEOWNERS` no activan protección de ramas ni otorgan permisos; la configuración de branch protection es opcional posthackathon y el CI ampliado con pruebas de servidor/RLS corresponde a `MVP-131`.

### CI ampliado (MVP-131)

`validate` conserva todos sus checks (incluido `npm test`, con los dobles y guards del puente). El job independiente `local-server-db` usa Docker de Ubuntu y la CLI Supabase instalada por `npm ci`, sin servicios cloud ni secretos configurados. Arranca la pila del repositorio y ejecuta **en serie**, con reset compartido antes de cada suite:

1. `npm run test:rls`.
2. `npm run test:server:local`.
3. `npx vitest run --config tests/server/persistence/vitest.local.config.ts`.
4. `npx vitest run --config tests/server/persistence/executor/vitest.local.config.ts`.
5. `npx vitest run --config tests/server/routes/vitest.local.config.ts`.
6. `npm run test:e2e:auth` (opt-in activo por su runner, tres casos reales con Auth/Mailpit locales, puerto 3217).

`scripts/ci-local.mjs` invoca directamente los mismos entrypoints bloqueados, fuerza reset y captura stdout/stderr de CLI y tests: solo publica progreso/resultado, nunca claves efímeras, correos, cookies ni errores crudos. Falla sin omitir suites si faltan prerrequisitos. No sube artefactos de este job; Auth ya deshabilita trazas, vídeos y capturas. `always()` detiene únicamente `galcoa` en ese runner desechable. El lanzador rechaza ejecución fuera de GitHub Linux para no resetear bases compartidas; para reproducir usar los comandos anteriores con reserva exclusiva de DB y no publicar logs privados.

No acredita la matriz futura MVP-121, seguridad pendiente MVP-130, evaluación IA, smoke remoto, Vercel ni proveedores reales. CI sigue siendo señal, no gate universal; no configura branch protection ni checks requeridos.

## Entorno y seguridad

- El único archivo local de entorno es **`.env`** en la raíz. `.env*` sigue ignorado (salvo `.env.example`) y los agentes no lo leen ni imprimen. `.env.example` se versiona con nombres del PRD; solo lleva valores no secretos por defecto.
- Instalar el `.env` que facilita el usuario (adjunto o ruta): `npm run env:install -- <ruta>`. Copia con el sistema de archivos sin leer el contenido, no sobrescribe un `.env` existente y no hace `git add`. Si el destino existe, pedir autorización.
- `npm run env:check` (también como `predev`, `prebuild` y `prestart`, y por tanto en el servidor de Playwright) falla si existen `.env.local`, `.env.development(.local)`, `.env.production(.local)` o `.env.test(.local)`: Next los carga **con precedencia sobre `.env`**. Solo mira nombres; el usuario decide moverlos o borrarlos. `.env.local` sigue en `.gitignore` por protección.
- Vitest y el preview Vite no cargan `.env`: las pruebas usan dobles y datos ficticios. Una prueba de integración autorizada deberá cargar `.env` de forma explícita.
- Local y Vercel usan los **mismos nombres** (los de `.env.example`). En Vercel se definen en Project Settings → Environment Variables por entorno (Production, Preview, Development); no se sube `.env`. Cambia el valor, no el nombre:

  | Variable | Local (`.env`) | Vercel |
  | --- | --- | --- |
  | `NEXT_PUBLIC_APP_URL` | URL de `npm run dev` (p. ej. `http://localhost:3000`) | Dominio de Production; en Preview la URL del deploy (Vercel expone `VERCEL_URL` sin esquema como variable de sistema). No basta con asumir una sola |
  | `NEXT_PUBLIC_SUPABASE_*` | Proyecto Supabase de desarrollo | Proyecto que corresponda al entorno; son `NEXT_PUBLIC_*` y se incrustan **en build**: cambiarlas exige redeploy |
  | `SUPABASE_SECRET_KEY`, claves IA, `HEDERA_OPERATOR_*` | Solo servidor | Solo servidor, nunca `NEXT_PUBLIC_*`; Preview puede usar credenciales distintas de Production |
  | `HEDERA_NETWORK` | `testnet` | `testnet` en todos los entornos (P0) |

  Las URLs de redirección de Supabase Auth se configuran en Supabase, no en el `.env`.
- Solo `NEXT_PUBLIC_*` puede llegar al cliente; claves IA/Hedera y futuras claves privilegiadas Supabase son exclusivamente de servidor.
- La plantilla local anterior se preservó sin inspeccionarla como `.env.example.local`, ignorada. Quien clone no necesita ese archivo.
- Preview sin carga de archivos de entorno ni inyección de secretos; datos ficticios, sin persistencia y solo loopback. No sirve para compartir una demo por red.
- Supabase Auth/RLS, migraciones, rutas, integraciones y claves solo dentro del alcance explícito del pedido/ticket del líder. HCS únicamente Testnet, sin herramientas abiertas para agentes (INV-04).
- Auditoría: registrar resultado completo y de producción por separado. Las incidencias dev conocidas no se ocultan ni justifican `npm audit fix --force`; consultar [deuda](exec-plans/tech-debt-tracker.md).

## Entrega del colaborador

Issue con objetivo, referencias, allowlist, props, escenarios y aceptación → rama corta → PR con checks y capturas → revisión/merge del líder. La [plantilla de Issue](../.github/ISSUE_TEMPLATE/frontend-task.md) y la [plantilla de PR](../.github/pull_request_template.md) ayudan a no depender de esta conversación.

El líder puede preparar infraestructura desde un pedido/plan sin crear Issues para cada paso. Diferencias de dependencias se resuelven en ese alcance explícito, no como limpieza oportunista. Los SDK de IA (`ai`, `@ai-sdk/react`, `groq-sdk`) y `server-only` ya están instalados; otras dependencias nuevas (p. ej. QR) se agregan con su consumidor y decisión del líder.

[Índice](README.md) · [Arquitectura](architecture.md) · [PRD](exec-plans/GALCOA-PRD-v1.4.md)
