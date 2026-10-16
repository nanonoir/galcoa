# ExecPlan F2 — Clientes Supabase de servidor y de sesión

**Estado: planificado; no implementado.** No cambia estados del [maestro](../mvp-master-plan.md).

Tareas del maestro: `MVP-025`

Requisitos PRD: REQ-17 (claves solo servidor), REQ-01; [§11](../../GALCOA-PRD-v1.4.md), [§13 variables](../../GALCOA-PRD-v1.4.md); INV-04 (claves solo servidor).

Referencias: [fundaciones SH-07](../../../design/mvp-shared-foundations.md) (conflicto de barreras con `SERVER_DIRS`) · [arquitectura: dependencias y `server-only`](../../../architecture.md) · [manifest de barreras](../../../../tests/boundaries/manifest.mjs) · [desarrollo](../../../development.md) · [esquema y RLS](f02-esquema-migraciones-rls.md).

## Precondiciones y checkpoints

- `MVP-023` integrada (migraciones; define con qué esquema hablan los clientes) y `MVP-002` (barreras, ya completada).
- Checkpoint único: módulos de cliente + barreras + tests integrados. Desbloquea `MVP-030`.
- No depende de `MVP-024` ni de acceso remoto: usa la instancia local y dobles. El proyecto remoto es [`MVP-026`](f02-entorno-supabase-remoto.md).

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-025 | `src/lib/supabase/` con `import "server-only"` en cada archivo: (a) cliente de sesión por petición (cookies, anon/publishable), (b) cliente privilegiado de uso acotado y nunca expuesto, (c) lectura de configuración que falla con error técnico explícito si falta, sin inicializar nada en el import ni durante `build`. Solo `NEXT_PUBLIC_*` pueden llegar al cliente; las claves privilegiadas existen solo en servidor. Barreras actualizadas con casos positivos y negativos. |

## Alcance, roles y carpetas

- Rol: **Líder**.
- Permitido: `src/lib/supabase/**`, `tests/boundaries/**` y `eslint.config.mjs` si hace falta tocar barreras, `.env.example` (solo **nombres** de variables, vacíos), configuración de Vitest para resolver `server-only` en tests (a confirmar), tests de servidor (`tests/server/`).
- Prohibido: importar `src/lib/supabase` desde presentación, contratos, preview o `src/mocks`; poner un cliente de navegador dentro de `src/lib/supabase/` (SH-07: iría en `src/features/auth/containers/supabase-browser.ts` y es decisión de `MVP-031`); relajar `SERVER_DIRS` globalmente; leer `.env*`; llamar proyectos remotos.

## Contratos

- Insumos: `@supabase/ssr` y `@supabase/supabase-js` ya instalados (versiones del lockfile; verificar su API al implementar), nombres de variables del PRD §13 y migraciones locales.
- Salidas: funciones de servidor que reciben el contexto de la petición y devuelven el cliente; un tipo de error técnico estable de configuración (código, etapa; sin valores). El nombre de la variable de la clave privilegiada se confirma contra la documentación vigente de Supabase y se añade a `.env.example` sin valor.

## Pasos

1. Leer la guía local de Next sobre variables de entorno y límites servidor/cliente (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`) y la documentación oficial de `@supabase/ssr` de la versión instalada.
2. Comprobar en `tests/boundaries/` cómo se verifica `server-only` en `SERVER_DIRS` y cómo importan los tests de servidor ese módulo; si `server-only` no resuelve bajo Vitest, resolverlo en la configuración del líder sin debilitar la regla.
3. Implementar el módulo de configuración (lectura perezosa en el momento de uso) y los dos clientes.
4. Tests con dobles: falta de variable → error técnico explícito; el cliente privilegiado nunca se crea por import; la salida de errores no incluye valores.
5. Barreras: caso positivo (archivo en `src/lib/supabase` con `server-only` pasa) y negativos (importarlo desde presentación/contratos/preview falla).
6. Comprobar que `npm run build` no inicializa clientes ni exige variables.
7. Prueba de humo local contra la instancia local si ya existe: crear el cliente de sesión y leer una tabla bajo RLS (sin credenciales privadas).

## Pruebas

Vitest Node con dobles; barreras (`npm run test:boundaries`); `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. La verificación real es la instancia local; no se llaman proyectos remotos.

## Seguridad, permisos y rollback

- La clave privilegiada no se registra, no entra en logs ni errores, y no usa prefijo `NEXT_PUBLIC_`. Todo uso de este cliente exige comprobar propiedad/capacidad antes (no sustituye a RLS).
- Rollback: revertir `src/lib/supabase/`, el cambio de barreras y `.env.example`; sin datos.

## Riesgos

- `server-only` y Vitest: resolver sin quitar la regla.
- Tentación de mover aquí el cliente de navegador de Auth: rompe `SERVER_DIRS`; seguir SH-07.
- Usar el cliente privilegiado como atajo de RLS: se limita a Storage y funciones restringidas que lo exijan.

## Decisiones pendientes

- Nombre exacto de la variable de la clave privilegiada y política de uso del cliente privilegiado: se verifican contra documentación vigente al implementar.

## Referencias a completar

Ninguna: SH-07 y RQ-A1 ([data-transactions](../../../design/data-transactions.md)) cubren el diseño. Si RQ-A1 define RPC con permisos mínimos, este plan solo consume el cliente adecuado.

## Checklist

- [ ] Guías locales de Next y de `@supabase/ssr` leídas.
- [ ] Módulo de configuración con error técnico explícito.
- [ ] Cliente de sesión y cliente privilegiado acotado.
- [ ] `server-only` resuelto en tests sin debilitar barreras.
- [ ] Barreras con casos positivos y negativos.
- [ ] Build sin variables y sin inicialización.
- [ ] Fila de `MVP-025` actualizada.

## Progreso y evidencia

No ejecutado.

## Cierre

Actualizar **solo** la fila `MVP-025` (evidencia con comandos reales, rama/PR) y recontar §3 tras integrar. Archivar en [`completed/`](../../completed/). **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
