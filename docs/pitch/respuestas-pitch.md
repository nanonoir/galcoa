# GALCOA+ · Respuestas del pitch (teoría para armar las imágenes)

**Para qué sirve:** texto base para el deck, el video, el README y los formularios. Responde las preguntas del workshop NEA («Construye un pitch claro y memorable»). No cambia el deck de Tomás: es el contenido que se vuelca en imágenes.

**Reglas de este documento**
- MVP: lo simple y práctico gana. Una idea por slide, pocas palabras, siempre desde el beneficio del cliente.
- Palabras simples: «huella» = una marca que prueba que nadie cambió el documento.
- Se distingue **sabemos / suponemos / falta comprobar**. No se inventan usuarios, métricas ni validaciones.
- Lenguaje del producto (PRD §5, §11): no usar «certificado», «validado regulatoriamente», «garantizado verdadero», «firma digital» ni «identidad verificada». ALCOA+ y GAMP 5 **inspiran**, no se «cumplen».

---

## 1. La frase de una línea
> **GALCOA+ convierte una conversación de trabajo en un registro que nadie puede cambiar sin que se note: se habla por chat, las partes confirman y la prueba queda en Hedera.**

Plantilla del workshop completada:
> Nos dirigimos a **empresas de sectores regulados (cannabis medicinal, farma, alimentos, agro)**. Resolvemos **el registro manual, tardío y difícil de probar de cada lote** mediante **un chat con IA, confirmación de las partes y una huella pública en Hedera**. Generamos valor porque **se pierde menos tiempo cargando, hay menos lotes rechazados y las auditorías son más tranquilas**. Nuestro modelo de ingresos podría ser **una suscripción por volumen de operaciones selladas**, y llegaremos a nuestros clientes mediante **nuestra red del sector y el ecosistema de mentores**.

## 2. Las 5 preguntas

### 2.1 Problema
En industrias reguladas los datos de cada lote se anotan **a mano, tarde y en planillas o chats**. En la auditoría falta algo, no coincide o no se puede probar quién dijo qué y cuándo. Cuesta **lotes rechazados, auditorías, multas y clientes**. Los operarios no registran mal por falta de voluntad, sino porque **la herramienta es más difícil que la tarea**.
- **Sabemos:** el problema existe en cannabis y farma (experiencia directa de un integrante).
- **Falta comprobar:** cuánto cuesta en cifras (no las inventamos).

### 2.2 Por qué ahora
- La exigencia de trazabilidad crece y los registros siguen en planillas y chats.
- La IA permite **cargar datos hablando**, sin formularios largos.
- Hedera ofrece una **prueba pública con costo fijo y bajo**, imposible hace unos años.
- El equipo lleva **tiempo investigando** estas industrias (cannabis y farma).

### 2.3 Solución (qué construimos)
Cuatro pasos, que son también el recorrido de la interfaz:
1. **Contás** qué pasó y adjuntás el remito o la evidencia (chat).
2. **La IA arma el documento y marca las diferencias** (por ejemplo, 10 toneladas declaradas contra 12 del remito). No frena el trabajo: lo deja a la vista.
3. **Las partes confirman** lo mismo, con un enlace. Quedan nombre declarado, rol y hora del servidor.
4. **Se sella:** a Hedera sube **solo una huella**. El dato nunca sale; sale la prueba.

Cómo decirlo simple: *«La prueba queda en la blockchain; los datos siguen siendo tuyos.»*

### 2.4 Por qué nosotros
Un integrante **trabajó en empresas de cannabis para exportación** y vivió este problema; también conocemos la industria farmacéutica. Venimos investigando el tema hace tiempo y tuvimos **acompañamiento de mentores del ecosistema** (NEA Tech). Equipo: Nahuel Noir (líder técnico), Gastón Persoglia, Facundo Ayala, Federico Fontana y Thomas Skarp.

