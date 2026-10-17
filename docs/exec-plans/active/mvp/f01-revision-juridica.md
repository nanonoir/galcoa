# ExecPlan F1 — Revisión jurídica externa del lenguaje de confirmación y la privacidad

**Estado: checkpoint A preparado (2026-10-16, pendiente de integrar); checkpoint B pendiente de acción humana externa.** Procedimiento de una acción **externa**; no es código ni automatizable. Esta preparación no es un dictamen ni cierra `MVP-014`.

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

- Textos de pantalla de `MVP-076` (referencia RQ-C1 de [f07-03](f07-03-estado-agregado-y-pantalla-publica.md)) y `MVP-101`: **pendientes**; no existen pantallas integradas. Añadir sus textos reales cuando existan; mientras tanto vale el texto normativo del PRD citado abajo.

## Checklist

- [x] Material de revisión preparado (checkpoint A): ver «Material de revisión (checkpoint A)».
- [ ] Profesional definido por el usuario.
- [ ] Material entregado fuera del repositorio.
- [ ] Dictamen recibido y resumen no confidencial registrado.
- [ ] Ajustes exigidos convertidos en tareas nuevas (si los hay).
- [ ] Fila de `MVP-014` actualizada.

## Material de revisión (checkpoint A)

Solo referencias y textos ya existentes en el repositorio; no introduce políticas ni redacciones nuevas. Todo dato de ejemplo es ficticio. Este bloque se entrega al profesional por fuera del repositorio (acción del usuario).

### 1. Preguntas para el profesional (alcance de `MVP-014`)

1. Lenguaje de la confirmación electrónica por enlace y del rechazo: ¿es adecuado y no engañoso lo que el producto afirma y deja de afirmar?
2. Límites de la afirmación sobre integridad y sello en HCS: ¿las frases de verificación pública describen correctamente lo que se comprueba?
3. Privacidad aplicable al uso comercial real: tratamiento de datos con los proveedores listados y términos que corresponderían.

### 2. Textos y reglas sujetos a revisión

Fuente de verdad: PRD, sin copiar su contenido completo.

| Tema | Fuente | Qué contiene |
| --- | --- | --- |
| Alcance de lo que acredita una confirmación | PRD §5 (viñeta «Una confirmación por link…») y §11 | Acredita una declaración realizada mediante ese enlace; no identidad presencial verificada ni verdad absoluta. Se muestra «Confirmado mediante enlace» |
| Lenguaje prohibido | PRD §5 (cierre) y §11 | No «certificado», «validado regulatoriamente», «garantizado verdadero», «firma digital» ni «identidad certificada/verificada» |
| Casilla, «Confirmar», «No coincide / Rechazar», modal | PRD §10 y D-09 | Casilla vacía; marcada habilita «Confirmar»; desmarcada permite «No coincide / Rechazar» con modal de ratificación; cancelar no registra ni consume; nombre autodeclarado sin login. Ejecución en `src/lib/contracts/confirmation.ts` y [data-transactions](../../../design/data-transactions.md) |
| Token de invitación | PRD §11 | Alta entropía, solo hash en base, caducidad, un solo uso, revocación; GET no consume |
| Mensajes de verificación pública | [manifest-hcs §6](../../../design/manifest-hcs.md) y PRD §9–§10 | «Integridad del archivo comprobada respecto del registro»; «El archivo o la prueba no coincide con el registro esperado»; «No es posible comprobar la integridad ahora; sello pendiente o evidencia de red no disponible»; sin PDF solo estado del registro, nunca «archivo verificado»; Testnet puede reiniciarse y la integridad no acredita verdad factual ni identidad |
| Estado de sello | PRD §10 y manifest-hcs | «Versión finalizada; sello pendiente» (no «sellada») hasta registro comprobado |
| Leyenda de extracción | `src/lib/ai/extraction/service.ts` (`VISUAL_LEGEND`) | «Interpretada por Gemini; sin verificación visual independiente.» |
| Guía de lenguaje para la demo | [jury-runbook](../../../demo/jury-runbook.md) | Frases permitidas, p. ej. «sin inconsistencias críticas detectadas» |
| Textos de pantalla de `MVP-076` y `MVP-101` | — | **Pendiente**: no hay pantallas integradas |

### 3. Descripción de datos y proveedores (base para la revisión de privacidad)

Según PRD §9 y §11; no sustituye una política de privacidad.

| Servicio | Papel | Dato tratado |
| --- | --- | --- |
| Supabase (Auth, PostgreSQL, Storage) | Cuentas, documentos, chats, evidencias privadas, PDFs, confirmaciones | Datos del usuario y del contenido documental; accesos con autorización y RLS; sin URLs públicas permanentes de archivos privados |
| Gemini (Agente 1, vía Vercel AI SDK) | Extracción y redacción | Mensajes y evidencias del usuario enviados al proveedor |
| Groq (Agente 2) | Contraste de hechos | Mensajes originales y texto extraído |
| Hedera Testnet (HCS) | Registro de huella | **Solo hashes e identificadores opacos**; nunca evidencias, PDFs, chats ni identidades. Testnet puede reiniciarse y no ofrece permanencia de producción |
| Terceros invitados | Confirman sin cuenta | Nombre autodeclarado y contexto de respuesta; ven el documento de operación congelado, no chat ni evidencias privadas |

Condiciones vigentes del PRD §11: sin datos reales regulados en servicios gratuitos sin revisar términos, retención, privacidad y permisos de cada proveedor; datos ficticios para el Ideatón.

### 4. Condiciones de entrega (acciones humanas)

- Elegir y contratar al profesional, entregar el material y recibir el dictamen: el usuario, fuera del repositorio.
- Ningún agente contacta a terceros, envía material ni redacta conclusiones jurídicas.
- Ejemplos o capturas, si se agregan, usan solo datos ficticios.

## Progreso y evidencia

- 2026-10-16 · Checkpoint A: material preparado en este plan (rama `flow/4-legal`, Issue [#4](https://github.com/nanonoir/galcoa/issues/4)); verificación documental de enlaces y coherencia; sin tests de aplicación ni llamadas reales. Pendiente de integrar en `develop`.
- Checkpoint B: **no recibido**. Causa externa: depende de que el usuario encargue la revisión a un profesional y aporte el dictamen. No hay dictamen, fecha, alcance ni resumen que registrar.
- Efecto: no bloquea desarrollo ni la demo con datos ficticios; sí bloquea el uso con documentos reales o comerciales (PRD §11).

## Cierre

Actualizar **solo** la fila `MVP-014` (evidencia: fecha · alcance del dictamen · ubicación fuera del repo si corresponde) y recontar §3 tras integrar. Archivar este plan en [`completed/`](../../completed/). Un dictamen recibido no cierra los ajustes que pida: quedan en sus tareas nuevas. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en la fila actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). Se archiva únicamente al completar; ningún plan se archiva ahora.
