# ExecPlan — Flujo de conversión: captación, demo pública, registro, activación, planes y medición

Estado: activo (2026-10-22). Pedido directo del líder (Nahuel) a Gastón, rama `feat/conversion` desde `develop` (PR #151).

## Objetivo

Convertir visitantes en usuarios registrados y luego en clientes pagos, dejándoles probar el valor antes de registrarse
(criterios 1–9 del pedido): captación, demo pública sin registro, conversión, registro, activación hasta el primer
sello, planes y contratación, UX responsive, medición del embudo y reutilización sin romper flujos.

## Decisiones (con justificación)

- **D1. Demo 100 % en el navegador, con el motor de reglas real.** `/demo` no llama a la API, a Supabase, a la IA ni a
  Hedera: ejecuta `evaluateAlc` (`src/lib/rules/alc.ts`, puro) sobre fuentes de ejemplo y calcula la huella SHA-256 con
  `crypto.subtle`. Así el visitante ve el comportamiento verdadero del producto (200/200 → verde; 200/198 → rojo que
  bloquea el sello, reglas §4 y §5) sin cuentas, costos ni datos reales. La extracción de la «IA» es un paso
  determinista rotulado «simulado en la demo» (regla §5.1: la IA no decide; el color lo decide el código). Respeta la
  arquitectura: los datos de ejemplo viven en el container de la demo (no en `src/mocks`/fixtures, que el producto no
  puede importar) y la presentación solo recibe props. No hay ruta de producto con finalización simulada: la demo es
  una superficie separada, rotulada «Demo con datos de ejemplo — nada se guarda ni se registra en Hedera».
- **D2. Conversión sin interrumpir.** No hay modales bloqueantes: un aviso discreto aparece después del veredicto y un
  cierre con CTA al final. El registro recibe `?origen=demo|precios&plan=…` para mostrar contexto.
- **D3. Registro: se reutiliza el flujo real existente** (`/api/auth/register`, sesión inmediata). Solo se suma
  contexto y beneficios; no se tocan reglas de contraseña ni el contrato de Auth (sensible, del líder).
- **D4. Activación derivada de datos reales.** El checklist del panel se calcula en servidor desde `listDocuments()`
  (creado → verificado → confirmado → sellado), sin estado nuevo de producto ni tablas extra.
- **D5. Monetización sin pagos en P0.** `AGENTS.md` deja Mercado Pago/Stripe fuera de P0, así que `/precios` muestra los
  planes de prueba de `GALCOA-REGLAS-PRODUCTO.md` §9 y la contratación registra una **solicitud de suscripción**
  (`request_subscription`) que el equipo activa a mano en el piloto. Integrar un cobro real queda como pendiente que
  requiere autorización.
- **D6. Medición propia y mínima.** Tabla `funnel_events` (sin datos personales: identificador aleatorio de visitante
  en `localStorage`, nombre de evento de lista cerrada, paso y origen) escrita solo por una función SECURITY DEFINER
  con rol dedicado sin bypass (patrón F4/F7). Respeta «Do Not Track». Sin terceros (sin GA ni píxeles).
- **D7. Migración aditiva, no aplicada a remoto.** Nuevo archivo en `supabase/migrations/`; aplicarla a `galcoa-dev`
  requiere autorización explícita del líder (AGENTS.md).

## Pasos

- [x] P1. Contratos `src/lib/contracts/conversion.ts` (eventos, planes, solicitud, checklist).
- [x] P2. Landing: problema + CTA principal a la demo + secundario a registro + llamado a planes.
- [x] P3. Demo pública `/demo` (container + presentación) con escenarios verde, amarillo y rojo (200/198).
- [x] P4. Registro con contexto de origen/plan.
- [x] P5. Checklist de activación en el panel.
- [x] P6. `/precios` + solicitud de suscripción (`POST /api/subscriptions`).
- [x] P7. Medición: migración, `POST /api/funnel`, cliente `track()`.
- [x] P8. Tests y checks.
- [x] P9. Documentar implementado, pruebas y pendientes.
- [ ] P10. Revisión independiente (toca una migración y una superficie anónima nueva) y aplicar la migración a `galcoa-dev` con autorización del líder.

## Qué se implementó (recorrido)

| Etapa del embudo | Dónde | Qué ve el usuario |
| --- | --- | --- |
| Captación | `/` (`landing-content.ts`, `landing-page.tsx`) | Problema («Trabajás bien, pero ¿lo podés demostrar?»), CTA principal «Probar la demo sin registrarte», secundario «Crear cuenta», llamado a «Ver planes». Con sesión: «Ir a mis documentos» + «Ver la demo». |
| Demo pública | `/demo` (`features/demo/*`) | 4 pasos: contar la entrega (cantidad editable y remito que coincide / con diferencia / sin remito) → veredicto real de `evaluateAlc` (verde, amarillo o rojo; el rojo bloquea y obliga a corregir) → confirmar como el comercio (QR de ejemplo) → huella SHA-256 real calculada en el navegador. Aviso permanente de datos de ejemplo. |
| Conversión | Demo paso 2 (aviso discreto) y paso 4 (cierre) | «Crear mi cuenta» → `/registro?origen=demo`; «Ver planes». Sin modales ni bloqueos. |
| Registro | `/registro?origen=…&plan=…` (`signup-context.tsx`) | Mismo formulario y flujo real de Auth; se suma contexto según origen, «no te pedimos tarjeta» y enlace a la demo. |
| Activación | `/dashboard` (`activation*.ts(x)`) | Guía de 4 pasos derivada de los documentos reales (creado → verificado → confirmado → sellado), con el próximo paso concreto y botón para crear o seguir el documento. Al sellar: invitación a planes (con el plan elegido antes, si lo hubo). |
| Monetización | `/precios` (`pricing-*.tsx`), `POST /api/subscriptions` | Planes de prueba de las reglas §9. Visitante → registro con el plan. Con sesión → solicitud real, idempotente, con confirmación visible; errores visibles. Sin cobro automático (fuera de P0). |
| Medición | `POST /api/funnel`, `track.ts`, tabla `funnel_events` | 12 eventos de lista cerrada (landing, CTA, demo por paso y veredicto, registro visto y completado, cada paso de activación, planes, plan elegido y solicitado). Respeta Do Not Track; nunca rompe la UI. |

Cambios en código existente (mínimos): `LandingContentSchema` suma campos opcionales; `useAuthForm` acepta un `onSuccess` opcional (no cambia destino ni reglas); la creación de documento del panel se extrajo a `create-document.ts` para reutilizarla; `SERVER_DIRS` suma `src/lib/conversion`; el test estático de la migración ALC ahora exige que ninguna migración posterior toque sus funciones (antes exigía ser la última); el catálogo RLS incluye las tablas y funciones nuevas.

## Progreso y evidencia

- 2026-10-22 (local, Windows, Node 24.22.1): `npm run lint` OK; `npm run typecheck` OK; `npm test` 115 archivos / 1552 tests OK; `npm run test:boundaries` 69 OK; `npm run build` OK (rutas nuevas `/demo` estática, `/precios`, `/api/funnel`, `/api/subscriptions`).
- `npm run test:rls` contra Supabase local en Docker (reset y todas las migraciones desde cero, incluida `20261022000100`): 3 archivos / 121 tests OK.
- Prueba manual SQL con roles reales en la base local: `anon` registra eventos pero no lee `funnel_events` (permission denied) ni ejecuta `request_subscription`; evento fuera de lista rechazado por CHECK; `request_subscription` con sesión: `solicitada`, luego `ya_solicitada` con la misma clave y con otra clave para el mismo plan abierto; tope de 60 eventos/minuto por visitante (70 llamadas → 60 filas).
- Navegador (`next start` local): landing con CTA nuevos; demo completa verde → confirmación → huella; `/precios` y `/registro?origen=precios&plan=crecimiento` con contexto; sin scroll horizontal a 375 px en `/`, `/demo` y `/precios` (se corrigió el aviso de la demo, que desbordaba); sin errores de consola; `/api/funnel` responde 204.
- No ejecutado: Playwright (`npm run test:e2e`) y suites `test:server:local`; revisión independiente.

## Pendientes

1. **Aplicar la migración** `20261022000100_conversion_funnel.sql` a `galcoa-dev` (requiere autorización del líder). Hasta entonces `/api/funnel` descarta los eventos en silencio y `/api/subscriptions` responde 503 visible.
2. **Revisión independiente** de la superficie anónima nueva (`record_funnel_event` para `anon`): tope por visitante, pero el visitante lo genera el navegador; si hace falta, sumar el limitador por origen (`hit_rate_limit`) en la ruta.
3. **Cobro real** (Mercado Pago/Stripe): fuera de P0; hoy la solicitud se activa a mano. Falta definir quién la atiende y cómo se avisa (no hay notificación al equipo).
4. **Tablero del embudo:** hoy se consulta por SQL (ejemplo al final de la migración); falta una vista o panel interno.
5. Validar con Nahuel/Facu el copy nuevo de la landing (cambia la acción principal a la demo) y la frase «probás sin cargo» del registro.
6. Playwright E2E del recorrido demo → registro → activación.
