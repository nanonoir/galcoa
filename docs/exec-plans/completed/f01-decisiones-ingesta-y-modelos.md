# ExecPlan F1 — Decisiones de adjuntos/extracción y de modelos, coste y calidad

**Estado: completado y archivado.** Tareas cubiertas: `MVP-010`, `MVP-013`.

Tareas del maestro: `MVP-010`, `MVP-013`

Requisitos PRD: REQ-04 (evidencias), REQ-05/06 (agentes); [§4 «Límites de actuación»](../GALCOA-PRD-v1.4.md), [§16 detalles pendientes](../GALCOA-PRD-v1.4.md) (adjuntos y parámetros de modelos), D-04, D-05, INV-02, INV-07.

Referencias: [fundaciones SH-08 y SH-10](../../design/mvp-shared-foundations.md) · [arquitectura](../../architecture.md) · [maestro F1 y regla de decisiones (§8.7)](../active/mvp-master-plan.md).

## Precondiciones y checkpoints

- Sin dependencias; ambas tareas son independientes entre sí y del resto de F1–F3. Checkpoint A: `MVP-010` documentada. Checkpoint B: `MVP-013` documentada.
- Consumidores que esperan estas decisiones antes de empezar: `MVP-010` → `MVP-042/043`; `MVP-013` → `MVP-050`, `MVP-053`, `MVP-122`, `MVP-123`.
- No se bloquea nada por acceso cloud: las decisiones se toman con documentación oficial pública, sin credenciales ni llamadas a proveedores.

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-010 | Documento citable con: matriz por formato (texto, PDF, imágenes simples) de tamaño, páginas y cantidad admitidos; tratamiento de extracción por formato y su procedencia; comportamiento ante rechazo técnico y fallo del proveedor (impedimento informado, nunca texto inventado); tratamiento explícito de discrepancias visuales que GPT-OSS no puede verificar (sin proclamar verificación visual independiente). Cada límite cita su fuente (documentación oficial con fecha de consulta) o se marca como decisión de producto. No amplía a audio ni medios complejos (P1). |
| MVP-013 | Documento citable con: parámetros de generación y contraste por agente (modelos fijados por D-05: no se cambian aquí), tiempos máximos por etapa, límites de entrada y de coste esperados, dónde se configuran (constantes o variables no secretas) y el **criterio de calidad mínima** antes de habilitar documentos reales, sin valores de rendimiento inventados. Distingue límite técnico, advertencia y calidad medida. |

## Alcance, roles y carpetas

- Rol: **Líder**. Sin colaborador.
- Permitido: escribir los registros de decisión en el documento consumidor (ver «Referencias a completar») y, solo si la decisión cambia producto, proponer el ajuste al PRD al líder (no se edita el PRD aquí).
- Prohibido: código, instalación de `ai`, `@ai-sdk/react`, `groq-sdk`, llamadas reales a Gemini/Groq, lectura de `.env`, presentar valores no aprobados como definitivos.

## Contratos

- Insumos: PRD §3–4 y §16, SH-08 (datos no confiables, Groq solo texto), límites oficiales de Gemini (entrada de archivos), Groq (`openai/gpt-oss-120b`), AI SDK, Supabase Storage por plan y límites de despliegue de Vercel (por ejemplo tamaño de cuerpo de petición de una función) — **consultar la versión y plan vigentes al ejecutar; no se citan cifras de memoria**.
- Salidas: registro de decisiones con estado `propuesto` o `aprobado AAAA-MM-DD`, alternativas descartadas y evidencia pendiente. Los defaults propuestos por especialistas se etiquetan «no aprobados» hasta que el líder los apruebe.

## Pasos

1. Leer el documento consumidor redactado por el especialista y comprobar que separa límites técnicos, advertencias y calidad medida.
2. `MVP-010`: reunir los límites oficiales de cada eslabón (carga a la app → Storage → extracción por Gemini) y fijar el mínimo común coherente; decidir cómo se carga un archivo (a través de la función o directo a Storage) porque condiciona el límite efectivo; definir mensajes de rechazo técnico.
3. `MVP-010`: definir qué se persiste de la extracción (proveedor, método, página/región) y la leyenda de limitación visual que ven autor y, cuando corresponda, la advertencia compartible.
4. `MVP-013`: definir parámetros, timeouts por etapa compatibles con el límite de ejecución del despliegue previsto, y política de reintento/cancelación a nivel de configuración (la lógica es de `MVP-052`).
5. `MVP-013`: definir el criterio de calidad mínima: qué se mide (detectados/etiquetados, falsos positivos, omisiones, variación; PRD §12), con qué dataset (`MVP-122`) y quién decide el umbral. Si el umbral numérico solo puede fijarse tras medir, declararlo pendiente y condicionar el uso de documentos reales a esa decisión.
6. El líder revisa y marca cada decisión `aprobada` con fecha. Reflejar en el PRD solo si cambia producto.
7. Dejar enlazado el documento en las filas consumidoras (lo hace el integrador del maestro).

## Pruebas y validación

Solo documental: coherencia con PRD/SH, enlaces locales y ausencia de secretos. No corresponden tests de aplicación. Los límites quedan verificables por los tests de `MVP-042/043/050/053` (no aquí).

## Seguridad, permisos y rollback

Sin credenciales ni datos reales. Si una decisión resulta errónea, se reemplaza por un nuevo registro fechado; no se reescribe el histórico.

## Riesgos

