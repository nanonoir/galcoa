# F13 · Smoke real integrado, evaluación de IA real y cierre del MVP

**Estado: planificado; implementación no iniciada.** ExecPlan derivado del [plan maestro](../mvp-master-plan.md) (filas de `MVP-134`, `MVP-135` y `MVP-136`). El maestro conserva IDs, estados y evidencia; este plan no los modifica.

Tareas del maestro: `MVP-134`, `MVP-135`, `MVP-136`

Producto: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (REQ-01…REQ-18; §9, §11, §12; D-11). Fundaciones: [mvp-shared-foundations](../../../design/mvp-shared-foundations.md) (SH-06, SH-08, SH-09). Evidencia previa: [`f12-critical-flow-matrix-and-e2e`](f12-critical-flow-matrix-and-e2e.md), [`f12-ai-evaluation-dataset-and-runner`](f12-ai-evaluation-dataset-and-runner.md), [`f13-deploy-and-demo`](f13-deploy-and-demo.md), [`f13-release-security-and-ci`](f13-release-security-and-ci.md).

## 1. Objetivo y alcance

Tres checkpoints en orden de dependencia:

- **`MVP-134` — Smoke real integrado:** flujo completo en el entorno configurado con Supabase, proveedores de IA y Hedera **Testnet** reales, con autorización expresa.
- **`MVP-135` — Evaluación de IA real:** ejecutar el runner de `MVP-123` sobre el dataset congelado de `MVP-122`, y publicar resultados medidos con sus límites.
- **`MVP-136` — Cierre del MVP:** reconciliar REQ-01…18 con evidencia, actualizar docs y deuda, y archivar el plan maestro.

Esta es la única parte del MVP que usa servicios reales; **exige autorización expresa** para cada uno. Un doble, el preview o un test verde **no** sustituyen estas tareas. No hay fallback a mock: si un proveedor falla, se registra el fallo tal cual.

Fuera de alcance: Mainnet, cobros, SMTP propio, evaluación de calidad más allá del dataset acordado, validación regulatoria.

## 2. Trazabilidad

| ID | REQ / INV / SH | Idea de aceptación |
| --- | --- | --- |
| `MVP-134` | REQ-10, REQ-16, REQ-18; INV-03, INV-06, INV-15, INV-18; SH-05, SH-06 | Flujo real completo; evidencia sin secretos; fallo/reintento de sello si es reproducible |
| `MVP-135` | REQ-06, REQ-18; D-11; SH-08, SH-09 | Resultados medidos con límites; si no alcanzan el mínimo, se informa |
| `MVP-136` | REQ-01…REQ-18 | Reconciliación con evidencia; docs y deuda actualizadas; maestro archivado |

## 3. Dependencias

- `MVP-134` ← `MVP-091` (sello posterior), `MVP-092` (reconciliación), `MVP-121` (matriz y E2E), `MVP-133` (datos y cuentas de demo).
- `MVP-135` ← `MVP-123` (runner), `MVP-134`.
- `MVP-136` ← `MVP-118`, `MVP-121`, `MVP-131`, `MVP-134`, `MVP-135`.
- Por paso: L0 sin dependencias remotas; L1 ← L0, autorización; L2 ← L1; L3 ← L2; E1 ← `MVP-134`, `MVP-123`; E2 ← E1, autorización; E3 ← E2; K1…K4 ← sus tareas del maestro; K5 ← K1–K4.
- Los pasos L0 y K1 parciales (preparar el procedimiento y la plantilla de reconciliación) son locales y no esperan al resto; **no se bloquea trabajo local por que el ciclo completo no haya terminado**.

## 4. Archivos y zonas: propiedad y límites

