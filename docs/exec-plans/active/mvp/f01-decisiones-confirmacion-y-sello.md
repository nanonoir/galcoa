# ExecPlan F1 — Decisiones de capacidades públicas (tokens) y de manifiesto/reconciliación HCS

**Estado: planificado; no implementado ni decidido.** Produce decisiones documentadas, no código. No cambia estados del [maestro](../mvp-master-plan.md).

Tareas del maestro: `MVP-011`, `MVP-012`

Requisitos PRD: REQ-12/13/16/17 (tokens), REQ-09/10/11 (manifiesto y HCS); INV-06, INV-12, INV-13, INV-15, INV-17, INV-18; [§8–9, §16](../../GALCOA-PRD-v1.4.md).

Referencias: [fundaciones SH-03, SH-04 y SH-06](../../../design/mvp-shared-foundations.md) · SH-10 · [arquitectura](../../../architecture.md) · [maestro F1 y §8.7](../mvp-master-plan.md).

## Precondiciones y checkpoints

- Sin dependencias; las dos tareas son independientes. Checkpoint A: `MVP-011`. Checkpoint B: `MVP-012`.
- Consumidores: `MVP-011` → `MVP-072/075`; `MVP-012` → `MVP-082`, `MVP-090`, `MVP-092` (y, por SH-03, el hash del snapshot de `MVP-070`, ver «Observaciones»).
- Ayudan a cerrar el diseño SQL ([plan de esquema](f02-esquema-migraciones-rls.md)): definen columnas y tablas de capacidades, nonce, referencia pública e intentos HCS. No lo bloquean para el núcleo.
- Sin credenciales ni llamadas reales; Testnet y Mirror Node se estudian por documentación oficial.

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-011 | Registro citable con: vigencia por defecto y quién la configura, política de límite de abuso para lectura y respuesta públicas **sin Redis, colas ni servicios nuevos** (AGENTS.md), semántica de reemisión y revocación (qué se reemite, qué se conserva, sin heredar decisiones ni confirmaciones), y qué reciben el enlace vencido/revocado/sustituido/consumido. Parámetros configurables, no cifras fijas en código. |
| MVP-012 | Diseño citable con: perfil canónico versionado (codificación, orden de claves y colecciones, números, nulos, Unicode, fechas) aplicable al snapshot y al manifiesto; estructura de dos niveles de SH-06 (detalle privado, compromiso público, nonce, `manifestHash`); forma de la referencia pública opaca; contenido exacto del mensaje HCS (solo hash e ids opacos); proyección pública de prueba; criterios de reconciliación vía Mirror Node (identificación por transacción/topic/payload, ventana de validez, qué es ausencia concluyente, retraso del Mirror, reinicio de Testnet) y vectores de prueba reproducibles. |

## Alcance, roles y carpetas

- Rol: **Líder**. Sin colaborador.
- Permitido: registrar las decisiones en el documento consumidor y proponer ajustes de PRD solo si cambia producto.
- Prohibido: código, `@hiero-ledger/sdk` en uso real, enviar mensajes a Testnet, leer `.env`, presentar un default propuesto como aprobado, ampliar HCS a mensajes por confirmación (fuera de P0).

## Contratos

- Insumos: PRD §8–9, §12.6–8 y §12.13–14; SH-03/04/06; documentación oficial de HCS, Mirror Node REST y del SDK instalado (consultar versión vigente al ejecutar; no citar cifras de memoria); límites de Supabase Auth/Postgres necesarios para el rate limit.
- Salidas: registros con estado `propuesto` o `aprobado AAAA-MM-DD`; para `MVP-012`, vectores de prueba calculados con un procedimiento independiente y reproducible (se verifican en el test de `MVP-082`, no aquí).

## Pasos

