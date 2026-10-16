# ExecPlan F3 — Sesiones por cookies y guardas de acceso

**Estado: planificado; no implementado.** No cambia estados del [maestro](../mvp-master-plan.md).

Tareas del maestro: `MVP-030`

Requisitos PRD: REQ-01, REQ-17; [§11](../../GALCOA-PRD-v1.4.md) (sesiones por cookies, autorización y RLS); INV-11 (autoría autenticada).

Referencias: [fundaciones SH-07](../../../design/mvp-shared-foundations.md) (cookies SSR; autorización por operación, no solo guardas de navegación; no cachear respuestas privadas) · [arquitectura](../../../architecture.md) · [clientes Supabase](f02-clientes-supabase.md) · [auth con flujos reales](../../completed/f03-auth-flujos-reales.md).

## Precondiciones y checkpoints

- `MVP-025` integrada (clientes de servidor y sesión). No depende de `MVP-115` ni del remoto.
- Checkpoint único: helper de usuario autenticado + guardas probadas. Desbloquea `MVP-031`, `MVP-040`, `MVP-071`, `MVP-116`.
- Se prueba con la instancia Supabase **local** (usuarios ficticios y credenciales efímeras); sin remoto.

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-030 | Sesión por cookies con `@supabase/ssr` según la guía local de Next 16; las rutas privadas y los Route Handlers privados rechazan peticiones sin sesión válida (redirección en páginas, respuesta de error estable en API); existe un helper reutilizable que devuelve el usuario autenticado verificado, no solo datos de cookie. Ninguna ruta privada se cachea entre usuarios. |

## Alcance, roles y carpetas

- Rol: **Líder**.
- Permitido: `src/lib/supabase/` (helper de usuario y refresco de sesión, `server-only`), el archivo de interceptación de peticiones que indique la guía de Next 16 instalada (`proxy`/`middleware` según corresponda) si el refresco lo exige, `src/app/(app)/layout.tsx` como guarda de servidor del grupo privado, `tests/server/`, `tests/e2e/` solo para casos de sesión.
- Prohibido: páginas de producto (dashboard, documentos: `MVP-116`), formularios de acceso (`MVP-031`), cliente de navegador de Auth (`MVP-031`), endpoints inventados fuera de lo necesario, Server Actions para eludir la separación (SH-07), logs con tokens o emails, relajar barreras.

## Contratos

- Insumos: clientes de `MVP-025`, guía local `node_modules/next/dist/docs/01-app/02-guides/authentication.md` y la de `proxy.md` (verificar nombre vigente), documentación de `@supabase/ssr` de la versión instalada. No se fija aquí una receta de APIs de cookies o proxy sujetas a cambios (SH-07).
- Salidas: helper (usuario verificado o ausencia) y guarda para páginas; error técnico estable de «no autenticado» para API (código, etapa, no reintentable sin sesión; SH-02).

## Pasos

1. Leer las guías locales y la documentación de `@supabase/ssr`; fijar qué verifica la identidad (consulta al servidor de Auth o verificación de claims) y dónde se refresca la sesión.
2. Implementar el refresco de sesión en el punto que recomiende la versión instalada y el helper de usuario autenticado.
3. Implementar la guarda del grupo `(app)` y el patrón para Route Handlers privados (helper + respuesta estable). No crear páginas de producto.
4. Asegurar que las respuestas privadas llevan cabeceras que impiden caché compartida y que no se filtran tokens por logs o `Referer`.
5. Tests con dobles de cookies y del cliente: sin cookie, cookie inválida/expirada, sesión válida, error del proveedor de Auth (impedimento técnico, no éxito).
6. Test real local: usuario ficticio confirmado creado en la instancia local, sesión por cookies resuelta por el helper; usuario B no recibe datos de A (la aislamiento de datos lo acredita `MVP-024`).
7. Playwright de rechazo en ruta privada se completa cuando exista una ruta privada real (`MVP-031`/`MVP-116`); aquí se cubre con tests de la guarda y del helper.

## Pruebas

Vitest Node (dobles) y prueba local contra Supabase; `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`, `npm run build` (toca rutas/configuración). E2E de navegador del rechazo: pendiente hasta contar con una ruta privada (ver Decisiones pendientes).

## Seguridad, permisos y rollback

- Autorización validada en cada operación además de RLS y Storage; no confiar en datos de sesión enviados por el cliente.
- Rollback: revertir interceptor, guarda y helper; sin datos ni migraciones.

## Riesgos

- Cambios de convención de Next 16 (nombre y ubicación del interceptor): leer la guía instalada antes de codificar.
- Guarda solo de navegación sin verificación de operación: cada servicio vuelve a comprobar usuario.
- Que el interceptor haga trabajo pesado o confíe en la cookie sin verificar.

## Decisiones pendientes

- Verificación E2E de «ruta privada rechaza sin sesión»: requiere una ruta privada; la primera existirá en `MVP-116` (o en la pantalla de `MVP-031`). Si se exige verlo antes, el líder debe aprobar una ruta mínima como ajuste de alcance; no se asume.

## Referencias a completar

Ninguna.

## Checklist

- [ ] Guías de Next y `@supabase/ssr` leídas para las versiones instaladas.
- [ ] Helper de usuario autenticado verificado.
- [ ] Refresco de sesión por cookies.
- [ ] Guarda del grupo privado y patrón para API.
- [ ] Tests con dobles y prueba local real.
- [ ] Sin caché de respuestas privadas ni fugas en logs.
- [ ] Fila de `MVP-030` actualizada.

## Progreso y evidencia

No ejecutado.

## Cierre

Actualizar **solo** la fila `MVP-030` (evidencia con comandos reales, rama/PR) y recontar §3 tras integrar. Archivar en [`completed/`](../../completed/). Un test con doble no acredita la sesión real: exigir la prueba local. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