### 2.5 Modelo de negocio (propuesta por validar)
| Pregunta | Respuesta | Estado |
|---|---|---|
| ¿Quién es el usuario? | Quien carga y confirma el dato en planta o campo | Sabemos |
| ¿Quién paga? | La empresa (calidad / operaciones) | Suponemos |
| ¿Qué valor recibe? | Menos tiempo de carga, menos lotes rechazados, auditorías más tranquilas, una prueba que no depende de nosotros | Suponemos |
| ¿Cómo se generan ingresos? | Suscripción mensual por volumen de operaciones selladas (planes Pro / Enterprise) | Hipótesis |
| ¿Cómo llegamos a los primeros clientes? | Red del sector (cannabis y farma), mentores y ecosistema, un piloto gratuito acotado | Hipótesis |
| ¿Qué necesitamos validar? | Si pagarían, cuánto ahorran, cuántas operaciones por mes, quién decide la compra | Falta comprobar |

## 3. Preguntas que faltaban, respondidas

**¿Por qué blockchain y no una base de datos común?**
Una base de datos **tiene un dueño que puede editarla**. Acá hay varias partes que no confían del todo entre sí (productor, comprador, auditor). Con el servicio de consenso de Hedera, el **orden y la hora quedan públicos** y cualquiera puede comprobar que la huella no cambió **sin pedirnos permiso**.

**¿Por qué Hedera y por qué HCS?**
Solo necesitamos **mensajes ordenados con hora pública**, no tokens ni contratos. HCS tiene costo fijo y predecible, alta velocidad y bajo consumo.

**¿Se publican datos privados?**
No. A HCS solo van tres campos: versión, una referencia anónima y la huella (`manifestHash`). Nunca nombres, texto ni archivos.

**¿Qué pasa si el operario miente al cargar?**
El sistema **no puede evitar la mentira**: hace evidente cualquier cambio posterior, deja un responsable con nombre y fecha, y marca las diferencias entre lo declarado y las pruebas.

**¿Es una certificación?**
No. GALCOA+ está **inspirada en ALCOA+ y GAMP 5** y ayuda a quien se audita a sostener sus registros. No certifica ni valida regulatoriamente.

**¿Qué es ALCOA+ y qué es GAMP 5? (una línea)**
- **ALCOA+:** criterios para que el **dato** sea confiable (quién, cuándo, original, completo…).
- **GAMP 5** (*Good Automated Manufacturing Practice*): guía global de la industria para la **validación de sistemas informáticos y automatizados**; que el **software** sea confiable.

**¿Competidores y alternativas?**
Planillas y papel (baratos, sin rastro); sistemas de gestión de lotes/ERP (caros y pesados, no prueban el orden a terceros); soluciones de blockchain empresariales (complejas). Nuestra ventaja: **chat simple + confirmación de las partes + prueba pública sin exponer datos**.

**¿Qué está validado y qué no?** (ver §5)

## 4. Lo que el jurado tiene que recordar
> **«La prueba queda en la blockchain; los datos siguen siendo tuyos.»**

## 5. Sabemos / suponemos / falta comprobar
| Sabemos | Suponemos | Falta comprobar |
|---|---|---|
| El problema existe (experiencia directa en cannabis y farma) | Que las empresas pagarían una suscripción | Entrevistas con clientes reales |
| El producto genera huella en Hedera Testnet con 3 campos | El ahorro de tiempo y de lotes rechazados | Cifras de ahorro |
| Las partes confirman el mismo documento | Los canales (red del sector y ecosistema) | Quién decide la compra |

**Validación (sin inventar):** experiencia directa del integrante + feedback de mentores + consultas a contactos del rubro. Cuando lleguen respuestas, citarlas con permiso y decir «N de M consultados». Mientras tanto: «validamos el problema desde adentro; la validación con clientes es el próximo paso».

## 6. Caso de uso agro (pendiente de Gastón)
El agro incluye **cultivos, animales y productos derivados**. Preguntas para Gastón, para cerrar un caso concreto:

**A. Elegir el caso**
1. ¿Qué rubro: cultivos, ganadería, aves, cerdos, apicultura, acuicultura, lácteos u otro?
2. ¿Qué auditoría o exigencia aplica (BPA/BPG, GACP, exportación, orgánico, SENASA, trazabilidad ganadera, cadena de frío)?
3. ¿Quién audita y qué le piden mostrar?

