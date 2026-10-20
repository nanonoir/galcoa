# ExecPlan — Evolución profesional de UI/UX de GALCOA+

Estado: COMPLETADO Y ARCHIVADO (implementación local, estabilización funcional, build, E2E y migración remota de persistencia verificadas al 100%; límites reales de Docker local y validación cloud de nueva UI documentados como seguimiento). Fecha: 2026-10-20.
Origen: pedido directo de Nahuel para explorar y planificar una mejora integral de interfaz, experiencia, tipografía y movimiento.

## Objetivo

### Continuación remota autorizada — 2026-10-20

El usuario confirmó login de CLI. Se identificó `galcoa-dev` (`yyvwuihzbdglidbxdknd`, activo) por listado de proyectos, sin leer secretos. Consulta de catálogo por Management API confirmó **ausentes tanto RPC `public.rename_document(uuid,text,text)` como migración `20261017000100`**. Helpers F4, rol restringido sin LOGIN/BYPASSRLS, permisos de lectura/auditoría y RLS de documentos existen. La consulta opera como `postgres`; el escritor no tiene CREATE antes de la operación y su membresía del operador tiene SET/INHERIT desactivados.

Próximos pasos de este lote, dentro de la autorización condicional ya dada:
1. Revisar independientemente la migración existente y verificar precondiciones de catálogo.
2. Aplicar **solo** `20261017000100_rename_document.sql` en transacción con guardas y registro de su historial exacto; sin `db push` masivo, reset, otras migraciones, cambios de datos de negocio ni despliegue de aplicación.
3. Verificar propietario/permisos/search_path/retirada de CREATE y SET, coincidencia de SQL registrado y revisión del esquema de PostgREST.
4. Probar renombrado por la UI/cuenta de prueba con documento ficticio mutable, persistencia al recargar y protección de versión finalizada; no modificar PDFs/hashes ni documentos ajenos.
5. Reconciliar evidencia y deuda; conservar límites de pruebas reales no ejecutadas y ausencia de autorización de push/despliegue.

Evolucionar GALCOA+ hacia una experiencia profesional, reconocible y fluida: jerarquía clara, lectura cómoda, navegación consistente y feedback preciso. Conservar la identidad verde/amarillo y la geometría editorial técnica; no convertir el producto en una plantilla SaaS genérica ni reescribirlo.

Este plan autoriza organizar la implementación futura; su creación no implica que los cambios estén implementados. No incluye entrega Git sin autorización específica.

## Fuentes y relación con trabajo existente

- Producto e invariantes: [PRD](../GALCOA-PRD-v1.4.md), especialmente §3–6, §10–11 e INV-02, INV-05, INV-10–14, INV-17–18.
- Dirección visual canónica: [design.md](../../../design.md). Las decisiones visuales definitivas se reconciliarán allí, sin mantener una especificación paralela en este plan.
- Arquitectura y validación: [architecture.md](../../architecture.md), [development.md](../../development.md) y `tests/boundaries/manifest.mjs`.
- Antecedente: [ui-estilo-roadmap.md](../active/ui-estilo-roadmap.md). Contiene ejecución parcial y evidencia histórica; no tratarlo como trabajo por repetir. Al implementar, revisar sus pendientes y registrar cuáles quedan absorbidos por este plan, sin borrar evidencia ni cerrar planes compartidos unilateralmente.
- Criterios de trabajo: `design-taste-frontend` para dirección visual, `redesign-existing-projects` para evolución del sistema existente y `emil-design-eng` para interacción y movimiento. Sus sugerencias se filtran por producto, identidad, accesibilidad y stack; no son una lista de efectos obligatorios.

## Exploración realizada y límites de evidencia

Se realizaron tres exploraciones de solo lectura: sistema visual/componentes, recorridos y arquitectura/validación. Se inspeccionaron páginas públicas productivas y la landing en navegador; se abrió también el preview local aislado. El árbol Git estaba limpio al comenzar.

Hallazgos de código que se deben volver a comprobar antes de intervenir:

| Hallazgo | Referencias | Consecuencia |
| --- | --- | --- |
| Radios hardcodeados contradicen geometría recta; controles con alturas dispares | `src/components/ui/{button,input,card,badge,dialog,alert-dialog}.tsx`, componentes de features | Normalizar el sistema, no parchear pantalla por pantalla |
| Tokens superpuestos y títulos excesivamente amarillos | `src/app/globals.css` | Consolidar tokens utilizados y restituir jerarquía neutra |
| Cabecera y landing no comparten ancho; títulos repetidos en dashboard | `src/features/marketing/components/`, `src/app/(app)/dashboard/page.tsx` | Alinear retícula y reducir redundancia |
| Confirmación/verificación sin contexto de marca suficiente | `src/app/confirm/[token]/page.tsx`, `src/app/verify/[reference]/page.tsx` | Mejorar reconocimiento y confianza de terceros |
| Feedback de espera del chat mejorable | `src/features/chat/containers/chat-container.tsx`, `src/features/chat/components/` | Comunicar fases reales sin simular progreso |
| Fuentes del preview no equivalen necesariamente a Next | `preview/index.html`, `src/app/layout.tsx` | Evitar decidir tipografía a partir de fallbacks |
| Registro sin sesión puede devolver error genérico; historial recibe `versions: []` | `src/lib/supabase/auth-flows.ts`, `src/app/(app)/documents/[id]/page.tsx` | Brechas funcionales separadas del pulido visual |
| Enlaces de invitación en claro viven en memoria | `src/features/corroborations/containers/review-container.tsx` | Explicar pérdida por recarga y consecuencias de reemisión |
| Modo demo oculta advertencias y omite contraste | `src/lib/contracts/demo-mode.ts`, `chat-container.tsx` | No modificar silenciosamente durante el rediseño |

No se ejecutaron suites para esta exploración. No se creó cuenta ni documento y no se probó el recorrido autenticado completo. La existencia de código/tests no demuestra funcionamiento productivo. El usuario autorizó pruebas reales en beta con datos ficticios; falta un correo de prueba accesible o una sesión de prueba provista por el usuario. No usar buzones ajenos ni servicios nuevos por iniciativa propia.

## Alcance y protección de producto

Incluye landing, acceso, dashboard, documento/chat, revisión/participantes, confirmación pública, finalización, historial visual y verificación. Incluye estados vacío, carga, error, éxito, foco y adaptación móvil donde correspondan.

No incluye nuevas capacidades de búsqueda, archivo, borrado, pagos ni servicios externos. Tampoco alterar Auth/RLS, persistencia de tokens, confirmaciones o finalización para fines estéticos. La estabilización funcional descrita abajo sí está autorizada. Migraciones destructivas, cambios incompatibles de contratos o decisiones de seguridad requieren consulta. No tocar PDFs finalizados, hashes ni versiones inmutables. La tipografía del PDF no cambia automáticamente al cambiar la de la web.

