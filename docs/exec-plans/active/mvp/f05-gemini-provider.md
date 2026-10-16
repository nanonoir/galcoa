# F5 — Proveedor Gemini con AI SDK (solo servidor)

Tareas del maestro: `MVP-050`

**Estado: planificado, no ejecutado.** Fuentes: [maestro](../mvp-master-plan.md), [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§0, §4 REQ-05, INV-04, INV-07, D-05), [fundaciones](../../../design/mvp-shared-foundations.md) (`SH-07`, `SH-08`, `SH-09`, `SH-10`), [arquitectura](../../../architecture.md), [desarrollo](../../../development.md).

## 1. Objetivo y estado de partida

Incorporar `ai`, `@ai-sdk/google` y `@ai-sdk/react`, y exponer un cliente Gemini **solo de servidor** con error técnico explícito si falta configuración, dobles para tests y **sin herramientas** de envío a blockchain (INV-04). Es la base de `MVP-043`, `MVP-051` y `MVP-052`.

**Estado real verificado:** `@ai-sdk/google` ya figura en `package.json`, sin integración. Faltan `ai`, `@ai-sdk/react` y `groq-sdk`; no existe `src/lib/ai/`. Antes de instalar se comprueban las versiones realmente presentes y sus peers; no se reinstala o actualiza un paquete a ciegas.

## 2. Criterios y dependencias

| Tarea | REQ / INV | Aceptación (resumen) |
| --- | --- | --- |
| `MVP-050` | REQ-05, INV-04, INV-07 | Instala paquetes; cliente solo servidor; error técnico explícito sin configuración; dobles; sin herramientas HCS |

**Entrada:** `MVP-013` (parámetros de modelos, timeouts, coste y calidad mínima **documentados**) y `MVP-020` (contratos núcleo). **Salida:** `MVP-043`, `MVP-051`; `MVP-052` por `MVP-051`. Este plan no depende de ningún plan de F4/F6.

Independientes de `MVP-013` y que pueden avanzar antes: instalación y compatibilidad de paquetes, estructura del cliente, errores técnicos y dobles. Los valores numéricos esperan a `MVP-013`.

## 3. Decisiones y pendientes

- **Fijado por D-05 (no se modifica localmente):** modelo `gemini-3.5-flash-lite` vía AI SDK/Google.
- **Pendiente `MVP-013`:** timeouts, límites de entrada/salida, temperatura y reintentos, costes. Se leen de configuración tipada; defaults de desarrollo se etiquetan «propuestos, no aprobados». No se inventan umbrales de calidad ni métricas.
- **Variable de entorno:** el nombre `GOOGLE_GENERATIVE_AI_API_KEY` figura en `.env.example`; el valor no se lee ni se imprime. Verificar el nombre esperado por la versión instalada de `@ai-sdk/google` con su documentación oficial antes de fijarlo (PRD §13: «el nombre exacto se verifica en la implementación»).
- **Ubicación de dobles:** `src/mocks/` solo puede depender de contratos (barreras), por lo que dobles que tipan contra servicios de `src/lib/ai/` viven en `tests/server/` (coordinación con `MVP-120`). Código de producto nunca importa dobles.

## 4. Rutas y propiedad

| Zona | Permitido (Líder) | Prohibido |
| --- | --- | --- |
| `package.json`, `package-lock.json` | Agregar `ai`, `@ai-sdk/google`, `@ai-sdk/react` con npm; revisar peers con React 19 / Next 16 / Zod 4 | `audit fix --force`; paquetes de otros proveedores sin orden |
| `src/lib/ai/` | Cliente, errores técnicos, puerto de generación estructurada, utilidades de entrada delimitada (`import "server-only"`) | Funciones de aprobación, congelación o HCS |
| `tests/server/` | Dobles del proveedor, tests del cliente | `src/features/*/components/` (presentación) |
| `tests/boundaries/manifest.mjs` | Solo si una barrera nueva hace falta, con casos positivos y negativos | Relajar `SERVER_DIRS` |
| `.env.example` | Solo si el nombre de variable cambia por verificación de la versión instalada (sin valores) | Leer `.env`/`.env.local` |

`@ai-sdk/react` coincide con el patrón `@ai-sdk/*` de paquetes restringidos para presentación/contratos/preview; solo lo usarán containers (`MVP-054`). Esta tarea no lo importa desde ningún lugar de cliente.

