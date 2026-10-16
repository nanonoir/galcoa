# Plan maestro del MVP P0: del estado actual al MVP desplegado y validado

**Estado: activo.** Este documento es el ExecPlan durable y el único tablero de seguimiento del MVP. No se cierra hasta completar `MVP-136`. Producto: [PRD v1.5](../GALCOA-PRD-v1.4.md) (autoridad); estructura y propiedad: [arquitectura](../../architecture.md); comandos y checks: [desarrollo](../../development.md).

Este plan **no repite** requisitos, invariantes ni decisiones: los referencia por ID (`REQ-xx`, `INV-xx`, `D-xx`, `§n` del PRD). No es un cronograma impuesto (PRD §13–14): las dependencias indican qué debe existir antes, no cuándo hacerlo.

## 1. Estado de partida y objetivo

**Objetivo.** La aplicación Next.js única cumple REQ-01…REQ-18, está desplegada en Vercel con Supabase y Hedera Testnet reales, y su flujo crítico fue validado con evidencia propia (tests deterministas, smoke real autorizado y evaluación de IA documentada).

**Hecho (base heredada, cerrada en [`team-workspace-readiness`](../completed/team-workspace-readiness.md)).** Contratos Zod y escenarios de dashboard, presentación de referencia, preview Vite aislado, Vitest, barreras de arquitectura, Playwright, workflow de CI definido y plantillas de Issue/PR. Los resultados numéricos de ese cierre (91 tests Vitest, 51 de barreras, 15 Playwright: 13 preview y 2 smoke Next, build, lint, tipos, 2026-10-16) son **evidencia histórica**: no se reutilizan como verificación actual. Cada tarea nueva ejecuta y registra sus propios checks.

**No existe todavía** (verificado en el repositorio): Auth, base de datos y migraciones, Storage, IA (los paquetes `ai`, `@ai-sdk/react` y `groq-sdk` aún no están instalados), PDF, Hedera, rutas funcionales, `supabase/`. El CI no corrió en GitHub y no hay protección de ramas comprobada. La base está en el árbol de trabajo sin commit (ver `MVP-006`).

**Equipo.** Un líder (backend, contratos, integración, rutas, configuración) y un colaborador frontend para tareas de presentación simples y delegables. No se inventan personas ni handles. Una herramienta de agente concreta no es requisito.

**Fuera del MVP** (PRD §4 P1, §15; D-13): cobros, Mercado Pago/Stripe, Mainnet, audio, OTP, envío automático de invitaciones, organizaciones/roles, firmas digitales, validación GAMP 5 o regulatoria, SMTP propio para registros públicos.

## 2. Convenciones

**IDs.** `MVP-NNN`, agrupados por fase (centena/decena); estables: no se reutilizan ni renumeran. Una tarea nueva toma un ID libre dentro de su fase.

`MVP-117` está libre; el salto a `MVP-118` no representa una tarea omitida ni una dependencia pendiente.

**Estados.**

| Estado | Significado |
| --- | --- |
| `pendiente` | No iniciada o sin entrega integrable |
| `en_curso` | En trabajo, **o implementada y validada en su rama pero aún no integrada** en la base del equipo; la fila debe indicar la rama o PR en evidencia |
| `bloqueada` | Un impedimento concreto la frena (permiso, credencial, decisión, dependencia fallida); se describe en §9 y se bloquea **solo esa tarea** y lo que dependa de ella |
| `completada` | Aceptación validada **tras integrarse en la base del equipo** (rama base configurable; hoy `main`), con evidencia registrada en la fila |

**Completada ≠ rama verde ≠ mock.** Una tarea no está completada porque: lo dijo un chat, pasa en una rama sin integrar, o funciona con mocks/preview. Los mocks y dobles (`src/mocks/`, fixtures, preview) prueban contratos y presentación; la integración real con Supabase, proveedores de IA o Hedera es parte explícita de las tareas que lo indican y se acredita con evidencia real o autorizada. Nunca hay fallback mock en producción.

**Excepción única, base heredada.** `MVP-001…005` se marcan `completada` por el cierre de la preparación (validada en copia limpia el 2026-10-16). Esa base aún no está en un commit del equipo: su integración y el primer run remoto de CI quedan en `MVP-006`.

**Evidencia** (columna final de la fila): `AAAA-MM-DD · comandos y resultado reales · rama/PR/commit · enlace`. Sin evidencia verificable, la tarea no pasa a `completada`. Resultados históricos se citan como tales.

