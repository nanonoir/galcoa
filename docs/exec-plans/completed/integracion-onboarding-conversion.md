# Integración de onboarding y conversión (#156 / #157)

## Objetivo y límites

Integrar ambos PRs en `integration/onboarding-conversion`, desde `origin/develop` (`a89e7de`), y entregar un único PR a `develop` sin merge. Preservar ramas originales y trabajo local ajeno. No modificar `main`, secretos ni bases remotas.

### Rationale de consolidación (size-exception aprobada)

El usuario aprobó explícitamente una excepción de tamaño (`size-exception`) para entregar un único PR hacia `develop` pese a superar las 600 líneas de cambio acumuladas (conteo final de código: 2871 altas + 184 bajas = 3055 líneas; docs y 22 PNG históricos excluidos del presupuesto). Rationale:
- Ambos PRs (#156 onboarding y #157 conversión) tocan superficies interconectadas de la primera experiencia del usuario: landing, demo pública, registro, guía de activación y panel principal.
- La consolidación en un único PR evita inconsistencias semánticas e intermedias entre la guía de activación (`ActivationChecklistCard`), el estado vacío del panel (`DashboardReference`), la terminología ALC de la demo (el rojo bloquea) y los contratos de medición/funnel.
- Permite una revisión técnica y de UX conjunta y exhaustiva del flujo completo de captación, prueba y activación antes de integrarlo en `develop`.

## Pasos

- [x] Inspeccionar estado, PRs y referencias remotas; crear worktree aislado.
- [x] Leer diffs, planes, reglas y arquitectura; integrar ambas ramas.
- [x] Resolver guía/CTA únicos, progreso por operación, terminología y coherencia demo/ALC.
- [x] Auditar y corregir conversión, privacidad, permisos, abuso e idempotencia.
- [x] Validar con lint, tipos, tests focalizados, build y recorrido manual disponible; migración/RLS solo local aislado (Docker no disponible).
- [x] Revisión independiente, correcciones y reconciliación documental (revisión UX/backend: PASS; correcciones completadas; reconciliación documental finalizada).
- [x] Commit, push y PR único sin merge; cerrar este plan con evidencia (commit `d22ae8f` publicado en `integration/onboarding-conversion`; PR #158 abierto a `develop` sin merge).

## Revisión UX/backend y correcciones completadas

Resultado de la revisión independiente final: **PASS** (sin defectos nuevos). Correcciones focalizadas implementadas en commit `d22ae8f`:
1. **Rojo en checklist de activación:** en `toActivationChecklist()`, un borrador con contradicción crítica no computa como listo para confirmación ni finalización; el avance se detiene en «verificado» hasta que la diferencia sea aclarada en el chat.
2. **Contradicción en «Te falta»:** en el listado de pendientes del panel (`pendingReason()`), refleja explícitamente «Diferencia por aclarar» cuando el documento reporta `controlStatus === "contradiccion_critica"`.
3. **Opt-out y privacidad en `trackOnce`:** `trackOnce()` respeta estrictamente las preferencias de «Do Not Track» y Global Privacy Control, limpiando el identificador almacenado mediante `forgetVisitor()` y evitando emitir eventos o conservar estado en almacenamiento local bajo opt-out.
4. **Concurrencia en límites y retención SQL:** en `record_funnel_event` (`20261022000100_conversion_funnel.sql`), se incorporó serialización fail-fast mediante advisory transaction lock (`pg_try_advisory_xact_lock(7001, 1)`) para evitar que llamadas concurrentes eludan los topes por minuto (60 por visitante, 300 global), junto con retención oportunista de eventos >90 días con `skip locked`. Riesgo residual conocido registrado: inanición maliciosa de métricas del embudo si se satura el cupo global rotando UUIDs (afecta la medición, nunca la disponibilidad del producto ni del usuario).

## Validación prevista

Regresiones de activación con documentos distintos e incompletos; creación compartida; Auth; escenario rojo 200/198; demo sin efectos externos; contratos y rutas de conversión; permisos SQL locales. Sin suite Playwright completa ni capturas masivas. Registrar comandos y límites reales, sin equiparar mocks con servicios reales.

## Diagnóstico inicial

El árbol original tiene dos archivos no versionados ajenos que se preservan. `origin/main` contiene 13 commits exclusivos frente a `origin/develop`, que no tiene commits exclusivos. Investigar `withoutRed()` sin trasladar su relajación a integración. La migración de conversión no está autorizada para remoto.

## Divergencia de producción: pendiente de autorización

`origin/main` observado en `c9fff82` incluye #152–#155. La diferencia efectiva con `develop` afecta cuatro archivos (148 altas / 38 bajas): `src/lib/ai/alc/facts.ts`, `src/lib/documents/alc/service.ts`, su test y el registro de deuda. Los commits de tolerancia de extracción #153/#154 son independientes y no se trasladan automáticamente en esta integración.

El commit `39f7f00` (#155) añade `withoutRed()`: sustituye `ALC-CONTRADICCION`, `ALC-AMBIGUEDAD` y `ALC-NO-LECTURA` por `ALC-DATO-DECLARADO` antes de persistir. Esto evita también el bloqueo SQL, porque la base recalcula el color de los hallazgos. Contradice REGLAS §4 (200/198) y §5.2. El color rojo de participantes es la excepción que conserva `main`.

**Acción propuesta, no ejecutada:** autorizar un PR separado hacia `main` que retire la reclasificación y restituya expectativas de contradicción/ambigüedad rojas, preservando y revisando por separado la tolerancia de extracción. Verificar evaluador → persistencia → finalización/sello y redeploy del runtime autorizado. No basta retocar el color del DTO ni modificar SQL. Revisar operativamente los registros generados bajo la excepción, sin reescribir versiones finalizadas ni su historial inmutable. No se ejecutó ningún cambio de producción, reversión de `main` ni inspección de datos remotos.

## Evidencia final y entrega (2026-10-25)

- **Entrega Git:**
  - Código y correcciones consolidados en commit `d22ae8f` publicado en la rama remota `integration/onboarding-conversion`.
  - PR único abierto hacia `develop` sin merge: [PR #158](https://github.com/nanonoir/galcoa/pull/158).
  - Conteo de código frente a `develop`: 2871 altas + 184 bajas = 3055 líneas acumuladas; documentación y 22 capturas PNG históricas excluidas del presupuesto de líneas; `size-exception` aprobada explícitamente por el usuario.
  - Ramas originales intactas; worktree original preserva dos archivos no versionados ajenos y rama `develop`.
- **Compilación y tipado:**
  - `npm run build` final verde ejecutado por el orquestador, validando tipado TypeScript estricto y rutas de producción Next.js.
  - ESLint final ejecutado y limpio sobre directorios de features, contracts y migration tests.
  - `npm run lint` y `npm run typecheck` globales limpios; reviewer final verificado en verde.
- **Suites de pruebas focalizadas (sin solapamiento):**
  - `npx vitest run src/features/conversion src/features/dashboard src/features/demo tests/contracts/conversion.test.ts tests/server/routes/conversion.test.ts tests/server/routes/conversion-migration.test.ts --maxWorkers=2`: **10 archivos / 82 tests verdes**.
  - Verificación de límites arquitectónicos: `npm run test:boundaries` (**4 archivos / 69 tests verdes**).
- **Validación manual en build de producción (`next start` en puerto 3187):**
  - `/precios`: planes (inicial, crecimiento, pro) y enlaces `href` con parámetros de contexto `origen` y `plan` correctos.
  - `/demo`: aviso explícito indicando que la entrega no se guarda y que la telemetría es seudónima respetando DNT; sin menciones a audio; nombre de contraparte «Almacén Ejemplo»; metadata y títulos precisos.
  - Caso rojo 200/198: solo ofrece «Empezar de nuevo» y «Corregir entrega», bloqueando de forma efectiva confirmación y sello HCS.
  - Caso verde-huella y registro con contexto confirmados previamente en entorno de desarrollo.
- **Gestión de procesos y limpieza:**
  - Proceso servidor en puerto 3187 (PID 21408) verificado en propiedad y detenido ordenadamente.
  - Navegador cerrado; comprobado que no quedaron listeners en puertos 3186 ni 3187.
- **Límites de base de datos y entorno:**
  - Docker Desktop ausente: **pruebas de migración/RLS en vivo y recorrido con Auth real sobre Supabase local quedan pendientes**.
  - Entorno remoto no autorizado ni utilizado; sin secretos en repositorio ni logs.
  - CI de GitHub para PR #158 en curso (`validate` / `local-server-db`) al momento de consulta; no se declara verde preventivamente.

---

## Implementation Outcome

### Implemented

Se integraron y unificaron de forma coherente los flujos de onboarding (PR #156) y conversión/captación (PR #157) en un único PR #158 sobre `develop`:
1. **Captación y landing:** problema del negocio, llamada a planes y CTA principal hacia la demo pública sin requerir registro previo.
2. **Demo pública en cliente (`/demo`):** simulación guiada de 4 pasos ejecutando el motor determinista de reglas ALC puro y cálculo de huella digital SHA-256 localmente en navegador con Web Crypto, sin llamadas a endpoints de documentos, IA ni registro en Hedera. Incorpora casos verde y rojo 200/198 bloqueante.
3. **Activación unificada en panel (`/dashboard`):** guía de activación superior (`ActivationChecklistCard`) derivada del estado real de los documentos del usuario; estado vacío (`DashboardReference`) simplificado y limpio («Todavía no hay documentos.») sin duplicar la lista de 4 pasos ni mostrar botones redundantes (`emptyWithGuide`); gestión explícita de «Diferencia por aclarar» en «Te falta».
4. **Monetización (`/precios`):** tabla de planes (inicial, crecimiento, pro) y solicitud de suscripción (`POST /api/subscriptions`) asociada al `user_id` autenticado con idempotencia.
5. **Medición y privacidad:** telemetría de 12 eventos de embudo (`POST /api/funnel`) con identificador seudónimo en `localStorage` (sin `user_id`), soporte estricto de Do Not Track / GPC mediante limpieza con `forgetVisitor()`, y migración SQL endurecida (`20261022000100_conversion_funnel.sql`) con rate limiting (60/min visitante, 300/min global), retención oportunista >90d y advisory lock fail-fast frente a concurrencia.

### Deviations from Design

- **Unificación del estado vacío del panel:** el diseño inicial proponía replicar los 4 pasos de la guía dentro del bloque vacío de `DashboardReference`. Se eliminó para evitar duplicidad directa con la `ActivationChecklistCard` superior, dejando el empty state limpio.
- **Tamaño del PR acumulado:** la entrega supera las 600 líneas de código (3055 líneas acumuladas entre altas y bajas) mediante una `size-exception` aprobada explícitamente por el usuario para consolidar ambos PRs en una única entrega revisable de punta a punta.
- **Verificación dinámica de base de datos:** debido a la ausencia de Docker Desktop en el host de ejecución, las pruebas dinámicas de migración SQL, políticas RLS y flujo de Auth real en Supabase local no pudieron ejecutarse y permanecen pendientes.

### Validation

- **Revisión de ingeniería:** PASS independiente final en commit `d22ae8f` sin defectos nuevos (con riesgo residual conocido documentado respecto a inanición del cupo global de métricas).
- **Pruebas de código:** `npm run build` final verde; 82 tests de Vitest sobre conversión, panel y rutas verdes; 69 tests de límites arquitectónicos (`npm run test:boundaries`) verdes; lint y typecheck limpios.
- **Validación manual en build de producción:** recorrido verificado en puerto 3187 sobre `/precios` y `/demo` (textos, avisos seudónimos, DNT, bloqueo rojo 200/198). Servidor y browser detenidos limpiamente.

### Follow-up

1. **Revisión humana y validación previa a merge:** efectuar revisión humana del PR #158 y ejecutar la validación aislada local de migraciones SQL/RLS y recorrido Auth real en Supabase local cuando Docker esté disponible, antes de realizar el merge hacia `develop`.
2. **Seguimiento del CI remoto:** verificar la finalización exitosa de los workflows de GitHub Actions en el PR #158.
3. **Planes compartidos origen:** mantener como activos `docs/exec-plans/active/onboarding-flujo-usuario.md` y `docs/exec-plans/active/conversion-funnel.md` mientras sus pendientes externos respectivos permanezcan abiertos.
4. **Divergencia de producción (`main`):** gestionar la reversión de `withoutRed()` y restauración de reglas ALC mediante plan y autorización independientes.
