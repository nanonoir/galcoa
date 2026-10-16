# Revisión común, confirmaciones y continuidad de versiones

**Estado objetivo P0; implementación pendiente.** Autoridad: [PRD v1.5](../exec-plans/GALCOA-PRD-v1.4.md), §3–6, §8–12 y D-08/09/14/15; REQ-08/09/12…16; INV-05, 11…18. Fundaciones: [SH-01…06](../design/mvp-shared-foundations.md), sin redefinir identidades ni transacciones.

Capacidades/enlaces: [public-capabilities](public-capabilities.md). Entrada lista: [sources-and-ai](sources-and-ai.md). Diseño consumidor: [SQL](../design/data-transactions.md) y [manifiesto/HCS](../design/manifest-hcs.md), en preparación; aquí no se fijan RPC ni bytes canónicos.

## 1. De propuesta a revisión congelada

El autor revisa la propuesta completa y advertencias, y elige «¿Quiénes van a confirmar: solo vos, vos e intermediario, vos y comprador o los tres?». La IA puede sugerir, no seleccionar ni confirmar.

| Selección | Confirmaciones necesarias |
| --- | --- |
| Solo autor | Autor autenticado |
| Autor + intermediario | Autor y un intermediario |
| Autor + comprador | Autor y un comprador |
| Los tres | Autor, intermediario y comprador |

Antes de recoger respuestas se congela la selección y el `FrozenOperation` completo. Cada respuesta referencia revisión, snapshot y hash exactos de lo mostrado; no «última revisión». Congelar una propuesta distinta de la vista por concurrencia debe dar conflicto, no confirmarla silenciosamente.

## 2. Qué ve y confirma cada participante

Autor y terceros reciben **el mismo objeto de operación**: contenido completo, datos aportados/no informados, correcciones relevantes, limitaciones y advertencias materiales completas con fuentes seguras. No una síntesis diferente para terceros.

Las referencias públicas son alias descriptivos locales al snapshot, según SH-02: «Fuente A: declaración de 10 cajas / Fuente B: remito de 12 cajas». La relación con originales se conserva privada. No publicar chat, adjuntos, IDs privados de fuentes, rutas, URLs firmadas, metadatos privados, prompts ni nombres de archivo sensibles.

El panel privado de fuentes del autor está fuera de lo confirmado. Si sanear una proyección exige corregirla, se hace antes de congelar sin esconder discrepancias; cambiar contenido compartido congelado exige nueva revisión. La adaptación responsive no cambia contenido.

«Cambio material» incluye modificar hechos, compromisos, cantidades, precios, partes, fechas, condiciones, advertencias o su interpretación. Cambiar selección siempre crea otra revisión. No se edita tampoco texto persistido congelado bajo el rótulo de «corrección cosmética».

## 3. Responder sin ambigüedad

El autor confirma desde sesión autenticada y con propiedad comprobada. La casilla de confirmación comienza vacía también en su revisión; confirmar exige marcarla y accionar «Confirmar». No se confirma por sugerencia de IA, navegación o GET.

Cada tercero, sin cuenta, escribe **nombre completo autodeclarado en toda respuesta**, incluso rechazo (INV-13). No basta un nombre vacío o solo espacios; no imponer patrón que excluya nombres legítimos. Longitud máxima queda pendiente, no un requisito de identidad verificada.

| Acción de tercero | Precondiciones | Resultado |
| --- | --- | --- |
| Confirmar | Casilla marcada, nombre y capacidad válidos, sin ratificación de rechazo | Una confirmación persistida sobre ese snapshot |
| «No coincide / Rechazar» | Casilla desmarcada, nombre válido, modal ratificado | Un rechazo persistido, sin exigir conformidad |
| Cancelar modal | Cualquier apertura del modal | Sin respuesta, consumo ni cambio de agregado |
| GET, refrescar o preview de enlace | Lectura autorizada | No confirma ni consume |

La acción de rechazo es secundaria, visible, accesible y sin dificultad deliberada. Modal: «¿Rechazar esta revisión? No podrá finalizarse. El autor podrá preparar otra revisión». Acciones «Ratificar rechazo» y «Cancelar». El servidor verifica coherencia de campos; no puede demostrar que alguien realmente vio un modal.

Éxito solo tras persistencia: «Confirmado mediante enlace» o «Rechazo registrado». Nombre autodeclarado no es identidad comprobada; no usar «firma digital», «certificado», «validado regulatoriamente» ni «garantizado verdadero».

**Mínimo P0 del autor que no acepta:** no confirmar, continuar conversando y preparar otra revisión cuando cambie contenido/selección. El rechazo formal descrito aquí es de terceros; no se exige inventar otra acción de rechazo del autor para habilitar P0.

## 4. Avance y disponibilidad

| Agregado de revisión | Condición | Efecto sobre documento/revisión |
| --- | --- | --- |
| `pendiente` | Ninguna confirmación, sin rechazo ni sustitución | `esperando_confirmaciones` |
| `parcial` | Alguna, pero no todas las confirmaciones seleccionadas | Sigue esperando; ninguna generación final |
| `completa` | Todos los seleccionados confirmaron el snapshot | Habilita iniciar finalización; no equivale aún a `finalizado` |
| `rechazada` | Al menos un rechazo en revisión no sustituida | `revision_rechazada`; esa revisión no finaliza |
| `sustituida` | Otra revisión reemplazó la pendiente/rechazada | `revision_sustituida` en ese registro; no revive |

