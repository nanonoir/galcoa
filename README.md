# GALCOA+

Plataforma de documentación autónoma de operaciones por conversación: una persona describe una operación y aporta evidencias, la IA redacta y contrasta, los participantes elegidos confirman el mismo snapshot y la huella de la versión final se sella en Hedera HCS (Testnet). El producto está definido en el [PRD](docs/exec-plans/GALCOA-PRD-v1.4.md).

> **Estado: base para colaboración.** Next.js conserva la página de plantilla. Se prepara presentación desacoplada con contratos Zod, escenarios ficticios, preview local y pruebas. Auth, base de datos, agentes de IA, PDF y Hedera **todavía no están implementados**; el preview no es el producto conectado.

## Inicio rápido

Requisitos: Node.js **24.18.0** (`.nvmrc`; engines `>=24.18.0 <25`) y npm **11 o superior**. El lockfile se generó con npm 11.16.0. Local y CI usan la misma versión Node.

```bash
npm ci
npm run preview:ui
```

El preview es local, usa datos ficticios y no necesita `.env` ni credenciales. Para la aplicación Next ejecuta `npm run dev` y abre <http://localhost:3000>: todavía muestra la plantilla de `create-next-app`. Consulta [desarrollo](docs/development.md) para escenarios, puertos y validación.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera tipos Next y ejecuta `tsc --noEmit` |
| `npm test` | Vitest: contratos, componentes y barreras |
| `npm run test:watch` | Vitest interactivo, solo local |
| `npm run test:boundaries` | Límites de dependencias e imports |
| `npm run preview:ui` | Preview Vite local sin servicios |
| `npm run test:e2e` | Playwright: navegador Chromium, preview y smoke de Next |

Antes de ejecutar Playwright por primera vez: `npx playwright install chromium` (Linux/CI: `npx playwright install --with-deps chromium`). GitHub Actions ejecuta los checks de PR/push en Linux (verificado verde en la base de integración [MVP-006](docs/exec-plans/completed/f00-integracion-base-ci.md)); la protección de ramas y suites ampliadas corresponden a fases posteriores (MVP-131).

## Variables de entorno

El único archivo local de entorno es `.env` en la raíz (no `.env.local`, que Next cargaría con precedencia sobre él: `npm run env:check` lo detecta y falla). Crea `.env` desde la plantilla `.env.example` **solo al implementar/probar integraciones autorizadas**, o instala el que te faciliten con `npm run env:install -- <ruta>` (copia sin leer el contenido ni sobrescribir). No es necesario para preview, tests ni build. Nunca versiones valores reales:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- IA: `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`.
- Hedera: `HEDERA_NETWORK=testnet`, `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_TOPIC_ID`.

Los nombres son los mismos en Vercel (Project Settings → Environment Variables; no se sube `.env`); ver diferencias por entorno en [`docs/development.md`](docs/development.md). Solo las variables `NEXT_PUBLIC_*` pueden exponerse al navegador. `.env` y `.env.local` siguen ignorados. La plantilla solo contiene nombres y valores vacíos salvo Testnet; las integraciones futuras documentarán cualquier clave privilegiada adicional necesaria, siempre de servidor.

## Stack

Objetivo del PRD: Next.js 16 + React + TypeScript, Tailwind v4 + shadcn/ui, Supabase (Auth, Postgres, Storage), Gemini 3.5 Flash-Lite (generación) y GPT-OSS 120B en Groq (verificación), Zod, Hedera HCS con `@hiero-ledger/sdk`, `@react-pdf/renderer`, Vercel. La base usa Next, React, Tailwind, shadcn, Zod, Vite, Vitest y Playwright. Los SDK previstos, incluidos `ai`, `@ai-sdk/react` y `groq-sdk`, ya están instalados; eso no implica que sus integraciones estén implementadas.

## Trabajo delegado

El líder prepara contrato, escenarios y entrypoint del preview. Cada Issue autoriza archivos concretos de presentación y sus tests; no toda una feature. El colaborador no modifica rutas, contratos, servicios o configuración por iniciativa propia. Entrega en rama corta y PR; el líder revisa e integra. Ver [propiedad y límites](docs/architecture.md#árbol-objetivo-y-propiedad).

## Limitaciones

- **Demo/MVP:** Hedera **Testnet** puede resetearse y no ofrece permanencia de producción. Usar solo datos ficticios.
- Una confirmación por enlace no es firma digital ni identidad verificada; la blockchain prueba integridad de un PDF, no la veracidad de los hechos.
- El correo de Supabase Auth integrado solo sirve para pruebas (límites estrictos); registros públicos requieren SMTP propio, fuera del MVP.
- Pagos, Mainnet, audio e invitaciones automáticas quedan fuera de P0.

## Documentación

- [Índice de `docs/`](docs/README.md)
- [PRD de producto](docs/exec-plans/GALCOA-PRD-v1.4.md)
- [Plan maestro del MVP](docs/exec-plans/active/mvp-master-plan.md)
- [Orden de ejecución y compatibilidad](docs/execution/mvp-execution-guide.md)
- [Qué Issue ejecutar: Nahuel, Gastón y Facu](docs/execution/team-ticket-order.md)
- [Inventario de Issues publicadas](docs/tasks/issue-rollout/README.md#issues-publicadas)
- [Arquitectura: objetivo vs. actual](docs/architecture.md)
- [Desarrollo, validación y seguridad](docs/development.md)
- [Deuda técnica](docs/exec-plans/tech-debt-tracker.md)
- [Instrucciones para agentes](AGENTS.md)