| Zona | Owner | Notas |
| --- | --- | --- |
| Entorno desplegado y credenciales | **Externo / propietario** | Autorización expresa; el agente no lee `.env` ni valores |
| Tests y scripts de smoke | Líder | Solo si hacen falta; datos ficticios |
| Resultados de evaluación (artefactos del runner) | Líder | Sin prompts completos por defecto |
| Docs: `README.md`, `docs/README.md`, `docs/architecture.md`, `docs/development.md`, tracker | Líder, en `MVP-136` | Actualización de estado real; no antes |
| Plan maestro | Líder | Solo en el cierre, por IDs |
| Colaborador | No participa | |

## 5. Insumos y salidas

| Insumo | Salida |
| --- | --- |
| Entorno de demo desplegado con cuentas y datos ficticios (`MVP-133`) | Recorrido real con IDs opacos de topic/transacción (públicos en Testnet), sin claves ni valores de entorno |
| Dataset congelado y runner (`MVP-122`, `MVP-123`) | Resultados de la corrida real: modelos, versiones de prompt, detecciones, falsos positivos, omisiones, variación |
| Evidencia de todas las tareas | Tabla REQ → tareas → evidencia (`MVP-136`) |

## 6. Pasos y checkpoints

Todos pendientes. Todo lo «real» requiere autorización del usuario.

**Checkpoint A — `MVP-134` (real, autorizado)**

- [ ] **L0 · Preflight local** (sin red). Procedimiento, lista de verificaciones y plantilla de evidencia sin secretos; comprobar que existen cuentas/datos de demo y que `HEDERA_NETWORK` es `testnet` por nombre de variable (sin leer valores).
- [ ] **L1 · Recorrido real** (← L0, `MVP-091`, `MVP-092`, `MVP-133`; autorización de Supabase cloud, IA y Hedera Testnet). Con datos ficticios: crear documento, conversar y adjuntar, advertencias, congelar revisión para las selecciones acordadas, confirmaciones (autor y terceros por enlace), finalización con PDF, sello en Testnet, verificación pública con y sin PDF y con un byte alterado (debe fallar). Sin fallback a mocks: un fallo se registra y detiene esa etapa.
- [ ] **L2 · Fallo y reintento de sello, si es reproducible** (← L1). Solo si existe una forma segura y autorizada de provocarlo; entonces comprobar «finalizada; sello pendiente», mismo PDF/hash y reconciliación previa al reintento. Si no es reproducible, se declara «no probado en real» sin simularlo.
- [ ] **L3 · Evidencia** (← L2). Fecha, entorno, versiones, IDs opacos, resultados y límites; sin secretos ni contenido privado. Comprobar que ningún registro HCS contiene texto privado (INV-06).

**Checkpoint B — `MVP-135` (real, autorizado)**

- [ ] **E1 · Preparación** (← `MVP-123`, `MVP-134`). Verificar que el dataset y sus etiquetas coinciden con el hash registrado antes de cualquier corrida; confirmar parámetros (repeticiones, timeouts) tomados de la decisión de `MVP-013`, no inventados aquí.
- [ ] **E2 · Ejecución real** (← E1; autorización para credenciales reales de IA). Ejecutar el runner con configuración de servidor puesta por el propietario; fuera de CI y de PRs.
- [ ] **E3 · Informe** (← E2). Publicar métricas **medidas** con límites (tamaño del dataset, modelos y versiones, variación, que GPT-OSS no ve imágenes, que no prueba detección de fraude ni validación regulatoria). Si no se alcanza la calidad mínima de `MVP-013`, informarlo sin ocultarlo ni reescribir etiquetas, prompts o criterios a posteriori. Sin cifras inventadas ni resultados hipotéticos.

**Checkpoint C — `MVP-136`** (← todo lo anterior; no se avanza sin sus dependencias `completada`)

