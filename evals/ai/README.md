# Evaluación de IA (MVP-122 / MVP-123)

Dataset etiquetado para medir la redacción de Gemini y el contraste de Groq (PRD §12; [release-validation §4](../../docs/specs/release-validation.md); [sources-and-ai §7.4](../../docs/specs/sources-and-ai.md)). **No es un benchmark:** acá no hay resultados de modelos. La única corrida real es la sesión final de `MVP-135`.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `dataset/cases.v1.json` | 30 casos **ficticios** (15 correctos y 15 con errores sembrados): las fuentes que reciben los agentes |
| `dataset/labels.v1.json` | Lo esperado por caso: estado de control, advertencias, datos permitidos, campos «no informado», correcciones inocuas y justificación |
| `dataset/labels.lock.json` | Congelamiento: SHA-256 del JSON canónico de las etiquetas y fecha, previo a cualquier corrida |
| `dataset/schema.ts` | Esquemas Zod y utilidades (JSON canónico, estado esperado). No llama a proveedores |

## Reglas

- **Etiquetas inmutables:** una vez usadas en una corrida no se reescriben. Una corrección crea `labels.v2.json` con su motivo y su propio lock. El test `tests/contracts/ai-evaluation-dataset.test.ts` falla si `labels.v1.json` cambia sin actualizar el lock.
- **Subconjunto demo:** los 12 casos con `demo: true` (6 correctos y 6 con errores). El dataset completo no se recorta.
- **Criterio de la demo** (por referencia a MVP-013, sources-and-ai §7.4): 0 material inventado y 100 % de las contradicciones conocidas reportadas como **advertencia, no bloqueo**. El umbral comercial no se inventa acá. El veredicto de la demo lo da Nahuel.
- **Repeticiones:** no constan acordadas en MVP-013; se definen con el líder antes de la corrida final.
- **Límites:** los casos con `extraccion` dependen del texto que extraiga Gemini; Groq contrasta texto y **no** aporta inspección visual independiente. Los datos son ficticios y no dicen nada sobre fraude real.
- **Origen de las etiquetas:** las redactó Gastón con asistencia de Claude (Anthropic), que no es uno de los modelos evaluados. Ni Gemini ni Groq se ejecutaron sobre el dataset antes del congelamiento.

## Runner (MVP-123)

| Archivo | Qué es |
| --- | --- |
| `runner.ts` | Carga el dataset (falla si las etiquetas no coinciden con el lock) y pasa cada caso por **Agente 1 → Agente 2** con los servicios reales de MVP-051 y MVP-053, sobre puertos en memoria. Servicios y puertos de proveedor se inyectan; solo importa tipos de `src/lib` |
| `metrics.ts` | Cálculo determinista: detección, omisiones, falsos positivos, acuerdo de estado, candidatos a material inventado, variación entre repeticiones y fallos técnicos aparte (fuera de los denominadores) |
| `report.ts` | Registro JSON y tabla Markdown: versión y hash de etiquetas, modelos, versiones de prompt, entradas por referencia, salidas validadas, momento y métricas con denominadores. Nunca el texto de los prompts |
| `live.ts` | Conexión real. Exige `GALCOA_EVAL_LIVE=1` y la configuración de servidor de Gemini y Groq; si falta algo, falla antes de leer el dataset o crear clientes. No se ejecuta al importarlo |

Reglas del runner:

- **Un solo reintento**, y solo si el error es transitorio (MVP-013 §7.3). Sin fallback ni truncado: lo garantizan los puertos de `src/lib/ai`.
- **Repeticiones explícitas:** `runEvaluation` no tiene valor por defecto. El número se acuerda con el líder antes de la corrida final.
- **Correspondencia:** un hallazgo detecta una advertencia etiquetada si comparten una fuente (`m#`/`e#`; `b1` no cuenta). Es mecánica y generosa: el tipo de cada hallazgo se revisa a mano en el registro.
- **Material inventado:** se cuentan como *candidatos* los hechos del borrador en campos etiquetados «no informado». Requieren revisión humana.
- **Criterio demo:** `cumple`, `no_cumple` o `incompleto` es un cálculo sobre la corrida, no el veredicto (lo da Nahuel).
- **Fechas declaradas:** se cargan como no informadas porque el dataset trae la fecha dentro del texto. El Agente 1 recibe esa marca: hay que tenerlo en cuenta al leer las advertencias de fecha.

Pruebas: `tests/contracts/ai-evaluation-runner.test.ts`, con corridas sintéticas y dobles de proveedor. Verifican el cálculo y el aislamiento de CI, **no** la calidad de ningún modelo.

### Propuesta para el líder (sin aplicar)

`live.ts` y los servicios importan `server-only`, que en Node fuera de Next falla a propósito. Para la sesión final de MVP-135 hace falta un mecanismo de ejecución, que es decisión de Nahuel. Por ejemplo:

- un `vitest.eval.config.ts` con el mismo alias de `server-only` que el proyecto `server`, que incluya solo un archivo de entrada (por ejemplo `evals/ai/run.eval.ts`) que llame a `runLiveEvaluation` y `writeRecord`;
- el script `"eval:ai": "vitest run --config vitest.eval.config.ts"` en `package.json`, **fuera** de `npm test` y del workflow.

No se agregaron ni el script ni la configuración. La prueba de aislamiento acepta un script `eval:ai` y verifica que ningún otro script ni el workflow lo invoquen.