- Límites oficiales cambian o dependen del plan contratado: registrar fecha de consulta y plan; revisar antes de documentos reales.
- Confundir calidad medida con advertencia o con límite técnico (SH-03). Mitigación: tabla explícita en el documento.
- Que el límite de Vercel/Storage sea menor que el del modelo y condicione la arquitectura de carga: decidirlo en el paso 2.

## Decisiones pendientes

- Umbral numérico de calidad para **datos reales**: queda para la sesión final de evaluación (`MVP-122`); la demo con los 12 casos ficticios ya tiene criterio (sources-and-ai §7.4).

Decisiones locales aceptadas por el orquestador el 2026-10-16 (decisiones técnicas delegadas por el usuario; sin aprobación humana adicional):

- Evaluación final: el dataset de ~30 casos se conserva en una sola sesión; los 12 son el subconjunto de la demo y, si solo corren esos, la brecha queda explícita.
- Etiquetado concreto de los 12 casos: lo fija `MVP-122` (consumidor), no bloquea F1.
- Valores de límites (§7.1, §7.3) y resoluciones técnicas de la spec: aceptados.

## Referencias a completar

- **RQ-A2** — Spec [sources-and-ai](../../specs/sources-and-ai.md) (§7, registro de decisiones F1): matriz de formatos, límites, extracción, procedencia y parámetros/calidad de modelos aprobados. Consumidor: este plan y luego `MVP-042/043/050/053/122/123`.

## Checklist

- [x] Spec RQ-A2 revisada por el líder y aceptada por el orquestador.
- [x] Límites oficiales consultados con fecha y plan.
- [x] `MVP-010` decidida y aprobada por el líder/orquestador.
- [x] `MVP-013` decidida y aprobada por el líder/orquestador (criterio de demo fijado con 12 casos; umbral real para evaluación final).
- [x] PRD revisado (no requirió cambio de producto).
- [x] Filas de `MVP-010` y `MVP-013` actualizadas en el maestro.

## Progreso y evidencia

Completado documentalmente el 2026-10-16:
- Valores aprobados y registrados en [sources-and-ai §7](../../specs/sources-and-ai.md): 10 MiB por archivo, 20 MiB acumulados por documento, 3 archivos por documento, 10 páginas PDF, 20 MP en imágenes y 8000 caracteres en chat.
- Resoluciones técnicas locales aceptadas por el orquestador: carga directa a Storage privado; extracción en servidor vía Files API con borrado explícito; 30 s por etapa; razonamiento bajo (`low`); y criterios de demo para los 12 casos (0 inventado, 100 % contradicciones conocidas) con veredicto de Nahuel.
- Dataset de ~30 casos preservado para la evaluación final en una sola sesión. Pruebas de runtime y etiquetado concreto de casos corresponden a consumidores técnicos (`MVP-042/043/050/053/122/123`).

## Cierre

Plan completado y archivado. Las tareas `MVP-010` y `MVP-013` quedan marcadas como `completada` en el plan maestro [`mvp-master-plan.md`](../active/mvp-master-plan.md) con evidencia documental verificable.

## Implementation Outcome

### Implemented

Se definieron y documentaron formalmente todas las decisiones requeridas para `MVP-010` y `MVP-013` en la especificación canónica [`docs/specs/sources-and-ai.md`](../../specs/sources-and-ai.md):
- **Límites de ingesta (`MVP-010`)**: 10 MiB por archivo, 20 MiB acumulados por documento, máximo 3 archivos por documento, PDFs de hasta 10 páginas sin contraseña, imágenes de hasta 20 megapíxeles y mensajes de chat de hasta 8000 caracteres.
- **Pipeline de carga y extracción**: subida directa a Storage privado para respetar el tope de 4,5 MB de Vercel Functions; extracción de texto en servidor mediante Files API de Gemini con limpieza explícita de archivos temporales; y leyenda de limitación visual transparente para el contraste en Groq sin proclamar capacidades visuales inexistentes.
- **Parámetros de modelos y tiempos (`MVP-013`)**: configuración de `gemini-3.5-flash-lite` y `openai/gpt-oss-120b` con nivel de razonamiento bajo (`low`) y parámetros por defecto del proveedor; timeout de 30 s por etapa (extracción, redacción, contraste) y reintento único ante fallos transitorios.
- **Criterio de calidad y evaluación**: conservación del dataset de ~30 casos del PRD §12 para la sesión final de evaluación; definición del subconjunto de 12 casos para la demo con criterio determinista estricto (0 material inventado, 100 % de contradicciones conocidas detectadas) bajo veredicto del líder técnico.

### Deviations from Design

None. Todas las decisiones técnicas locales fueron delegadas al orquestador y formalmente aceptadas el 2026-10-16.

### Validation

- Validación documental contra el PRD §4, §16, fundaciones SH-08 y SH-10, y la documentación técnica oficial de Gemini, Groq, Supabase y Vercel.
- La aceptación es de naturaleza documental; no se realizaron llamadas con credenciales ni pruebas de runtime, las cuales quedan asignadas a los consumidores técnicos posteriores.
- Revisión técnica documental completa: PASS.

### Follow-up

- Los consumidores de backend (`MVP-042/043` para evidencias y extracción, `MVP-050/053` para integración de IA) implementarán el pipeline y validaciones conforme a estas decisiones.
- El etiquetado específico de los casos de prueba y el runner de evaluación corresponden a `MVP-122` y `MVP-123`.
