# F12 · Dataset de evaluación de IA y runner

**Estado: checkpoint A (`MVP-122`) implementado el 2026-10-16 (Issue #34); checkpoint B (`MVP-123`) implementado con dobles el 2026-10-16; falta el mecanismo de ejecución del líder.** ExecPlan derivado del [plan maestro](../mvp-master-plan.md) (filas de `MVP-122` y `MVP-123`). El maestro conserva IDs, estados y evidencia; este plan no los modifica.

Tareas del maestro: `MVP-122`, `MVP-123`

Producto: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (REQ-06, REQ-18; §12 «Evaluación de IA»; D-05, D-11; INV-02, INV-07, INV-10). Fundaciones: [mvp-shared-foundations](../../../design/mvp-shared-foundations.md) (SH-08, SH-09, SH-10).

## 1. Objetivo y alcance

- **`MVP-122`:** dataset de ~30 casos etiquetados (correctos y con errores sembrados), con etiquetas **fijadas antes de ejecutar modelos**, y criterios de medición y calidad mínima documentados.
- **`MVP-123`:** runner de evaluación **separado de CI** que registra modelos, prompts, detecciones, falsos positivos, omisiones y variación; sin llamadas en PRs.

Separado de este plan: la **ejecución real** con proveedores y la publicación de resultados es `MVP-135` ([`f13-live-validation-and-closure`](f13-live-validation-and-closure.md)); aquí solo se construye lo que permite ejecutarla. Tampoco se miden métricas ni se afirma calidad: **no se escriben números de rendimiento**. Los tests deterministas de CI siguen siendo otra cosa (PRD §12, D-11).

## 2. Trazabilidad

| Fuente | Aplicación |
| --- | --- |
| REQ-18, D-11 | Evaluación de IA separada de los tests de CI; métricas honestas |
| REQ-06, INV-02 | Se evalúa la detección de discrepancias del Agente 2; sus resultados son informativos |
| INV-07 | Se registran modelo, versión de prompt, momento y referencias; no se reconsulta para reescribir historia |
| INV-10 | Los casos no esperan que la IA invente valores ilegibles |
| SH-08 | Modelos fijos por D-05; GPT-OSS recibe texto: no hay validación visual independiente; datos de evaluación ficticios, sin prompts completos en logs por defecto |
| SH-09 | Evaluación y smoke reales fuera de CI por defecto, dataset etiquetado antes de ejecutar |
| SH-10 | Parámetros, coste, timeouts y calidad mínima vienen de `MVP-013`; no se inventan umbrales |

## 3. Dependencias

- `MVP-122` ← `MVP-013` (parámetros de modelos, coste, tiempos máximos y calidad mínima).
- `MVP-123` ← `MVP-122`, `MVP-053` (Agente 2 con Groq).
- Los pasos de diseño del dataset que no dependan de los valores de `MVP-013` (tipos de caso, formato, esquema de etiquetas) pueden iniciarse antes; **el umbral de calidad mínima no se escribe hasta que `MVP-013` lo documente**.
- Por paso: Q1 ← `MVP-013` (parcial); Q2 ← Q1; Q3 ← Q2 (cierra `MVP-122`); Q4 ← `MVP-053`, Q3; Q5 ← Q4; Q6 ← Q5.
- `MVP-122` no espera a `MVP-053`; `MVP-123` sí.

## 4. Archivos: propiedad y límites

Todo **Líder**.

| Zona | Notas |
| --- | --- |
| Directorio de evaluación fuera de `tests/` y fuera de los proyectos Vitest por defecto (propuesta: `evals/ai/`; decisión local) | Dataset, esquema de etiquetas (Zod), runner, resultados |
| Script npm de evaluación (propuesta `eval:ai`) en `package.json` | **Nunca** invocado por CI ni por `npm test` |
| Tests deterministas del propio runner | Dentro del suite normal; usan resultados sintéticos, **sin proveedores** |
| `src/lib/ai/**` | Sin cambios; el runner pasa por el servicio real del Agente 2 para medir el pipeline verdadero, sin duplicar prompts |

Prohibido: leer `.env`, ejecutar llamadas reales, añadir la evaluación al workflow de CI.

## 5. Insumos y salidas

| Insumo | Salida |
| --- | --- |
| Parámetros y calidad mínima de `MVP-013` | Criterios de medición y umbral documentados (copiados por referencia a su decisión, no inventados) |
| Contratos de reporte del Agente 2 (`MVP-053`): `sin_inconsistencias_criticas_detectadas`, `con_advertencias`, `contradiccion_critica` | Etiquetas esperadas por caso |
| Ejemplos del PRD §4 (10 vs 12 cajas; valor sin unidad; fecha no informada; carga posterior) | Casos sembrados |
| — | Dataset + esquema validado; runner; formato de registro de corrida |

## 6. Pasos y checkpoints

Checkpoint A completo; checkpoint B implementado (Q6 parcial: el script y el mecanismo `server-only` son del líder).

**Checkpoint A — `MVP-122`** (no necesita proveedores ni `MVP-053`)

- [x] **Q1 · Diseño del dataset** (← `MVP-013`, parcial). ~30 casos como punto de partida (p. ej. 15 correctos y 15 con contradicciones, omisiones o errores sembrados, según PRD §12). Cobertura mínima: cantidades contradictorias, precios, unidad ausente, fecha ausente, destinatario distinto, error ortográfico inocuo (no es error material), datos consistentes, caso con texto extraído de evidencia (declarado como no independiente de Gemini). Datos **ficticios**; sin afirmaciones regulatorias ni de detección de fraude.
- [x] **Q2 · Etiquetado previo** (← Q1). Cada caso con etiqueta esperada y justificación breve, definidas por una persona **antes** de ejecutar cualquier modelo; guardar hash del archivo de etiquetas y su fecha para evidenciar que precede a las corridas. Esquema de etiquetas validado con Zod; fixtures inválidos rechazados.
- [x] **Q3 · Criterios de medición y calidad mínima** (← Q2, `MVP-013`). Definir: errores detectados / errores etiquetados, falsos positivos, omisiones y variación entre repeticiones (el número de repeticiones sale de `MVP-013`, no se inventa aquí). Referir el umbral de calidad mínima a la decisión de `MVP-013`. Con esto se cumple `MVP-122`.

**Checkpoint B — `MVP-123`** (← `MVP-053`)

- [x] **Q4 · Runner** (← Q3, `MVP-053`). Carga dataset, valida etiquetas, invoca el servicio real del Agente 2 solo con configuración de servidor tomada del proceso (ejecutada por el líder fuera del agente), y registra por corrida: modelos y versiones, versión de prompt, entradas por referencia, salida validada, momento. No incluye prompts completos en logs por defecto.
- [x] **Q5 · Cómputo de métricas** (← Q4). Detección, falsos positivos, omisiones y variación; salida tabular y JSON. Tests **deterministas con resultados sintéticos** que verifican el cálculo (no la calidad de ningún modelo). Si falta la configuración, el runner falla con error técnico explícito: nunca simula resultados.
- [ ] **Q6 · Aislamiento de CI** (← Q5). Comprobar que el script no está en el workflow ni en `npm test`, y que un PR no lo dispara; un test de configuración lo verifica. Mecanismo de ejecución (script Node vs proyecto Vitest dedicado) con módulos `server-only`: decisión local abierta del líder.

## 7. Validación

| Qué | Cómo | Límite |
| --- | --- | --- |
| Esquema y dataset | Vitest: validación Zod, cobertura de tipos de caso, unicidad de IDs | No prueba calidad de IA |
| Cálculo de métricas | Vitest con resultados sintéticos | No usa proveedores; no genera cifras de calidad |
| Aislamiento de CI | Test de configuración | No ejecuta el runner real |
| Ejecución real | **No en este plan** (`MVP-135`) | — |

## 8. Evidencia

**Checkpoint A (2026-10-16, rama `issue/34-ai-eval-dataset`):** `evals/ai/dataset/cases.v1.json` (30 casos ficticios, 12 demo), `labels.v1.json` (etiquetas previas con justificación), `labels.lock.json` (SHA-256 del JSON canónico `f2f2061e…f47e05e`, congelado 2026-10-16T14:34:06Z, sin corridas previas de Gemini ni Groq), `schema.ts` (Zod) y `evals/ai/README.md` (criterios por referencia a MVP-013: 0 material inventado y 100 % de contradicciones conocidas como advertencia; repeticiones a acordar con el líder antes de la corrida final). Comandos: `npx vitest run tests/contracts/ai-evaluation-dataset.test.ts` 20/20; `npm run lint`, `npm run typecheck`, `npm test` (244), `npm run test:boundaries` (66), `npm run build` con exit 0. Etiquetas redactadas por Gastón con asistencia de Claude (no evaluado). **Checkpoint B (2026-10-16, rama `issue/34-ai-eval-runner`):** `evals/ai/runner.ts`, `metrics.ts`, `report.ts` y `live.ts` (habilitación `GALCOA_EVAL_LIVE=1` más configuración de servidor; sin ella falla antes de crear clientes). El runner pasa cada caso por los servicios reales de MVP-051 y MVP-053 sobre puertos en memoria, con un solo reintento transitorio y repeticiones explícitas. Pruebas: `tests/contracts/ai-evaluation-runner.test.ts` 21/21 (cálculo con corridas sintéticas, runner con dobles de proveedor, habilitación y aislamiento de CI); `npm run lint`, `npm run typecheck`, `npm test` (386), `npm run test:boundaries` (67), `npm run build` con exit 0. Sin llamadas reales ni cifras. Pendiente del líder (Q6): mecanismo `server-only` y script `eval:ai`, propuesta en `evals/ai/README.md`. Para la corrida final se registrará: fecha, comandos y resultados reales de los tests, hash de etiquetas y su fecha, rama/PR/commit. Ninguna cifra de detección ni de calidad figura en este plan.

## 9. Referencias a completar

- **RQ-D1** → [release-validation](../../../specs/release-validation.md) (§4): **compuerta de evaluación** (dataset etiquetado antes de ejecutar modelos, contenido del informe, tratamiento de un resultado bajo el mínimo y límites de lo que la evaluación no demuestra). Complementa, sin duplicar, el registro de parámetros y mínimo de calidad de `MVP-013` en [sources-and-ai §7](../../../specs/sources-and-ai.md) (propuesto, no aprobado; el mínimo y la métrica siguen abiertos en F1) y [SH-10](../../../design/mvp-shared-foundations.md).
- **RQ-D2** → no aplica.

## 10. Rollback y límites

- Dataset, runner y script son archivos nuevos: revertirlos no afecta el producto. Etiquetas ya usadas en una corrida no se reescriben a posteriori; una corrección crea otra versión del dataset y se anota.
- Sin llamadas a proveedores, sin `.env`, sin CI de evaluación; sin commit/push/merge sin autorización. No se redactan promesas de calidad.

## 11. Cierre

`MVP-122` se completa al integrar dataset, etiquetas fijadas y criterios; `MVP-123` al integrar el runner y sus tests con evidencia real. Cada uno cierra por separado. Luego recuento del §3 del maestro. Las métricas reales no se registran aquí: son de `MVP-135`. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
