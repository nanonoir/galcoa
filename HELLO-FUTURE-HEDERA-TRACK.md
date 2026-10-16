# Hedera Track: Hello Future

Fuente: [Reglas y tracks - Hedera NEA TECH 2026](https://docs.google.com/document/d/1XoLUFFcOdX0ajfc71asH8aGjzCQ4cZ5i8YTiogUbmvE/edit?usp=drivesdk)

## Introducción

Muchos de los problemas que hoy enfrentan las empresas y las personas, como la conciliación de pagos, la trazabilidad en cadenas de suministro, la validación de documentos y credenciales, las remesas o el registro de propiedad, siguen dependiendo de procesos lentos, intermediarios y sistemas que no confían entre sí. Con blockchain muchos de estos procesos pueden resolverse en una fracción del tiempo y del costo.

Además, estamos entrando en la era agéntica: los agentes de IA ya ejecutan tareas, y es probable que en el futuro cercano también compren, vendan y paguen por su cuenta. Los compradores de mañana podrían ser, en buena parte, IAs. Para operar entre ellas y con las personas, esos agentes necesitan identidad, pagos y registros verificables, y es ahí donde la blockchain tiene un rol concreto.

## Propuesta

Este track está pensado para resolver problemas reales. Cada equipo deberá identificar un problema concreto, hoy resuelto con procesos manuales, intermediarios, falta de confianza o baja eficiencia, y rediseñarlo con las tecnologías de Hedera. Puede aplicarse a un negocio existente o dar lugar a uno nuevo.

## Descripción

La evaluación se centra en la comprensión del problema y en la justificación del uso de blockchain. Cada equipo deberá demostrar que el problema existe, a quién afecta y por qué blockchain es la herramienta adecuada para resolverlo. La complejidad técnica, por sí sola, no suma puntos.

Las propuestas deberán utilizar uno o más de los siguientes servicios de Hedera:

- **Hedera Token Service (HTS):** tokenización de activos.
- **Hedera Consensus Service (HCS):** intercambio de mensajes y trazabilidad de forma segura y ordenada.
- **Hedera Smart Contract Service (HSCS):** lógica de negocio inalterable y descentralizada.
- **Asset Tokenization Studio:** propiedad de activos, cumplimiento normativo, documentos y notificaciones onchain. Aplica a bonos, cuotas, inmuebles, cosechas y derechos.
- **Stablecoin Studio:** gestión de stablecoins con transparencia y seguridad. Aplica a pagos, sueldos, remesas y cobros entre empresas.
- **Sustainability Studio (Guardian):** registros auditables y reproducibles de activos ambientales, como los créditos de carbono.
- **AI Studio (Hedera Agent Kit):** agentes de IA verificables, para procesos donde una máquina actúa y sus acciones deben poder auditarse.

Toda propuesta debe demostrar al menos una transacción en vivo en testnet o mainnet, usando alguno de los servicios mencionados.

## Qué no buscamos

- **Blockchain sin justificación:** propuestas que no expliquen qué falla hoy y por qué blockchain lo resuelve.
- **Soluciones en busca de un problema:** ideas que parten de la tecnología y luego intentan encontrarle un caso de uso.
- **Problemas no validados:** propuestas basadas en suposiciones, sin conversaciones con usuarios ni evidencia de que el problema existe.
- **Tokenización innecesaria:** activos que no ganan nada al ser tokenizados.

## Criterios de evaluación (100 puntos)

| Criterio | Puntos | Preguntas guía |
| :-: | :-: | :-- |
| **Validación del problema** | 30 | ¿Quién tiene el problema? ¿Cuánto le cuesta hoy en dinero, tiempo o riesgo? ¿Hablaron con usuarios reales? ¿Hay datos, entrevistas o casos documentados? |
| **Justificación de blockchain** | 25 | ¿Qué falla hoy sin blockchain? ¿Participan varias partes que no confían entre sí? ¿Se necesita un registro inalterable o una liquidación sin intermediarios? ¿Por qué no alcanza una base de datos tradicional? |
| **Uso de Hedera y sus Studios** | 15 | ¿Eligieron los servicios adecuados y explican por qué? ¿Cada componente cumple una función real en la solución? **Requisito: al menos una transacción en vivo en testnet o mainnet, con el ID de transacción o un enlace a HashScan como evidencia.** |
| **Viabilidad y modelo** | 15 | ¿Cuál es el modelo de negocio? ¿Quién es el usuario y quién el cliente? ¿Quién paga? ¿Qué barreras regulatorias existen? ¿Cuál es el primer paso concreto? |
| **Impacto y alcance** | 10 | ¿Cuántas personas o procesos mejora? ¿Puede replicarse fácilmente en otros contextos o países? Pensá global, construí local. |
| **Claridad de la presentación** | 5 | ¿Se comprende el problema y la solución en el tiempo del pitch? Calidad de la presentación en general. |

## Ideas para inspirarte: proyectos de hackathon construidos en Hedera

Estos proyectos muestran distintas formas de aplicar blockchain a problemas reales. Se incluyen como referencia para entender las capacidades de la tecnología, **no para replicarlos**.

- **Ketch (pesca):** las cuotas de pesca de EE.UU. se negocian a través de brokers que cobran entre 3% y 8% y demoran semanas en trámites en papel. Ketch las tokeniza para que los permisionarios compren, vendan y alquilen sin intermediarios. [Demo](https://www.youtube.com/watch?v=1l_NxV6dz1Y)
- **Hedera Green Bonds (finanzas sostenibles):** bono verde con penalidad en el cupón si el emisor incumple sus metas ambientales, para reducir el greenwashing. Utiliza Asset Tokenization Studio y Guardian. [Demo](https://youtu.be/261J4n4K3t8)
- **Lamina (mercado de capitales):** agente que gestiona el ciclo de vida de un bono tokenizado: cumplimiento, cupones y vencimiento. [Demo](https://www.loom.com/share/82d84f077a514fa890b57c59613e90bc)
- **Arze (recursos humanos):** pago de sueldos tokenizado y transparente, directo a la billetera del empleado. [Más info](https://hedera.com/blog/these-are-the-winners-of-the-hellofuture-hackathon-2-0/)
- **Eggologic (economía circular):** hub real en Uruguay que transforma residuos orgánicos de restaurantes en huevos, proteína, compost y activos ambientales verificados. Utiliza Guardian. [Demo](https://youtu.be/hENzHwvPzm4)
- **Hestia (seguros y clima):** registra tareas de prevención de incendios forestales como credenciales verificables y emite créditos que las aseguradoras aceptan para reducir primas. [Sitio](https://www.hestia.bond) · [GitHub](https://github.com/akash-mondal/hestia)
- **Golden Needle (construcción):** registro inalterable de documentos de seguridad de edificios, diseñado para la ley británica Building Safety Act 2022. [Demo](https://www.youtube.com/watch?v=p1w2u1-GRUU)
- **Haras Project (ganadería):** registros seguros de linaje, historial médico y propiedad de caballos, para reducir el fraude entre propietarios, veterinarios y casas de subasta. [Más info](https://hedera.com/blog/these-are-the-winners-of-the-hellofuture-hackathon-2-0/)
- **Medera (salud):** plataforma que conecta clínicas, farmacias y pacientes mediante identidad descentralizada. [Más info](https://hedera.com/blog/these-are-the-winners-of-the-hellofuture-hackathon-2-0/)
- **Dossier (información y medios):** tres agentes que verifican afirmaciones en noticias y registran cada paso en Hedera Consensus Service, para recuperar la confianza en la información. [Demo](https://youtu.be/N9ZR_P0YsDg)

**Fuentes:** [Hello Future Apex](https://hedera.com/blog/these-are-the-winners-of-the-hello-future-apex-hackathon/) · [Hello Future 2.0](https://hedera.com/blog/these-are-the-winners-of-the-hellofuture-hackathon-2-0/)

---

# Reglas Hello Future: Hedera en NEA Tech

## Ideathon

Cada equipo debe presentar un proyecto que resuelva una problemática real utilizando tecnología blockchain de Hedera.

## Premios

**Total: USD 1.000**

| Puesto | Premio |
| :-: | :-: |
| 1er puesto | USD 500 |
| 2do puesto | USD 300 |
| 3er puesto | USD 200 |

**Entrega del premio**

- Hedera tendrá un plazo de hasta 15 días hábiles desde recibida la información de pago para entregar el premio a los equipos ganadores.
- Cada equipo ganador deberá proporcionar una wallet válida.
- Se realizará un único pago a la wallet indicada. El reparto entre los integrantes queda a criterio del equipo.
- La wallet debe especificar la moneda a recibir y la blockchain utilizada.

**Datos requeridos**

- Wallet: xxxxxxxxxxxx (Red Hedera + MEMO, si corresponde)
- Moneda: USDC
- Nombre del propietario de la wallet:
- Nombre del equipo:

## Equipos

- Entre 2 y 5 integrantes por equipo.
- Cada persona puede integrar un único equipo.
- La participación es únicamente presencial.
- Un equipo puede participar en uno o más tracks, siempre que se cumplan los requisitos de cada uno.

## Reglas del Ideathon

**1. Originalidad.** El proyecto debe desarrollarse desde cero durante el ideathon. No se aceptan trabajos previos, proyectos reutilizados ni plagios. Sí es válido extender un proyecto anterior agregándole la conexión a la red de Hedera. Si el proyecto extiende uno anterior, debe declararse por escrito en el README qué existía previamente y qué se desarrolló durante el ideathon.

**2. Uso de Hedera.** El proyecto debe utilizar al menos uno de los siguientes componentes de Hedera:

- Hedera Token Service (HTS)
- Hedera Consensus Service (HCS)
- Hedera Smart Contract Service (HSCS)
- AI Studio (Hedera Agent Kit)
- Asset Tokenization Studio
- Sustainability Studio (Guardian)
- Stablecoin Studio

Esta es la condición mínima para que un proyecto sea considerado válido en el track de Hedera.

**3. Código abierto.** El repositorio público en GitHub es obligatorio. El líder del equipo lo crea y da acceso al resto de los integrantes. Debe incluir:

- Código fuente de la aplicación.
- README con instrucciones claras de instalación, despliegue y testing.
- Todo archivo de configuración necesario para ejecutar el proyecto.

El repositorio no podrá registrar commits posteriores al cierre de entregas (viernes 16/10, 19:00 hs). Los cambios realizados después de ese momento no serán considerados.

**4. Pitch y presentación.** Se seleccionarán tres finalistas, que serán anunciados el sábado durante NEA Tech.

**5. Entregables.** Todo se entrega a través de Google Forms: <https://forms.gle/YMJFPs919qHdH9w2A>

**El cierre es el viernes 16/10 a las 19:00 hs.** Se recomienda subir el material con al menos 30 minutos de anticipación.

La entrega debe incluir:

- **Repositorio público en GitHub** con código, README e instrucciones de despliegue.
- **Demo funcional:** la aplicación debe estar en funcionamiento y accesible mediante un enlace, con al menos una transacción real en testnet o mainnet de Hedera. Se debe incluir el ID de la transacción o su enlace a HashScan en la entrega y en el README, junto con los IDs de cuenta, token, topic o contrato utilizados.
- **Video demo:** máximo 5 minutos, subido a YouTube o Drive con **acceso público**. Una entrega sin video demostrativo no será puntuada.
- **Pitch deck en PDF** con la siguiente estructura:
  1. Problema que ataca el proyecto.
  2. Evidencia de validación del problema: entrevistas, datos o casos documentados.
  3. Solución que propone.
  4. Por qué blockchain: qué falla hoy sin ella y por qué no alcanza una base de datos tradicional.
  5. Equipo detrás del proyecto.
  6. Stack tecnológico: soluciones, infraestructura, servicios y componentes de Hedera utilizados.
  7. Modelo de negocio: usuario, cliente, quién paga y primer paso concreto.
  8. Roadmap y próximos pasos: aprendizajes y mejoras para versiones posteriores al evento.

**6. Uso de inteligencia artificial.** Se permite el uso de herramientas de IA siempre que se cumplan los requisitos de estas reglas y que su uso sea declarado en la entrega.

## Cronología

| Fecha | Hito |
| :-: | :-- |
| Jueves 15/10, 14:00 hs | Inicio del ideathon |
| Viernes 16/10, 19:00 hs | Cierre de entregas. No se harán excepciones |
| Viernes 16/10, desde las 19:00 hs | Deliberación del jurado |
| Sábado 17/10, inicio de NEA Tech | Anuncio presencial de los finalistas |
| Sábado 17/10 | Pitch de finalistas ante el jurado: 5 minutos como máximo y 2 minutos de preguntas y respuestas |
| Cierre del evento | Anuncio de ganadores y solicitud de contacto para coordinar la entrega de premios |

## Mentorías

Durante el evento, Henry Tong y Martin Gutter acompañarán a los equipos como mentores, tanto técnicos como no técnicos.

## Jurado

**Revisión y preselección (viernes)**

- Embajadores Hedera LATAM
- Equipo de DevRel de Hedera
- Henry Tong
- Martin Gutter

**Jurado final (sábado, presencial)**

- Henry Tong
- Martin Gutter
- Jurados de los demás tracks participantes podrán hacer preguntas en vivo.
