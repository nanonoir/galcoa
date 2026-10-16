# ExecPlan F2 — Entorno Supabase de desarrollo/demo con migraciones aplicadas (remoto)

**Estado: planificado; no ejecutado.** Procedimiento con acciones **externas y autorizadas**. No cambia estados del [maestro](../mvp-master-plan.md).

Tareas del maestro: `MVP-026`

Requisitos PRD: REQ-17, REQ-01; [§8 y §11](../../GALCOA-PRD-v1.4.md), [§0 límite de correo](../../GALCOA-PRD-v1.4.md); datos ficticios para la demo (§11).

Referencias: [fundaciones SH-09](../../../design/mvp-shared-foundations.md) (la evidencia local no acredita el remoto) · [esquema y RLS](f02-esquema-migraciones-rls.md) · [desarrollo: entorno y seguridad](../../../development.md) · [maestro §9](../mvp-master-plan.md).

## Precondiciones y checkpoints

- `MVP-024` integrada (migraciones, RLS y buckets verificados en local).
- **Autorización expresa del usuario** y una cuenta de Supabase con un proyecto de desarrollo/demo creado por él. Credenciales solo fuera del repositorio.
- Checkpoint A: proyecto y credenciales disponibles (acción humana). Checkpoint B: migraciones aplicadas y verificadas.
- **No frena el desarrollo local**: sin A/B se bloquea solo `MVP-026` y lo que dependa de ella (`MVP-132`). `MVP-030` y `MVP-031` se prueban contra la instancia local.

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-026 | El proyecto remoto de desarrollo/demo existe, tiene las migraciones del repositorio aplicadas sin edición manual del esquema, RLS activo en toda tabla expuesta y buckets privados, comprobado con consultas de solo lectura al catálogo. La configuración de Auth relevante (confirmación de email activa por defecto, límites del emisor integrado) está anotada. Sin secretos en el repositorio ni en la evidencia. |

## Alcance, roles y carpetas

- Roles: **Externo** (crear el proyecto, obtener credenciales, ajustes en la consola de Supabase) y **Líder** (vincular y aplicar migraciones, verificar, registrar).
- Permitido: `supabase/` si la CLI necesita configuración de enlace sin secretos; nombres de variables en `.env.example`; `docs/development.md` (procedimiento).
- Prohibido: guardar claves o URL privadas en el repo, leer `.env*` de otros, ejecutar pruebas con usuarios de datos reales, desactivar la confirmación de email, editar el esquema remoto a mano, borrar/reiniciar el proyecto sin autorización.

## Contratos

- Insumos: migraciones versionadas, credenciales aportadas por el usuario (en `.env.local` o gestor de secretos propio, nunca comiteadas). Salidas: evidencia de versiones de migración aplicadas y del estado de RLS/buckets; variables que `MVP-132` cargará en Vercel (solo nombres).

## Procedimiento

1. (Externo) El usuario crea el proyecto de desarrollo/demo y decide plan y región; guarda URL, clave pública y clave privilegiada fuera del repositorio. No se comparten por chat ni se pegan en documentos.
2. (Líder) Antes de ejecutar nada remoto, recibir autorización expresa para esta acción concreta.
3. (Líder) Vincular y aplicar migraciones con la CLI `supabase` instalada; confirmar los subcomandos de su versión con la ayuda de la CLI, no asumirlos.
4. (Líder) Verificar con consultas de solo lectura: lista de migraciones aplicadas igual a la del repositorio, `rowsecurity` activo en tablas expuestas y buckets no públicos. Una prueba de dos usuarios en el remoto solo si el usuario la autoriza con cuentas ficticias dedicadas.
5. (Externo) Revisar ajustes de Auth: confirmación de email activa, redirecciones (las definitivas se cierran en `MVP-132`) y el límite del emisor integrado (PRD §0).
6. Registrar la evidencia sin valores sensibles y actualizar el procedimiento en `docs/development.md` si aporta.

## Alcance no automatizable

Creación de la cuenta/proyecto, plan contratado, claves, ajustes de la consola y cualquier uso remoto de credenciales: acciones del usuario. Ningún agente las obtiene ni las deduce.

## Seguridad, permisos y rollback

- Sin autorización o sin credenciales: tarea `bloqueada` solo ella (se anota en §9 del maestro).
- Rollback del remoto: nuevas migraciones correctivas; restablecer o borrar el proyecto es decisión explícita del usuario, nunca por defecto. Rotar claves si alguna se expuso.

## Riesgos

- Divergencia entre esquema local y remoto por ediciones manuales: prohibidas; si aparecen, registrar y corregir con migración.
- Límite de 2 correos/hora del emisor integrado: afecta pruebas de registro y la demo (`MVP-133`).
- Credenciales filtradas por logs o capturas: la evidencia no las incluye.

## Decisiones pendientes

- Plan, región y nombre del proyecto: del usuario.
- Si se realiza la prueba de dos usuarios en remoto: autorización expresa.

## Referencias a completar

Ninguna.

## Checklist

- [ ] Autorización expresa para acciones remotas.
- [ ] Proyecto y credenciales provistos por el usuario (fuera del repo).
- [ ] Migraciones aplicadas con la CLI.
- [ ] Verificación de solo lectura: migraciones, RLS, buckets privados.
- [ ] Ajustes de Auth anotados.
- [ ] Fila de `MVP-026` actualizada sin secretos.

## Progreso y evidencia

No ejecutado.

## Cierre

Actualizar **solo** la fila `MVP-026` (fecha, verificación realizada, rama/PR; sin valores sensibles) y recontar §3 tras integrar. Archivar en [`completed/`](../../completed/). Pruebas locales no cierran esta tarea. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
