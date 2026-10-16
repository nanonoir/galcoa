# ExecPlan F2 — Entorno Supabase de desarrollo/demo con migraciones aplicadas (remoto)

**Estado: en curso.** Migraciones aplicadas y verificadas en `galcoa-dev`; falta confirmar redirecciones y límites de correo de Auth. Procedimiento con acciones **externas y autorizadas**.

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

- [x] Autorización expresa para acciones remotas.
- [x] Proyecto y credenciales provistos por el usuario (fuera del repo).
- [x] Migraciones aplicadas (con `apply_migration` del conector, no con la CLI) y historial reconciliado.
- [x] Verificación de solo lectura: migraciones, RLS, buckets privados.
- [ ] Ajustes de Auth anotados (email confirmado; redirecciones y límites de correo sin confirmar).
- [ ] Fila de `MVP-026` actualizada sin secretos.

## Progreso y evidencia

Preparación de solo lectura, 2026-10-16 (no es aceptación ni validación remota; `MVP-026` sigue `pendiente`).

- El repositorio no designa un proyecto remoto: `supabase/config.toml` solo trae `project_id = "galcoa"` (identificador de la pila local), y ninguna doc ni configuración versionada nombra otro. No se leyó `.env*`.
- Metadatos públicos del listado de proyectos del conector de Supabase (sin claves): una única cuenta visible con un proyecto `galcoa-dev` (región `us-east-2`, estado `ACTIVE_HEALTHY`). Que sea el objetivo previsto **no está confirmado** por el usuario; no se consultó su catálogo, no se aplicaron migraciones y no se leyó uso de plan.
- Límite: no se ejecutaron consultas autenticadas ni cambios remotos. Esta nota no acredita acceso privado.
- Migraciones locales a aplicar (ya verificadas en local por `MVP-024`, sin DDL nuevo): `20261016000100_c1_core`, `20261016000200_c2_revision`, `20261016000300_c3_version_seal`, `20261016000400_rls_storage`.

### Ejecución remota, 2026-10-16

Autorización del usuario: usar `galcoa-dev` como base de prueba y crear tablas y reglas de seguridad versionadas, probadas en local, **sin borrar datos**. Sin reset, sin borrados, sin usuarios ni correos, sin llamadas a IA/Hedera.

- Estado previo (solo lectura): 0 tablas en `public`, historial de migraciones vacío, 0 usuarios; existían la función `public.rls_auto_enable` (propia de Supabase) y el bucket privado `documents`. Sin conflictos con las 4 migraciones (aditivas; solo agregan objetos, un rol `nologin` y defaults de privilegios de `postgres`).
- Aplicadas con `apply_migration` del conector, una por una, sin error: `c1_core`, `c2_revision`, `c3_version_seal`, `rls_storage`. El SQL se transcribió **manualmente** al conector; la equivalencia con los archivos del repo se revisó de forma independiente tras normalizar comentarios, espacios y delimitadores de dólar, pero **no es byte a byte idéntica**. La revisión reportó coincidencia de huellas normalizadas (prefijos `c1 bbf3771b`, `c2 4c95ad69`, `c3 beb57830`, `rls 9a443120`; el algoritmo de la huella no se conoce, no se afirma que sea criptográfico).
- Versiones asignadas por el conector: `20261016173321`, `…173346`, `…173417`, `…173429` (mismos nombres que el repo, timestamps distintos).
- Reconciliación del historial, 2026-10-16 (autorizada solo para esos cuatro identificadores): destino confirmado como `galcoa-dev` por metadatos del conector (sin leer `.env`). Antes: exactamente 4 filas con los nombres esperados. Se actualizó **solo** la columna `version` de `supabase_migrations.schema_migrations`, en una transacción con guardas (4 filas, sin colisión con los IDs locales, mapeo exacto): `20261016173321`→`20261016000100` (`c1_core`), `…173346`→`…000200` (`c2_revision`), `…173417`→`…000300` (`c3_version_seal`), `…173429`→`…000400` (`rls_storage`). Nombres y `statements` sin cambios (huella md5 por fila idéntica antes y después; no se imprimió contenido). Sin borrar filas, sin `repair`, sin migración nueva, sin cambios de tablas, datos ni permisos; los archivos del repo no se tocaron. Un `db push` futuro ya encuentra el historial alineado con los nombres de archivo. Sin otras migraciones concurrentes hasta ahora.
- Verificación de solo lectura: 24/24 tablas de `public` con RLS activo; 0 grants de **tabla** para `anon`/`service_role`/`PUBLIC` en `public` (los privilegios de función, como los de la `rls_auto_enable` preexistente, son aparte); `authenticated` solo `SELECT` en 18 tablas; 22 políticas: 18 `SELECT` de lectura propietaria en `public` más 4 de Storage (2 `SELECT` y 2 `INSERT`); buckets `evidences-private` y `versions-private` con `public = false`; `galcoa_executor` sin login ni bypass.
- Advisors de seguridad: 6 INFO `rls_enabled_no_policy` (tablas solo de servidor, intencional) y 2 WARN sobre `public.rls_auto_enable`, función preexistente de Supabase que no crea este repo (no se modificó).
- **Auth parcialmente confirmado**: el usuario confirmó en el panel (2026-10-16) que la confirmación de email está activa. La URL de Vercel (`https://galcoa-nea.vercel.app`) y las claves están configuradas en `main`. Las redirecciones de Auth y los límites de correo **no** están confirmados automáticamente; el conector no expone esa configuración y no se afirma su estado. Por eso `MVP-026` **no** se marca aceptada.
- Proveedores de IA (solo modelos gratuitos, sin llamadas reales ni lectura de `.env`): Gemini y Groq; configurados `openai/gpt-oss-120b` y `gemini-3.5-flash-lite`. Hedera queda para más adelante; no se autorizan planes de pago.