Las advertencias siguen siendo no bloqueantes; las confirmaciones siguen ligadas a la misma revisión/snapshot. No inventar métricas, testimonios ni garantías. Mantener terminología permitida del PRD.

## Dirección inicial y decisiones pendientes

- Carácter: precisión editorial, identidad técnica y calma operacional.
- Conservar marca, verde/amarillo, fondos oscuros y formas rectas. Amarillo como acento y acción principal, no en todos los títulos.
- Retícula al servicio de regiones reales; evitar textura o decoración que compita con la lectura del chat.
- Densidad diferenciada: landing expresiva, espacios de trabajo compactos pero legibles, confirmación especialmente clara.
- Tipografía: comparar **Space Grotesk + IBM Plex Mono** frente a **Manrope + IBM Plex Mono** en landing, chat y confirmación. Manrope es candidata preferida, no elección definitiva. Seleccionar una sans principal; mono solo para hashes, referencias y metadatos que la justifiquen. No agregar una tercera familia.
- No cambiar rutas, identidad, navegación principal ni workflows sin documentar una necesidad real compatible con producto.

## Etapas de ejecución

### S. Estabilización funcional previa al rediseño (ampliación aprobada)

El usuario aprobó Manrope + IBM Plex Mono y la dirección visual, y autorizó ampliar y ejecutar este plan para corregir fallas antes de implementar sobre ellas. No se requieren nuevas aprobaciones rutinarias; se mantienen las consultas por riesgos materiales descritos arriba y la prohibición de push/despliegue no solicitados.

1. Diagnosticar renombrado, relectura/hidratación del chat e historial. Referencias iniciales: rutas de `src/app/(app)/documents/`, `src/features/documents/containers/`, `src/features/chat/containers/`, servicios/lectores de `src/lib/documents/` y handlers de documento. Implementar correcciones acotadas con casos de regresión de guardar/recargar/reabrir; no asumir pérdida de datos donde falló una lectura.
2. Conectar historial real y acceso autorizado al PDF final reutilizando los servicios de versiones/storage existentes. Probar versión finalizada visible, descarga de bytes correctos y rechazo de acceso ajeno; nunca regenerar ni alterar un artefacto finalizado.
3. Distinguir estado histórico congelado de avance actual sin mutar snapshot. Probar resultado completo/registrado frente al resumen histórico y revisión rechazada sin opción de finalizar.
4. Corregir generación de contenido en su origen donde el diagnóstico lo justifique: preservar tildes y no aplicar correcciones lingüísticas regresivas; evitar referencias internas repetitivas en prosa sin perder procedencia estructurada. Usar dobles/pruebas deterministas, no prometer que un prompt garantiza toda salida futura.
5. Registro: contrastar la hipótesis de confirmación de correo con la decisión vigente de acceso inmediato en `docs/development.md` (§Registro con acceso inmediato). Esa decisión requiere sesión y no ofrece verificación opcional; no introducir un éxito pendiente incompatible ni cambiar configuración Auth. Verificar con dobles el contrato aprobado y corregir solo un fallo reproducido compatible. Si se propone otra política, consultarla por separado.
6. Validar cada bloque con tests focalizados, límites, tipos y revisión independiente de las áreas sensibles. Ejecutar una regresión integrada con dobles/local donde esté disponible: crear → conversar → adjuntar → recargar/reabrir → revisar → confirmar/rechazar → finalizar → obtener PDF → verificar coincidencia. Las mutaciones productivas siguen limitadas a pruebas ficticias autorizadas; no ejecutar resets de bases sin necesidad.

Salida: fallas corregidas con evidencia proporcional y lista explícita de límites. Si una dependencia externa impide comprobar algo, registrar la limitación, no simular éxito. Fundamentos visuales y prototipos pueden prepararse en paralelo, pero las pantallas dependientes de estados/contratos se implementan una vez estabilizados estos.

### 0. Completar línea base y verificar hallazgos

1. Releer instrucciones, estado Git, `package.json` y guías relevantes. Antes de código Next, leer la guía local correspondiente en `node_modules/next/dist/docs/` y consultar documentación vigente cuando aplique.
2. Con cuenta de prueba disponible, recorrer producción: registro/acceso, creación, chat, evidencia ficticia, revisión solo autor y con tercero, confirmación, resultado, descarga y verificación. Usar prefijo `[TEST AUDITORÍA UX - DATOS FICTICIOS]`; registrar lo creado sin publicar tokens, contraseñas ni enlaces privados.
3. Probar rechazo en una revisión/documento de prueba separado, sin impedir el caso de éxito. No borrar datos ni usar evidencia real.
4. Capturar línea base pública y autenticada en escritorio y móvil. Si falta acceso, registrar exactamente las pantallas no comprobadas y continuar el trabajo visual aislado donde sea seguro.
5. Revalidar las brechas funcionales; abrir su seguimiento local o referenciar deuda existente, sin resolverlas implícitamente dentro de estilos.

Criterio de salida: mapa de pantallas/estados, evidencia real distinguida de fixtures y lista priorizada de problemas reproducidos o detectados solo en código.

### 1. Comparación tipográfica y especificación visual

Archivos previstos: `src/app/layout.tsx`, `src/app/globals.css`, `preview/index.html`, `preview/preview.css`, `design.md`; prototipos temporales locales si son necesarios.

1. Comparar las dos parejas tipográficas con el mismo contenido, tamaños de pantalla y estados. Evaluar español, acentos, números, texto largo, títulos de documentos y lectura sostenida.
2. Definir escala por rol, pesos, interlineado, anchos de lectura y cortes responsive. Marketing puede tener titulares expresivos; chat y controles no deben heredar esa escala.
3. Establecer tokens semánticos, contenedores, espaciados, superficies, bordes y foco. Consolidar CSS preservando variables que sí tengan consumidores.
4. Documentar en `design.md` la elección y el sistema final. Resolver explícitamente la diferencia entre títulos amarillos del plan anterior y títulos neutros del diseño canónico.
5. Hacer que preview y aplicación usen las mismas fuentes efectivas, preferentemente sin introducir solicitudes externas en el preview aislado. Verificar carga/fallback y evitar saltos perceptibles.

Criterio de salida: comparación visual registrada en tres pantallas; una dirección elegida y reproducible; no depender del fallback del sistema para aprobarla.

### 2. Fundamentos y componentes compartidos

Archivos previstos: `src/components/ui/`, `src/app/globals.css`, componentes afectados en `src/features/*/components/` y sus tests.

