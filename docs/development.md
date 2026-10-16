# Desarrollo, validación y seguridad

Guía práctica para trabajar en el repo. Solo describe lo que existe hoy; si agregas tests o CI, actualiza este archivo.

## Camino rápido

1. `npm install` (Node `>=20.9.0`).
2. `npm run dev` → <http://localhost:3000>.
3. Antes de entregar: `npm run lint`, `npm run typecheck` y, si tocaste rutas, configuración o dependencias, `npm run build`.

## Qué validar según el cambio

| Cambio | Checks |
| --- | --- |
| Solo Markdown | Revisar enlaces locales y que no haya secretos en el diff |
| Componentes, hooks, lib | `npm run lint` + `npm run typecheck` |
| Rutas, `next.config.ts`, dependencias, CSS global | Los anteriores + `npm run build` |
| Lógica de flujo crítico (futura) | Tests deterministas del PRD §12; **hoy no hay runner**, el ticket que lo introduzca debe documentarlo aquí |

Notas:

- No hay script `test` ni CI. No reportes tests como ejecutados.
- La evaluación de IA (PRD §12) es independiente de los tests de PR y no se simula.
- Mocks de los dos agentes en tests; nunca llamadas reales a proveedores en CI.

## Seguridad y secretos

- `.env`, `.env.local` y `.env.example` están ignorados por `.gitignore` (`.env*`). Nunca copies valores a código, docs, issues o logs.
- Solo `NEXT_PUBLIC_*` llega al navegador. `SUPABASE_SECRET_KEY`, claves de IA y `HEDERA_OPERATOR_*` son de servidor.
- Hedera: Testnet únicamente; sin herramientas genéricas de escritura expuestas a agentes (INV-04).
- Datos de prueba ficticios; no subir datos reales regulados a servicios gratuitos (PRD §11).
- Zonas coordinadas con el líder técnico (Auth/RLS, claves, migraciones, API, Hedera): solo con ticket explícito (PRD §13).

## Flujo de trabajo

Issue independiente → rama corta → Pull Request con checks de tipos, lint, build y pruebas relevantes → revisión y merge del líder técnico (PRD §13).

## Dependencias conocidas fuera del PRD

Las diferencias entre `package.json`, `.env.example` y el PRD están registradas en la [deuda técnica](exec-plans/tech-debt-tracker.md); no se resuelven sin ticket.

[Índice](README.md) · [Arquitectura](architecture.md) · [PRD](exec-plans/GALCOA-PRD-v1.4.md)