Sin revisión, agregado e identidades de revisión son nulos, no `completa`. Sustitución prevalece en la disponibilidad actual, conservando el rechazo/respuestas históricos. La revisión nueva tiene su propio agregado; la versión histórica finalizada conserva sus estados, sin atribuirlos al borrador nuevo.

Mostrar «Confirmaron X de Y», «Faltan confirmaciones», «Revisión rechazada» o «Revisión sustituida: requiere nuevas confirmaciones» según corresponda. Advertencias críticas no cambian este conteo ni bloquean confirmar/finalizar.

Respuesta y consumo del token ocurren atómicamente. Doble clic/reintento del mismo comando devuelve la respuesta persistida; confirmar y rechazar concurrentemente no producen dos decisiones. Misma clave con contenido distinto da conflicto. Respuesta tardía tras sustitución no revive la revisión.

## 5. Finalizar y continuar en el mismo chat

Solo todas las confirmaciones persistidas del mismo snapshot, sin rechazo y con autorización válida, permiten producir anexo/PDF/manifiesto. No basta el estado enviado por cliente ni el resultado del contraste.

El anexo se rotula «Constancias de confirmación». Conserva roles, referencia de revisión/snapshot, decisión/casilla, nombre autodeclarado de terceros, contexto de autor autenticado y fechas de servidor según respuestas persistidas. No añade datos pedidos de nuevo al navegador ni modifica la operación acordada.

Presentar primero la operación y después las constancias, por roles en orden estable autor/intermediario/comprador cuando existan. Caso solo-autor: «Declarado por el autor; sin corroboración de terceros». Con terceros: «Confirmado mediante enlace», no verificación de identidad. Formato visual final queda al renderer, sin alterar estos significados.

Finalización recuperable mantiene una sola versión y PDF canónico conforme SH-05. Fallo de persistencia no anuncia finalización. HCS posterior fallido/incierto conserva «Versión finalizada; sello pendiente», mismos bytes/hash y reconciliación antes de reenviar; intentos históricos no se sobrescriben.

Una modificación posterior inicia **borrador mutable para v2**, con copia contextual de la operación anterior, nuevas anotaciones y referencia a v1 en el mismo chat. No clona una versión final como editable ni hereda confirmaciones. Su nueva revisión vuelve a requerir todos los seleccionados.

Distinguir «Nuevo hecho posterior: devolución…» de «Corrección del relato anterior…» según lo declarado por el autor; no inferir que una devolución vuelve falsa la entrega ni corregir retroactivamente v1. Mantener operación, PDF, reportes y hashes de v1 intactos.

## 6. Compartir y explicar confianza

Por tercero elegido: copiar enlace, QR, WhatsApp prearmado o `mailto:`. Texto base: «Te comparto una revisión de operación para que la leas y confirmes o rechaces: [enlace]. El enlace es personal para esta solicitud». No incluir chat ni evidencia en mensajes prearmados; el envío lo hace la persona/dispositivo, no el backend.

La política de exposición, pérdida y reemisión del secreto vive en public-capabilities. No prometer recuperar un token hasheado. Explicar «Sin inconsistencias críticas detectadas» como resultado del contraste, distinto de «corroborado por terceros». HCS prueba compromiso/integridad según cadena verificable, no verdad de los hechos.

## 7. Aceptación trazable — pendiente de implementación

| Caso | Positivo / negativo esperado | MVP / PRD §12 |
| --- | --- | --- |
| R-01 | Cuatro selecciones exactas; autor no puede excluirse; todos ven mismo contenido/advertencias sin fuentes privadas | 070/071/073/077; 3,9 |
| R-02 | Confirmación de autor con sesión/propiedad; sin una confirmación no hay PDF/HCS; solo-autor basta | 071/080; 3,13 |
| R-03 | Tercero confirma marcado o rechaza desmarcado+modal, ambos con nombre; vacío o incoherencia se rechazan | 074/076; 8,12 |
| R-04 | Cancelar modal/GET no consume; doble clic y carrera opuesta conservan una respuesta | 074/075; 8,12 |
| R-05 | Cambio material/selección crea revisión sin herencia; respuesta tardía no revive enlace | 070/075; 11 |
| R-06 | Crítica y unidad ausente siguen confirmables, visibles a todos | 062/070/076; 4,15 |
| R-07 | Todas las confirmaciones preceden anexo/PDF/HCS; fallo HCS no regenera bytes | 080…083/091/092; 6,13 |
| R-08 | Borrador v2 conserva antecedente y anotaciones; devolución/corrección no altera v1 | 084; 2,10,11 |

## 8. Registro operativo abierto

| Tema | Default propuesto, NO APROBADO | Resolución pendiente |
| --- | --- | --- |
| Nombre declarado | Texto no vacío, respetando nombres legítimos | Máximo/normalización segura en MVP-011; aprobar con validación de formularios y capacidad |
| Rechazo adicional del autor | No añadirlo al mínimo P0 | Solo si se solicita esa opción extra, definir su efecto; no bloquea P0 |

F1 registra valor/evidencia/aprobación fechada en public-capabilities para MVP-011; MVP-012 se resuelve en el diseño de manifiesto, no aquí. MVP-014 conserva la revisión jurídica para uso real/comercial; estos textos funcionales no son dictamen. Ningún registro se considera resuelto por esta preparación.