1. Normalizar geometría recta, tamaños, estados hover/pressed/focus/disabled/loading y contraste de botones, campos, tarjetas, diálogos y badges.
2. Adoptar objetivo de controles táctiles de 44 px en acciones principales/formularios; comprobar espacio efectivo y excepciones de controles densos. No afirmar incumplimiento WCAG solo a partir de altura: evaluar también área y separación.
3. Unificar patrones realmente repetidos de dimensiones de estado, advertencias, copia y casillas, manteniendo contratos y semántica. Ubicarlos dentro de límites autorizados; no introducir lógica de negocio en primitivas.
4. No eliminar componentes sin uso como limpieza oportunista: no son necesariamente parte del bundle y pueden servir al rediseño.

Criterio de salida: muestras de estados consistentes, foco visible, controles cómodos y pruebas de componentes/límites aprobadas para los cambios.

### 3. Navegación y recorrido de trabajo

Archivos previstos: `src/app/(app)/layout.tsx`, páginas de dashboard/documento/revisión; componentes de `dashboard`, `chat`, `documents`, `corroborations` y `auth`. Containers solo cuando sea necesario para representar estados reales y con pruebas específicas.

1. Corregir cabecera móvil y alinear contenedores; eliminar títulos redundantes conservando estructura semántica.
2. Dashboard: jerarquizar título, estado y acción siguiente, con vacío y error orientados a continuar. No añadir filtros o archivo como nuevas funciones.
3. Chat: mejorar lectura, composición, adjuntos, feedback de envío/espera y acceso al resumen sin perder contexto. No prometer streaming token a token ni porcentajes inexistentes.
4. Revisar foco, scroll y conservación de texto ante fallos; cualquier fallo funcional descubierto se identifica y valida por separado.
5. Revisión: dejar evidente revisión/snapshot, participantes y pendientes; explicar reemisión y revocación de enlaces sin persistir tokens en claro para resolver una fricción visual.
6. Resultado: distinguir versión finalizada, PDF disponible y sello pendiente/registrado. Ajustar jerarquía de `sealed-version-card.tsx` sin equiparar estos estados.

Criterio de salida: acción siguiente comprensible en cada estado; sin saltos de lectura/foco causados por el rediseño; invariantes de confirmación intactas.

### 4. Landing, acceso y superficies públicas

Archivos previstos: `src/features/marketing/components/`, componentes de auth, `confirmation-screen.tsx`, `public-verifier.tsx` y sus rutas/layouts si hace falta composición de marca.

1. Landing: composición editorial propia, propuesta concreta, recorrido ilustrado fiel al producto y CTA claro. Usar assets reales o diagramas con significado, no screenshots falsos ni bloques decorativos arbitrarios.
2. Acceso: legibilidad, etiquetas, feedback y continuidad entre opciones; no cambiar contratos de registro dentro de un ajuste cosmético.
3. Confirmación/verificación: cabecera mínima de marca, contexto de la acción, estados comprensibles y detalles técnicos progresivos.
4. Conservar casilla inicialmente desmarcada y ratificación de rechazo; no ocultar contenido necesario para entender qué se confirma.

Criterio de salida: identidad consistente, lectura móvil clara, sin claims prohibidos y rutas/acciones existentes preservadas.

### 5. Movimiento y acabado

Aplicar después de estabilizar estructura, con CSS/`tw-animate-css`/Base UI existentes. No agregar Motion por defecto.

| Elemento | Propósito y disparador | Criterio |
| --- | --- | --- |
| Botones y copia | Respuesta a interacción | Feedback inmediato; resultado de copia basado en éxito real |
| Diálogos/popovers/paneles | Explicar aparición y relación espacial | Transiciones breves e interrumpibles; origen coherente |
| Mensajes/estados | Suavizar cambios reales | No mover texto mientras se lee ni retrasar contenido |
| Finalización | Comunicar cambios de fase | Estados reales, sin progreso inventado ni celebración que implique garantía |

Definir propiedades concretas, curvas y duraciones por componente; normalmente 100–250 ms, sin demorar acciones frecuentes. Priorizar transform/opacity; no usar `transition: all`. No animar navegación por teclado ni imponer scroll con inercia. Con movimiento reducido, retirar desplazamientos y preservar claridad. Hover solo donde el dispositivo lo soporte.

Criterio de salida: movimiento útil, sin bloqueo de interacción y comprobado con preferencia de movimiento reducido.

### 6. Validación, revisión y cierre

