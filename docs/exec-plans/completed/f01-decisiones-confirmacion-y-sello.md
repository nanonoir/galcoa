# ExecPlan F1 — Decisiones de capacidades públicas (tokens) y de manifiesto/reconciliación HCS

**Estado: completado y archivado.** Tareas cubiertas: `MVP-011`, `MVP-012`.

Tareas del maestro: `MVP-011`, `MVP-012`

Requisitos PRD: REQ-12/13/16/17 (tokens), REQ-09/10/11 (manifiesto y HCS); INV-06, INV-12, INV-13, INV-15, INV-17, INV-18; [§8–9, §16](../GALCOA-PRD-v1.4.md).

Referencias: [fundaciones SH-03, SH-04 y SH-06](../../design/mvp-shared-foundations.md) · SH-10 · [arquitectura](../../architecture.md) · [maestro F1 y §8.7](../active/mvp-master-plan.md).

## Precondiciones y checkpoints

- Sin dependencias; las dos tareas son independientes. Checkpoint A: `MVP-011`. Checkpoint B: `MVP-012`.
- Consumidores: `MVP-011` → `MVP-072/075`; `MVP-012` → `MVP-082`, `MVP-090`, `MVP-092` (y, por SH-03, el hash del snapshot de `MVP-070`).
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

- `MVP-070` (congelar snapshot con hash) consume el mismo perfil canónico de `MVP-012` por regla de diseño SH-03.

## Decisiones pendientes

- Resuelto el 2026-10-16: `manifest-hcs` §1/§2 se alineó al contrato (`selection` dentro de `content`; V5–V8 validados), y el contrato aplica el máximo de 200 puntos de código en `declaredName` (comandos, resultados y `ReceiptSchema`) con tests en Vitest.
- Resoluciones técnicas aceptadas por el orquestador el 2026-10-16.

## Referencias a completar

- **RQ-A3** — Spec [public-capabilities](../../specs/public-capabilities.md) (§8, registro de decisiones `MVP-011`): capacidades públicas, vigencia 72 h, abuso en Postgres (60/10 por min), reemisión/revocación y respuestas uniformes. Consumidor: este plan y luego `MVP-072/075`.
- **RQ-A4** — Diseño [manifest-hcs](../../design/manifest-hcs.md) (perfil JCS, manifiesto de dos niveles y reconciliación): JCS + SHA-256, nonce privado de 32 bytes, reference opaca de 16 bytes, validez de transacción de 120 s persistida, plazos 5/20/10/30 s y ausencia concluyente. Consumidor: este plan y luego `MVP-082/090/092/100`.

## Checklist

- [x] Spec RQ-A3 revisada por el líder y aceptada por el orquestador.
- [x] Diseño RQ-A4 revisado por el líder y aceptado por el orquestador.
- [x] `MVP-011` decidida y aprobada por el líder/orquestador.
- [x] `MVP-012` decidida y aprobada por el líder/orquestador, con vectores reproducibles V0–V8.
- [x] Observación sobre `MVP-070` comunicada al integrador.
- [x] Filas de `MVP-011` y `MVP-012` actualizadas en el maestro.

## Progreso y evidencia

Completado documentalmente el 2026-10-16:
- Valores aprobados y registrados: tokens de 32 bytes (base64url) con hash en base, 72 h configurable, GET sin consumo, respuesta/consumo atómicos e idempotentes, reemisión que invalida tokens previos sin heredar respuestas, rate limit en Postgres de 60 lecturas y 10 escrituras por minuto sobre ventana de 60 s con hash de IP confiable, y nombre autodeclarado máximo 200 codepoints (incorporado en esquema de dominio y verificado con tests).
- Manifiesto HCS: JCS (RFC 8785) + SHA-256, nonce exclusivamente privado de 32 bytes, `reference` pública opaca de 16 bytes, solo Testnet, hashes e identificadores opacos en HCS, validez de transacción de 120 s persistida, plazos 5/20/10/30 s, ausencia concluyente estricta (expiración conocida y recibo definitivo de fracaso; ausencia sola es desconocida sin reenvío automático) y vectores reproducibles V0–V8 en [manifest-hcs §2](../../design/manifest-hcs.md).
- Resoluciones técnicas formalmente aceptadas por el orquestador. Pruebas de SDK, red y runtime quedan asignadas a los consumidores técnicos.

## Cierre

Plan completado y archivado. Las tareas `MVP-011` y `MVP-012` quedan marcadas como `completada` en el plan maestro [`mvp-master-plan.md`](../active/mvp-master-plan.md) con evidencia documental verificable.

## Implementation Outcome

### Implemented

Se completaron e integraron todas las decisiones documentales requeridas para `MVP-011` y `MVP-012` en sus fuentes canónicas:
- **Capacidades públicas y tokens (`MVP-011`)** en [`public-capabilities.md`](../../specs/public-capabilities.md): tokens aleatorios de 32 bytes en formato base64url con hash en base de datos; vigencia configurable por defecto de 72 h; consumo atómico e idempotente en POST sin consumo en GET; política de rate limit implementada en Postgres (60 lecturas/min, 10 escrituras/min sobre ventana fija de 60 s agrupada por hash de IP confiable de plataforma; respuestas `429` con `Retry-After` y `503` ante fallos de infraestructura); y límite estricto de 200 puntos de código para el nombre autodeclarado de terceros incorporado en los contratos de dominio.
- **Perfil canónico y reconciliación HCS (`MVP-012`)** en [`manifest-hcs.md`](../../design/manifest-hcs.md): canonicalización estricta bajo JCS (RFC 8785) + SHA-256; estructura de dos niveles con nonce privado de 32 bytes, compromiso público y `reference` pública de 16 bytes; mensajes HCS restringidos estrictamente a hashes e identificadores opacos en Testnet; persistencia obligatoria de la intención con `transactionValidDuration = 120` segundos; plazos operativos (5 s hash, 20 s envío/recibo, 10 s consulta Mirror, 30 s espera interactiva total); definición unívoca de ausencia concluyente (expiración vencida y recibo de fracaso terminal comprobado; la ausencia por sí sola es desconocida e impide reenvío automático); y vectores de prueba reproducibles (V0–V4 sintéticos y V5–V8 de dominio).

### Deviations from Design

None. El diseño de `manifest-hcs.md` §1/§2 fue alineado con la estructura real de los contratos (`content.selection`), y el tope de 200 caracteres de `declaredName` fue implementado en los esquemas y validado por los tests del proyecto.

### Validation

- Validación documental completa contra el PRD §8–9, §12.6–8, §12.13–14, fundaciones SH-03/04/06, RFC 8785 y la API de Hedera / `@hiero-ledger/sdk`.
- Suite completa de contratos en `tests/contracts/` con 224 tests pasando en Vitest (incluyendo 66 tests de barreras de arquitectura) con exit 0 en `sh_144ad1456001oRrn5vunfZFhsT`.
- Revisión técnica documental completa: PASS.

### Follow-up

- Consumidores posteriores de confirmaciones (`MVP-072…075`) y de orquestación/sello HCS (`MVP-082`, `MVP-090…093`, `MVP-100`) implementarán los esquemas, tablas SQL y adapters de red sobre estas especificaciones cerradas.
