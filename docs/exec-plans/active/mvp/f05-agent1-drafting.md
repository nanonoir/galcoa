# F5 — Agente 1: extracción de hechos y redacción autónoma

Tareas del maestro: `MVP-051`

**Estado: planificado, no ejecutado.** Fuentes: [maestro](../mvp-master-plan.md), [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3, §4 REQ-05, §6 INV-02/07/10, §7), [fundaciones](../../../design/mvp-shared-foundations.md) (`SH-01`, `SH-02`, `SH-03`, `SH-08`), [arquitectura](../../../architecture.md), [desarrollo](../../../development.md).

## 1. Objetivo y estado de partida

Generar, a partir de los mensajes originales (y de extracciones cuando existan), un borrador claro con procedencia por hecho, correcciones inocuas trazadas y datos ausentes o contradictorios **explícitos, sin inventar ni exigir aclaración**; persistir modelo, versión de prompt y fuentes (INV-07).

**Estado real verificado:** no existen `src/lib/ai/`, borradores ni mensajes persistidos. Solo hay `DocumentWarningSchema` (con `sources` como array genérico privado, no un contrato público).

## 2. Criterios y dependencias

| Tarea | REQ / INV | Aceptación (resumen) |
| --- | --- | --- |
| `MVP-051` | REQ-05, INV-07, INV-10, D-04 | Borrador con procedencia; correcciones inocuas trazadas; ausentes/contradictorios explícitos; modelo, prompt y fuentes persistidos |

**Entrada:** `MVP-050` (cliente Gemini) y `MVP-041` (mensajes persistentes). **Salida:** `MVP-052` (turno de chat), `MVP-053` (Agente 2 recibe el borrador), `MVP-062` (advertencias del Agente 1).

**Extracciones de evidencia (MVP-043) no son prerrequisito del maestro.** La entrada del Agente 1 admite referencias opcionales a extracciones persistidas; sin ellas el plan se valida con mensajes y con un doble de extracción. La conexión real con `MVP-043` queda como paso condicionado (último de §5) cuyo hueco, si 043 aún no está integrada, se registra y no bloquea el cierre de `MVP-051`.

## 3. Decisiones y pendientes

- **Esquema del borrador, advertencias y reporte: autoridad de `MVP-020/021`.** Forma propuesta (no autoritativa): texto legible; hechos con referencias de fuente y cita literal; correcciones (original → corregido, tipo inocuo, fuente); huecos/dudas/contradicciones como advertencias con severidad `warning|critical` y fuentes **privadas** (alias compartibles los construye `MVP-062/070`, `SH-02`); sugerencia opcional de participantes (la decide el autor).
- **Pendiente `MVP-013`:** límites de entrada/salida, timeouts y reintentos máximos. Sin ellos se usan constantes etiquetadas «propuestas, no aprobadas».
- **Una o dos llamadas por turno** (respuesta conversacional y borrador estructurado): decisión técnica local compartida con `MVP-052`; este plan entrega la generación estructurada como servicio no-streaming, y `MVP-052` orquesta el turno.
- **Cualquier prompt nuevo es una versión nueva**; el prompt no cambia contratos de negocio ni reescribe verificaciones históricas (PRD §4).

## 4. Rutas y propiedad

| Zona | Permitido (Líder) | Prohibido |
| --- | --- | --- |
| `src/lib/ai/` | Servicio de redacción, prompts versionados (`prompts/`), validación de procedencia (`server-only`) | Congelar, confirmar, finalizar, HCS, SQL directo |
| `src/lib/documents/` | Persistencia de borrador (`draftId`, `draftRevision`) y puerto de lectura de mensajes | Alterar mensajes originales |
| `src/lib/contracts/` | Solo ajuste mínimo autorizado si `MVP-020/021` omitió un campo | Redefinir enums existentes |
| `tests/server/` | Dobles de Gemini y casos de procedencia | Código de producto que importe dobles |
| `src/app/`, `src/features/` | Nada (el transporte es de `MVP-052`) | Todo |

## 5. Pasos