## 5. Pasos

- [ ] Verificar `MVP-013` documentado y leer la fila; revisar `package.json` y `docs/architecture.md` («Herramientas de la base»).
- [ ] Consultar la documentación oficial de las versiones a instalar (AI SDK, Google provider; referencias del PRD §18) para la API de generación estructurada y de cancelación; **no** copiar recetas de memoria.
- [ ] `npm install ai @ai-sdk/google @ai-sdk/react`; revisar el lockfile, compatibilidad de peers y `npm audit`; comparar con la deuda #3 del [tracker](../../tech-debt-tracker.md) sin cerrar la deuda desde aquí.
- [ ] Fábrica del cliente en `src/lib/ai/`: lee configuración **al invocar**, no al importar (el `build` no inicializa proveedores, `SH-09`). Si falta la clave: error técnico estable (`ai_config_missing`, nombre propuesto) sin fallback ni salida simulada.
- [ ] Puerto de generación estructurada: recibe entrada delimitada (datos no confiables), esquema Zod de salida, `AbortSignal` y parámetros de `MVP-013`; devuelve resultado validado o error técnico estable con código, etapa, posibilidad de reintento y correlación no sensible (`SH-02`). **No expone `tools`**: la llamada no puede registrar herramientas (INV-04).
- [ ] Salida inválida frente al esquema = error técnico de esa etapa (reintentable), no reporte fabricado y no tratado como advertencia de contenido; las advertencias `critical` no tienen relación con este error.
- [ ] Registrar uso (tokens, latencia) cuando el proveedor lo informe, con correlación; sin prompts completos ni contenido por defecto (`SH-08`).
- [ ] Dobles de éxito, timeout, cancelación, respuesta mal formada y configuración ausente en `tests/server/`.
- [ ] Documentar en el archivo del cliente (comentario breve) que ningún agente recibe credenciales, SQL ni herramientas de blockchain.

## 6. Casos de test por aceptación

| Aceptación | Caso |
| --- | --- |
| Paquetes instalados | `npm ci` desde cero resuelve; `typecheck` ve los tipos; `build` no inicializa el proveedor ni falla sin variables |
| Solo servidor | Test de barreras: importar `src/lib/ai/*` desde presentación/contratos/preview falla; cada archivo de `src/lib/ai/` importa `server-only` |
| Error explícito sin configuración | Invocar sin clave devuelve `ai_config_missing`, sin llamar a la red y sin resultado simulado |
| Dobles | Éxito, timeout, abort, salida inválida: cada uno produce el resultado/error técnico esperado |
| Sin herramientas (INV-04) | Inspección del doble: la llamada no incluye `tools`; no existe función exportada que acepte herramientas |
| Sin filtrado de secretos | El error y los logs no contienen la clave ni el prompt |

## 7. Validación, evidencia y rollback

`npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries` y `npm run build` (dependencias y config). **Evidencia actual: no ejecutado.** Conexión real a Gemini: **no se prueba aquí**; requiere autorización y credenciales (`MVP-134/135`) y el repositorio no las lee. Un fallo de red o de proveedor no se presenta como éxito ni se cubre con un mock en producción. Rollback: revertir `package.json`/lockfile/`src/lib/ai/` en la rama; no hay efectos externos.

## 8. Cierre

Se valida tras integrar y repetir checks. Actualizar solo la fila `MVP-050` (y recuento) con evidencia real; luego archivar el plan. Escribir este documento no cambia el estado. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

## 9. Pendientes y solicitudes

**Referencias:** `RQ-B1` — [sources-and-ai](../../../specs/sources-and-ai.md) (§4 y §7): fallos, cancelación y registro abierto de `MVP-013` (parámetros, timeouts, límites), distinguiendo límite técnico, advertencia y calidad medida; sin valores aprobados anticipados.

**Solicitudes:** a `MVP-020/021` (forma del resultado técnico y errores estables); a `MVP-120` (convenio de ubicación y construcción de dobles de proveedor); a F13 (`MVP-130`): confirmar que el bundle no incluye el SDK.

**Decisiones pendientes:** valores de `MVP-013`. La instalación y la estructura no dependen de ellas.

[Maestro](../mvp-master-plan.md) · [Fundaciones](../../../design/mvp-shared-foundations.md) · Siguiente: [Agente 1](f05-agent1-drafting.md)
