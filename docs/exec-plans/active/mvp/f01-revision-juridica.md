# ExecPlan F1 — Revisión jurídica externa del lenguaje de confirmación y la privacidad

**Estado: planificado; no ejecutado.** Procedimiento de una acción **externa**; no es código ni automatizable. No cambia estados del [maestro](../mvp-master-plan.md).

Tareas del maestro: `MVP-014`

Requisitos PRD: [§5 y §11](../../GALCOA-PRD-v1.4.md) (lenguaje permitido y limitaciones de confianza), [§16](../../GALCOA-PRD-v1.4.md) (detalle abierto: revisión jurídica de confirmación electrónica y política de privacidad), D-09, INV-13/15. REQ-13 y REQ-11 como pantallas afectadas.

Referencias: [fundaciones SH-10](../../../design/mvp-shared-foundations.md) (dictamen no impide la demo ficticia) · [maestro §1 y F1](../mvp-master-plan.md).

## Precondiciones y checkpoints

- Sin dependencias. Owner: **Externo** (profesional elegido por el usuario).
- **No bloquea** documentación, desarrollo ni la demo con datos ficticios. **Bloquea** el uso con documentos reales o comerciales (PRD §11).
- Checkpoint A: material de revisión preparado (puede hacerse ya con el texto del PRD). Checkpoint B: dictamen recibido y resumen registrado.

## Objetivo y aceptación

| ID | Aceptación |
| --- | --- |
| MVP-014 | Existe un dictamen externo recibido sobre (1) el lenguaje de confirmación electrónica por enlace y el rechazo, (2) los límites de la afirmación sobre integridad/HCS y (3) la política de privacidad aplicable a uso comercial real. Se registra la fecha y un resumen no confidencial de conclusiones; su cumplimiento por el producto se trata como tareas nuevas, no aquí. |

## Procedimiento

1. El líder reúne, de forma ligera, los textos sujetos a revisión: las reglas de lenguaje del PRD §5 y §11, las frases de la confirmación pública (casilla, «Confirmar», «No coincide / Rechazar», modal) del PRD §10, los mensajes de verificación pública (integridad comprobada, discrepancia, no verificable, sello pendiente) y una descripción breve de qué datos se tratan, con qué proveedores (Supabase, Gemini, Groq, Hedera Testnet) y qué va a HCS (solo hashes e identificadores opacos).
2. Cuando existan las pantallas (`MVP-076`, `MVP-101`), añadir sus textos reales para que el dictamen se refiera a lo implementado. No es requisito para empezar.
3. El usuario encarga la revisión a un profesional por fuera del repositorio. Ningún agente contacta a terceros ni envía material.
4. Al recibir el dictamen, el líder anota fecha, alcance cubierto y conclusiones en forma resumida. El documento completo se guarda donde decida el usuario; no se versiona si contiene información confidencial.
5. Cada ajuste de texto o política que el dictamen exija se registra como tarea nueva (ID libre en F11 o la fase que corresponda) por edición del líder del maestro. Este plan no modifica la UI.

## Alcance no automatizable

Juicio jurídico, contratación del profesional, entrega y recepción del dictamen. No se redacta ni se afirma conformidad legal desde el repositorio; «validado regulatoriamente», «certificado» y similares siguen prohibidos.

## Seguridad y rollback

El material solo contiene datos ficticios y textos del producto; sin secretos, sin documentos de clientes. Rollback: no aplica (no hay cambios en el repo).

## Riesgos

- Dictamen tardío: no frena el MVP con datos ficticios, pero sí cualquier piloto real; se mantiene visible en el §9 del maestro.
- Cambios de redacción tardíos obligan a una nueva revisión congelada de las pantallas y a repetir pruebas de lenguaje (ver `MVP-118`).

## Decisiones pendientes

- Quién realiza la revisión y si el dictamen se versiona: decide el usuario.
- Si se desea una página de privacidad en el producto durante P0: el PRD no la exige como requisito; sería una tarea nueva si el usuario la quiere.

## Referencias a completar

Ninguna.

## Checklist

- [ ] Material de revisión preparado (checkpoint A).
- [ ] Profesional definido por el usuario.
- [ ] Material entregado fuera del repositorio.
- [ ] Dictamen recibido y resumen no confidencial registrado.
- [ ] Ajustes exigidos convertidos en tareas nuevas (si los hay).
- [ ] Fila de `MVP-014` actualizada.

## Progreso y evidencia

No ejecutado.

## Cierre

Actualizar **solo** la fila `MVP-014` (evidencia: fecha · alcance del dictamen · ubicación fuera del repo si corresponde) y recontar §3 tras integrar. Archivar este plan en [`completed/`](../../completed/). Un dictamen recibido no cierra los ajustes que pida: quedan en sus tareas nuevas. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en la fila actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). Se archiva únicamente al completar; ningún plan se archiva ahora.
