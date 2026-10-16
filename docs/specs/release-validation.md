# Evidencia de aceptación, evaluación y liberación P0

**Estado objetivo: toda validación funcional pendiente.** Esta spec define qué debe demostrarse, no afirma tests implementados/ejecutados. Autoridad: [PRD v1.5](../exec-plans/GALCOA-PRD-v1.4.md), REQ-17/18, §11–12, D-11 y §16; [SH-09/10](../design/mvp-shared-foundations.md); seguimiento en [maestro](../exec-plans/active/mvp-master-plan.md).

Parámetros/calidad abiertos: [sources-and-ai](sources-and-ai.md). Reglas de revisión: [review-confirmation](review-confirmation.md). Seguridad pública: [public-capabilities](public-capabilities.md). UX: [frontend-delivery](frontend-delivery.md). Los diseños [SQL](../design/data-transactions.md) y [manifiesto/HCS](../design/manifest-hcs.md), en preparación, concretan las fronteras técnicas; no se sustituyen con tests contra un producto clonado.

## 1. Qué acredita cada evidencia

| Nivel | Sí acredita | No acredita | Consumidor |
| --- | --- | --- | --- |
| Contratos/reglas con dobles | Formatos, invariantes deterministas, errores, estados y recuperación simulada | IA real, permisos RLS, consenso real | MVP-120/121 |
| Componentes/preview | Props, contenido, callbacks, accesibilidad local | Sesión, navegación integrada, persistencia o permisos | MVP-110…115 |
| E2E de rutas integradas con dobles | Navegación/interacción real sobre la app y servicios controlados | Proveedores remotos ni RLS si usa dobles | MVP-121/118 |
| Supabase/Postgres local real | Migraciones, RLS/Storage, transacciones, concurrencia e inmutabilidad reales | Configuración remota, proveedores, permisos de GitHub | MVP-024/120/131 |
| CI Linux remoto | Checks de ese run/commit/entorno | Protección de ramas por tener workflow/CODEOWNERS | MVP-006/131 |
| Smoke remoto autorizado | Flujo real en Vercel/Supabase/IA/HCS Testnet configurados | Calidad estadística general o permanencia Mainnet | MVP-132…134 |
| Evaluación real etiquetada | Métricas medidas del dataset/modelos/prompts registrados | Detección general de fraude o validación regulatoria | MVP-122/123/135 |

Todo resultado registra fecha, revisión de código/datos, comando o procedimiento, entorno, caso, resultado observado y evidencia sanitizada. «No ejecutado», «con doble», «local real» y «remoto real» no son equivalentes.

## 2. Entorno determinista y aislamiento

CI por defecto no llama proveedores IA/HCS ni servicios cloud con credenciales. La base local real puede usar claves efímeras del harness sin leer `.env` privado. Build no inicializa proveedores ni consulta datos privados por faltar configuración.

MVP-024 introduce helpers RLS en `tests/server/rls/`; MVP-120 los reutiliza, no duplica otro harness. Probar A, B y anónimo contra base/Storage local reales: A no obtiene documentos, archivos ni respuestas de B. Dobles de autorización no satisfacen esa aceptación.

Pruebas concurrentes usan conexiones/transacciones independientes, no solo `Promise.all` contra dobles. Incluyen respuesta opuesta, sustitución tardía, claim de finalización y fallos entre checkpoints, verificando una sola decisión/versión y persistencia inmutable.

`src/mocks/` contiene escenarios DTO de contratos. Dobles de Gemini/Groq/Storage/HCS y constructores de servidor pertenecen a `tests/server/`; nunca se importan desde producto ni preview para simular integración real.

E2E usa las rutas/componentes y reglas reales con sustitución controlada de dependencias en el harness. El seam concreto lo define el diseño consumidor: no crear clon mock del producto, ruta privada de pruebas desplegable ni flag productivo que habilite acceso/fallback ficticio. Barreras prueban también casos negativos.

El diseño SQL §7 distingue «navegador + integración de handlers con dobles» de un recorrido Next íntegro: si intercepta mutaciones para invocar servicios reales con dobles, la matriz identifica requests interceptados y deja explícito el hueco de transporte/composición. No declarar ese hueco cubierto por la siguiente lectura SSR. El recorrido íntegro con adapters reales corresponde al smoke autorizado MVP-134.