1. Por lote: tests de componentes afectados y `npm run test:boundaries`; lint/typecheck según alcance.
2. Integración final: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`, `npm run build`; revisar configuración vigente antes de lanzar proyectos Playwright de preview y responsive/a11y.
3. Revisión visual en 360/390, 768 y 1440 px; comprobar también cabecera a 320 px, zoom 200%, textos largos, foco, diálogos y ausencia de desborde horizontal.
4. Contraste AA, nombres accesibles, encabezados/landmarks y recorrido con teclado; no confundir estas comprobaciones con auditoría WCAG completa.
5. Comparar capturas antes/después usando la misma ruta, estado y viewport. Inspeccionar fuentes computadas y carga; no aprobar solo por código o tests.
6. Verificar rendimiento de interacciones y carga de fuentes contra línea base con las mismas condiciones; sin librerías nuevas injustificadas ni regresiones atribuibles al rediseño.
7. Revisión independiente de cumplimiento visual/producto y calidad técnica. Corregir problemas relevantes y registrar límites de evidencia.
8. Reconciliar `design.md`, deuda y solapamientos del plan anterior. Delegar cierre/archivo de este ExecPlan a `archiver`, con evidencia y pendientes reales. No modificar contadores globales ni filas de otros IDs MVP.

## Brechas funcionales: tratamiento separado

| Tema | Tratamiento |
| --- | --- |
| Registro con confirmación de correo | Reproducir con configuración real; si se corrige, delimitar contrato/estados y pruebas Auth en un trabajo funcional explícito. No desactivar confirmación para ocultar el error |
| Historial con lista vacía fija | Documentar y proponer conexión funcional separada; no simular versiones para completar el diseño |
| Modo demo | Mantener estado actual hasta decisión de producto; referenciar deuda existente. No cambiar el flag ni activar proveedores por estética |
| Enlaces tras recarga | Incluir explicación visual y consecuencias de reemisión; cambios de almacenamiento o token fuera de alcance |

## Dependencias, paralelismo y riesgos

Orden actualizado: S → 2 → 3/4 → 5 → 6; 0 y 1 ya tienen evidencia preparatoria y deben completarse en sus límites al validar. No declarar cierre integral sin evidenciar o registrar limitaciones.

Después de congelar tokens/primitivas, pueden ejecutarse carriles disjuntos: núcleo/layouts y estilos; marketing/acceso; un recorrido de presentación. Máximo tres y con propiedad explícita de archivos; las áreas de `corroborations` no se reparten entre carriles simultáneos. Los cambios compartidos se integran antes de volver a validar.

Riesgos principales: métricas tipográficas rompen anchos; estilos globales cambian pantallas no vistas; preview difiere de Next; cambios visuales confunden confirmación/finalización; producción difiere de código local. Mitigación: lotes pequeños, capturas equivalentes, fuentes efectivas verificadas y pruebas de invariantes. Preservar trabajo ajeno; no revertir archivos completos para deshacer un lote.

## Registro de progreso

### Autorización de ejecución y ampliación — 2026-10-20

- Dirección visual y Manrope + IBM Plex Mono aprobadas por el usuario.
- Ampliación funcional y continuación automática aprobadas; inicia diagnóstico en dos exploraciones disjuntas: documento/chat/historial y resultado/PDF/estados/contenido.
- Sin autorización de commit, push, PR o despliegue. Producción todavía corresponde a la versión anterior y no puede usarse para acreditar correcciones locales.
- [ ] S: estabilización funcional y regresiones.

Evidencia inicial de ejecución:
- `npm run env:check`: OK, sin inspeccionar valores; Node 24.18.0/npm 11.16.0.
- `npm test` durante trabajo concurrente de Auth: 95 archivos/1402 pruebas pasaron y una aserción de mensaje falló en `tests/server/auth-flow/flows.test.ts`. No se considera línea base inmutable; se remitió al implementador para reconciliar contrato y prueba.
- `docker version`: daemon Docker no disponible. Las suites SQL/RLS locales y E2E que lo requieren no pueden acreditarse en este entorno; no se lanzaron resets ni se omitieron silenciosamente. Se usarán dobles y se declarará el límite.
- Reconciliada hipótesis de registro con la decisión canónica de acceso inmediato: no se cambia política Auth para resolver un supuesto error no reproducido.
- Auth: se conserva 503 sin redirección si el proveedor no entrega sesión, con mensaje más preciso. Revisión independiente PASS: 75 pruebas Auth servidor, 819 servidor total, 16 containers Auth, 10 formulario registro, 69 barreras, lint y typecheck informados como correctos. No se modificó configuración alojada ni se afirma necesario cambiarla.
- Verificación del coordinador: `npm run typecheck` y `npm run test:boundaries` OK (69 pruebas).
- Navegador antes de estabilizar documentos: `npm run test:e2e`: 141/142 pasaron. Único fallo: `next.spec.ts` suponía Auth sin configurar y esperaba 500; el entorno configurado respondió 307 a acceso. Se delegó ajustar la comprobación de fallo cerrado sin debilitar permisos; no se inspeccionó `.env`.
- Corrección del test E2E: solo admite 500 sin Location o 307/308 al pathname `/acceso`, relativo o del mismo origen; prohíbe contenido privado y otros resultados. Foco `next.spec.ts --project=next`: 5/5 OK (rama configurada 307; rama sin configuración no ejecutada en navegador).
- Diagnóstico de PDF/contenido recibido: falta endpoint de descarga final pese a almacenamiento/artefactos ya implementados; se delega lectura autenticada por versión con bytes existentes y enlaces accesibles incluso si HCS está pendiente. Esto no acredita por sí solo disponibilidad de cada artefacto en producción.
- Redacción: se delega prompt `drafting-v2` (v1 permanece inmutable) y defensas deterministas acotadas contra pérdida de tildes/procedencia ruidosa, con dobles. No se cambia contenido de documentos ya finalizados.
- Snapshot: la implementación deberá verificar origen real de sus dimensiones (algunas se recomponen desde revisión al cargar); no basta con renombrarlas todas como «al congelar» si eso sería históricamente inexacto.
- S.4 implementado, pendiente revisión independiente: `drafting-v2` separado de v1; saneamiento acotado de correcciones identidad/desacentuación y refs conocidas entre delimitadores, sin tocar facts/warnings. Implementador informa 92 pruebas AI/evaluación, tsc y eslint focalizados OK. Se solicitó revisión de riesgos del saneamiento posterior a procedencia; no se considera cerrado hasta resolver hallazgos. No se afirma cobertura de toda redacción ni de citas libres «según m1».
- Corrección de diagnóstico visual: `globals.css` define `--radius: 0px` y radios Tailwind derivados. Por tanto, encontrar `rounded-lg/xl/4xl` en código **no demuestra** esquinas redondeadas computadas; comprobar estilos en navegador antes de cambiar clases. Unificar el sistema no requiere una sustitución masiva sin efecto visual.
- Diagnóstico de documento recibido y delegado a implementación: historial vacío fijo confirmado en código; se evaluarán lectura inicial y carga del chat sin asumir la hipótesis no reproducida de router inestable. El antecedente de migración `rename_document` pendiente **no prueba** ausencia en la base remota actual; no se aplicarán migraciones cloud por deducción documental.
- S.2 implementado, pendiente revisión independiente: endpoint por versión con sesión/RLS, comprobación longitud/hash y cabeceras privadas, enlace de descarga con todos los estados HCS. Implementador informa 166 tests de finalización/documentos/corroboraciones, tipos y 69 barreras OK. Falta probar Storage/RLS reales (Docker ausente) y revisar que la nota de estados del snapshot no describa como vivo un estado conservado en memoria.
- Revisión AI encontró riesgo real: restauración global de tildes podía alterar homógrafos y faltaba rastro de saneamiento. Se delegó eliminar restauración semántica heurística, conservar hechos/códigos y registrar descartes con campos existentes. No se cierra S.4 con esa versión riesgosa.
- Suite global de estabilización intermedia: 98 archivos/1428 tests OK, 1 fallo de evaluación que todavía esperaba `drafting-v1` en runner activo. Corrección delegada y exigida ejecución del proyecto contracts (la corrida AI anterior con `--project server` no acreditaba ese test).
- Historial/Chat implementados con dobles: lector real de versiones con error recuperable y carga explícita del chat; renombrado solo mejora mensaje de disponibilidad, no acredita reparación remota. Pendiente revisión independiente antes de pasar a pantallas.
- `npm run build` de estabilización intermedia: OK; compilación, TypeScript y generación de rutas completadas, incluyendo descarga por versión. No acredita descarga cloud ni los cambios posteriores a esa ejecución.
- Tras fixes AI: `npm test` completo 99 archivos/1430 tests OK y `npm run lint` limpio. Re-revisión independiente AI PASS (93 AI +21 evaluación, tipos/barreras/lint); se mantienen límites de generación no determinista.
- Se preparan fundamentos independientes (fuentes/tokens/primitivas) en carril separado mientras concluyen revisiones de lectores/PDF. Ninguna pantalla dependiente de esos estados se rediseña hasta resolver sus hallazgos. Fuentes locales compartidas entre Next y preview para comparar bytes/familias reales sin red externa.
- Regresión navegador de estabilización: `npm run test:e2e` 142/142 OK (preview + Next público/guardas). No acredita el ciclo autenticado con DB real ni PDF/Storage cloud, y deberá repetirse tras rediseño.
- Revisión PDF: seguridad/inmutabilidad aprobadas; dos hallazgos a corregir antes de cerrar S: dimensiones de snapshot conservadas en memoria pese a nota de avance actual, y descarga ausente en estado published de FinalizationPanel (solo estaba en tarjeta). Se delegó derivar vista viva sin mutar contenido y propagar descarga al resultado inmediato, más compatibilidad HEAD si acotada. Revisor ejecutó 199 tests foco, tipos y barreras OK; esos verdes no sustituyen resolver los hallazgos.
- Fixes PDF/estados implementados: estados derivados de progreso/sello, guardas por revisionId, descarga inmediata chat/revisión y HEAD sin cuerpo. Re-revisión solicitada. Chat: se separó historyStatus loading/ready/error, sin vacío simultáneo ni envío durante carga (44 tests chat reportados).
- Segunda inspección productiva: `/messages` del documento de prueba devuelve 200 JSON con mensajes y la UI termina mostrando ambos. Evidencia compatible con vacío transitorio; no se demuestra pérdida. PATCH del otro documento sigue devolviendo 503 `TECHNICAL_FAILURE`, stage persistencia (correlationId `924977c8-9f60-4a8f-9f7a-57f4fb0d4536`). No se registra como reparado.
- Usuario autorizó revisión remota y aplicación de migración aditiva existente **solo si se comprueba que falta**, sin push/despliegue. No hay conector administrativo Supabase disponible, proyecto local vinculado ni sesión CLI: `supabase projects list` informó falta de access token. No se leyeron secretos. Solicitado login CLI fuera del chat; no aplicada migración ni cambios remotos.
- Fundamentos implementados: Manrope variable + IBM Plex Mono locales con licencias, mismos bytes Next/preview, tokens consolidados y controles/foco/movimiento reducidos. Implementador informa lint/tipos/build, 69 barreras y 381 pruebas foco OK; coordinador comprobó preview390 sin overflow, Manrope16/25.6 y radio computado0. Validación global posterior pendiente.
- Inician carriles UI disjuntos marketing/acceso y espacio de trabajo. Historial aprobado para UI local por revisión independiente; límites remotos anteriores siguen abiertos y no impiden composición local, pero sí declarar todas las fallas remotas resueltas.
- Re-revisión PDF PASS: 259 tests foco, tipos/lint/barreras; estados vivos aislados por revisión, descarga inmediata y HEAD aprobados. `esperando_confirmaciones` con confirmaciones completas se conserva por contrato (dimensiones independientes, no existe estado intermedio nuevo).
- UI workspace integrada: cabecera compacta, títulos dashboard simplificados, hilo720/composer, historial con enlaces PDF hermanos del selector. 148 tests foco y69 barreras reportados; revisión independiente en curso.
- UI marketing/acceso integrada: hero editorial7/5, recorrido explicativo sin assets falsos y formularios con marca/contexto. 81 tests foco y69 barreras reportados; revisión independiente en curso. Coordinador alineó heading en mock y smoke E2E con copy aprobado.
- Verificación del coordinador en Next local: landing/acceso/registro sin overflow horizontal y un h1/main en320/390/768/1440; foco del primer Tab en registro sólido2px. Ensayo CSS zoom200% registro1440 sin overflow (no equivale a zoom nativo ni auditoría completa). Capturas locales `recordings/redesign-landing-{1440,390}.png` y `redesign-auth-390.png` inspeccionadas.
- Cuenta beta no aceptada por Auth del entorno local; no se inspeccionaron variables ni se modificaron cuentas para forzar acceso. Las pantallas privadas nuevas se validan con preview/tests hasta disponer de un entorno autenticado compatible; no presentar capturas públicas/fixtures como prueba privada real.
- Validación integrada UI (intermedia antes de hallazgos finales): `npm test`100 archivos/1443 pruebas OK; lint limpio; typecheck OK; barreras69/69. Se alineó una aserción de hash de `font-mono` a `tech-id` (utilidad canónica que aplica mono), sin cambiar bytes ni lógica.
- Coordinador inspeccionó dashboard en preview390 (captura `redesign-dashboard-preview-390.png`), y confirmación pública local en error. Rama error de `/verify` detectada sin h1 ni recuperación; remitida a revisión para corrección. Las pantallas con servicios locales caídos no acreditan un resultado de verificación exitoso.
- Revisión UI pública confirma 3 warnings (error verify sin contexto/recuperación, amarillo pasivo no aprobado, jerarquía de Finalización) y2 sugerencias (h2 comparación PDF, blanco táctil marca). Correcciones delegadas con regresiones; invariantes/casillas/PDF sin hallazgos funcionales. Revisor volvió a ejecutar1443 tests y checks estáticos limpios.
- Evidencia de navegadores compartidos: se detectaron cambios inesperados de pestañas durante auditoría; agentes de UI/revisión recibieron instrucción de usar Chromium propio. No atribuir acciones remotas de pestañas a un agente sin evidencia. Las pruebas declaradas en este plan distinguen inspección del coordinador, reportes de agentes y prototipos.
- Fixes públicos aplicados y observados por coordinador en Next: verify error ahora conserva h1/Alert/reintentar codificado/volver inicio; bodies borde neutro; Finalización h2; comparaciónPDF h2; enlace marca44. Re-revisión solicitada. Prueba de ruta con dobles agrega cobertura de error sin DB.
- Última suite integrada tras fixes públicos:101 archivos/1444 pruebas OK, lint limpio, typecheck OK, barreras69/69. Captura `redesign-verifier-error-390.png` inspeccionada; build y E2E finales pendientes de liberar servidores propios usados por revisiones visuales.
- Revisión independiente workspace PASS:161 tests foco/302 features y comprobación de preview320/390/768/1440 sin overflow en dashboard/historial. Esto no acredita el header privado en sesión real del entorno local.
- Dictámenes de revisiones independientes completadas:
  - Auth: PASS (75 pruebas servidor, redirección y permisos verificados).
  - AI / Redacción: PASS (93 pruebas AI + 21 de evaluación, prompt drafting-v2 separado de v1 y saneamiento acotado).
  - PDF / Finalización: PASS (259 pruebas foco, endpoint seguro GET/HEAD por versión con RLS/sesión, descarga inmediata).
  - Workspace: PASS (161 pruebas foco / 302 de features, vistas responsivas 320/390/768/1440 sin desbordes).
  - Marketing / Acceso: PASS (81 pruebas foco, hero 7/5 editorial, formularios con marca y foco visible).
  - UI Pública re-review: PASS (169 tests foco, lint, types y barreras; los 3 warnings de verify error, amarillo pasivo y jerarquía de Finalización, más las 2 sugerencias de h2 en comparación PDF y área táctil de 44px en marca quedaron completamente verificados y cerrados).
  - Fundamentos UI y Motion: PASS (comprobados en Chromium propio independiente: paridad estricta de fuentes locales entre Next y Vite preview, targets táctiles de 44 px, foco sólido de 2 px y respuesta correcta a `prefers-reduced-motion`).
- Ajuste menor de layouts y navegación: acción principal de marketing normalizada a sans regular con foco de 2 px; enlaces de logotipo en layouts de auth y aplicación privada ajustados con contenedor táctil accesible de 44 px conteniendo span visual de 28 px. Verificado con `tsc` y `eslint` limpios por el agente de soporte, y marcado inspeccionado por el coordinador contra la guía local de layouts.
- Validación integrada por el coordinador técnico: 101 archivos de prueba, 1444 tests en verde (`npm test`), lint limpio, typecheck OK, barreras arquitectónicas 69/69 OK. Repetición final post-wrappers confirmada por el coordinador: 101 files, 1444/1444 OK, lint limpio. `git diff --check` limpio (solo advertencias de terminación CRLF). Captura `redesign-verifier-error-390.png` inspeccionada.
- Liberación de puertos y validación final integrada completada al 100%:
  - Todos los servidores locales de desarrollo y revisión en puertos 3100 y 4173 fueron detenidos y sus puertos liberados tras concluir las revisiones visuales y la ejecución de Playwright.
  - `npm run build`: completado con éxito (compilación en 4.7s, TypeScript en 7.6s, rutas generadas correctamente incluyendo `/api/documents/[id]/versions/[version]/pdf`).
  - `npm run test:e2e`: 142/142 pruebas OK en 59.6s (servidores Next y Vite preview levantados y limpiados automáticamente por Playwright).
  - Los 3 ajustes menores en wrappers/cabeceras (marketing CTA sans regular con foco de 2 px, enlaces de logo de auth y aplicación privada de 44 px con span visual de 28 px) quedaron incluidos y verificados tanto por `tsc`/`eslint` como por el build y la suite E2E completa.
  - Ya no existen validaciones de build ni de E2E pendientes; no hay hallazgos locales abiertos en ninguna de las 7 revisiones independientes.
- Estado explícito de límites remotos y de base de datos:
  - Docker ausente en la estación local: impidió ejecutar suites completas de RLS/SQL reales contra PostgreSQL local; la verificación se apoya en dobles y pruebas de servidor sin suponer persistencia local real.
  - Auth local: no acepta las credenciales de la cuenta de prueba de la beta por falta de sincronización o investigación del estado de usuarios local vs remoto; no se forzaron cuentas ni se inspeccionaron secretos.
  - Relectura de mensajes en beta: el endpoint `/messages` del documento de prueba respondió 200 JSON con 2 mensajes y la interfaz terminó renderizando ambos; la evidencia confirma que la vista previa de «Todavía no hay mensajes» fue un estado vacío inicial transitorio durante la carga y no pérdida de datos.
  - Desbloqueo y resolución remota de migración (2026-10-20): con sesión CLI confirmada por el usuario (`galcoa-dev` `yyvwuihzbdglidbxdknd`, estado `ACTIVE_HEALTHY`) y autorización condicional previa, el preflight del catálogo comprobó que la función `rename_document` y la migración `20261017000100` estaban ausentes en la base remota. Tras dictamen independiente PASS en sesión `ses_ea7cbf51cffepMkmrpLZ0fuKxc`, se aplicó exclusivamente `supabase/migrations/20261017000100_rename_document.sql` mediante consulta transaccional a la Management API con advisory lock, guardas, historial exacto y recarga PostgREST (SHA256 coincidente `efe68d74fc1535ca4a67f1a8a51ccf4b11415aba9ef26d3dbb6ae538bf016afe`). Verificado en la beta productiva con cuenta existente: documento mutable `dd3122c4-90c2-4f18-824b-efb07ce1306e` renombrado a «[TEST AUDITORÍA UX] Evidencia y rechazo ficticios», persistente al recargar y con exactamente 1 evento de auditoría; PATCH duplicado 200 idempotente sin evento extra; PATCH sobre documento finalizado `705718a3-c750-4c96-aa11-8cf47652fa9b` rechazado con 409 `DOCUMENT_FINALIZED`; petición sin cookies rechazada con 401 `NO_SESSION`; títulos, eventos y hash de manifiesto `4d79777dc1f40b4d32ad540c11bd99ce36964f27e06018d9126dea5c12c5f311` intactos. Sesión beta cerrada. Falla 503 remota completamente resuelta.
- Reconciliación documental completada: `design.md` alineado formalmente en §3, §9 y §11 con la dirección aprobada de §13 (Manrope + IBM Plex Mono local y titulares neutros); superposición registrada en `ui-estilo-roadmap.md` manteniéndolo abierto sin cierre unilateral; deuda técnica registrada en `docs/exec-plans/tech-debt-tracker.md` (Ítem 10); y referencias actualizadas en `docs/architecture.md`.

### Inicio de ejecución preparatoria — 2026-10-20

El usuario autorizó ejecutar el recorrido de línea base y la definición visual/tipográfica, con **reporte y aprobación explícita antes de continuar con fundamentos e implementación**. Esta pausa sustituye cualquier interpretación de ejecución automática del resto del plan.

- Diseñador delegado para comparación tipográfica y propuesta, sin rediseño productivo.
- Capturas públicas móviles tomadas en producción: `recordings/baseline-landing-mobile.png` y `recordings/baseline-access-mobile.png` (evidencia local, no publicación de datos).
- Recorrido autenticado pendiente de correo o sesión de prueba; solicitado al usuario. No se creó una cuenta con correo inventado ni se declara probado el flujo privado.

### Resultado de los pasos 1 y 2 — 2026-10-20

El usuario proporcionó una cuenta de prueba existente. Se utilizó para entrar a la beta; no se copiaron credenciales en documentación ni se creó otra cuenta. El estado pendiente de acceso del párrafo anterior queda resuelto por esta evidencia posterior.

**Recorrido principal observado en producción mediante navegador:**

- Login correcto y dashboard inicialmente vacío.
- Documento de éxito `705718a3-c750-4c96-aa11-8cf47652fa9b`: creación, mensaje explícitamente ficticio, respuesta del asistente/borrador, vista previa, selección Autor + Comprador, congelamiento, confirmación del autor y respuesta confirmada del comprador desde su enlace.
- Finalización: la UI mostró versión 1 finalizada, huella registrada en Testnet, topic `0.0.11047482`, secuencia `10`. El verificador público mostró referencia `b3357344164340c5b1c72712adaa97a3`, huellas y consenso. Esto acredita el recorrido visible de la aplicación, no una auditoría independiente de la transacción en Mirror Node.
- Documento alternativo `dd3122c4-90c2-4f18-824b-efb07ce1306e`: mensaje ficticio con discrepancia, carga de captura pública PNG (solo prueba de carga, no evidencia comercial) y transición de adjunto hasta «Texto extraído».
- Confirmación solo autor mediante modal: pasó a «Confirmado» y ofreció finalizar. Antes de finalizar se cambió la selección a Autor + Comprador: nueva revisión con ambas respuestas pendientes, sin heredar la confirmación anterior.
- Rechazo: casilla vacía, nombre ficticio, modal de ratificación; cancelar permitió volver a abrirlo y ratificar. La pantalla mostró respuesta registrada y el autor vio «Un participante rechazó: abrí otra revisión para continuar», sin acción de finalizar esa revisión.
- No se enviaron mensajes por WhatsApp/correo ni se usaron datos personales comerciales. Quedan dos documentos reales de prueba; no se eliminaron ni se alteraron versiones finalizadas.

**Hallazgos reproducidos que requieren separar estética de funcionalidad:**

| Hallazgo | Evidencia observada | Tratamiento |
| --- | --- | --- |
| Renombrado fallido | Intento de cambiar el primer título mostró «No se pudo guardar el título. Reintentá.»; continuó como «Documento sin título» | Investigar causa funcional antes de prometer auto-título/renombrado correcto |
| Chat vacío al volver | Tras finalizar y volver a la ruta del primer documento, la UI mostró «Todavía no hay mensajes» pese al intercambio previo | Investigar lectura/hidratación; no afirmar pérdida de datos sin comprobar persistencia |
| Historial contradictorio | Misma pantalla mostró versión 1 finalizada y, más abajo, «Todavía no hay versiones finalizadas» | Brecha funcional de integración ya detectada en código |
| Estados congelados vs actuales | Tras éxito, snapshot seguía mostrando pendientes/no iniciado mientras avance y resultado indicaban completo/registrado | Distinguir explícitamente estado al congelar y estado actual; no mutar snapshot inmutable |
| Resultado difícil de usar | No se encontró descarga del PDF final en las superficies recorridas; verificador sí permite elegir PDF | Registrar acceso al artefacto como brecha pendiente; generación/descarga/comparación de bytes no verificadas |
| Calidad del contenido | Segundo borrador mostró referencias `m1` repetidas y una «corrección» que quitó un acento | Problema de generación/contenido, no corregir con CSS ni ocultar información |

La explicación «Guardá los enlaces ahora» y la advertencia de revocación **sí estaban presentes en producción**: no describirlas como ausentes. Queda por evaluar su jerarquía y claridad en la etapa de implementación.

**Evidencia visual:** capturas locales en `recordings/` de dashboard/chat móvil, chat escritorio, confirmación a 390 px, resultado y verificador. `baseline-confirm-mobile.png` corresponde en realidad a una pestaña de escritorio (1920 px); usar `baseline-confirm-390.png` para la comparación móvil. Las capturas/snapshots automáticos de revisión pueden contener enlaces personales: no publicar ni agregar en bloque `recordings/` al control de versiones.

**Límites:** no se probó alta de cuenta, recuperación de contraseña, descarga/comparación del PDF final, HashScan/Mirror Node independiente, navegadores distintos, dispositivos físicos, zoom 200% ni accesibilidad integral. Confirmación pública se recorrió en otra pestaña del mismo contexto de navegador; no acredita aislamiento de sesión. No se ejecutaron suites productivas ni se investigó la causa interna de errores observados. El preview propio iniciado para exploración fue detenido al terminar.

**Paso 2:** propuesta del diseñador registrada en [design.md §13](../../../design.md#13-propuesta-tipográfica-y-dirección-de-evolución--pendiente-de-aprobación) y [estudio tipográfico](../../design-experiments/typography-2026-10-20/README.md). Dos parejas, tres pantallas y cuatro anchos: 24 vistas comprobadas geométricamente, 12 capturas; evidencia de prototipo aislado, no de componentes productivos. Recomendación: **Manrope + IBM Plex Mono**, titulares neutros, amarillo para acción/acento, geometría recta y movimiento breve/funcional. Aplicación y fuentes productivas intactas.

**Siguiente acción:** presentar reporte y ejemplos al usuario. Esperar aprobación explícita de dirección/tipografía y de continuación antes de ejecutar etapas de implementación. Las brechas funcionales no quedan automáticamente autorizadas como cambios de Auth, persistencia o generación.

- [x] Exploración de código en tres áreas y superficie pública.
- [x] Dirección inicial y comparación tipográfica delimitadas.
- [x] ExecPlan creado y ampliado para estabilización funcional.
- [x] Cuenta de prueba y recorrido autenticado principal en beta; límites registrados.
- [x] Comparación tipográfica en estudio aislado y dirección Manrope + IBM Plex Mono aprobadas por el usuario.
- [x] Estabilización funcional (S) implementada: descarga segura PDF GET/HEAD, historial real, loading/ready/error en chat, prompt drafting-v2 separado de v1, mensajes claros de disponibilidad.
- [x] Implementación local de UI/UX completada: fundamentos (Manrope + Plex local, tokens semánticos, radio 0px), marketing/acceso, workspace/historial, confirmación y verificación pública.
- [x] Revisiones independientes aprobadas: Auth PASS, AI PASS, PDF PASS, Workspace PASS, Marketing PASS, UI Pública re-review PASS (169 tests foco), Fundamentos/Motion PASS (Chromium propio). Sin hallazgos locales abiertos.
- [x] Validación integrada del coordinador: 101 archivos, 1444 tests OK, lint limpio, typecheck OK, barreras 69/69 OK. Repetición final post-wrappers confirmada: 101 files, 1444/1444 OK, lint limpio.
- [x] Validación final de `npm run build` (rutas generadas) y suites E2E completas `npm run test:e2e` (142/142 OK en 59.6s, puertos 3100/4173 liberados, git diff --check limpio).
- [x] Desbloqueo y resolución remota de persistencia: migración `rename_document` aplicada bajo transacción con advisory lock en Supabase alojado y verificada en la beta productiva con cuenta existente (título persistente, 1 evento de auditoría, invariantes 409/401 respetadas).
- [x] Documentación reconciliada, deuda técnica actualizada y plan completado y archivado en `completed/` con límites de despliegue explícitos.

## Implementation Outcome

### Implemented
- **Tipografía y fundamentos del sistema visual:** adopción de **Manrope** (sans variable local) e **IBM Plex Mono** (monoespaciada técnica local) alojadas con licencias libres en `public/fonts/`, compartidas entre Next.js y el preview aislado de Vite sin peticiones a redes externas. Consolidación de tokens CSS en `globals.css` (`--radius: 0px`, `--border: 1px solid var(--line)`, colores semánticos) y geometría estrictamente recta.
- **Jerarquía y color:** establecimiento de **titulares neutros (`#F5F4EC`)**, reservando el amarillo de marca (`#FCD34D`) exclusivamente para llamadas a la acción primarias (CTA), estados de foco y acentos estructurados, resolviendo la inconsistencia con propuestas preliminares de títulos amarillos generalizados.
- **Estabilización de PDF y versiones:** creación de endpoint seguro de descarga de PDF por versión (`/api/documents/[id]/versions/[version]/pdf`) con validación de sesión/RLS, verificación de longitud y hash sha256 del binario, cabeceras privadas (`no-store`, `attachment`) y soporte de métodos `GET` y `HEAD` (sin cuerpo). Integración de enlace de descarga directa en el panel de finalización (`published`) y como acción hermana en el selector de versiones del historial.
- **Historial de versiones y estados de chat:** reemplazo de la lista fija vacía por un lector real de versiones con manejo de errores recuperable. Desacoplamiento explícito de los estados del chat (`loading`, `ready`, `error`), impidiendo estados vacíos o envíos durante la carga.
- **Redacción y calidad de IA:** aislamiento del prompt `drafting-v2` sin modificar el inmutable `drafting-v1`, con saneamiento determinista acotado de caracteres y desacentuaciones espurias sin alterar hechos ni advertencias.
- **Espacio de trabajo y navegación privada:** cabecera compacta con navegación y cierre de sesión seguro; hilo central de conversación de 720 px con compositor accesible; tarjetas de revisión y resultado con distinción clara entre estado congelado al snapshot y estado de avance actual.
- **Marketing, acceso y superficies públicas:** hero editorial 7/5 con diagrama fiel al flujo real del producto, formularios de acceso/registro con contexto de marca y foco accesible de 2 px; pantalla de confirmación pública con casilla inicialmente desmarcada y modal de ratificación de rechazo intactos; pantalla de verificación pública con manejo de error que preserva título, alerta explicativa y acciones de recuperación.
- **Persistencia remota en Supabase alojado:** verificación y aplicación de la migración `supabase/migrations/20261017000100_rename_document.sql` bajo transacción con advisory lock, guardas y recarga PostgREST, resolviendo la falla HTTP 503 en producción sin alterar código de la aplicación.