### Ampliación autorizada F4/LOGIN — 2026-10-16

Después de integrar PR #80 y su revisión final PASS, el usuario autorizó crear
en `galcoa-dev` el mismo acceso limitado probado localmente. Se aplicaron solo
`20261016001000_f4_persistence.sql` y `20261016001100_executor_login.sql`,
obtenidas intactas del commit `ca957b03ac7305f4ddaa08b7774915d5ab68e0e9`.
Historial final: las cuatro bases anteriores más esas dos versiones, sin cambios
de payload (SHA-256 fuente/SQL guardado coincidentes). Reconciliación acotada a
los dos timestamps nuevos, sin borrar filas ni reaplicar SQL.

Detalle reproducible de huellas, preflight, grants y límites en
[F4: aplicación remota](f04-documents-chat-audit.md#aplicación-remota-autorizada--2026-10-16).
RLS sigue 24/24, SELECT propietario en 18 tablas, sin grants de tabla para
anon/service_role/PUBLIC; dos RPC internas exclusivas del executor y cinco de
autor para authenticated. LOGIN sin contraseña provisionada; conexión remota,
TLS/Supavisor y Vercel siguen sin comprobar/configurar en este paso.

Advisors posteriores: cuatro INFO de tablas servidor sin políticas
([0008](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy));
cinco WARN esperados por las RPC de autor SECURITY DEFINER y el WARN preexistente
de `rls_auto_enable` para authenticated
([0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable));
un WARN preexistente de esa misma función para anon
([0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)).
No se modificó la función del proveedor ni se hicieron correcciones ajenas.
Sin reset, borrados, consultas de datos de usuarios, usuarios nuevos, contraseñas,
claves, configuración remota, IA ni HCS. `MVP-026` no queda aceptada: conserva
pendientes de Auth y despliegue; F4 conserva sus IDs parciales.

### Pendiente (checkpoint B cumplido salvo Auth)

Autorización y proyecto objetivo resueltos. Resta verificar en la consola las redirecciones de Auth y los límites del emisor de correo (paso 5) antes de aceptar `MVP-026`.

### Checklist de ejecución posterior (tras autorización)

1. Confirmar con la CLI (`supabase link --help`, `supabase db push --help`) los subcomandos de la versión instalada; vincular sin guardar secretos en el repo.
2. Aplicar las 4 migraciones sin editar el esquema a mano.
3. Solo lectura: versiones de migración aplicadas = las 4 del repositorio; `pg_tables.rowsecurity` activo en tablas expuestas; `storage.buckets.public = false`.
4. Auth: confirmación de email activa, redirecciones provisionales, límite del emisor integrado anotado (PRD §0).
5. Registrar evidencia sin valores sensibles y actualizar la fila `MVP-026`.

## Cierre

Actualizar **solo** la fila `MVP-026` (fecha, verificación realizada, rama/PR; sin valores sensibles) y recontar §3 tras integrar. Archivar en [`completed/`](../../completed/). Pruebas locales no cierran esta tarea. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
