# ExecPlan F2 — Contratos de dominio: núcleo documental, revisión, confirmación, versión y DTO públicos

**Estado: planificado; no implementado.** No cambia estados del [maestro](../mvp-master-plan.md).

Tareas del maestro: `MVP-020`, `MVP-021`

Requisitos PRD: REQ-17 y REQ-15 (base de contratos); estados [§5](../../GALCOA-PRD-v1.4.md), datos [§8](../../GALCOA-PRD-v1.4.md); INV-05, INV-09, INV-11–15, INV-17. Cuatro selecciones (D-08, §12.9).

Referencias: [fundaciones SH-01, SH-02, SH-03](../../../design/mvp-shared-foundations.md) · [arquitectura: contratos y barreras](../../../architecture.md) · [desarrollo](../../../development.md) · contratos actuales `src/lib/contracts/document.ts` y `dashboard.ts` · [manifest de barreras](../../../../tests/boundaries/manifest.mjs).

## Precondiciones y checkpoints

- `MVP-003` completada (contratos y escenarios del dashboard existen). `MVP-021` depende de `MVP-020`.
- Checkpoint A: `MVP-020` integrado. Checkpoint B: `MVP-021` integrado. Con A ya pueden avanzar `MVP-060` y la parte de `MVP-050` que solo usa el núcleo; con B, `MVP-022` y `MVP-110`.
- **Sin acciones remotas ni credenciales.** No depende de `MVP-012`: el contrato fija la forma del hash (`sha256` hexadecimal) y `schemaVersion`; el cálculo canónico pertenece a los consumidores (`MVP-070`, `MVP-082`) con el perfil de `MVP-012`.

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-020 | Esquemas Zod y tipos para documento, mensaje, evidencia (con hash, ubicación privada y extracciones relacionadas), borrador (con contador de concurrencia) y las dimensiones de estado de PRD §5 **reutilizando** los enums de `document.ts`. Fecha declarada del hecho (texto original, precisión, zona, instante solo si es suficiente, o desconocida explícita) y fecha de carga del servidor son campos distintos (INV-09). Sin React, SDK ni entorno. |
| MVP-021 | Esquemas de: revisión y snapshot (operación + advertencias compartibles con alias de fuente locales, selección, IDs, hash, `schemaVersion`); selección con exactamente las 4 combinaciones, siempre autor, orden canónico; comandos y resultados de confirmación (autor, tercero con nombre autodeclarado, rechazo con casilla desmarcada y ratificación) e idempotencia; versión con antecedente, constancias y referencias privadas; sello HCS separado de finalización; invitación pública y verificación pública como DTO mínimos estrictos propios; envelope de resultados técnicos. Fixtures inválidos rechazados. |

## Alcance, roles y carpetas

- Rol: **Líder**.
- Permitido: nuevos archivos en `src/lib/contracts/` (propuesta de módulos, ajustable: conversación/documento, evidencia, borrador, revisión, confirmación, versión, público, resultados técnicos) y tests en `tests/contracts/`.
- Prohibido: modificar de forma incompatible `DocumentSummarySchema`, `DashboardViewStateSchema` o sus fixtures (no añadir `schemaVersion` retroactivo al dashboard); tocar `src/mocks/`, `preview/`, `src/features/`, `src/app/`, dependencias, `.env*`; importar fuera de contratos y Zod; `node:crypto` o cálculo de hashes en contratos; relajar barreras.
- `DocumentWarningSchema.sources` (strings privados) se conserva. La advertencia compartible nueva usa alias locales («Fuente A…»), no ids internos (SH-02).

## Contratos

- Insumos: PRD §5/§8, SH-01…03, enums vigentes. Salidas: esquemas y tipos `z.infer`, consumidos por `MVP-022` (SQL), `MVP-060`, `MVP-040`+, `MVP-070`+ y `MVP-110` (props y escenarios del colaborador).
- IDs como cadenas no vacías (como los existentes); fechas ISO con `Z`; DTO solo JSON, sin `Date`, `File` ni `Buffer`.