1. `MVP-011`: leer el spec del especialista, separar parámetros configurables (vigencia, umbrales) de reglas fijas (alta entropía, hash en base, un uso, revocación).
2. `MVP-011`: elegir el mecanismo de límite de abuso con las herramientas ya admitidas (por ejemplo contadores en Postgres o controles de la plataforma) y justificar por qué no requiere servicios fuera de P0; definir la respuesta uniforme que no revele existencia de tokens.
3. `MVP-011`: definir reemisión: nueva credencial para la misma invitación/revisión/snapshot tras vencimiento o revocación, o nueva revisión cuando hay cambio material; en ningún caso hereda una respuesta ya emitida.
4. `MVP-012`: fijar el perfil canónico y el vínculo de dos niveles; probar mentalmente contra los casos de PRD §12.7 y 12.14 (un byte distinto; verificación sin PDF).
5. `MVP-012`: fijar la reconciliación: qué se persiste antes de enviar (intención, transaction ID, payload y hash, topic/red, ventana), cómo se consulta, cuándo se considera concluyente la ausencia y cuándo se permite un nuevo envío; el reinicio de Testnet se trata como límite de verificabilidad.
6. El líder revisa, aprueba con fecha y deja enlazados los documentos en las filas consumidoras (lo hace el integrador del maestro).

## Pruebas y validación

Solo documental: coherencia con PRD/SH, enlaces locales, ausencia de secretos y de cifras sin fuente. Los tests aparecen en los consumidores (`MVP-072/075/082/090/092/100`).

## Seguridad, permisos y rollback

Sin credenciales. Un registro erróneo se sustituye por otro fechado que lo referencia. Si más adelante el perfil canónico cambia, se versiona (`schemaVersion`); no se invalidan versiones ya selladas.

## Riesgos

- Dos perfiles canónicos divergentes (snapshot vs manifiesto): el diseño debe ser único (SH-03).
- Rate limit insuficiente sin infraestructura nueva: declarar la limitación en lugar de prometer cobertura que no existe.
- Documentación de Mirror Node/HCS cambia: registrar fecha de consulta.

## Observaciones para el integrador

- `MVP-070` (congelar snapshot con hash) no declara dependencia de `MVP-012`, pero SH-03 exige el mismo perfil canónico para el hash del snapshot. Este plan no edita el maestro; se reporta.

## Decisiones pendientes

- Valores concretos de vigencia, umbrales de abuso, ventana de validez y criterio de ausencia concluyente: resultado de ejecutar este plan con la documentación oficial; no se inventan aquí.

## Referencias a completar

- **RQ-A3** — Spec [public-capabilities](../../../specs/public-capabilities.md) (§8, registro abierto de `MVP-011`) con [review-confirmation](../../../specs/review-confirmation.md): capacidades públicas, vigencia, abuso, reemisión/revocación y respuestas por estado del enlace. Documentos objetivo disponibles; entropía, vigencia, cuotas y demás parámetros siguen **propuestos, no aprobados**, hasta que el líder los registre aquí (F1). Consumidor: este plan (`MVP-011`) y luego `MVP-072/075`.
- **RQ-A4** — Diseño [manifest-hcs](../../../design/manifest-hcs.md) (perfil JCS y parámetros propuestos): perfil canónico, manifiesto de dos niveles, referencia pública, mensaje HCS, prueba pública y reconciliación. Documento objetivo disponible; la aprobación del perfil, los vectores de dominio y los parámetros de reconciliación siguen pendientes de `MVP-012` (F1). Consumidor: este plan (`MVP-012`) y luego `MVP-082/090/092/100`.

## Checklist

- [ ] Spec RQ-A3 (documento disponible) revisada por el líder.
- [ ] Diseño RQ-A4 (documento disponible) revisado por el líder.
- [ ] `MVP-011` decidida y aprobada por el líder.
- [ ] `MVP-012` decidida y aprobada por el líder, con vectores reproducibles.
- [ ] Observación sobre `MVP-070` comunicada al integrador.
- [ ] Filas de `MVP-011` y `MVP-012` actualizadas.

## Progreso y evidencia

No ejecutado.

## Cierre

Actualizar **solo** las filas `MVP-011` y `MVP-012` (enlace a los documentos aprobados y fecha) y recontar §3 tras integrar. Archivar en [`completed/`](../../completed/). Defaults sin aprobar no cierran las tareas. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
