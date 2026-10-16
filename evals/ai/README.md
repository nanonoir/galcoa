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