## Pasos

1. Releer PRD §5/§8 y SH-01…03; listar entidades y campos mínimos; contrastar con `document.ts` para no duplicar enums.
2. `MVP-020`: escribir esquemas y tests válidos/ inválidos (fechas separadas, desconocida explícita, fecha de carga nunca sustituye la declarada, estados fuera de enum).
3. Revisar con el líder el checkpoint A y ejecutar los checks.
4. `MVP-021`: escribir los esquemas de revisión/snapshot/selección/confirmación/versión/sello.
5. `MVP-021`: DTO públicos con `z.strictObject` y construcción por allowlist: la invitación incluye operación completa, advertencias con alias, selección por roles y disponibilidad de respuesta; ninguna clave de chat, evidencias, tokens ni ids privados. La verificación pública incluye referencia opaca, estado de registro y prueba no sensible; nunca operación ni constancias.
6. `MVP-021`: envelope técnico (éxito persistido u operación en curso; error con código, etapa, reintentable, correlación no sensible) y tipos de identidad de operación durable solo como referencias (su máquina de estados pertenece a `MVP-080`).
7. Fixtures inválidos: selección sin autor o con combinación fuera de las cuatro; confirmar con casilla desmarcada; rechazar con casilla marcada o sin ratificación; tercero sin nombre al confirmar; claves extra en DTO público.
8. Ejecutar checks y revisar el diff.

## Pruebas

Vitest Node en `tests/contracts/` (proyecto `contracts`): válidos, inválidos, compatibilidad (tests actuales del dashboard sin cambios) y propiedad de `strict` en DTO públicos. Barreras: `npm run test:boundaries` sin cambios de configuración salvo necesidad demostrada. Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`. No hay Playwright ni RLS.

## Seguridad, permisos y rollback

Sin secretos. Contrato público por allowlist evita filtración por `spread`. Rollback: revertir los archivos nuevos; no hay datos ni migraciones. Cambios posteriores incompatibles requieren nueva `schemaVersion`, no edición de la anterior.

## Riesgos

- Sobre-especificar antes de las consultas SQL: mantener solo campos con consumidor o regla del PRD.
- Confundir `revisionId` con `snapshotId` (SH-01): el esquema de respuesta exige ambos más hash.
- Contrato de operación durable dependiente de `MVP-022`/`MVP-080`: solo referencias aquí.

## Decisiones pendientes

- Nombre autodeclarado del tercero requerido tanto al confirmar como al rechazar (INV-13: toda respuesta conserva ese nombre). Rechazar exige casilla desmarcada y ratificación, no conformidad; eso no elimina la atribución declarada.
- Nombres definitivos de módulos y campos: decisión local del líder al implementar.

## Referencias a completar

Ninguna adicional. La estructura de snapshot/DTO público ya está en SH-01/02; el perfil canónico (RQ-A4, [manifest-hcs](../../../design/manifest-hcs.md)) se consume después en `MVP-070/082`, no en este plan.

## Checklist

- [ ] Inventario de entidades y campos mínimos revisado.
- [ ] `MVP-020` implementada con tests válidos/ inválidos.
- [ ] Checks de `MVP-020` ejecutados; checkpoint A integrado.
- [ ] `MVP-021` implementada con DTO públicos estrictos y tests negativos.
- [ ] Checks de `MVP-021` ejecutados; checkpoint B integrado.
- [ ] Filas de `MVP-020` y `MVP-021` actualizadas.

## Progreso y evidencia

No ejecutado.

## Cierre

Actualizar **solo** las filas `MVP-020` y `MVP-021` (estado, evidencia con comandos reales, rama/PR) y recontar §3 tras integrar; no marcar `completada` por pasar en rama. Archivar en [`completed/`](../../completed/) con ambas integradas. Los mocks no cierran tareas de integración. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