- [ ] Verificar `MVP-050` y `MVP-041` integradas; leer la fila y `SH-08`.
- [ ] Entrada: mensajes originales ordenados + referencias opcionales a extracciones; cada fuente con un identificador estable que el modelo debe citar. Todo texto de chat/evidencia se entrega como **datos no confiables delimitados**, nunca como instrucción de sistema.
- [ ] Prompt versionado (`promptVersion` constante): redactar con la información disponible; corregir solo ortografía/formato/estructura inocuos; no inventar precios, cantidades, nombres, fechas ni voluntades; ante huecos o contradicciones continuar y emitir advertencias; **sin preguntas bloqueantes** (la aclaración voluntaria vive en el chat). Ejemplos de criterios de suficiencia del PRD §4 solo como orientación, no campos obligatorios.
- [ ] Salida estructurada con Zod. Una referencia de fuente que no esté en la entrada autorizada invalida la salida (error técnico reintentable según `MVP-013`), no se descarta en silencio.
- [ ] Verificación determinista de procedencia: cada hecho debe citar un fragmento presente en su fuente; si no, se marca «sin respaldo textual» como advertencia, no se elimina ni se corrige el valor. (Criterio propuesto; confirmar con el líder al implementar.)
- [ ] Persistir como propuesta nueva del borrador con comprobación de `draftRevision` esperado (conflicto si cambió, `SH-01`): entradas exactas (IDs/orden), salida validada, modelo, `promptVersion`, tiempo del servidor y limitaciones. No sobrescribe propuestas ni reportes anteriores; un borrador nuevo no altera una revisión congelada.
- [ ] Fechas: conservar la fecha declarada tal como el autor la dio (texto, precisión, zona); si no hay fecha, «fecha no informada», no la de carga (`SH-03`, INV-09).
- [ ] Fallos de red/proveedor/salida inválida: error técnico de esa etapa, sin borrador ni éxito fabricado; auditoría de la ejecución sin contenido (vía `MVP-044` si está disponible).
- [ ] (Condicionado a `MVP-043` integrada) incorporar referencias a extracciones reales en la entrada y repetir los casos con ellas.

## 6. Casos de test por aceptación

| Aceptación | Caso |
| --- | --- |
| Borrador con procedencia | Cada hecho de una conversación de entrega comercial referencia un mensaje y una cita presente en él |
| Correcciones inocuas trazadas | Tilde/espacio corregidos y registrados con original, resultado y fuente; un cambio de cantidad no se admite como corrección |
| Ausentes/contradictorios explícitos | Chat «10 cajas» vs extracción «12 cajas» (doble): ambas cifras y fuentes en advertencia; no se elige; «valor 7 sin unidad»: advertencia de unidad no informada, sin inventarla (PRD §12.4, §12.15) |
| Sin exigir aclaración | El flujo devuelve un borrador utilizable con la información disponible; ninguna rama requiere respuesta del autor |
| Persistencia (INV-07) | Registro con modelo, `promptVersion`, referencias exactas y tiempo del servidor; segunda ejecución crea otra propuesta |
| Concurrencia | `draftRevision` desactualizado devuelve conflicto sin pisar |
| Datos no confiables | Mensaje con instrucciones inyectadas no cambia el esquema, no produce acciones ni referencias inventadas |
| Fallo del proveedor | Error técnico; sin borrador ni advertencia fabricada; original intacto |

## 7. Validación, evidencia y rollback

`lint`, `typecheck`, `npm test`, `test:boundaries`. **Evidencia actual: no ejecutado.** No se llama a Gemini real ni se leen secretos; la calidad del modelo se mide en `MVP-122/123/135`, no aquí. Rollback: revertir archivos del plan; ningún cambio de esquema pertenece a este plan salvo ajuste mínimo autorizado.

## 8. Cierre

Tras integrar y repetir checks: actualizar solo `MVP-051` (y recuento) y archivar el plan. Este documento no marca el estado. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

## 9. Pendientes y solicitudes

**Referencias:** `RQ-B1` — [sources-and-ai](../../../specs/sources-and-ai.md) (§2, §3, §5 y §7): contenido mínimo persistido de la propuesta del Agente 1 (hechos y procedencia, datos no informados, discrepancias, limitaciones), manejo de entrada no confiable y parámetros de `MVP-013` (propuestos, no aprobados); los esquemas exactos y la severidad de cada campo los concreta `MVP-020/021`; `RQ-B2` — [data-transactions](../../../design/data-transactions.md): estructura persistida de borrador/propuestas.

**Solicitudes:** a `MVP-020/021` (borrador, propuesta, advertencia con fuentes privadas y `draftRevision`); a `MVP-052` (acordar uno o dos llamados por turno); a `MVP-062/070` (consumen advertencias del Agente 1 y las proyectan con alias).

**Decisiones pendientes:** valores de `MVP-013`; criterio de verificación de procedencia (propuesto arriba).

[Maestro](../mvp-master-plan.md) · [Fundaciones](../../../design/mvp-shared-foundations.md) · Previo: [Gemini](f05-gemini-provider.md) · Siguiente: [Streaming](f05-chat-streaming-retry.md)