**B. Cultivos**
4. ¿Qué registra el productor por lote o campaña (siembra, insumos, aplicaciones, riego, cosecha, poscosecha, traslado)?
5. ¿Qué evidencia se adjunta (fotos, remitos, análisis de laboratorio, recetas de agroquímicos)?

**C. Animales**
6. ¿Qué se registra por animal o por lote (identificación, nacimiento, movimientos, sanidad, vacunas, tratamientos y tiempos de espera, alimentación, peso, faena)?
7. ¿Qué documentos acompañan el traslado o la venta (guías, certificados sanitarios, remitos)?
8. ¿Hay medicamentos veterinarios o antibióticos que deban quedar registrados?

**D. Cadena y partes**
9. ¿Quiénes son las partes que no confían del todo entre sí (productor, transportista, frigorífico o acopio, comprador, auditor)?
10. ¿Quién confirma cada registro y en qué momento?
11. ¿Hay cadena de frío o condiciones (temperatura, tiempos) que haya que probar?

**E. Dolor y valor**
12. ¿Qué es lo que más falla o más se pierde en la auditoría (registros faltantes, cargados tarde, discrepancias, lotes rechazados)?
13. ¿Cuánto tiempo y costo implica hoy preparar la documentación?
14. ¿Cómo se registra hoy (papel, planillas, WhatsApp, sistema propio)?

**F. Demo y validación**
15. ¿Qué lote o animal mostraríamos en la demo, de productor a comprador?
16. ¿Conoce 2 o 3 productores o empresas a quienes consultar rápido, para tener validación real?
17. ¿Quién decidiría la compra de una herramienta así y cuánto estaría dispuesto a pagar?

Hasta que responda, el caso se presenta como **«lote de producción agropecuaria (cultivo o animal): productor → comprador»**, marcado como ilustrativo.

## 7. Bloque para el README (Hedera)
> ### Uso de Hedera
> Usamos **Hedera Consensus Service (HCS)** en **Testnet**, enviado desde el servidor con el SDK `@hiero-ledger/sdk`. Por cada versión finalizada se publica **un solo mensaje** con `schemaVersion`, `reference` y `manifestHash`. Nunca se envían datos, nombres ni archivos. Solo el servidor tiene la clave; los agentes de IA no tienen herramientas de envío.
>
> | Dato | Valor |
> |---|---|
> | Red | Testnet |
> | Topic ID | `[completar: 0.0.xxxxx]` |
> | ID de transacción | `[completar]` |
> | Marca de tiempo de consenso | `[completar]` |
> | **Hash (`manifestHash`)** | `[completar: SHA-256 del manifiesto]` |
> | HashScan | `[completar: enlace]` |
>
> El mismo hash se declara en el formulario de entrega.

Reglas para completarlo: salen de una **transacción real** hecha por Nahuel; no se inventan ni se usa una ajena. El `manifestHash` se ve en el mensaje del Topic en HashScan.

## 8. Dónde va cada cosa
| Lugar | Qué lleva |
|---|---|
| Deck | §1 a §5, una idea por slide |
| Video (≤ 5 min) | §2 en 3 minutos; escena de HashScan |
| README | §7 + problema → solución → demo |
| Formulario de entrega | Frase de una línea, Topic, transacción, **hash**, HashScan, uso de IA |
| Formulario NEA Productivo Digital | §2 con el caso agro (§6) |
| Mapa del camino feliz y roadmap | Paso «Sellar» = HCS Testnet vía `@hiero-ledger/sdk`; Fase 3 = Mainnet |

## 9. Sugerencias
1. Empezar por el problema, no por la tecnología.
2. Mostrar la demo en los primeros 60 s del video.
3. Ensayar con cronómetro: 3 minutos.
4. Preparar una respuesta de una línea para cada pregunta de §3.
5. Declarar el uso de IA en README y formulario.