### Deviations from Design
- **Space Grotesk sustituida por Manrope:** la propuesta preliminar de diseño y el roadmap exploratorio contemplaban Space Grotesk vía Google Fonts. Aprobado por el usuario tras el estudio tipográfico comparativo en `docs/design-experiments/typography-2026-10-20/`, se adoptó Manrope variable local para optimizar la legibilidad sostenida en el chat y la sobriedad en controles.
- **Titulares neutros vs. títulos amarillos:** se descartó el uso de títulos amarillos generalizados en favor de titulares neutros en crema (`#F5F4EC`), reservando el amarillo únicamente para acciones y foco.
- **Uso acotado de monoespaciada:** IBM Plex Mono se acotó estrictamente a hashes, referencias, identificadores técnicos y números de secuencia HCS, evitando su uso en subtítulos o párrafos extensos.

### Validation
- **Suites integradas y estáticas (Coordinador):**
  - `npm test`: 101 archivos de prueba, 1444 tests pasando en verde (confirmado en repetición final post-wrappers).
  - `npm run lint`: ejecución limpia sin errores ni advertencias de estilo.
  - `npm run typecheck`: validación de TypeScript y generación de tipos de Next.js exitosa.
  - `npm run test:boundaries`: 69/69 pruebas de barreras de arquitectura e importaciones aprobadas.
  - `npm run build`: completado con éxito (compilación 4.7s, TypeScript 7.6s, generación de rutas estáticas y dinámicas incluyendo endpoint de descarga PDF por versión).
  - `npm run test:e2e`: 142/142 pruebas en verde en 59.6s (cobertura Chromium de preview, Next público, guardas y smoke de rutas).
  - `git diff --check`: sin errores de formato ni espacios (solo avisos de conversión CRLF en Git).
  - Servidores y puertos 3100 y 4173 liberados tras Playwright.
