# Arquitectura: objetivo y estado actual

Una sola aplicación Next.js 16 (App Router) con lógica de servidor en Route Handlers. Este documento separa lo **propuesto por el PRD** de lo **existente hoy**; las reglas de producto están en el [PRD](exec-plans/GALCOA-PRD-v1.4.md) y no se repiten aquí.

## Estado actual (verificado en el repo)

| Área | Hoy |
| --- | --- |
| `src/app/` | `layout.tsx`, `page.tsx` (plantilla), `globals.css`, `favicon.ico` |
| `src/components/ui/` | Componentes shadcn (`base-nova`, ver `components.json`) |
| `src/hooks/`, `src/lib/` | `use-mobile.ts`, `utils.ts` |
| Config | `next.config.ts` (React Compiler y regla Turbopack para CSS), `eslint.config.mjs`, alias `@/*` → `src/*` |
| No existe | `supabase/`, `tests/`, `src/features/`, rutas `api/`, `confirm/[token]`, `verify/[reference]`, CI, runner de tests |

## Objetivo propuesto (PRD §13, orientativo)

Árbol orientativo; no ordena mover código (D-17). Se crean carpetas cuando un ticket las requiera.

| Ubicación | Responsabilidad prevista |
| --- | --- |
| `src/app/` (grupos de rutas) | Marketing, auth, dashboard, `documents/[id]`, `verify/[reference]`, `confirm/[token]`, `api/` |
| `src/features/` | Pantallas por dominio: dashboard, chat, documents, corroborations |
| `src/lib/supabase/` | Clientes `@supabase/ssr`, sesión por cookies |
| `src/lib/ai/` | Orquestación de Agente 1 (Gemini) y Agente 2 (Groq) |
| `src/lib/hedera/` | Envío y reconciliación HCS, solo servidor |
| `src/lib/documents/` | PDF, versiones, hashes, manifiesto |
| `src/lib/rules/` | Reglas deterministas ALCOA+ y cálculo de estados |
| `src/lib/contracts/` | Esquemas Zod compartidos |
| `supabase/migrations/`, `tests/`, `src/mocks/` | Migraciones SQL, pruebas deterministas, mocks de agentes |

## Límites que conviene respetar

- **Servidor vs. cliente:** claves de Supabase (secret), IA y Hedera solo en servidor (INV-04, REQ-17). El token de tercero nunca da acceso al chat ni a evidencias (INV-11).
- **Contratos y reglas:** Zod valida estructura; el código aplica reglas de negocio y calcula estados de forma determinista; la IA no decide estados (PRD §4, INV-01–03).
- **Persistencia:** versiones finalizadas e histórico son solo-agregar (INV-05, INV-08).
- **Dependencia de dirección sugerida:** `app/features` → `lib/*` → proveedores externos; `lib/contracts` sin dependencias de UI. Es una guía de diseño local, no una decisión del PRD; confírmala en el primer ticket que cree esas carpetas.

## Referencias

[PRD §8 Modelo de datos](exec-plans/GALCOA-PRD-v1.4.md) · [PRD §9 Hedera](exec-plans/GALCOA-PRD-v1.4.md) · [Desarrollo](development.md) · [Índice](README.md)
