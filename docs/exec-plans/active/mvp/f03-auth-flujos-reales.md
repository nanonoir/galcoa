# ExecPlan F3 — Registro, login, logout y recuperación reales

**Estado: implementado con dobles y verificado en unidad/build; la prueba real local (Playwright + Supabase local) NO se ha ejecutado, así que `MVP-031` sigue pendiente.** No cambia estados del [maestro](../mvp-master-plan.md).

Tareas del maestro: `MVP-031`

Requisitos PRD: REQ-01; [§0 límite de correo](../../GALCOA-PRD-v1.4.md), [§10 pantallas](../../GALCOA-PRD-v1.4.md), [§11](../../GALCOA-PRD-v1.4.md).

Referencias: [fundaciones SH-07 (entrada de Auth de navegador aislada) y SH-09](../../../design/mvp-shared-foundations.md) · [arquitectura: presentación vs container](../../../architecture.md) · [sesiones y guardas](f03-sesiones-y-guardas.md) · [clientes Supabase](f02-clientes-supabase.md) · [desarrollo](../../../development.md).

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

## Decisiones pendientes

- Mecanismo exacto (adaptador de servidor vs. cliente de navegador aislado): decide el líder al implementar, con preferencia por el servidor (SH-07).
- Ninguna sobre la cobertura de callback y nueva contraseña: están dentro del requisito de recuperación (paso 1).

## Referencias a completar

Ninguna: SH-07 y SH-09 bastan. Si el equipo quiere una nota breve de Auth/correo, se añade a `docs/development.md` (edición, no documento nuevo).

## Checklist

- [x] `MVP-030` (PR #50) y `MVP-115` (PR #58) integradas en `develop`.
- [x] Formulario de nueva contraseña verificado en `MVP-115` (`NewPasswordForm`). No hay pantalla de callback en la presentación: el callback es un Route Handler que redirige (aviso de enlace inválido en `/acceso`).
- [x] Adaptadores de servidor y callback con redirecciones seguras (checkpoint A, con dobles).
- [ ] Container conectado a la presentación (hecho); flujo local completo: suite Playwright escrita, **no ejecutada** (falta instancia local con confirmación activa).
- [ ] Mensajes sin filtrar existencia de cuentas: verificados con dobles (vitest); contra Supabase real, pendiente en la suite local.
- [x] Límites del emisor de correo documentados en [`auth-local.md`](../../../auth-local.md).
- [x] No aplica: se eligió adaptador de servidor, sin cliente de navegador ni cambios de barreras.
- [ ] Fila de `MVP-031` actualizada.

## Progreso y evidencia

Rama `flow/9-auth`. Decisión: adaptadores de servidor (Route Handlers `POST /api/auth/{register,login,logout,recovery,password}` y `GET /api/auth/callback`), sin cliente de navegador. CSRF: `Origin` debe coincidir con el host de la petición y el cuerpo ser JSON. Destinos del callback de lista cerrada (`flow=signup|recovery`).

Comprobado en worktree aislado: `npm run lint`, `npm run typecheck`, `npm test` (746 pasan; incluye `tests/server/auth-flow/` y los containers), `npm run test:boundaries`, `npm run build`; humo con `next start` sin credenciales (503 neutral, 403 por origen, 422 por campo, redirección interna del callback).

**No comprobado:** Playwright real (`tests/e2e/auth.config.ts`, omitido sin instancia), correo real/remoto y ruta privada (`MVP-116`). Requisito del líder: `enable_confirmations = true` y URLs de redirección en `supabase/config.toml` ([`auth-local.md`](../../../auth-local.md)).

## Cierre

Actualizar **solo** la fila `MVP-031` (evidencia con comandos reales, rama/PR) y recontar §3 tras integrar. Archivar en [`completed/`](../../completed/). Un flujo con dobles o el preview no cierra esta tarea; se exige la prueba local real. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