- **Revisiones independientes realizadas (100% PASS):**
  - Auth: PASS (75 pruebas servidor, contratos y redirecciones sin debilitar permisos).
  - AI / Redacción: PASS (93 pruebas AI + 21 de evaluación con `drafting-v2` y saneamiento no heurístico).
  - PDF / Finalización: PASS (259 pruebas foco, soporte GET/HEAD seguro, inmutabilidad y enlace directo en resultado).
  - Workspace: PASS (161 pruebas foco / 302 de features, previews responsivos sin overflow).
  - Marketing / Acceso: PASS (81 pruebas foco, accesibilidad y semántica).
  - UI Pública: PASS en re-revisión (169 tests foco, lint, types y barreras; los 3 warnings de verify error, amarillo pasivo y jerarquía de Finalización, más las 2 sugerencias de h2 en comparación PDF y área táctil de 44px en marca quedaron completamente verificados y cerrados).
  - Fundamentos UI y Motion: PASS (comprobados en Chromium propio independiente: paridad estricta de fuentes locales entre Next y Vite preview, targets táctiles de 44 px, foco sólido de 2 px y respuesta correcta a `prefers-reduced-motion`).
  - Sin hallazgos locales abiertos.
- **Validación remota en la beta de producción (recorrido real):**
  - Renombrado de documento mutable persistente tras recarga con exactamente 1 evento de auditoría.
  - Reintento con mismo título devuelve 200 idempotente sin auditoría duplicada.
  - Renombrado sobre documento finalizado rechazado con HTTP 409 `DOCUMENT_FINALIZED`.
  - Petición sin cookies de sesión rechazada con HTTP 401 `NO_SESSION`.
  - Verificación en base de datos: hashes de manifiesto, documentos finalizados e inmutabilidad preservados al 100%.