**Owner.** Solo roles: `Líder`, `Colaborador frontend` (únicamente con ticket, allowlist y puerta de delegación según [arquitectura](../../architecture.md#condición-para-delegar-y-primeros-candidatos)), `Externo` (acción fuera del repositorio).

**ExecPlan.** Cada fila pendiente enlaza el plan derivado que la cubre (catálogo en [`mvp/README.md`](mvp/README.md)); `MVP-001…005` conservan su enlace histórico a `completed/`. Los planes son documentación preparada por adelantado, no ejecución (ver §7). No se enlazan archivos inexistentes.

## 3. Progreso

Método: contar los estados de la columna 3 de las filas `| MVP-` de §4. Denominador = filas de tareas. El porcentaje es solo `completadas / total`; no pondera esfuerzo ni sustituye la evidencia.

Comando de recuento (desde la raíz del repositorio):

```bash
node -e "const fs=require('node:fs');const counts={};for(const line of fs.readFileSync('docs/exec-plans/active/mvp-master-plan.md','utf8').split(/\r?\n/)){if(!/^\| MVP-\d{3} /.test(line))continue;const state=line.split('|')[3].trim();counts[state]=(counts[state]||0)+1;}console.table(counts);"
```

| Estado | Tareas |
| --- | --- |
| `completada` | 5 |
| `en_curso` | 1 |
| `bloqueada` | 0 |
| `pendiente` | 67 |
| **Total** | **73** |

Avance: 5/73 (6,8 %), todo correspondiente a la base heredada. Actualizar esta tabla en la misma edición que cambie un estado.

| Fase | Completadas / total |
| --- | --- |
| F0 Integración y proceso | 5/7 |
| F1 Decisiones abiertas | 0/5 |
| F2 Contratos y datos | 0/7 |
| F3 Autenticación | 0/2 |
| F4 Documentos, chat y evidencias | 0/5 |
| F5 Agentes de IA | 0/5 |
| F6 Reglas y advertencias | 0/3 |
| F7 Revisión y confirmaciones | 0/9 |
| F8 Finalización y versiones | 0/5 |
| F9 Hedera HCS | 0/4 |
| F10 Verificador público | 0/2 |
| F11 Producto y UI | 0/8 |
| F12 Pruebas y evaluación | 0/4 |
| F13 Seguridad, despliegue y validación | 0/7 |

## 4. Tablero por fases

Aceptación abreviada: el detalle de cada requisito está en el PRD. Toda tarea incluye, además, tests proporcionales (determinista, con dobles de proveedores), `lint`, `typecheck` y las barreras según [desarrollo](../../development.md#checks-según-el-cambio), y mantiene vigentes las barreras de arquitectura (`server-only`, sin SDK ni entorno en presentación).

### F0 — Integración y proceso

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-001 | Base reproducible y entorno seguro | completada | — | Líder | Node fijado, `npm ci`, Zod, `.env.example` sanitizado, sin secretos. Alcance real: P1 del cierre | [P1](../completed/team-workspace-readiness.md) · 2026-10-16 histórico, copia limpia |
| MVP-002 | Tests y barreras de arquitectura | completada | MVP-001 | Líder | Vitest (Node/jsdom), Playwright, ESLint y tests de imports con casos negativos. Alcance: P2; no acredita REQ-18 | [P2](../completed/team-workspace-readiness.md) · 2026-10-16 histórico |
| MVP-003 | Contrato y escenarios del dashboard | completada | MVP-001 | Líder | DTO Zod de resumen, props de vista y 8 escenarios ficticios. Alcance: P3; solo dashboard | [P3](../completed/team-workspace-readiness.md) · 2026-10-16 histórico |
| MVP-004 | Preview local y componente de referencia | completada | MVP-002, MVP-003 | Líder | `preview:ui` en loopback sin entorno, selector de escenarios, smoke de render. Alcance: P4; no prueba integración Next | [P4](../completed/team-workspace-readiness.md) · 2026-10-16 histórico |
| MVP-005 | CI configurado, plantillas Issue/PR y CODEOWNERS | completada | MVP-004 | Líder | Workflow, plantillas y CODEOWNERS en el árbol. Alcance: solo configuración; **ningún run remoto ni protección de ramas** | [P5](../completed/team-workspace-readiness.md) · 2026-10-16 histórico |
| MVP-006 | Integrar la base en la rama del equipo y obtener el primer run remoto de CI | en_curso | MVP-005 | Líder | Base commiteada e integrada en la rama base; preparar e integrar la base `develop` de la estrategia objetivo (§6) y obtener el run de GitHub Actions en Linux verde (o fallos corregidos) enlazado. Requiere autorización explícita de commit/push/PR | [f00-integracion-base-ci](mvp/f00-integracion-base-ci.md) · 2026-10-16: entrega autorizada en `delivery/team-foundation` hacia `develop`; pendiente CI remoto e integración |
| MVP-007 | Acceso del colaborador al repositorio | pendiente | — | Externo | Handle del colaborador y permisos confirmados fuera del repo; sin esto se bloquea asignarle/ejecutar sus entregas (`MVP-111…115`), no preparar contratos y planes en `MVP-110` | [f00-acceso-colaborador](mvp/f00-acceso-colaborador.md) · — |

### F1 — Decisiones abiertas del PRD §16

Cada decisión se resuelve y documenta (en el ExecPlan consumidor o en un diseño breve, y reflejada en el PRD solo si cambia producto) **antes** de implementar su consumidor. Este plan no fija los valores.

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-010 | Decidir límites de adjuntos y pipeline de extracción | pendiente | — | Líder | Tipos, tamaños y páginas admitidos; tratamiento de texto/PDF/imagen y de discrepancias visuales no verificadas por GPT-OSS. Documentado y citado por `MVP-042/043` | [f01-decisiones-ingesta-y-modelos](mvp/f01-decisiones-ingesta-y-modelos.md) · — |
| MVP-011 | Decidir vigencia de tokens, límite de abuso y reemisión segura | pendiente | — | Líder | Vigencia, rate limit y política de reemisión/revocación documentados; consumidos por `MVP-072/075` | [f01-decisiones-confirmacion-y-sello](mvp/f01-decisiones-confirmacion-y-sello.md) · — |
| MVP-012 | Decidir canonicalización del manifiesto y reconciliación HCS | pendiente | — | Líder | Forma canónica versionada, identificador opaco y criterios de reconciliación vía Mirror Node (mismo PDF/hash); consumidos por `MVP-082/090/092` | [f01-decisiones-confirmacion-y-sello](mvp/f01-decisiones-confirmacion-y-sello.md) · — |
| MVP-013 | Decidir parámetros de modelos, coste, tiempos máximos y calidad mínima | pendiente | — | Líder | Configuración, timeouts y umbral de calidad mínima antes de habilitar documentos reales, sin valores de rendimiento inventados | [f01-decisiones-ingesta-y-modelos](mvp/f01-decisiones-ingesta-y-modelos.md) · — |
| MVP-014 | Revisión jurídica del lenguaje de confirmación y la política de privacidad | pendiente | — | Externo | Dictamen externo recibido. **No bloquea** la demo con datos ficticios; bloquea el uso con documentos reales/comerciales | [f01-revision-juridica](mvp/f01-revision-juridica.md) · — |

### F2 — Contratos de dominio y datos (REQ-17, REQ-15)

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-020 | Contratos del núcleo documental | pendiente | MVP-003 | Líder | Zod + tipos para documento, mensaje, evidencia, borrador y las dimensiones de estado del PRD §5; fecha declarada y fecha de carga separadas (INV-09); sin React/SDK/env | [f02-contratos-dominio](mvp/f02-contratos-dominio.md) · — |
| MVP-021 | Contratos de revisión, confirmación, versión, sello HCS y DTO públicos | pendiente | MVP-020 | Líder | Esquemas de revisión/snapshot, selección (4 combinaciones), invitación pública y verificador con DTO mínimo propio (sin chat ni evidencias); fixtures inválidos rechazados | [f02-contratos-dominio](mvp/f02-contratos-dominio.md) · — |
| MVP-022 | Diseño del esquema SQL | pendiente | MVP-021, MVP-011, MVP-012 | Líder | Tablas del PRD §8 con revisiones separadas de versiones, inmutabilidad de versiones finalizadas, auditoría solo-agregar y claves de idempotencia. Diseño breve solo si elimina ambigüedad | [f02-esquema-migraciones-rls](mvp/f02-esquema-migraciones-rls.md) · — |
| MVP-023 | Migraciones SQL versionadas | pendiente | MVP-022 | Líder | `supabase/migrations/` aplicable desde cero en base local; constraints/triggers de inmutabilidad y append-only probados con casos negativos | [f02-esquema-migraciones-rls](mvp/f02-esquema-migraciones-rls.md) · — |
| MVP-024 | RLS y buckets privados con prueba de dos usuarios | pendiente | MVP-023 | Líder | RLS en tablas expuestas y políticas de Storage privado; el usuario A no ve documentos, archivos ni respuestas de B (PRD §12.1) en base real local | [f02-esquema-migraciones-rls](mvp/f02-esquema-migraciones-rls.md) · — |
| MVP-025 | Clientes Supabase de servidor y sesión | pendiente | MVP-023, MVP-002 | Líder | `src/lib/supabase/` con `server-only`, solo `NEXT_PUBLIC_*` hacia cliente, claves privilegiadas únicamente en servidor; barreras actualizadas | [f02-clientes-supabase](mvp/f02-clientes-supabase.md) · — |
| MVP-026 | Entorno Supabase de desarrollo/demo y migraciones aplicadas | pendiente | MVP-024 | Líder | Proyecto configurado y migraciones aplicadas. Requiere autorización del usuario y credenciales fuera del repo; sin ellas se bloquea solo esta tarea | [f02-entorno-supabase-remoto](mvp/f02-entorno-supabase-remoto.md) · — |

### F3 — Autenticación (REQ-01)

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-030 | Sesiones por cookies y guardas de acceso | pendiente | MVP-025 | Líder | `@supabase/ssr` según la guía de Next 16 de `node_modules/next/dist/docs/`; rutas privadas rechazan sin sesión; helper de usuario autenticado reutilizable | [f03-sesiones-y-guardas](mvp/f03-sesiones-y-guardas.md) · — |
| MVP-031 | Registro, login, logout y recuperación | pendiente | MVP-030, MVP-115 | Líder | Flujos reales con confirmación de email activa por defecto; mensajes de error sin filtrar existencia de cuentas; límites del emisor integrado de Supabase documentados | [f03-auth-flujos-reales](mvp/f03-auth-flujos-reales.md) · — |

### F4 — Documentos, chat y evidencias (REQ-02, 03, 04, 15)

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-040 | Servicio y API de documentos | pendiente | MVP-020, MVP-024, MVP-030 | Líder | Crear, listar y reabrir documentos del propietario; estados persistidos; acceso ajeno denegado con test | [f04-documents-chat-audit](mvp/f04-documents-chat-audit.md) · — |
| MVP-041 | Mensajes persistentes del chat | pendiente | MVP-040 | Líder | Mensajes originales conservados entre sesiones; se guarda fecha real de carga del servidor y fecha declarada del hecho por separado | [f04-documents-chat-audit](mvp/f04-documents-chat-audit.md) · — |
| MVP-042 | Evidencias: carga, Storage privado, hash y metadatos | pendiente | MVP-041, MVP-010, MVP-024 | Líder | Texto, PDF e imágenes simples dentro de los límites decididos; original privado, SHA-256 y metadatos; rechazo técnico explícito; sin URL pública permanente | [f04-evidence-upload-extraction](mvp/f04-evidence-upload-extraction.md) · — |
| MVP-043 | Extracción de texto de evidencias | pendiente | MVP-042, MVP-050 | Líder | Texto extraído con procedencia persistido; fallo del proveedor es un impedimento informado, nunca texto inventado; no se proclama verificación visual independiente | [f04-evidence-upload-extraction](mvp/f04-evidence-upload-extraction.md) · — |
| MVP-044 | Auditoría solo-agregar | pendiente | MVP-023, MVP-040 | Líder | Servicio de eventos críticos (INV-08) sin update/delete; las tareas posteriores emiten sus eventos | [f04-documents-chat-audit](mvp/f04-documents-chat-audit.md) · — |

### F5 — Agentes de IA (REQ-05, 06)

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-050 | Integración Gemini con AI SDK | pendiente | MVP-013, MVP-020 | Líder | Instala `ai`, `@ai-sdk/google`, `@ai-sdk/react`; cliente solo servidor; error técnico explícito si falta configuración; dobles para tests; sin herramientas de envío a blockchain (INV-04) | [f05-gemini-provider](mvp/f05-gemini-provider.md) · — |
| MVP-051 | Agente 1: extracción de hechos y redacción autónoma | pendiente | MVP-050, MVP-041 | Líder | Borrador con procedencia, correcciones inocuas trazadas, datos ausentes/contradictorios explícitos sin inventar ni exigir aclaración; modelo, versión de prompt y fuentes persistidos (INV-07) | [f05-agent1-drafting](mvp/f05-agent1-drafting.md) · — |
| MVP-052 | Streaming, cancelación y reintento del chat | pendiente | MVP-051, MVP-044 | Líder | Respuesta en streaming; cancelar y reintentar sin duplicar ni perder mensajes; fallo del proveedor no deja estado falso; eventos auditados | [f05-chat-streaming-retry](mvp/f05-chat-streaming-retry.md) · — |
| MVP-053 | Agente 2: contraste con Groq y fuentes textuales independientes | pendiente | MVP-013, MVP-043, MVP-051 | Líder | Instala `groq-sdk`; recibe mensajes originales y texto extraído, no solo el resumen del Agente 1; salida Zod con los tres resultados; reporte persistido; nunca veta (INV-02) | [f05-agent2-groq-contrast](mvp/f05-agent2-groq-contrast.md) · — |
| MVP-054 | Chat conectado: container, rutas y adjuntos | pendiente | MVP-040, MVP-042, MVP-052, MVP-053 | Líder | Container de chat y adapters de turno/adjuntos conectan redacción, streaming y contraste persistido; presentación sin red ni SDK, errores visibles. El montaje de `documents/[id]/page.tsx` pertenece a MVP-116 | [f04-connected-chat](mvp/f04-connected-chat.md) · — |

### F6 — Reglas y advertencias (REQ-07, INV-02, INV-10)

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-060 | Motor determinista de estados | pendiente | MVP-021 | Líder | `src/lib/rules/` calcula las dimensiones del PRD §5 con los mismos eventos → mismo resultado; no deriva «aprobado» de la ausencia de advertencias | [f06-rules-and-warnings](mvp/f06-rules-and-warnings.md) · — |
| MVP-061 | Controles ALCOA+ proporcionados | pendiente | MVP-060, MVP-043 | Líder | Carga tardía, lotes retroactivos, valores repetidos y metadatos de PDF como indicadores, no fraude ni bloqueo (INV-16); umbrales no universales | [f06-rules-and-warnings](mvp/f06-rules-and-warnings.md) · — |
| MVP-062 | Consolidación de advertencias materiales | pendiente | MVP-053, MVP-061 | Líder | Advertencias de Agente 1, Agente 2 y reglas unificadas con fuentes; cantidades contradictorias y unidad ausente se muestran sin elegir ni inventar y sin bloquear (PRD §12.4, 12.15) | [f06-rules-and-warnings](mvp/f06-rules-and-warnings.md) · — |

### F7 — Revisión y confirmaciones (REQ-08, 12, 13, 14, 16, 17)

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-070 | Congelar revisión: snapshot, advertencias y selección | pendiente | MVP-062, MVP-023, MVP-044, MVP-012 | Líder | Snapshot completo inmutable con hash, selección fija (las 4 combinaciones); un cambio material o de selección crea otra revisión sin confirmaciones heredadas y sustituye enlaces pendientes | [f07-01-revision-congelada-y-confirmacion-autor](mvp/f07-01-revision-congelada-y-confirmacion-autor.md) · — |
| MVP-071 | Confirmación del autor | pendiente | MVP-070, MVP-030 | Líder | Requiere sesión y propiedad; solo-autor basta con su confirmación; evento auditado | [f07-01-revision-congelada-y-confirmacion-autor](mvp/f07-01-revision-congelada-y-confirmacion-autor.md) · — |
| MVP-072 | Tokens de invitación individuales | pendiente | MVP-070, MVP-011 | Líder | Un token por tercero y revisión: alta entropía, solo hash en base, caducidad, un uso y revocación (INV-12) | [f07-02-invitaciones-y-respuesta-atomica](mvp/f07-02-invitaciones-y-respuesta-atomica.md) · — |
| MVP-073 | Lectura pública de la invitación (GET sin consumo) | pendiente | MVP-072 | Líder | `confirm/[token]` entrega el snapshot idéntico y completo con advertencias, sin chat ni evidencias; GET nunca consume; vencido/revocado/sustituido no acepta respuesta | [f07-02-invitaciones-y-respuesta-atomica](mvp/f07-02-invitaciones-y-respuesta-atomica.md) · — |
| MVP-074 | Respuesta atómica e idempotente | pendiente | MVP-073 | Líder | Confirmar (casilla marcada, nombre autodeclarado) o rechazar (casilla desmarcada, ratificación) persisten respuesta y consumo en una transacción; doble clic/reintento/concurrencia devuelven una sola decisión (INV-13) | [f07-02-invitaciones-y-respuesta-atomica](mvp/f07-02-invitaciones-y-respuesta-atomica.md) · — |
| MVP-075 | Estado agregado de confirmaciones, rechazo y supersede | pendiente | MVP-074, MVP-071 | Líder | `pendiente/parcial/completa/rechazada/sustituida` calculado en servidor; un rechazo impide finalizar esa revisión y permite otra; límite de abuso en endpoints públicos | [f07-03-estado-agregado-y-pantalla-publica](mvp/f07-03-estado-agregado-y-pantalla-publica.md) · — |
| MVP-076 | Pantalla pública de confirmación | pendiente | MVP-074, MVP-075 | Líder | Casilla inicialmente vacía, nombre, «Confirmar» solo con casilla marcada, «No coincide / Rechazar» visible y accesible con modal; cancelar el modal no responde ni consume. Sin login | [f07-03-estado-agregado-y-pantalla-publica](mvp/f07-03-estado-agregado-y-pantalla-publica.md) · — |
| MVP-077 | UI de revisión del autor: selección y avance | pendiente | MVP-070, MVP-072, MVP-075, MVP-112 | Líder | Elegir participantes, ver snapshot y avance de confirmaciones, finalización y sello como estados separados; sin alterar el significado de los estados del servidor | [f07-04-ui-autor-seleccion-y-compartir](mvp/f07-04-ui-autor-seleccion-y-compartir.md) · — |
| MVP-078 | Compartir manual | pendiente | MVP-077 | Líder | Copiar enlace, QR, `wa.me` prearmado y `mailto:` por tercero; el backend no envía correos ni mensajes (REQ-14) | [f07-04-ui-autor-seleccion-y-compartir](mvp/f07-04-ui-autor-seleccion-y-compartir.md) · — |

### F8 — Finalización, PDF y versiones (REQ-09, 16)

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-080 | Orquestación de finalización | pendiente | MVP-071, MVP-075 | Líder | Solo con todas las confirmaciones persistidas del mismo snapshot; sin PDF ni HCS antes; idempotente y seguro ante concurrencia; no confía en veredictos del cliente ni de la IA (INV-03) | [f08-01-finalizacion-durable-y-pdf-canonico](mvp/f08-01-finalizacion-durable-y-pdf-canonico.md) · — |
| MVP-081 | Constancias, anexo y PDF final | pendiente | MVP-080 | Líder | `@react-pdf/renderer` desde el snapshot; anexo de constancias que no cambia la operación; sin «certificado», «firma digital» ni «identidad verificada» | [f08-01-finalizacion-durable-y-pdf-canonico](mvp/f08-01-finalizacion-durable-y-pdf-canonico.md) · — |
| MVP-082 | Manifiesto canónico y hashes | pendiente | MVP-081, MVP-012 | Líder | SHA-256 del PDF y manifiesto versionado que relaciona PDF, evidencias, reporte, constancias y versión anterior; reproducible con los mismos datos | [f08-02-manifiesto-version-inmutable-y-nueva-version](mvp/f08-02-manifiesto-version-inmutable-y-nueva-version.md) · — |
| MVP-083 | Persistencia inmutable de la versión | pendiente | MVP-082, MVP-024 | Líder | PDF en Storage privado y versión registrada; un fallo de Storage no marca `finalizado` falsamente; versiones, PDFs y hashes no se sobrescriben (INV-05, INV-18) | [f08-02-manifiesto-version-inmutable-y-nueva-version](mvp/f08-02-manifiesto-version-inmutable-y-nueva-version.md) · — |
| MVP-084 | Nueva versión en el mismo chat | pendiente | MVP-083, MVP-070 | Líder | Una modificación crea v2 con referencia a v1 sin alterar v1; devolución posterior no reescribe la entrega original (PRD §12.2, 12.10, 12.11) | [f08-02-manifiesto-version-inmutable-y-nueva-version](mvp/f08-02-manifiesto-version-inmutable-y-nueva-version.md) · — |

### F9 — Hedera HCS Testnet (REQ-10, 16)

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-090 | Cliente HCS exclusivamente Testnet en servidor | pendiente | MVP-012, MVP-021 | Líder | `src/lib/hedera/` con `server-only` sobre `@hiero-ledger/sdk`; rechaza red distinta de testnet; envía solo hash e identificadores opacos (INV-06); sin herramienta abierta para agentes | [f09-01-hedera-hcs-testnet](mvp/f09-01-hedera-hcs-testnet.md) · — |
| MVP-091 | Sello posterior a la finalización | pendiente | MVP-090, MVP-083 | Líder | Solo para versiones finalizadas; persiste topic, transacción, secuencia y consenso; estados `no_iniciado/pendiente/registrado/fallido`; un fallo deja «finalizada; sello pendiente» con el mismo PDF/hash | [f09-01-hedera-hcs-testnet](mvp/f09-01-hedera-hcs-testnet.md) · — |
| MVP-092 | Reconciliación y reintento | pendiente | MVP-091, MVP-093 | Líder | Un resultado incierto se reconcilia antes de reintentar; nunca se regenera el PDF ni se afirma registro sin comprobarlo; intentos fallidos en auditoría | [f09-01-hedera-hcs-testnet](mvp/f09-01-hedera-hcs-testnet.md) · — |
| MVP-093 | Lectura y verificación vía Mirror Node | pendiente | MVP-090 | Líder | Recupera el mensaje del topic y compara huella de manifiesto; maneja indisponibilidad del Mirror Node y reinicios de Testnet sin presentarlos como éxito; sin registros adicionales por confirmación en P0 | [f09-01-hedera-hcs-testnet](mvp/f09-01-hedera-hcs-testnet.md) · — |

### F10 — Verificador público (REQ-11)

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-100 | Servicio de verificación | pendiente | MVP-093, MVP-083 | Líder | Referencia opaca; sin PDF solo estado del registro; con PDF compara bytes con el hash conservado y manifiesto con HCS: `integridad comprobada`, `discrepancia` o `no verificable`; un byte alterado falla (PRD §12.7, 12.14); sin fugas de chat, evidencias ni constancias | [f10-01-verificador-publico](mvp/f10-01-verificador-publico.md) · — |
| MVP-101 | Página pública `verify/[reference]` | pendiente | MVP-100 | Líder | Separada de la invitación; carga acotada de PDF; mensajes que no afirman verdad factual ni «archivo verificado» sin comprobación | [f10-01-verificador-publico](mvp/f10-01-verificador-publico.md) · — |

### F11 — Producto y UI (REQ-02, 01, 03; PRD §10)

La presentación simple se delega al colaborador solo tras `MVP-110`; la integración con servidores y rutas es del líder. Auth conectada, chat, confirmación pública y verificador son tareas del líder (`MVP-031`, `054`, `076`, `101`).

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-110 | Preparar el paquete de delegación frontend | pendiente | MVP-021, MVP-004 | Líder | Para `MVP-111…115`: contratos de props, escenarios validados con Zod, entrypoints de preview, allowlist por archivo y capturas esperadas; preparar paquetes no requiere acceso del colaborador. Issues solo al autorizar su delegación | [f11-frontend-delegation-package](mvp/f11-frontend-delegation-package.md) · — |
| MVP-111 | Presentación del dashboard | pendiente | MVP-110, MVP-007 | Colaborador frontend | Lista, vacío, carga y error con responsive y accesibilidad dentro de la allowlist; borrador en [`dashboard-presentation`](../../tasks/dashboard-presentation.md); PR con checks y capturas; sin red ni SDK | [f11-frontend-presentation-tickets](mvp/f11-frontend-presentation-tickets.md) · — |
| MVP-112 | Presentación del snapshot y advertencias | pendiente | MVP-110, MVP-007 | Colaborador frontend | Contenido completo y advertencias con fuentes; dimensiones de estado separadas; sin acciones de confirmar/finalizar | [f11-frontend-presentation-tickets](mvp/f11-frontend-presentation-tickets.md) · — |
| MVP-113 | Presentación del historial de versiones | pendiente | MVP-110, MVP-007 | Colaborador frontend | Versiones, estado de finalización y sello como estados independientes; lectura y callback de selección | [f11-frontend-presentation-tickets](mvp/f11-frontend-presentation-tickets.md) · — |
| MVP-114 | Landing y navegación responsive | pendiente | MVP-110, MVP-007 | Colaborador frontend | Landing simple y navegación accesible sin afirmaciones prohibidas del PRD §5/§11 | [f11-frontend-presentation-tickets](mvp/f11-frontend-presentation-tickets.md) · — |
| MVP-115 | Presentación de formularios de acceso | pendiente | MVP-110, MVP-007 | Colaborador frontend | Login, registro y recuperación (incluida nueva contraseña) como presentación con callbacks; errores y estados de envío; sin lógica de autenticación | [f11-frontend-presentation-tickets](mvp/f11-frontend-presentation-tickets.md) · — |
| MVP-116 | Integración de dashboard, historial y documento | pendiente | MVP-040, MVP-111, MVP-113, MVP-030, MVP-114, MVP-054 | Líder | Dueño de páginas `(app)` con carga autorizada y DTO hacia containers; monta el chat entregado por MVP-054 sin duplicar su implementación; crear/reabrir documentos y navegación de landing integradas | [f11-product-ui-integration-and-review](mvp/f11-product-ui-integration-and-review.md) · — |
| MVP-118 | Revisión transversal de accesibilidad y responsive | pendiente | MVP-116, MVP-076, MVP-101, MVP-114 | Líder | Chequeos Playwright y revisión manual de pantallas del producto (incluidas las públicas) en móvil y escritorio; hallazgos corregidos o registrados | [f11-product-ui-integration-and-review](mvp/f11-product-ui-integration-and-review.md) · — |

### F12 — Pruebas y evaluación de IA (REQ-18)

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-120 | Harness de tests de servidor | pendiente | MVP-023, MVP-002 | Líder | Base local con claves efímeras, dobles de Gemini/Groq/Storage/HCS y builders; reutiliza helpers RLS de MVP-024. Puente ESM exclusivo de tests para factories reales y Auth local, sin flags ni dobles en producto, conforme al diseño SQL §7 | [f12-server-test-harness](mvp/f12-server-test-harness.md) · — |
| MVP-121 | Matriz del PRD §12 y E2E del flujo crítico | pendiente | MVP-024, MVP-031, MVP-076, MVP-077, MVP-084, MVP-092, MVP-100, MVP-116, MVP-120 | Líder | Los 15 casos deterministas con test enlazado y las 4 selecciones: evidencia compuesta de navegador Next + factories/servicios/RPC reales con dobles externos. Identificar mutaciones interceptadas y huecos; no afirmar recorrido HTTP Next íntegro. El transporte íntegro real se valida en MVP-134; ningún caso obligatorio sin probar se acepta como cubierto | [f12-critical-flow-matrix-and-e2e](mvp/f12-critical-flow-matrix-and-e2e.md) · — |
| MVP-122 | Dataset de evaluación de IA etiquetado | pendiente | MVP-013 | Líder | ~30 casos (correctos y con errores sembrados) con etiquetas fijadas antes de ejecutar modelos; criterios de medición y calidad mínima documentados | [f12-ai-evaluation-dataset-and-runner](mvp/f12-ai-evaluation-dataset-and-runner.md) · — |
| MVP-123 | Runner de evaluación y registro de métricas | pendiente | MVP-122, MVP-053 | Líder | Ejecución separada de CI; registra modelos, prompts, detecciones, falsos positivos, omisiones y variación; sin llamadas en PRs | [f12-ai-evaluation-dataset-and-runner](mvp/f12-ai-evaluation-dataset-and-runner.md) · — |

### F13 — Seguridad, despliegue y validación final

| ID | Tarea | Estado | Depende de | Owner | Resultado y aceptación | ExecPlan · evidencia |
| --- | --- | --- | --- | --- | --- | --- |
| MVP-130 | Seguridad y privacidad transversal | pendiente | MVP-054, MVP-073, MVP-101 | Líder | Límites de carga y rate limits en endpoints públicos y de upload; logs de acceso sin secretos ni contenido privado; auditoría de que ningún secreto llega al bundle; datos de demo ficticios | [f13-release-security-and-ci](mvp/f13-release-security-and-ci.md) · — |
| MVP-131 | CI ampliado y protección de ramas | pendiente | MVP-006, MVP-120 | Líder | CI Linux ejecuta también los tests de servidor/RLS; branch protection y checks requeridos comprobados en GitHub. Requiere aprobación y permisos; si faltan, se bloquea solo esta tarea | [f13-release-security-and-ci](mvp/f13-release-security-and-ci.md) · — |
| MVP-132 | Despliegue en Vercel | pendiente | MVP-026, MVP-118, MVP-130, MVP-131 | Líder | Proyecto Vercel con nombres de variables de servidor y solo `NEXT_PUBLIC_*` públicas, redirecciones de Auth, migraciones aplicadas; requiere autorización y cuenta; sin secretos en el repo | [f13-deploy-and-demo](mvp/f13-deploy-and-demo.md) · — |
| MVP-133 | Datos y cuentas de demo | pendiente | MVP-031, MVP-132 | Líder | Cuentas precreadas/autorizadas (el emisor de correo integrado es limitado y no se desactiva la confirmación por defecto), datos ficticios y guion de demo; credenciales fuera del repo | [f13-deploy-and-demo](mvp/f13-deploy-and-demo.md) · — |
| MVP-134 | Smoke real integrado | pendiente | MVP-091, MVP-092, MVP-121, MVP-133 | Líder | Flujo completo en el entorno configurado con Supabase, proveedores de IA y Hedera Testnet reales, con autorización expresa; evidencia sin secretos. Incluye fallo/reintento de sello si es reproducible | [f13-live-validation-and-closure](mvp/f13-live-validation-and-closure.md) · — |
| MVP-135 | Evaluación de IA real | pendiente | MVP-123, MVP-134 | Líder | Resultados medidos y publicados con sus límites; si no alcanzan la calidad mínima, se informa sin ocultarlo ni reescribirlo | [f13-live-validation-and-closure](mvp/f13-live-validation-and-closure.md) · — |
| MVP-136 | Cierre del MVP | pendiente | MVP-118, MVP-121, MVP-131, MVP-134, MVP-135 | Líder | REQ-01…18 reconciliados con evidencia; docs y deuda actualizadas; este plan archivado en `completed/` | [f13-live-validation-and-closure](mvp/f13-live-validation-and-closure.md) · — |

## 5. Trazabilidad REQ → tareas

Todo requisito P0 tiene al menos una tarea. «Tareas» incluye las que lo implementan y las que lo validan; el requisito se considera cumplido solo cuando todas sus tareas están `completada`.

| REQ | Tareas |
| --- | --- |
| REQ-01 | MVP-024, 030, 031, 115 |
| REQ-02 | MVP-040, 111, 113, 116 |
| REQ-03 | MVP-041, 054, 084 |
| REQ-04 | MVP-010, 042, 043 |
| REQ-05 | MVP-050, 051, 052 |
| REQ-06 | MVP-013, 053 |
| REQ-07 | MVP-060, 061, 062 |
| REQ-08 | MVP-070, 071, 075, 080 |
| REQ-09 | MVP-081, 082, 083, 084 |
| REQ-10 | MVP-090, 091, 092, 134 |
| REQ-11 | MVP-093, 100, 101 |
| REQ-12 | MVP-072, 077 |
| REQ-13 | MVP-073, 074, 076 |
| REQ-14 | MVP-078 |
| REQ-15 | MVP-044 (y los eventos de cada tarea que lo emite) |
| REQ-16 | MVP-074, 075, 080, 083, 091, 092 |
| REQ-17 | MVP-024, 025, 072, 130 |
| REQ-18 | MVP-120, 121, 122, 123, 135 (más los tests de cada tarea) |

**REQ-18 no está completo por la base existente**: hoy hay tests de contratos, preview y barreras, no del flujo de negocio. Las tareas de proceso y entrega (`MVP-006`, `110`, `118`, `131`–`133`, `136`) cubren todos los requisitos de forma transversal.

Deuda abierta relacionada ([tracker](../tech-debt-tracker.md)): #2 → `MVP-134`; #3 → `MVP-050`, `MVP-053`; #5 → `MVP-006`, `MVP-121`, `MVP-131`. Se actualizan en el tracker al cerrarse, no aquí.

## 6. Olas y paralelismo

Las olas se derivan solo de las dependencias (nivel = 1 + máximo nivel de sus dependencias) y sirven para planificar paralelismo, no son fechas. Con dos implementadores, el líder conserva rutas, contratos compartidos, configuración y servidores; el colaborador solo toma presentación autorizada (`MVP-111…115`) cuando `MVP-110` y `MVP-007` lo permitan. Dos tareas del líder pueden avanzar en paralelo si no tocan los mismos archivos ni contratos. Antes de abrir una ola nueva, el líder integra las ramas pendientes de la anterior y actualiza este tablero.

Cada ola agrupa un rango de niveles de dependencia (calculados con la regla anterior). Dentro de una ola siguen mandando las dependencias entre sus tareas.

| Ola | Niveles | Tareas |
| --- | --- | --- |
| 1 | 1–4 | MVP-001…005, 007, 010…014, 020, 021, 050, 122 |
| 2 | 5–8 | MVP-006, 022…026, 030, 060, 090, 093, 110…115, 120, 131 |
| 3 | 9–14 | MVP-031, 040…044, 051…054, 061, 062, 123 |
| 4 | 15–20 | MVP-070…077, 080, 116 |
| 5 | 21–25 | MVP-078, 081…084, 091, 092, 100, 101 |
| 6 | 26–31 | MVP-118, 121, 130, 132…136 |

Tareas del colaborador (`MVP-111…115`) entran en la ola 2 y pueden avanzar en paralelo con el trabajo compatible del líder al completar `MVP-110` y confirmar acceso en `MVP-007`. La preparación de paquetes no espera ese acceso. `MVP-014` (externo) y `MVP-007` no frenan al resto salvo lo indicado en sus filas.

**Estrategia de ramas.** El 2026-10-16 se verificó que `origin/develop` ya existe en el mismo commit base que `main`; no se sobrescribió. La entrega MVP-006 está autorizada y en curso: `main` estable, `develop` como integración y una rama/worktree por plan cuando se cumplan sus dependencias, con un máximo de dos implementaciones simultáneas compatibles. Los PR van a `develop`; el paso final a `main` es un release aparte. La mera existencia de un plan no autoriza publicaciones futuras. CI remoto y merge de esta base se comprueban antes de completar MVP-006.

- Una tarea pasa a `completada` solo tras integrarse en `develop` y repetir los checks; hasta la transición de `MVP-006`, la base vigente sigue siendo la actual (§2).
- Si los checkpoints de un plan permiten entregar una parte ya útil para otro, se ejecuta ese checkpoint, se publica un PR acotado y se registran en el maestro solo los IDs integrados; el resto del plan sigue abierto. No hace falta cerrar un plan entero antes de usar una salida ya integrada.
- `MVP-007` y `MVP-014` son acciones externas: ningún agente implementa el acceso ni el dictamen, la evidencia se registra sin secretos y no se exige rama ni worktree para una acción que no toca archivos.
- La [guía de ejecución y matriz de compatibilidad](../../execution/mvp-execution-guide.md) propone tandas y parejas; antes de ejecutar se verifican archivos concretos, contratos y precondiciones. No se interpreta un worktree distinto como garantía de independencia.

## 7. Cómo derivar ExecPlans

Por autorización del usuario, los ExecPlans derivados se crearon **por adelantado para todas las fases pendientes**: 36 planes bajo [`mvp/`](mvp/README.md) cubren los 68 IDs pendientes sin solapes (el catálogo `mvp/README.md` no es un ExecPlan y no cuenta). Tener un plan redactado no habilita a ejecutarlo: deben cumplirse sus dependencias, contratos y autorizaciones, y cada plan describe un objetivo futuro, no una implementación hecha. Las decisiones transversales se mantienen en [fundaciones compartidas](../../design/mvp-shared-foundations.md). Reglas:

- **Una tarea ↔ un plan** si es un cambio de comportamiento, arquitectura o integración con varios pasos. Un ajuste pequeño no requiere plan (AGENTS.md).
- **Varias tareas ↔ un plan** si comparten archivos, contrato o migración y no tienen sentido por separado. Ejemplos razonables: `MVP-022…024` (esquema, migraciones y RLS), `MVP-072…075` (invitaciones y respuesta), `MVP-090…093` (Hedera). El plan lista los IDs que cubre.
- **Specs o diseños** solo cuando eliminan una ambigüedad real; `MVP-010…013` producen decisiones que el plan consumidor cita.
- Un plan nuevo nace en `docs/exec-plans/active/` (los preparados, bajo `mvp/`), declara los IDs que cubre en su línea `Tareas del maestro:` y se enlaza desde la fila de cada ID; el catálogo `mvp/README.md` solo indexa por plan y no duplica estados.
- Tareas delegadas al colaborador: un Issue por entrega con la plantilla de `.github/` y la allowlist; el trabajo propio del líder no necesita un Issue por paso.
- En esta preparación documental no se crean Issues ni se ejecutan tareas MVP. Specs y diseños describen el objetivo, no una implementación. Los valores operativos abiertos siguen como decisiones de F1 hasta resolverse con evidencia; no se convierten en parámetros aprobados por figurar como propuestas.
- Si un plan agrupa varias tareas, respeta los checkpoints y dependencias por ID. No exigir completar una fase entera para usar una salida ya integrada ni crear ciclos por agrupar entregas que se necesitan mutuamente.
- Al archivar el plan, la fila conserva el enlace a `completed/` y la evidencia.

## 8. Protocolo de ejecución

1. **Antes de empezar:** leer la fila, sus dependencias (deben estar `completada`, o la tarea se marca `bloqueada` con la causa) y las secciones citadas del PRD. Pasar la fila a `en_curso`.
2. **Al terminar el trabajo:** ejecutar los checks proporcionales ([desarrollo](../../development.md#checks-según-el-cambio)); registrar en la fila fecha, comandos y resultados reales, rama/PR y enlace al ExecPlan. No copiar resultados históricos.
3. **Integración:** la fila pasa a `completada` solo después de integrar en la base del equipo y repetir los checks y gates relevantes sobre la integración (validación conjunta del líder). Hasta entonces permanece `en_curso` con la nota «implementada, pendiente de integrar» y la rama.
4. **Tareas con integración real:** si la aceptación exige proveedores o servicios reales, se acredita con ejecución real autorizada. Mocks, preview o tests con dobles no cierran esa tarea.
5. **Edición del tablero:** quien ejecuta modifica **solo las filas de sus IDs** (y la tabla de progreso del §3 en el mismo cambio); no reescribe el resto. Una ramificación puede editar este archivo, pero el líder integra esas ediciones antes de abrir una ola nueva para evitar conflictos de línea.
6. **Cambios de alcance o dependencias:** agregar o dividir tareas es una edición del líder con ID nuevo; no se borran ni renumeran. Las dependencias deben seguir existiendo y sin ciclos (§10).
7. **Decisiones:** una tarea que dependa de una decisión de `F1` no empieza su consumidor sin que esta esté documentada.
8. **Sin acciones remotas por defecto:** no se hace commit, push, PR, merge ni cambios en GitHub/Vercel/Supabase sin pedido o autorización expresa. No se leen ni imprimen secretos ni se llaman proveedores reales con credenciales sin autorización.

## 9. Bloqueos y autorizaciones

Bloqueos activos: ninguno. Si una tarea queda `bloqueada`, se anota aquí `ID · causa · quién resuelve · qué más queda afectado`.

Acciones que requieren autorización expresa y bloquean **solo** la tarea que las necesita si falta el permiso: commit/push/PR/merge (`MVP-006`), protección de ramas y permisos de GitHub (`MVP-131`), invitación del colaborador (`MVP-007`), proyecto y credenciales de Supabase (`MVP-026`), cuenta y variables de Vercel (`MVP-132`), uso de credenciales reales de IA/Hedera (`MVP-134`, `MVP-135`) y dictamen jurídico externo (`MVP-014`).

## 10. Verificación de este plan

Se comprobó al redactarlo (2026-10-16): IDs únicos, todas las dependencias referencian IDs existentes y forman un grafo acíclico, cada REQ-01…18 tiene tareas, y el recuento del §3 coincide con el tablero. Volver a verificarlo tras agregar o cambiar tareas.

**Revisión documental de dependencias y planes (2026-10-16).** Es una verificación de documentos, no un resultado de ejecución: no se corrió código ni se cambió ningún estado. Cambios del grafo: `MVP-022` depende además de `MVP-011` y `MVP-012`; `MVP-070` de `MVP-012`; `MVP-054` de `MVP-053`; `MVP-110` ya no depende de `MVP-007`, que sí condiciona a `MVP-111…115`; `MVP-116` depende de `MVP-054` y `MVP-114` y es dueño de `documents/[id]/page.tsx`; `MVP-121` depende además de `MVP-031` y `MVP-116` (el E2E del flujo exige las páginas de composición y la autenticación completas; no hay ciclo con `MVP-118`, que no depende de `MVP-121`). Se recalcularon los niveles del DAG (máximo 31): `MVP-116` pasa de la ola 3 a la ola 4. Cobertura: 36 planes cubren los 68 IDs pendientes sin omisiones ni duplicados; `MVP-001…005` conservan su enlace histórico; los totales del §3 no cambian (5 completadas, 68 pendientes, 73).

[Índice](../../README.md) · [PRD](../GALCOA-PRD-v1.4.md) · [Arquitectura](../../architecture.md) · [Desarrollo](../../development.md)