- [ ] **K1 · Reconciliación REQ-01…18** (← `MVP-118`, `MVP-121`, `MVP-131`, `MVP-134`, `MVP-135`). Para cada requisito, tareas del §5 del maestro, su estado y evidencia real. Un requisito se declara cumplido solo si todas sus tareas están `completada`; las que no, se listan.
- [ ] **K2 · Documentación** (← K1). Actualizar el estado real en `README.md`, `docs/README.md`, `docs/architecture.md` («Estado actual» deja de decir que no hay Auth/IA/PDF/Hedera solo si es cierto) y `docs/development.md`.
- [ ] **K3 · Deuda** (← K1). Actualizar el [tracker](../../tech-debt-tracker.md): #2 → `MVP-134`; #3 → `MVP-050`, `MVP-053`; #5 → `MVP-006`, `MVP-121`, `MVP-131`, cada una según su evidencia. Si `MVP-014` (revisión jurídica, Externo) sigue pendiente, declarar que el uso queda limitado a datos ficticios.
- [ ] **K4 · Recuento y verificación del maestro** (← K1). Ejecutar el comando de recuento del §3 del maestro y la verificación del §10; confirmar que tablero, progreso y enlaces coinciden.
- [ ] **K5 · Archivo** (← K2–K4). Mover el plan maestro y los planes derivados cerrados a `../../completed/`, conservando enlaces y evidencia en las filas.

## 7. Validación

| Qué | Acredita | No acredita |
| --- | --- | --- |
| Smoke real | Integración efectiva con Supabase, IA y Hedera Testnet en el entorno probado | Calidad de IA, desempeño en producción, permanencia de Testnet |
| Evaluación real | Medición sobre el dataset acordado | Ausencia de errores, detección de fraude, cumplimiento regulatorio |
| Cierre | Coherencia entre requisitos, tareas y evidencia | Nada por sí mismo |

Antes del smoke: checks locales (`lint`, `typecheck`, `test`, `test:boundaries`, `build`, `test:e2e`). Todo resultado se registra con su fecha y comandos reales.

## 8. Evidencia

No ejecutada. Se registrará por checkpoint: fecha · comandos · resultado · IDs opacos públicos · rama/PR/commit · limitaciones. Sin secretos, valores de variables ni contenido privado.

## 9. Referencias a completar

- **RQ-D1** → [release-validation](../../../specs/release-validation.md) (§1, §4 y §5): criterios y matriz de evidencia (qué prueba cada nivel), **compuerta de evaluación** (formato del informe, tratamiento de un resultado bajo el mínimo) y lista de verificación del cierre. El recorrido Next íntegro con adapters reales que cierra el hueco de transporte del E2E compuesto de `MVP-121` ([data-transactions §7](../../../design/data-transactions.md#7-costuras-de-tests-y-evidencia)) corresponde a `MVP-134`. Complementa, sin duplicarlo, el registro de decisiones del PRD §16.
- **RQ-D2** → no aplica.

Bloqueos posibles (se anotan en el §9 del maestro por el líder, no aquí): falta de autorización o credenciales de Supabase/IA/Hedera bloquean solo `MVP-134`/`135`; `MVP-014` no bloquea la demo con datos ficticios.

## 10. Rollback y límites

- El smoke real crea datos en un entorno de demo con datos ficticios; se retiran desde ese entorno si se pide. Los mensajes de HCS Testnet **no se pueden deshacer** (y Testnet puede reiniciarse): por eso solo hashes e identificadores opacos y solo con autorización.
- Ninguna acción remota ni uso de credenciales sin autorización expresa; no se leen secretos; no se llama a proveedores desde CI.
- El archivo del maestro (K5) es reversible por Git, pero solo se hace con todos los IDs `completada`.

## 11. Cierre

Cada ID cierra solo con su aceptación real validada tras integrarse y con evidencia en su fila del maestro: `MVP-134` con el recorrido real, `MVP-135` con resultados medidos y publicados, `MVP-136` con REQ-01…18 reconciliados, docs y deuda al día y el maestro archivado. Un resultado de evaluación inferior al mínimo no impide registrar la tarea como ejecutada, pero debe constar de forma explícita en la reconciliación. Tras cada cierre: recuento del §3 del maestro, enlace, archivo de este plan en `../../completed/`. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