### Follow-up y Límites de Despliegue
1. **Nueva UI local pendiente de despliegue:** las mejoras visuales, componentes y navegación residen exclusivamente en el entorno local (sin push a GitHub ni despliegue a Vercel, por quedar fuera del alcance autorizado). La UI desplegada en la beta remota corresponde a la versión previa; la verificación de la nueva interfaz en producción se realizará en el ciclo de despliegue autorizado.
2. **Entorno local sin Docker:** el daemon de Docker no está disponible en la estación local, lo que impidió ejecutar pruebas reales de migraciones SQL y RLS contra PostgreSQL local (`npm run test:rls`). Las comprobaciones se basan en dobles y contratos de servidor.
3. **Discrepancia de credenciales en Auth local:** la cuenta beta de prueba no es aceptada por la base de datos local no investigada; se evitaron manipulaciones no autorizadas de credenciales locales.
4. **Ciclo E2E autenticado con DB real:** los 142 tests de Playwright validan guardas, preview y navegación pública; la prueba del ciclo autenticado completo con base de datos real queda supeditada a un entorno con Docker o backend real.
5. **Deuda técnica registrada:** documentada en `docs/exec-plans/tech-debt-tracker.md` (Ítem 11 para seguimiento de límites de entorno/despliegue; Ítem 10 resuelto).
