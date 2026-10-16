# GALCOA+

Plataforma de documentación autónoma de operaciones por conversación: una persona describe una operación y aporta evidencias, la IA redacta y contrasta, los participantes elegidos confirman el mismo snapshot y la huella de la versión final se sella en Hedera HCS (Testnet). El producto está definido en el [PRD](docs/exec-plans/GALCOA-PRD-v1.4.md).

> **Estado: arranque.** El repositorio contiene hoy la plantilla de Next.js y componentes de UI (shadcn). Auth, base de datos, agentes de IA, PDF y Hedera **todavía no están implementados**; lo descrito en el PRD es el objetivo, no el estado actual.

## Inicio rápido

Requisitos: Node.js `>=20.9.0` (mínimo que declara Next 16.4.2) y npm. El repo usa `package-lock.json`.

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. Hoy muestra la página de plantilla de `create-next-app`.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

No hay script de tests ni CI configurados.

## Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores. Nunca versiones valores reales. Nombres definidos hoy:

- App y Supabase: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (solo servidor), `SUPABASE_STORAGE_BUCKET`.
- IA: `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`, `AI_GENERATOR_PROVIDER`, `AI_VERIFIER_PROVIDER` (más `AI_GENERATOR_MODEL`/`AI_VERIFIER_MODEL`, comentadas).
- Hedera: `HEDERA_NETWORK`, `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY` (solo servidor), `HEDERA_TOPIC_ID`.
- Fases posteriores: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`; opcional `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

Solo las variables `NEXT_PUBLIC_*` son visibles en el navegador. `.gitignore` ignora `.env*`, incluido `.env.example`, por lo que ese archivo hoy no está versionado. Los nombres del PRD (§13) y de `.env.example` difieren en parte; ver [deuda técnica](docs/exec-plans/tech-debt-tracker.md).

## Stack

Objetivo del PRD: Next.js 16 + React + TypeScript, Tailwind v4 + shadcn/ui, Supabase (Auth, Postgres, Storage), Gemini 3.5 Flash-Lite (generación) y GPT-OSS 120B en Groq (verificación), Zod, Hedera HCS con `@hiero-ledger/sdk`, `@react-pdf/renderer`, Vercel. Instalado y usado hoy: Next, React, Tailwind, shadcn/ui, React Compiler. El resto figura en `package.json` pero sin código que lo use.

## Limitaciones

- **Demo/MVP:** Hedera **Testnet** puede resetearse y no ofrece permanencia de producción. Usar solo datos ficticios.
- Una confirmación por enlace no es firma digital ni identidad verificada; la blockchain prueba integridad de un PDF, no la veracidad de los hechos.
- El correo de Supabase Auth integrado solo sirve para pruebas (límites estrictos); registros públicos requieren SMTP propio, fuera del MVP.
- Pagos, Mainnet, audio e invitaciones automáticas quedan fuera de P0.

## Documentación

- [Índice de `docs/`](docs/README.md)
- [PRD de producto](docs/exec-plans/GALCOA-PRD-v1.4.md)
- [Arquitectura: objetivo vs. actual](docs/architecture.md)
- [Desarrollo, validación y seguridad](docs/development.md)
- [Deuda técnica](docs/exec-plans/tech-debt-tracker.md)
- [Instrucciones para agentes](AGENTS.md)
