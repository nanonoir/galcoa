# ExecPlan: inicialización de documentación (AGENTS, README, docs)

Estado: completado

## Objetivo

Dejar el repositorio listo para que personas y agentes trabajen alineados con el PRD: `AGENTS.md` operativo, `README.md` de onboarding veraz y un índice `docs/` con guías mínimas. Solo documentación; no se toca código, dependencias, configuración ni el PRD.

## Fuente de verdad

[`GALCOA-PRD-v1.4.md`](../GALCOA-PRD-v1.4.md) (internamente v1.5, 16/10/2026) es la fuente de producto. El nombre del archivo se conserva para no romper referencias. Las guías nuevas enlazan al PRD y no copian sus reglas.

## Alcance

| Archivo | Acción |
| --- | --- |
| `AGENTS.md` | Agregar instrucciones del repo; preservar literalmente el bloque `BEGIN/END:nextjs-agent-rules` |
| `README.md` | Reemplazar el texto de `create-next-app` por onboarding real |
| `docs/README.md` | Crear índice navegable |
| `docs/architecture.md` | Crear: límites objetivo (PRD) vs. estado actual |
| `docs/development.md` | Crear: comandos, validación, seguridad y secretos |
| `docs/exec-plans/tech-debt-tracker.md` | Agregar (sin alterar lo existente) desviaciones detectadas |

Fuera de alcance: mover el PRD, reestructurar `src/`, cambiar dependencias, scripts, `opencode.json`, `.gitignore`, CI o tests, ejecutar `/init`, commit o push.

## Hallazgos de estado real (2026-10-16)

- `src/` contiene solo la plantilla de `create-next-app` (`app/page.tsx`, `layout.tsx` con metadatos por defecto), componentes shadcn en `src/components/ui/`, `src/hooks/use-mobile.ts` y `src/lib/utils.ts`.
- No existen `supabase/`, `tests/`, `src/features/`, CI ni runner de tests. Scripts: `dev`, `build`, `start`, `lint`, `typecheck`.
- `.gitignore` ignora `.env*`, incluido `.env.example` (no está versionado).
- Desviaciones de dependencias respecto al PRD registradas como deuda (no modificadas): ver tracker.

## Decisiones

- Docs en español (convención del PRD); comandos y nombres de código sin traducir.
- ExecPlans abiertos en `docs/exec-plans/active/`, cerrados en `docs/exec-plans/completed/` (convención ya existente).
- Se evita duplicar invariantes: `AGENTS.md` resume las que más afectan a un agente y remite a IDs del PRD.

## Progreso

- [x] Lectura de PRD, docs previos, `package.json`, configs y árbol (sin leer `.env`/`.env.local`)
- [x] ExecPlan creado antes de editar
- [x] `AGENTS.md`
- [x] `README.md`
- [x] `docs/README.md`, `docs/architecture.md`, `docs/development.md`
- [x] Deuda registrada en tracker
- [x] Validación (enlaces locales, bloque Next intacto, coherencia con scripts/árbol, sin secretos)
- [x] Revisión independiente completada con PASS (sesión `ses_ebc6969f2ffePRDbV7gqV20ozx`) y cierre archivado

## Validación

- Enlaces Markdown locales: 34 enlaces locales verificados y validados con script Node de solo lectura.
- Bloque Next en `AGENTS.md`: comparado byte a byte con el original (`git show HEAD:AGENTS.md`), preservado intacto.
- Comandos de verificación: `npm run lint`, `npm run typecheck` y `npm run build` ejecutados y pasando.
- Secretos: verificado que no se incluyeron valores reales ni credenciales.
- Revisión independiente: aprobada con dictamen PASS en sesión `ses_ebc6969f2ffePRDbV7gqV20ozx`.

## Implementation Outcome

### Implemented

- Inicialización y alineación completa de la documentación según el PRD v1.5 (alcance P0):
  - `AGENTS.md`: instrucciones operativas del repositorio con reglas clave de producto (autonomía máxima, confirmaciones unánimes, inmutabilidad, Hedera Testnet, lenguaje no engañoso), referencias canónicas y preservación estricta del bloque Next.js.
  - `README.md`: onboarding veraz que describe el estado real (arranque, plantilla Next.js y UI shadcn), comandos disponibles, variables requeridas (`.env.example`), stack y limitaciones de demo.
  - `docs/README.md`: índice navegable de la documentación técnica del proyecto.
  - `docs/architecture.md`: separación entre límites y árbol objetivo propuestos por el PRD frente al estado real del código.
  - `docs/development.md`: guía de comandos, niveles de validación por tipo de cambio, manejo de secretos y flujo de trabajo.
  - `docs/exec-plans/tech-debt-tracker.md`: registro y seguimiento de deuda técnica y desviaciones identificadas (dependencias no usadas/por revisar en P0, omisión de `.env.example` en `.gitignore`, ausencia de tests/CI).

### Deviations from Design

None. El plan se ejecutó según el alcance previsto sin tocar código, dependencias, configuración ni el PRD.

### Validation

- Revisión independiente completada con resultado PASS (sesión `ses_ebc6969f2ffePRDbV7gqV20ozx`):
  - 34 enlaces Markdown locales validados sin enlaces rotos ni referencias inválidas.
  - Bloque `BEGIN/END:nextjs-agent-rules` en `AGENTS.md` verificado intacto byte a byte contra `git show HEAD:AGENTS.md`.
  - Verificación de comandos del proyecto: `npm run lint`, `npm run typecheck` y `npm run build` pasan exitosamente.
  - Ausencia de secretos o credenciales expuestas en la documentación.

### Follow-up

- Seguimiento de deuda técnica registrada en `docs/exec-plans/tech-debt-tracker.md`:
  - Revisión y decisión por ticket del líder técnico sobre dependencias adicionales (`@hashgraph/hedera-agent-kit*`, `mercadopago`, `stripe`, etc.) y alineación final de variables de entorno (ítem 3).
  - Versionado de `.env.example` ajustando `.gitignore` (ítem 4).
  - Implementación de runner de tests y pipeline de CI para REQ-18 (ítem 5).
