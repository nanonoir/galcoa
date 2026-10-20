# GALCOA+ · Reglas de producto

> **Autoridad (2026-10-20):** estas reglas rigen por instrucción explícita del usuario y **prevalecen sobre el PRD anterior** donde lo contradicen. Resumen elaborado a partir de la presentación del pitch (galcoa-presentation.vercel.app). Una versión previa citaba `docs/ORIENTACION-DISTRIBUIDORES.md` como fuente de verdad: **ese archivo no existe en el repositorio** y no se crea. La autoridad es la instrucción del usuario, registrada en [`alineacion-distribuidoras.md`](exec-plans/active/alineacion-distribuidoras.md).
>
> **Estado frente al código:** son reglas **objetivo**. El código actual sigue el PRD v1.5 (p. ej. las diferencias son advertencias que no bloquean). El usuario confirmó las precisiones de participantes, semáforo y correcciones; no quedan decisiones de producto pendientes para F-1 a F-5. Diseño aprobado, límites y criterios de validación en el [lote 2 del plan](exec-plans/active/alineacion-distribuidoras.md#lote-2--diseño-acotado-sin-implementación). No acredita implementación.
>
> **Para el agente que lea esto:** usalo para escribir o reescribir el `README.md` con este enfoque. **No inventes datos, clientes, métricas ni funciones que el código no tenga:** si una función no está hecha, el README la pone en "Próximos pasos", no como hecha.

## 1. Qué es, en una frase

**Las distribuidoras ya trabajan bien. GALCOA+ hace que lo puedan demostrar.**

GALCOA+ convierte cada entrega en una prueba: la distribuidora la cuenta por chat, la IA arma el documento y lo controla, el comercio confirma con un QR y la huella del documento queda sellada en Hedera. Con el tiempo, eso arma un historial verificable que la distribuidora le puede mostrar a una marca.

Frase de posicionamiento: **«Tu historial de operaciones es tu mejor carta de presentación.»**

## 2. Para quién es

| Rol | Quién es | Qué hace en el producto | ¿Paga? |
|---|---|---|---|
| **Cliente principal** | Distribuidoras pequeñas y medianas de alimentos, bebidas y consumo masivo. Empezamos por Corrientes y el NEA. | Registra sus operaciones y arma su historial. | Sí |
| Decisor de compra | Dueño, gerente comercial o responsable de operaciones de la distribuidora. | Decide contratarlo. | — |
| **Comercio** | El almacén o negocio que recibe la mercadería. | Confirma la entrega con un QR o enlace, sin crearse una cuenta. | No |
| **Marca** | La empresa que evalúa a la distribuidora. | Ve el historial que la distribuidora decide compartir. | No |

**Mercados secundarios** (se nombran, no son el foco hoy): cannabis medicinal, farma y agro (registros de cultivo, cosecha, lotes y auditorías), objetos de alto valor (relojes, joyas) y operaciones internas de cualquier empresa (del depósito a la sucursal, de un área a otra).

**No competimos** con ERP, sistemas de GPS ni plataformas de cumplimiento corporativo. GALCOA+ es simple y específico.

## 3. El problema que resuelve

Una distribuidora puede trabajar bien durante años y no poder demostrarlo:

- Remitos, planillas y mensajes de WhatsApp desparramados.
- Reclamos sin respaldo: cuando hay un problema con una entrega, nadie puede probar qué pasó.
- Todo es «palabra de la distribuidora», sin un tercero que lo confirme.
- Le cuesta convertir un buen historial en argumentos para conseguir marcas nuevas.

Pregunta gancho: **«¿Cuántas oportunidades pierde una distribuidora por no poder demostrar todo lo que ya hace bien?»**

## 4. Cómo funciona (el flujo del producto)

1. **Lo cuenta por chat.** La distribuidora cuenta la operación por texto o audio y adjunta la foto del remito o comprobante. Ejemplo: «Entregué 200 cajas en el almacén a las 9:42».
2. **La IA lo controla.** Una IA ordena los datos en un documento y otra revisa que sean consistentes y detecta faltantes o contradicciones. **No inventa nada.**
3. **El proveedor revisa y declara.** El transportista confirma si fue incluido. Una vista previa es preliminar, distinta del PDF final y nunca se sella.
4. **El comprador confirma.** El comercio escanea un QR o abre un enlace, sin crearse una cuenta. Proveedor y comprador son obligatorios; transportista opcional. Solo después de todas las confirmaciones de la misma revisión se genera el PDF final.
5. **Queda sellado en Hedera.** Se calcula la huella SHA-256 del documento y se registra en Hedera Consensus Service (HCS). Si alguien cambia el documento después, la huella ya no coincide y se nota.
6. **Se arma el historial.** Las operaciones se suman en indicadores que la distribuidora puede compartir con marcas.

### La regla del ejemplo 200 / 198 (no se rompe)

- Si el pedido dice **200 cajas** y el remito dice **200**: coincide, sigue y se puede sellar.
- Si el pedido dice **200** y el remito dice **198**: la diferencia se detecta y **no se sella**. Primero hay que aclarar la diferencia, corregir el documento y que la otra parte confirme.
- Nunca mostrar una diferencia como algo que "se aprueba igual".

## 5. Reglas que no se rompen

1. **La IA no decide el veredicto.** Extrae, redacta y explica; las reglas (código determinista) deciden; una persona aprueba.
2. **Tres estados:**
    - **Verde** (verificado): los datos relevantes se pueden contrastar con las fuentes usadas y coinciden; se puede sellar tras las confirmaciones obligatorias.
    - **Amarillo** (declarado): respaldo insuficiente, sin contradicciones y con alcance claro de lo que se confirma; se puede sellar tras las confirmaciones obligatorias, marcado como declarado.
    - **Rojo** (requiere revisión): diferencias, evidencia ilegible o ambigüedades que impiden determinar qué se confirma. Siempre bloquea el sello de esa revisión; incluye "no se pudo leer" y 200/198. Corregir conserva fuentes y contradicción originales, registra qué cambió y por qué, y exige nueva revisión y nuevas confirmaciones de todos los participantes seleccionados; nunca «aprobar igual».
3. **La herramienta que sella recibe solo el ID de la operación**, vuelve a verificar ella misma y se niega por código si da rojo. El agente no tiene ninguna otra herramienta que escriba en Hedera.
4. **Separación por rol en el documento:** proveedor y comprador obligatorios; transportista opcional. La declaración del proveedor no sustituye la confirmación del comprador. Se acepta capacidad por rol (token para terceros), **sin asegurar identidad verificada ni personas distintas**; no se requiere un segundo aprobador interno ni cuentas de equipo.
5. **A Hedera solo van huellas SHA-256**, nunca datos personales ni el contenido del documento (Ley 25.326). El documento se queda privado en el sistema.
6. Cada regla tiene un ID (`ALC-...`) y cada veredicto guarda la versión de las reglas.
7. **Todo queda registrado:** carga, corrección, sello, bloqueo y aprobación, con usuario, fecha, hora y motivo.
8. **Declarado ≠ confirmado.** Nunca presentar un registro solo declarado como si estuviera confirmado por un tercero.
9. **Sin puntaje mágico.** No crear un puntaje absoluto de confiabilidad sin una metodología transparente.
10. **La distribuidora decide qué comparte** con cada marca. No exponer datos privados de los comercios.
11. **Fuentes completas, sin inventar exigencias:** usar todas las fuentes empleadas en el chat (datos, mensajes y adjuntos disponibles), no exigir documentos que no se usaron. No ocultar contradicciones por mayoría, por el último mensaje o por un umbral numérico. La aplicación técnica conservadora de estas reglas está en el diseño del lote 2 citado arriba.

## 6. Qué prueba Hedera y qué no

| Sí prueba | No prueba |
|---|---|
| Cuándo se registró el documento. | Que la entrega haya pasado de verdad. |
| Que nadie lo cambió después. | Que todo lo declarado sea cierto. |

Una blockchain hace que un dato sea **inalterable**, no que sea **verdadero**. Por eso sumamos la confirmación del comercio, el historial auditable y la separación entre lo declarado y lo confirmado.

Datos técnicos: hoy funciona en **Hedera Testnet** (la red de prueba); el próximo paso es la red principal. Cada sello cuesta una fracción de centavo de dólar. Se puede comprobar en el mirror node o en HashScan con el QR.

## 7. Qué gana cada uno

**La distribuidora:** menos tiempo armando y buscando papeles, pruebas a mano cuando hay un reclamo y un historial para mostrarle a una marca nueva.

**La marca:** ve el historial que la distribuidora decide compartir, y cada número se puede rastrear hasta la entrega confirmada.

**Advertencia:** GALCOA+ no promete ventas, contratos, solvencia ni reputación. Da pruebas para decidir mejor.

## 8. Indicadores que muestra el producto

- Entregas registradas y entregas confirmadas por terceros (siempre separadas).
- Porcentaje de entregas puntuales, solo cuando hay fechas verificables.
- Comercios recurrentes, sin exponer datos privados.
- Reclamos abiertos y resueltos, y cuánto tardan en resolverse.
- Operaciones documentadas por período.
- Historial de acuerdos y condiciones cumplidas.

## 9. Modelo de negocio

Abono mensual. **Precios de prueba** (se ajustan con entrevistas y un piloto; a la distribuidora se le informa el equivalente en pesos):

| Plan | Precio | Alcance |
|---|---:|---|
| Inicial | USD 30 / mes | Hasta 150 documentos, confirmaciones y trazabilidad. |
| Crecimiento | USD 60 / mes | Hasta 600 documentos, perfil comercial e indicadores para marcas; acuerdos programables básicos. |
| Pro | USD 120 / mes | Hasta 3.000 documentos, reportes e integraciones. |

**Quién paga:** la distribuidora que quiere ser representante oficial o de zona de una marca, demostrando trazabilidad, seguridad y confiabilidad. El comercio y la marca no pagan.

**Cómo llegamos:** un piloto cara a cara con distribuidoras del NEA; después, cámaras y asociaciones de distribuidores. Cada comercio que confirma una entrega conoce GALCOA+ y lo puede recomendar.

## 10. Hoja de ruta

| Fase | Qué incluye |
|---|---|
| **1 · Hoy (MVP en Hedera Testnet)** | Chat con IA, control por una segunda IA, PDF, confirmación por QR, huella en Hedera e historial por distribuidora. Premiado en NEA Tech. |
| **2 · Piloto en el NEA** | Primeras distribuidoras pagando, pase a la red principal de Hedera, panel de indicadores y perfil para compartir con marcas, exportación de reportes. |
| **3 · Acuerdos automáticos** | Contratos inteligentes en Hedera (Smart Contract Service): condiciones de entrega y premios por entregas confirmadas, **sin manejar dinero**. Todo el país. |
| **4 · Otros mercados y países (objetivo)** | Mercados secundarios, integraciones con sistemas de gestión y, solo si la demanda, la ley y la seguridad lo justifican, pagos condicionados. Distribuidoras de América y Europa. |

## 11. Lenguaje (README, app y pitch)

- Palabras simples, en español rioplatense. Sin jerga sin explicar.
- **Nunca** decir «cumple», «está validado», «certificado», «garantizado» ni «a prueba de».
- Firma **electrónica**, no «digital».
- No decir «certificadora»: decir «verificación de datos con fuente».
- **No nombrar empresas ni casos reales** (ni clientes, ni distribuidoras, ni comercios). En ejemplos y datos de prueba, usar nombres genéricos.
- No usar el nombre «Veraz».
- No compararnos con otros productos por nombre.
- Las cifras de mercado y los precios son ilustrativos o de prueba, y se dicen así. No hay todavía datos reales de validación con clientes.
- Claves y secretos solo en variables de entorno (archivo `.env` en la raíz; **nunca** `.env.local`, ver `AGENTS.md`), nunca en el repo ni en el README.

## 12. Qué tiene que tener el README de la app

Guía sugerida para el agente, en este orden:

1. **Nombre y frase:** GALCOA+ · «Tu historial de operaciones es tu mejor carta de presentación».
2. **El problema**, en tres o cuatro líneas (sección 3).
3. **Cómo funciona**, con el flujo de la sección 4 y el ejemplo 200/198.
4. **Por qué Hedera**, con la tabla de qué prueba y qué no (sección 6).
5. **Para quién es** (sección 2), con los mercados secundarios en una línea.
6. **Estado actual:** qué está hecho de verdad en el código y qué no. Revisar el código antes de afirmar algo.
7. **Cómo correrlo:** requisitos, instalación, variables de entorno (solo los nombres, nunca los valores) y cómo usar Hedera Testnet.
8. **Reglas del producto** (sección 5), resumidas.
9. **Hoja de ruta** (sección 10).
10. **Equipo:** Gastón Persoglia, Nahuel Noir, Facundo Ayala, Federico Fontana y Thomas Skarp. 3er puesto en NEA Tech.
11. **Links:** demo (galcoa.noirnahuel.com), presentación (galcoa-presentation.vercel.app) y, cuando esté, la transacción en HashScan y el Topic ID.
