# ExecPlan F3 — Registro, login, logout y recuperación reales

**Estado: completado (2026-10-16).** Integrado en `develop` mediante [PR #70](https://github.com/nanonoir/galcoa/pull/70), merge `a0c6d0fe5b00b363367a30024068296cb1d369d0`. Aceptación local de `MVP-031` satisfecha; ruta privada de producto (`MVP-116`), correo real y remoto son seguimientos separados, no bloqueos de este cierre.

Tareas del maestro: `MVP-031`

Requisitos PRD: REQ-01; [§0 límite de correo](../GALCOA-PRD-v1.4.md), [§10 pantallas](../GALCOA-PRD-v1.4.md), [§11](../GALCOA-PRD-v1.4.md).

Referencias: [fundaciones SH-07 (entrada de Auth de navegador aislada) y SH-09](../../design/mvp-shared-foundations.md) · [arquitectura: presentación vs container](../../architecture.md) · [sesiones y guardas](../active/mvp/f03-sesiones-y-guardas.md) · [clientes Supabase](../active/mvp/f02-clientes-supabase.md) · [desarrollo](../../development.md).

## Precondiciones y checkpoints

- `MVP-030` integrada (helper y guardas) **y** `MVP-115` completada (presentación de formularios de acceso: login, registro, recuperación; plan del grupo F11). Sin `MVP-115` la tarea no empieza, según el maestro.
- Checkpoint A (servidor): adaptadores y manejo de errores listos y probados con dobles. Checkpoint B (integración): container conectado a la presentación de `MVP-115` y flujo local completo.
- Es la única parte de F3 que depende de la fase de UI: se mantiene separada de `MVP-030` para no crear un ciclo F3 ↔ F11. `MVP-115` no depende de ninguna tarea de Auth.
- Se prueba con Supabase **local** (credenciales efímeras, buzón local de correo de la instancia); sin remoto ni credenciales privadas.

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-031 | Flujos reales de registro, login, logout y recuperación de contraseña con confirmación de email activa por defecto; los mensajes de error no revelan si una cuenta existe; las redirecciones tras confirmar/recuperar son seguras (solo destinos internos permitidos); los límites del emisor integrado de Supabase (PRD §0) quedan documentados; sin lógica de autenticación en la presentación. |

## Alcance, roles y carpetas

- Rol: **Líder**. El colaborador solo entrega la presentación (`MVP-115`) y no toca este plan.
- Permitido: `src/app/(auth)/**` (rutas), `src/app/api/auth/**` o el mecanismo de servidor elegido, `src/features/auth/containers/**`, `src/lib/supabase/**` (adaptadores de servidor), `tests/server/`, `tests/e2e/`, `docs/development.md` (límites de correo y flujo local).
- Si se necesita cliente de navegador: **solo** en `src/features/auth/containers/supabase-browser.ts` con configuración pública (SH-07), actualizando la allowlist y los tests de barreras con casos positivos y negativos. Se prefiere primero el adaptador de servidor.
- Prohibido: modificar `src/features/**/components/` (es de `MVP-115`), importar Supabase en presentación, importar el cliente de navegador desde `src/lib/supabase/`, quitar `server-only`, desactivar la confirmación de email, loguear emails o contraseñas.

## Contratos

- Insumos: callbacks y props de `MVP-115`, helper de `MVP-030`, comportamiento documentado de Supabase Auth para la versión instalada. Salidas: rutas y container que traducen resultados de Auth a los estados de la presentación (cargando, error recuperable, enviado) usando el envelope técnico de `MVP-021` donde aplique.

## Pasos

1. Confirmar `MVP-115` y leer sus props y callbacks; verificar que la presentación cubre la pantalla de callback y el formulario de **nueva contraseña** tras el enlace de recuperación: ambos forman parte del requisito de recuperación de `MVP-031`/`MVP-115` (el maestro ya incluye la nueva contraseña en `MVP-115`); no es una pregunta de «añadir tarea». Si sus props no encajan, el ajuste de contrato lo resuelve el líder dentro del plan de `MVP-115`, sin ID nuevo.
2. Leer la guía local de Next sobre autenticación y la documentación oficial de Supabase Auth con SSR de la versión instalada; verificar cómo se comporta el alta ante un email ya registrado con la confirmación activa, para no revelar existencia de cuentas.
3. Implementar adaptadores de servidor (alta, acceso, cierre de sesión, solicitud de recuperación, actualización de contraseña) y el callback de confirmación/recuperación con redirecciones validadas.
4. Mapear errores a mensajes neutrales y estables; distinguir impedimentos técnicos (proveedor caído, límite de envíos) de errores del usuario sin filtrar datos.
5. Container en `src/features/auth/containers/` que conecta los callbacks de la presentación; protección CSRF/origen según la convención del adaptador elegido.
6. Documentar en `docs/development.md` el flujo local con buzón de la instancia y el límite de correos del emisor integrado.
7. Tests (ver abajo) y revisión de que ningún dato sensible aparece en logs.

## Pruebas

Vitest Node con dobles para los adaptadores y el mapeo de errores; componentes (jsdom) del container con la presentación de `MVP-115`; prueba local real: registro → confirmación leyendo el buzón local → acceso → ruta protegida → cierre de sesión → recuperación. Playwright E2E del flujo local con la instancia levantada; el rechazo de ruta privada sin sesión se verifica aquí si ya existe una ruta (si no, ver `MVP-116`). Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`, `npm run build`, `npm run test:e2e`. El remoto y el correo real quedan para `MVP-026`/`MVP-133`.

## Seguridad, permisos y rollback

- Mensajes que no filtran existencia de cuentas; destinos de redirección en lista permitida; tokens de recuperación nunca en logs ni `Referer`.
- Los límites de envío de correo se manejan con el mensaje técnico adecuado; la demo usa cuentas precreadas/autorizadas (`MVP-133`).
- Rollback: revertir rutas y container; la presentación y las guardas siguen intactas.

## Riesgos

- `MVP-115` demorada: bloquea esta tarea; mitigación: empezar `MVP-110/115` temprano. Cualquier separación adicional es edición del líder del maestro.
- Cliente de navegador mal ubicado rompe las barreras (conflicto con `SERVER_DIRS`).
- Enumeración de cuentas por tiempos o mensajes distintos: probar respuestas uniformes.
- Límite de correos del emisor integrado dificulta pruebas remotas.

## Decisiones resueltas

- Mecanismo: adaptadores de servidor (Route Handlers), sin cliente de navegador (SH-07).
- Ninguna sobre la cobertura de callback y nueva contraseña: están dentro del requisito de recuperación (paso 1).

## Referencias a completar

Ninguna: SH-07 y SH-09 bastan. Si el equipo quiere una nota breve de Auth/correo, se añade a `docs/development.md` (edición, no documento nuevo).

## Checklist

- [x] `MVP-030` (PR #50) y `MVP-115` (PR #58) integradas en `develop`.
- [x] Formulario de nueva contraseña verificado en `MVP-115` (`NewPasswordForm`). No hay pantalla de callback en la presentación: el callback es un Route Handler que redirige (aviso de enlace inválido en `/acceso`).
- [x] Adaptadores de servidor y callback con redirecciones seguras (checkpoint A, con dobles).
- [x] Container conectado a la presentación y flujo local real ejecutado: Playwright + Supabase local + Mailpit, 3/3 verde, con confirmación activa.
- [x] Mensajes sin filtrar existencia de cuentas: verificados con dobles y respuestas uniformes en la suite real local.
- [x] Límites del emisor de correo documentados en [`auth-local.md`](../../auth-local.md).
- [x] No aplica: se eligió adaptador de servidor, sin cliente de navegador ni cambios de barreras.
- [x] Fila de `MVP-031` actualizada y recuentos consolidados con autorización del coordinador; sin cambiar otros IDs.

## Progreso y evidencia

Rama `flow/9-auth`. Decisión: adaptadores de servidor (Route Handlers `POST /api/auth/{register,login,logout,recovery,password}` y `GET /api/auth/callback`), sin cliente de navegador. CSRF: `Origin` debe coincidir con el host de la petición y el cuerpo ser JSON. Destinos del callback de lista cerrada (`flow=signup|recovery`).

Origen confiable: lista cerrada desde `NEXT_PUBLIC_APP_URL` (coincidencia exacta de esquema y host; sin `Host`/`X-Forwarded-*`); falta de configuración → 503 neutral. `/nueva-contrasena` sin Auth disponible muestra aviso técnico neutral.

Comprobado (último run, tras integrar `origin/develop`, con Supabase local propio): `npm run lint`, `npm run typecheck`, `npm test` (846 pasan, 44 archivos), `npm run test:boundaries`, `npm run build`, `npm run test:e2e:auth` (3 pasan: registro→Mailpit→confirmar→acceso→guarda→logout→recuperación→nueva contraseña→acceso; respuestas uniformes; origen/destinos externos), `npm run test:rls` (119 pasan), `npm run test:server:local` (3 pasan), `npm run test:e2e` (68 pasan). Negativo de configuración: con `AUTH_E2E=1` y datos faltantes la suite falla (no omite).

**No comprobado:** correo real/remoto y ruta privada de producto (`MVP-116`); sí se probó la guarda de `/nueva-contrasena`. Limitación documentada: la sesión de recuperación es completa con `secure_password_change = false` ([`auth-local.md`](../../auth-local.md)).

## Cierre

### Corrección acotada de revisión independiente (PR #70)

Tras las cuatro correcciones previas de revisión independiente (base `d7999c3`), se atendió el último WARNING: el logger instalado de Next imprime `request.url`, incluido el `code` del callback. `next.config.ts` excluye únicamente el prefijo `/api/auth/callback` mediante `logging.incomingRequests.ignore`; no desactiva los logs de las demás rutas. Se actualizó la nota local para explicar la mitigación y su límite: no cubre logs externos/de producción.

Validación de esta corrección: `npx vitest run tests/server/auth-flow src/features/auth/containers` (90 tests, 4 archivos), `npm run lint`, `npm run typecheck`, `npm run build` y `git diff --check`: correctos. Prueba directa adicional con `logRequests` de Next 16.4.2 instalado y la configuración real: callback con código ficticio no escribe en stdout; `/api/auth/login` sí se registra y el código ficticio no aparece. No se arrancaron servidores ni servicios, ni se repitieron aquí las suites reales de Supabase/Playwright; la evidencia anterior corresponde a su ejecución previa. Sin lectura de `.env` ni llamadas a proveedores. La integración principal quedó realizada por PR #70.

## Implementation Outcome

### Implemented

Cinco adaptadores POST, callback PKCE, páginas y containers de registro, acceso, cierre de sesión, recuperación y nueva contraseña. Confirmación de email local activa; errores neutrales, orígenes canónicos de `NEXT_PUBLIC_APP_URL` y destinos internos cerrados. Guarda real de `/nueva-contrasena` y mitigación de logs del callback en desarrollo. Entrega integrada por PR #70; este archivo cierra únicamente `MVP-031`/Issue #9.

### Deviations from Design

La nota de operación y límites vive en `docs/auth-local.md`, enlazada desde este plan, en vez de duplicarse en desarrollo. El callback es un Route Handler que redirige, no una pantalla de presentación. Se eligió servidor sin cliente de navegador. La guarda E2E usa `/nueva-contrasena`; las páginas privadas de producto y montaje de `LogoutButton` siguen en `MVP-116`, como permitía el plan.

### Validation

Evidencia histórica del implementador en PR #70: 846 Vitest, 67 barreras, 3 Auth E2E reales con Mailpit (incluyen confirmación, nueva contraseña y nuevo acceso), 119 RLS locales, 3 servidor local y 68 E2E generales; lint, tipos y build correctos. Revisión independiente `ses_eba300f78ffe6FxWh3s93m9e6d`: cuatro advertencias iniciales corregidas y verificadas con 119 pruebas focalizadas. Última advertencia del logger corregida en `6221659`; después se verificaron 90 pruebas focalizadas, 8 regresiones del logger, harness del logger instalado, lint, tipos y build. El coordinador leyó la configuración y confirmó las 8 regresiones. No se repitió la suite completa después del último fix: no se afirma un nuevo total completo ni prueba remota. Sin hallazgos críticos pendientes comunicados por la revisión/coordinación.

Validación documental del archivado: `git diff --cached --check`, parseo de los dos JSON de publicación, recuento de 73 IDs (21 completados, 28 en curso, 24 pendientes), catálogo de 36 planes (28 activos y 8 archivados) y comprobación de que solo cambió la fila de `MVP-031`. Verificador local de Markdown: 123 archivos, 917 enlaces relativos; quedan tres enlaces rotos preexistentes al plan F2 archivado en clientes Supabase, entorno remoto y harness. Ninguno apunta a Auth; no se corrigieron fuera del alcance. No se ejecutaron tests de producto durante este cierre exclusivamente documental.

### Follow-up

- `MVP-116`: navegación privada de producto y montaje del botón de cierre.
- `MVP-026`/`MVP-132`/`MVP-133`: configuración de URLs remotas, demo y correo real; el usuario conserva deliberadamente URLs locales hasta preparar Vercel. `NEXT_PUBLIC_APP_URL` debe incluir el origen exacto del despliegue; un Preview distinto no queda autorizado automáticamente.
- `MVP-130`/`MVP-132`: configurar/verificar logs externos de Vercel/proxies; la mitigación local no los cubre. La sesión de recuperación completa permanece documentada en `auth-local.md`, sin rediseño de Auth.
- Issue #9 se cierra por el coordinador únicamente después del merge del PR documental; este cierre no la modifica directamente.
