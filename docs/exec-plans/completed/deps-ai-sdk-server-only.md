# ExecPlan — Dependencias requeridas por los planes MVP (IA y `server-only`) y docs de proveedores

**Estado: completado y archivado.** Ejecutado localmente y validado íntegro; entrega directa a `develop` autorizada por el usuario, pendiente de commit/push por el orquestador (sin SHA previo inventado). No completa directamente ninguna tarea `MVP-NNN`: instalar paquetes no implementa funcionalidad en runtime y el [maestro](../active/mvp-master-plan.md) no se modifica.

Referencias: [PRD §13 y D-05](../GALCOA-PRD-v1.4.md) · [arquitectura](../../architecture.md) · [fundaciones SH](../../design/mvp-shared-foundations.md) · [deuda #3](../tech-debt-tracker.md).

## Objetivo

Auditar las dependencias que exigen los planes derivados frente a `package.json`, instalar solo las confirmadas y compatibles, y revisar las referencias de proveedores aportadas por el usuario en `docs/generated/`.

## Inventario (confirmado contra planes)

| Paquete | Fuente que lo exige | Decisión |
| --- | --- | --- |
| `ai` | PRD §13 (`npm install ai …`), D-05; plan F5 Gemini | **Instalado** `^7.0.142` |
| `@ai-sdk/react` | PRD §13; planes F5 Gemini y F4 chat | **Instalado** `^4.0.146` |
| `groq-sdk` | PRD §13, D-05; plan F5 Agente 2 | **Instalado** `^1.6.0` |
| `server-only` | Arquitectura (barreras); el chequeo de barreras exige `import "server-only"` en carpetas de servidor | **Instalado** `^0.0.1` |
| `@ai-sdk/google`, `zod`, `@supabase/*`, `@hiero-ledger/sdk`, `@react-pdf/renderer` | PRD §13 | Ya presentes |
| Librería de QR | `MVP-078` (PD-03) | **No instalada**: decisión abierta del líder (licencia/tamaño/auditoría) |
| Cliente SQL de pruebas, auditoría a11y automática | F12/F11 | **No instalados**: decisiones locales abiertas de los planes, no confirmadas |
| `@ai-sdk/groq` | Solo aparece en ejemplos de `docs/generated/groq` | **No instalado**: D-05 fija `groq-sdk` |

Búsqueda adicional sin hallazgos: ningún plan nombra paquetes de extracción de PDF/imagen/EXIF; la extracción usa Gemini multimodal (Gemini API de documentos/imágenes). No se agrega nada especulativo.

## Compatibilidad (npm ls + Context7 `/vercel/ai` v7)

- `ai@7.0.142`, `@ai-sdk/react@4.0.146` y `@ai-sdk/google@4.0.98` comparten `@ai-sdk/provider@4.0.28` y `@ai-sdk/provider-utils@5.0.61` (deduped), `zod@4.6.7` (peer `^3.25.76 || ^4.1.8`) y `react@19.3.0` (peer `^19.2.1`). Sin conflictos de peers.
- Documentación v7 confirma `npm install ai @ai-sdk/react` e `import { useChat } from '@ai-sdk/react'`.
- No se actualizaron versiones mayores de paquetes existentes.

## Docs `docs/generated/` (aportadas por el usuario)

- Se preservan sin modificar: 7 archivos (Gemini: 6; Groq: 1), copias de documentación pública.
- Revisión de secretos (patrones `gsk_…`, `AIza…`, `sk-…`, claves privadas, JWT) sin imprimir valores: **0 coincidencias**; solo marcadores como `your-groq-api-key`.
- Enlaces: referencias externas oficiales; no se verificaron en línea. Sin enlaces locales rotos introducidos.
- Cambio mínimo: fila en `docs/README.md` indicando que no son fuente de verdad y que los ejemplos `@ai-sdk/groq` no aplican (D-05).

## Cambios

`package.json`, `package-lock.json` (+4 dependencias directas y transitivas), `docs/README.md`, `docs/architecture.md`, `docs/development.md`, `docs/design/mvp-shared-foundations.md`, `docs/exec-plans/tech-debt-tracker.md` (#3), este plan, `docs/exec-plans/active/README.md`.

## Validación (ejecutada, Node 24.18.0 / npm 11.16.0)

| Check | Resultado |
| --- | --- |
| `npm run lint` | OK (exit 0) |
| `npm run typecheck` | OK (exit 0) |
| `npm test` | OK: 6 archivos, 91 tests |
| `npm run test:boundaries` | OK: 3 archivos, 51 tests |
| `npm run build` | OK (rutas `/` y `/_not-found`) |
| `npm run test:e2e` | OK: 15 passed |
| `npm audit --omit=dev` | 0 vulnerabilidades (igual que antes) |
| `npm audit` (completo) | 9 high, mismas dependencias de desarrollo que la deuda #1 (`braces`, `fast-glob`, `micromatch`, `shadcn`, `ts-morph`, …); sin nuevas por estos paquetes |
| `npm ci --dry-run` | Resuelve; aviso npm `allow-scripts` por `protobufjs` y `unrs-resolver` (ya existente, no tratado aquí) |

No se ejecutaron llamadas reales a Gemini/Groq ni se leyeron `.env`.

## Decisiones y límites

- Sin cambios de branch protection, checks obligatorios ni CI. Sin commit/push en este plan: lo realiza el orquestador.
- La instalación no habilita integraciones: sin consumidores, sin herramientas de envío a blockchain para agentes (INV-04 intacto).
- Los planes F5 tienen un paso «npm install» en su lista; queda cumplido en cuanto a paquetes, pero los orquestadores de cada plan deben marcarlo con su evidencia propia.

## Rollback

Revertir `package.json`, `package-lock.json` y los cambios de docs listados.

## Implementation Outcome

### Implemented

1. **Dependencias instaladas:**
   - Incorporación en `package.json` y `package-lock.json` de:
     - `ai@^7.0.142` (PRD §13, D-05; base para planes de chat e IA F5)
     - `@ai-sdk/react@^4.0.146` (PRD §13; hooks de UI y streaming F4/F5)
     - `groq-sdk@^1.6.0` (PRD §13, D-05; SDK oficial para contraste de Agente 2)
     - `server-only@^0.0.1` (Arquitectura; barrera explícita para módulos de servidor)
   - Verificación de consistencia del lockfile y resolución de dependencias sin conflictos de peers con `zod@4.6.7` y `react@19.3.0`.
2. **Documentación de proveedores preservada:**
   - Preservación íntegra de 7 archivos de documentación técnica provistos por el usuario en `docs/generated/` (6 en `gemini/`, 1 en `groq/`).
   - Revisión preventiva de secretos realizada sobre los 7 archivos, confirmando 0 coincidencias con credenciales o claves reales.
3. **Reconciliación de documentación canónica:**
   - `docs/README.md`: fila informativa incorporada para `docs/generated/`, advirtiendo el carácter no canónico y la exclusión de `@ai-sdk/groq` conforme a D-05.
   - `docs/architecture.md`: tabla de proveedores actualizada reflejando la instalación de las dependencias sin integración activa.
   - `docs/development.md`: sección de dependencias actualizada documentando los paquetes instalados y aplazando dependencias nuevas (p. ej. QR).
   - `docs/design/mvp-shared-foundations.md`: sección SH-08 actualizada con enlace a este plan completado.
   - `docs/exec-plans/tech-debt-tracker.md`: deuda #3 actualizada en descripción, estado actual y remediación.
   - `docs/exec-plans/active/README.md`: tabla de planes de ejecución actualizada con el archivo de este plan.

### Deviations from Design

None. El inventario ejecutado coincide estrictamente con los requerimientos confirmados del PRD (§13), las decisiones arquitectónicas (D-05) y las barreras de importación, excluyendo expresamente paquetes especulativos no definidos.

### Validation

- Todos los checks de validación ejecutados localmente en Node 24.18.0 y npm 11.16.0 por la sesión de implementación (`ses_ebb976a17ffevWpwdCFayPisc7`) con resultado exitoso (exit 0):
  - `npm run lint`: OK (exit 0)
  - `npm run typecheck`: OK (exit 0)
  - `npm test`: OK (6 archivos, 91 tests pasados)
  - `npm run test:boundaries`: OK (3 archivos, 51 tests pasados)
  - `npm run build`: OK (build de Next.js generado limpiamente para rutas `/` y `/_not-found`)
  - `npm run test:e2e`: OK (15 tests Playwright pasados en Chromium)
  - `npm audit --omit=dev`: 0 vulnerabilidades en dependencias de producción
  - `npm audit`: 9 vulnerabilidades high preexistentes en dependencias de desarrollo (`braces`, `fast-glob`, etc., deuda #1); 0 vulnerabilidades nuevas introducidas por los nuevos paquetes
  - `npm ls`: compatibilidad peer validada; documentación oficial de Vercel AI SDK v7 consultada vía Context7 (`/vercel/ai`)
- Revisión de seguridad y secretos: 7 archivos en `docs/generated/` verificados sin credenciales reales expuestas.
- Revisión independiente: no requerida al consistir la entrega únicamente en dependencias y documentación, con validación completa y checks automáticos en verde.
- Validación de enlaces locales: todos los enlaces de documentación modificados verificados sin roturas.

### Follow-up

- **Entrega pendiente a `develop`:** Commit directo a `develop` y push autorizados explícitamente por el usuario, pendientes de ejecución por el orquestador (sin SHA inventado previo a la creación del commit).
- **Consumidores en runtime:** La implementación funcional, configuración de API keys y consumo en tiempo de ejecución quedan a cargo de los planes correspondientes (`MVP-040…042`, `MVP-050…055`); no se cierran IDs del plan maestro en este plan.
- **Deuda #3:** Decisión pendiente sobre librería de generación de QR para `MVP-078` (PD-03).
- **Configuración de CI:** Conservación de la configuración actual de CI en `.github/workflows/ci.yml`; el usuario determinó no habilitar checks obligatorios ni protección de ramas en GitHub para esta entrega.