## 3. Matriz exacta de los 15 casos del PRD §12

MVP-121 mantiene una fila por caso con **archivo + nombre del test + enlace**, frontera, entorno, resultado y huecos. Esta tabla enlaza hoy la fuente de aceptación; los enlaces a tests se incorporan solo cuando existan. **Las 15 filas están pendientes; ninguna constituye cobertura implementada.**

| Caso PRD | Aceptación a demostrar | MVP consumidores | Evidencia requerida |
| --- | --- | --- | --- |
| [§12.1](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | A no ve documentos, archivos ni respuestas de B | 024/120/130 | RLS/Storage local real, dos usuarios/anon |
| [§12.2](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Chat/evidencias persisten entre sesiones; v2 no altera v1 | 041/042/084/121 | Servicios persistentes y E2E |
| [§12.3](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Autor requiere sesión/propiedad; todas las confirmaciones; solo-autor basta | 071/075/080 | Denegaciones y finalización real local |
| [§12.4](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Dudas/críticas advierten sin inventar/bloquear; fallo técnico sin éxito falso | 051/053/060…062 | Reglas/servicios con dobles, positivos/negativos |
| [§12.5](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Mismos eventos dan mismos estados, ambos agentes mockeados | 060/120 | Determinista, sin proveedor real |
| [§12.6](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | HCS falla/incierto: finalizada/sello pendiente, mismos bytes/hash y reconciliación | 083/091/092 | Fallos/checkpoints y Mirror retrasado con dobles |
| [§12.7](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Un byte distinto del PDF falla integridad | 082/100 | Bytes PDF y cadena criptográfica |
| [§12.8](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Capacidad acotada, caduca/revoca, GET no consume, respuesta única atómica | 072…075/120 | Fronteras temporales y carreras SQL reales |
| [§12.9](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Cuatro selecciones, enlaces distintos, operación idéntica y sin privados | 070/073/077/121 | Contratos y E2E de las cuatro combinaciones |
| [§12.10](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Devolución conserva entrega anterior | 084 | Historia persistida y comparación v1/v2 |
| [§12.11](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Cambio material/selección sin herencia, enlaces sustituidos, finales inmutables | 070/075/083/084 | Casos negativos SQL y respuesta tardía |
| [§12.12](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Checkbox/modal/rechazo visible; cancelar no responde; rechazo impide finalizar | 074/076/118 | Componentes, E2E y rechazo de comando incoherente |
| [§12.13](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Todas → anexo sin cambiar operación → PDF/manifiesto → HCS, sin sello por confirmación | 080…083/091/121 | Orden observable y negativos antes de completar |
| [§12.14](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Invitación distinta; con PDF bytes; sin PDF solo registro, sin fugas | 073/100/101/130 | DTO público, servicios y E2E |
| [§12.15](../exec-plans/GALCOA-PRD-v1.4.md#12-pruebas-y-métricas) | Cantidades contradictorias/unidad ausente confirmables con fuentes; no independencia visual falsa | 043/053/062/070/076 | Fuentes textuales y vista compartida completa |

No sustituir estos casos por quince tests fáciles distintos. Además de la fila §12.9, el flujo crítico E2E recorre las cuatro selecciones hasta sus precondiciones de finalización; cubre también rechazo y sustitución, no solo camino feliz.

Hueco significa caso no probado, evidencia de nivel insuficiente o prueba fallida. Se registra causa y tarea afectada; no se acepta como cumplido ni cierra REQ-18. Preparación documental puede conservar huecos explícitos, cierre del MVP no puede ocultarlos.

## 4. Evaluación IA y compuerta de uso real

MVP-122 prepara aproximadamente 30 casos correctos y con errores sembrados, etiquetados **antes** de ejecutar modelos; 15/15 es ejemplo del PRD, no resultado ni obligación de reparto exacto.

Las etiquetas identifican fuentes, errores esperados y respuesta correcta/no advertencia cuando corresponda. Incluir omisiones, contradicciones, casos correctos y limitaciones visuales; no adaptar etiquetas después de ver respuestas para mejorar métricas.

| Informe de MVP-123/135 | Contenido requerido |
| --- | --- |
| Reproducibilidad | Versión del dataset/etiquetas, modelos decididos, versiones de prompts/reglas, configuración y fecha |
| Resultados | Errores detectados / etiquetados, falsos positivos, omisiones; denominadores y casos concretos |
| Variación y fallos | Repeticiones cuando importe, dispersión observada, errores técnicos y ejecuciones incompletas separados |
| Límites | Tamaño/composición del conjunto, dependencia de extracción Gemini y ausencia de independencia visual de Groq |
| Decisión de uso | Comparación contra mínimo aprobado en MVP-013, resultado y restricciones pendientes |

No contar intento técnico fallido como acierto ni ocultarlo excluyéndolo sin explicación. Un dataset etiquetado, runner con dobles o tabla de ejemplo **no es benchmark real**. La evaluación no se ejecuta en cada PR ni convierte variación de proveedor en test unitario frágil.

Si falta mínimo aprobado, el resultado no habilita documentos reales. Si no lo alcanza, informar déficit, casos y limitaciones; mantener esa habilitación pendiente y registrar trabajo necesario, no cambiar retrospectivamente etiquetas/umbral para declarar éxito. Demo con datos ficticios sigue diferenciada. Uso real/comercial requiere también MVP-014 y revisión de privacidad/términos.

## 5. Seguridad, despliegue y cierre

| Compuerta | Aceptación verificable |
| --- | --- |
| MVP-130 | Upload y endpoints públicos limitados; tokens/privados fuera de logs/referrer/recursos/bundle; sin fixtures en producto; casos negativos de autorización |
| MVP-131 | Run Linux enlazado al commit con servidor/RLS local. Checks requeridos y protección de rama **no son obligatorios** en la hackathon (opt-out explícito del usuario, AGENTS.md); quedan opcionales posthackathon y, si se configuran, se comprueban aparte con permisos efectivos. El workflow se conserva como señal |
| MVP-132 | Despliegue Vercel real, Auth redirects y migraciones aplicados al entorno autorizado; nombres de configuración documentados sin valores secretos |
| MVP-133 | Cuentas autorizadas y datos ficticios; confirmación de correo no desactivada para eludir límites del emisor |
| MVP-134 | Smoke real de sesión/chat/evidencias/IA/confirmación/finalización/HCS/verificación; fallo/reintento si reproducible, o limitación registrada |
| MVP-135 | Métricas reales y límites publicados, sin extrapolar desde dobles |
| MVP-136 | REQ-01…18 reconciliados con evidencia, huecos/deuda visibles, integración y validaciones del cierre comprobadas |

Ausencia de permiso remoto bloquea solo su tarea: Supabase remoto MVP-026, Vercel MVP-132, GitHub/CI/protección MVP-006/131, smoke/evaluación live MVP-134/135. No exige esas credenciales para contratos, tests locales o preparación documental. No se ejecutan acciones remotas ni se leen secretos por redactar specs.

## 6. Aceptación de esta política y decisiones abiertas

| Caso | Positivo / negativo esperado | Consumidor |
| --- | --- | --- |
| V-01 | Matriz tiene 15 filas y tests reales enlazados cuando existan; mock RLS no se declara local real | MVP-024/120/121 |
| V-02 | CI default pasa sin proveedores; test E2E usa producto real sin ruta/flag de bypass desplegable | MVP-120/121/131 |
| V-03 | Etiquetas previas y métricas con denominadores; resultados bajo mínimo no se convierten en habilitación | MVP-013/122/123/135 |
| V-04 | Run/configuración/protección y smoke son evidencias distintas; falta de permiso no cierra tarea | MVP-006/131…136 |

Registro F1 canónico: MVP-013 en sources-and-ai; **default propuesto NO APROBADO:** evaluar primero el conjunto etiquetado y fijar mínimo con criterio documentado antes de uso real. Quedan abiertos métrica/umbral, parámetros, coste y tiempos; F1 debe registrar fundamento, alternativas, pruebas y aprobación fechada sin fabricar cifras.

MVP-010/011/012 se resuelven en sus documentos consumidores, no aquí. Esta spec no crea otra decisión de calidad ni marca ningún ID completado. Tests, evaluaciones, despliegue y CI descritos siguen pendientes de evidencia propia.
