# F11 · Integración de dashboard, historial y documento; revisión transversal de accesibilidad y responsive

**Estado: en curso (rama `facu`): MVP-116 parcial, MVP-118 no iniciado (depende de MVP-116, 076 y 101).** ExecPlan derivado del [plan maestro](../mvp-master-plan.md) (filas de `MVP-116` y `MVP-118`). El maestro conserva IDs, estados y evidencia; este plan no los modifica.

Tareas del maestro: `MVP-116`, `MVP-118`

Producto: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (REQ-01, REQ-02, REQ-03; PRD §10). Arquitectura: [dependencias permitidas](../../../architecture.md#dependencias-permitidas-y-barreras). Fundaciones: [mvp-shared-foundations](../../../design/mvp-shared-foundations.md) (SH-02, SH-07, SH-09).

## 1. Objetivo y alcance

**Delegación expresa del usuario, 2026-10-16:** Facu (`@jfacundoayala`) ejecuta #31 y luego #21. Puede editar las páginas y containers de integración de este plan, con sus pruebas, consumiendo Auth, servicios y el container de chat integrados. No modifica Auth, servicios de persistencia, RPC, migraciones, contratos compartidos, configuración global ni dependencias: esas superficies siguen coordinadas por el líder. Las menciones de «Líder» en la tabla de propiedad indican responsabilidad de coordinación; las superficies de presentación y composición quedan delegadas por esta excepción. No se importan fixtures/mocks desde producto ni se inventan endpoints para destrabar un checkpoint.

- **`MVP-116` (Líder):** conectar a datos reales las presentaciones entregadas (dashboard `MVP-111`, historial `MVP-113`) en rutas `(app)` con carga autorizada y DTO hacia containers; crear y reabrir documentos reales; integrar la navegación de la landing. Es además el **dueño final** de `src/app/(app)/documents/[id]/page.tsx`: monta el container de chat entregado por `MVP-054` sin duplicar su implementación.
- **`MVP-118` (Líder):** revisar accesibilidad y responsive de **todas** las pantallas del producto, incluidas las públicas, en móvil y escritorio; corregir o registrar hallazgos.

Son dos checkpoints de un mismo plan porque comparten rutas y pruebas de navegador, pero **`MVP-118` se ejecuta al final y está condicionado por tareas de otros planes**; `MVP-116` no espera a `MVP-118`.

Fuera de alcance: lógica de chat, adjuntos y streaming (`MVP-054`, que entrega el container y sus adapters; aquí solo se monta), confirmación pública (`MVP-076`), verificador (`MVP-101`), formularios de acceso conectados (`MVP-031`, que depende de la presentación `MVP-115` y de `MVP-030`; su integración pertenece al plan de Auth, no a este). Ninguna pantalla nueva de producto.

## 2. Trazabilidad

| ID | REQ / INV / SH | Aceptación (detalle en el maestro) |
| --- | --- | --- |
| `MVP-116` | REQ-02, REQ-01, REQ-03; INV-11; SH-02, SH-07 | Rutas `(app)` autorizadas; DTO serializable → container; crear/reabrir real; navegación de landing |
| `MVP-118` | REQ-02, REQ-13; PRD §10; SH-09 | Playwright + revisión manual en móvil y escritorio; hallazgos corregidos o registrados |

## 3. Dependencias

- `MVP-116` ← `MVP-040` (servicio y API de documentos), `MVP-111`, `MVP-113`, `MVP-030` (sesión y guardas), `MVP-114` (landing) y `MVP-054` (chat conectado).
- `MVP-118` ← `MVP-116`, `MVP-076`, `MVP-101`, `MVP-114`.
- **Cierre vs. avance:** el maestro incluye `MVP-114` y `MVP-054` entre las dependencias de `MVP-116`; la landing (I4) y el montaje del chat (I3) no son opcionales para cerrarlo. Se puede construir antes un checkpoint temprano del dashboard (I1–I2) con `MVP-040`, `MVP-030` y `MVP-111`, sin esperar a `MVP-118`, pero `MVP-116` solo se cierra con todas sus dependencias integradas.
- Por paso: ver §6; los pasos I1–I3 y I5 dependen solo de `MVP-116`; los A1–A2 son locales y no esperan a las pantallas públicas; A3 espera `MVP-076` y `MVP-101`.

## 4. Archivos: propiedad y límites

| Zona | Owner | Notas |
| --- | --- | --- |
| `src/app/(app)/dashboard/`, `src/app/(app)/documents/[id]/`, `src/app/(marketing)/` | Líder | Server Components leen servicios directamente; sin HTTP a la propia app |
| `src/features/dashboard/containers/`, `src/features/documents/containers/` | Líder | Interacción y peticiones; callbacks nacen en cliente; sin Server Actions para eludir la frontera |
| `src/features/*/components/**` | Colaborador (otros planes) | Aquí **solo se leen**; un ajuste de presentación pasa por ticket |
| `tests/e2e/`, `playwright.config.ts` | Líder | Nuevos specs de rutas integradas |
| `src/mocks/`, `src/features/*/fixtures/` | — | **Prohibido** importarlos desde rutas/containers (barrera existente) |

Propiedad de rutas (resuelta): `src/app/(app)/documents/[id]/page.tsx` pertenece **solo a `MVP-116`** (carga autorizada, envoltorio y montaje del container de chat). `MVP-054` ([`f04-connected-chat`](f04-connected-chat.md)) entrega containers, consumers de API/adapters y pruebas de contrato en `src/features/chat`, sin tocar esa página. Las rutas de auth de `MVP-031` ([`f03-auth-flujos-reales`](../../completed/f03-auth-flujos-reales.md)) son de su propio plan, no hay conflicto con este.

## 5. Insumos y salidas

| Insumo | Origen |
| --- | --- |
| Servicios de documentos/listado, sesión y guardas | `MVP-040`, `MVP-030` (Líder, otros planes) |
| Presentaciones y sus props | `MVP-111`, `MVP-113`, `MVP-114` |
| Container de chat conectado y sus adapters | `MVP-054` (Líder, otro plan) |
| Contratos DTO (`DocumentSummarySchema`, versiones) | [`document.ts`](../../../../src/lib/contracts/document.ts), [`dashboard.ts`](../../../../src/lib/contracts/dashboard.ts), `MVP-021` |

Salidas: rutas y containers integrados; specs E2E de navegación autorizada; registro de hallazgos de accesibilidad (sección de evidencia de este plan).

Historial: hasta que existan versiones reales (`MVP-083/084`), el container muestra el historial vacío o con las versiones persistidas que haya; no se rellena con fixtures ni se simula una versión.

## 6. Pasos y checkpoints

Checkpoint A en curso; B no iniciado. Las casillas marcadas tienen evidencia en §8.

**Checkpoint A — `MVP-116`**

- [x] **I1 · Lectura autorizada del dashboard** (← `MVP-040`, `MVP-030`, `MVP-111`). Server Component llama al servicio de listado, proyecta a `DashboardViewState` validado y lo pasa al container. Sin sesión → guarda rechaza; documento ajeno → denegado (test con dos usuarios sobre la base local de `MVP-120` si ya existe; si no, con doble del servicio y se anota el hueco).
- [~] **I2 · Crear y reabrir** (← I1). El container `onCreate`/`onOpen`/`onRetry` llaman endpoints reales definidos por el servicio de `MVP-040`; error técnico visible como `error` del DTO, nunca éxito simulado ni fallback mock.
- [~] **I3 · Ruta de documento con historial y chat** (← I2, `MVP-113`, `MVP-054`). Carga autorizada del documento y de sus versiones persistidas; montar en la página el container de chat de `MVP-054` pasándole el DTO del documento, sin reimplementar su lógica; `onSelect` navega a la versión; mantener separados finalización y sello tal como los entrega el servidor.
- [x] **I4 · Landing integrada** (← `MVP-114`; requerida para cerrar `MVP-116`). Componer la presentación en `(marketing)` con enlaces a login/registro/panel como datos.
- [~] **I5 · Pruebas** (← I1–I4). Vitest para adaptadores DTO con casos inválidos rechazados; Playwright en ruta integrada: sin sesión redirige/rechaza, crear y reabrir. Ejecutar `npm run lint`, `typecheck`, `test`, `test:boundaries`, `build`, `test:e2e` con resultados reales. El E2E contra datos reales usa la base local efímera de `MVP-120`, no el proyecto cloud.

**Checkpoint B — `MVP-118`** (final; no bloquea a A)

- [x] **A1 · Inventario de pantallas** (← `MVP-116`). Lista de pantallas del PRD §10 realmente integradas y su ruta.
- [~] **A2 · Checks automáticos de navegador** (← `MVP-116`, `MVP-114`). Playwright en 360 px y 1280 px: sin desbordamiento horizontal, navegación por teclado y orden de foco, nombres accesibles por rol, foco visible. Decisión local abierta del líder: incorporar una herramienta de auditoría automática (dependencia nueva; requiere su aprobación) o limitarse a aserciones por rol/teclado sin dependencia nueva.
- [ ] **A3 · Pantallas públicas** (← `MVP-076`, `MVP-101`). Mismo conjunto sobre `confirm/[token]` (casilla vacía, «Confirmar» deshabilitado hasta marcar, «No coincide / Rechazar» visible y operable por teclado, modal con foco atrapado y devolución de foco, cancelar no responde) y `verify/[reference]`.
- [~] **A4 · Revisión manual** móvil y escritorio de todas las pantallas; contraste, lectura de lenguaje sin términos prohibidos (PRD §5, §11).
- [ ] **A5 · Hallazgos.** Cada uno se corrige o se registra (descripción, pantalla, severidad, decisión) en la evidencia de este plan; los no corregidos no se ocultan.

## 7. Validación

| Evidencia | Nivel |
| --- | --- |
| Adaptadores DTO, guardas con doble de servicio | Vitest con dobles: acredita contrato, **no** permisos reales |
| Aislamiento A/B en rutas | Base Supabase local efímera (claves efímeras, sin `.env`); distinto de cloud |
| Navegación y accesibilidad | Playwright sobre rutas integradas con datos de la base local; no sustituye RLS |
| Cloud/Vercel | No aplica aquí: es `MVP-132`/`134` |

## 8. Evidencia

**Checkpoint B (parcial, `MVP-118`) · 2026-10-16.**

- **A1 `[x]` inventario (PRD §10) y estado:** `/` landing (integrada, probada) · `/acceso`, `/registro`, `/recuperar` (integradas, probadas) · `/nueva-contrasena` (requiere sesión; no probada aquí) · `/dashboard` y `/documents/[id]` (integradas; requieren Auth local, **no probadas en navegador**) · `confirm/[token]` (MVP-076) y `verify/[reference]` (MVP-101): **aún no existen**. Chat y snapshot no montados (MVP-054, MVP-077/112).
- **A2 `[~]`** `tests/e2e/responsive-a11y.spec.ts` (proyecto `next`): landing, acceso, registro y recuperar a 360 y 1280 px — sin desbordamiento; estructura (`h1` + `main` + sin saltos) solo en landing (auth omitido por el hallazgo 2); controles con nombre accesible, primer Tab con foco visible; y menú móvil operable con teclado. Resultado: 125/125 con el proyecto `preview` incluido. Sin herramienta de auditoría automática (decisión del líder abierta, §6-A2).
- **A4 `[~]`** Revisión manual con capturas (landing 360/1280, acceso 360, 404 360): estructura y tamaños táctiles correctos. No revisadas: pantallas privadas, contraste medido con herramienta, lector de pantalla.
- **A5 hallazgos:** (1) **corregido** — la landing no tenía región `main`; (2) **registrado, pendiente de su propietario** — `acceso`, `registro`, `recuperar` y `nueva-contrasena` no tienen `h1` (título en `h2`; presentación de MVP-031, fuera de la allowlist de #31); (3) **registrado, pendiente del líder** — `globals.css` define `--font-sans: var(--font-sans)` (referencia circular) y el sitio cae a la fuente serif del navegador, no a Geist (propuesta: `var(--font-geist-sans, ui-sans-serif, system-ui, sans-serif)`); (4) **registrado** — el 404 muestra «Ir a mis documentos» también a un visitante sin sesión (lo lleva al acceso; aceptable, a decidir).

**Checkpoint A (parcial) · 2026-10-16 · rama `facu` (sin commit aún).** Leyenda: `[x]` hecho · `[~]` parcial.

- **I1 `[x]`** `dashboard/page.tsx` (Server Component) llama al servicio de listado y proyecta con `toDashboardState` (DTO validado con `DashboardViewStateSchema`; fallo técnico → `error`, nunca lista vacía). Vitest: `tests/contracts/dashboard-state.test.ts`. Sin sesión: la guarda del layout `(app)` redirige a `/acceso`.
- **I2 `[~]`** `DashboardContainer`: crear = `POST /api/documents` con clave de idempotencia estable entre reintentos; abrir = navegar; error visible, sin éxito simulado. Vitest de componente (4 casos). El título del documento nuevo es el fijo «Documento sin título»: la presentación no ofrece campo de título (decisión local a confirmar con el líder).
- **I3 `[~]`** `documents/[id]/page.tsx`: carga autorizada (ajeno = inexistente = 404) con historial **vacío** (no hay servicio de versiones: MVP-083/084). **Pendiente: montar el chat**, porque el container de `MVP-054` aún no existe (`src/features/chat/containers/` ausente); no se inventó un sustituto.
- **I4 `[x]`** `(marketing)/page.tsx` reemplaza la plantilla; enlaces según sesión (`/registro`, `/acceso`, `/dashboard`). Hallazgo corregido en la presentación MVP-114: `LandingPage` llamaba a `siteNavigationProps()` (módulo `"use client"`) desde un Server Component → 500 en `/`; ahora pasa `brand` y `links` directamente.
- **I5 `[~]`** Comandos reales: `npm run lint` ✓ · `npm run typecheck` ✓ · `npm test` ✓ (57 archivos, 975 tests) · `npm run test:boundaries` ✓ (67) · `npm run build` ✓ · `playwright test --project=next` ✓ (5/5; con el Chromium preinstalado 1194 mediante configuración local fuera del repo). **No ejecutado:** `test:e2e:auth` (el nuevo caso de rutas privadas reales en `tests/e2e/auth-flow.spec.ts` está escrito pero sin correr: no hay daemon de Docker para la pila local de Supabase) y el aislamiento A/B con dos usuarios.
- **Revisión de experiencia (2026-10-16):** contraste medido por script sobre `/`, `/acceso`, `/registro`, `/recuperar` y el 404, en claro y oscuro (texto normal ≥ 4,5:1; grande ≥ 3:1): **0 fallas**. Cambios: pila de reserva para `--font-sans` en `globals.css`; el 404 enlaza a «Ir al inicio» (antes ofrecía «mis documentos» a visitantes); copy de la landing alineado con control de calidad, respaldo y trazabilidad (producto, a confirmar con el líder); descripción del sitio sin jerga. **Propuesta, no aplicada:** la UI muestra «Sello HCS» y «snapshot», vocabulario del PRD §5 y del runbook del jurado; conviene decidir con el líder si la interfaz de demo usa «Sello público» y «revisión». `npm test` ✓ (1006) · `playwright` ✓ (125/125).
- **Endurecimiento (2026-10-16):** la sesión se verifica una vez por petición (`React.cache`, `(app)/_lib/session.ts`) en vez de dos veces (layout + página); `error.tsx` (Next 16, `retry`; no muestra el mensaje original), `not-found.tsx` y `(app)/loading.tsx`; sesión vencida (`NO_SESSION` o 401 al crear) redirige a `/acceso` en vez de mostrar error genérico. **No verificado:** la deduplicación de `getUser()` (requiere Auth real; se razonó del código) y el E2E con datos reales.
- Pendiente de decisión del líder: título del documento nuevo y destino posterior al login (hoy siempre `/`).
- Otros cambios: layout `(app)` con cabecera y `LogoutButton`; metadatos y `lang="es"` del layout raíz; fixture `bad-app-route.ts` apunta a `@/app/layout` (la página raíz ya no existe).
- **Checkpoint de accesibilidad de producto (rama `fix/product-accessibility`):** `lang="es"` y metadatos «GALCOA+» en el layout raíz; `--font-sans` apunta a la variable Geist con pila de reserva; los cuatro formularios de Auth usan `h1` (se retiró el `test.skip` de `responsive-a11y.spec.ts`); `AUTH_PATHS.afterLogin` pasa a `/dashboard`. Sin cambios en PKCE, cookies ni sesión. **Fallo real de CI (run 38990595903, job Auth real local):** `tests/e2e/auth-flow.spec.ts` seguía esperando `/\/$/` tras el login; corregido a `/\/dashboard$/` en las tres expectativas posteriores al login (callback, signup y recuperación no cambian). **Validación pendiente:** re-ejecución del job Auth real local en CI (Supabase local aislado; no se levantó localmente). **No marca `MVP-116` ni `MVP-118` como completos** (el montaje del chat y las pantallas privadas siguen pendientes).

## 9. Referencias a completar

Documentos objetivo **disponibles**:

- **RQ-D2** → [frontend-delivery](../../../specs/frontend-delivery.md): referencia visual y accesibilidad (§3) y casos F-02…F-06 que `MVP-118` usa como criterio de revisión transversal sobre las pantallas integradas; no sustituye la revisión manual.
- **RQ-D1** → [release-validation](../../../specs/release-validation.md) (§1–§2): matriz de evidencia por frontera (qué acredita un doble y qué una prueba real); este plan la consume sin duplicarla.

## 10. Rollback y límites

- Rutas, containers y specs son archivos acotados: revertir su merge devuelve la plantilla actual. No hay migraciones.
- Sin lectura de `.env`, sin Supabase cloud ni proveedores; sin Issues, commit, push ni merge sin autorización. No se crean rutas mock de producto.
- Un hallazgo de `MVP-118` en una presentación del colaborador se resuelve vía ticket o ajuste del líder, no por edición silenciosa de su allowlist.

## 11. Cierre

`MVP-116` se completa tras integrar todas sus dependencias (incluidas `MVP-114` y `MVP-054`) y repetir los checks sobre la base; `MVP-118` solo cuando A1–A5 se ejecutaron sobre las pantallas integradas (incluidas las públicas) con hallazgos resueltos o registrados. Entonces: evidencia en sus filas del maestro, recuento del §3 del maestro. No se completa un ID por el otro. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
