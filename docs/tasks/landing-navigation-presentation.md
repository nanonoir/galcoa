# Ficha de delegación: landing y navegación responsive (MVP-114)

**Estado: presentación completada por Facu e integrada por PR [#61](https://github.com/nanonoir/galcoa/pull/61), Issue #29 cerrada.** Aceptación verificada; evidencia y límites en el [plan cerrado](../exec-plans/completed/f11-frontend-presentation-tickets.md#resultado-de-implementación). La lista conserva criterios del ticket, no trabajo pendiente. Reglas: [dashboard-presentation](dashboard-presentation.md), [frontend-delivery](../specs/frontend-delivery.md) (§2–§5, F-04, F-06).

## Objetivo

Landing simple que explique el alcance (documentar operaciones por chat, confirmaciones, sello de huella en Testnet) y dé acceso, con navegación accesible móvil/escritorio. No prometer envío automático, pagos, Mainnet ni certificación.

Referencias: PRD REQ-02 (navegación), §5, §10 (pantallas), §11 (lenguaje).

## Contrato y alcance

- Props (existen): `LandingViewProps { content: LandingContent }` en `src/features/marketing/contracts/landing-view.ts`; esquema `LandingContentSchema` en `src/lib/contracts/landing.ts` (`brand`, `navigation[]`, `primaryAction`, `heading`, `summary`, `features[]`, `limits[]`). Enlaces como **datos** (`NavLink {label, href}`, solo rutas internas o anclas); la presentación no importa `next/link` (barrera) y usa `<a href>`. El menú móvil es estado visual local.
- Escenarios: `landingScenarios` en `src/mocks/marketing.ts` — `public` y `signed-in`. Menú abierto/cerrado y ancho móvil/escritorio cubiertos por tests y capturas. Preview real: «Landing (MVP-114)».

**Allowlist propuesta (a confirmar en el Issue):**

1. `src/features/marketing/components/landing-page.tsx`
2. `src/features/marketing/components/landing-page.test.tsx`
3. `src/features/marketing/components/site-navigation.tsx`
4. `src/features/marketing/components/site-navigation.test.tsx`

La carpeta `marketing` existe con la presentación integrada. **Prohibido:** igual que [snapshot-presentation](snapshot-presentation.md) (incluye rutas `src/app/(marketing)/`, fuera de esta presentación).

## Aceptación

- [ ] Navegación por teclado completa, foco visible, nombres accesibles; el menú móvil devuelve el foco de forma comprensible al cerrarse.
- [ ] Sin desbordamiento horizontal a 360 px; legible a 1280 px.
- [ ] **Test que recorre el render de todos los escenarios** y falla si aparece «certificado», «validado regulatoriamente», «garantizado verdadero», «firma digital» o «identidad verificada».
- [ ] No afirma pagos, Mainnet, envío automático de invitaciones ni que la blockchain garantice que un dato sea verdadero (PRD §1).
- [ ] Enlaces vienen de los datos, no están fijados en el componente.
- [ ] Texto como contenido; sin imágenes ni dependencias nuevas (`package.json` es del líder).
- [ ] Capturas a 360 y 1280 px: menú cerrado y abierto.

## Resolución de preparación

Wireframe técnico y copy de fixtures aceptados, Issue asignada a Facu y preview real conectado. Excepción autorizada: solo import/entrada propia del registro, su prueba y casos E2E, con un único escritor. Navegación de producto sigue en MVP-116; cuota de despliegues Vercel agotada y advertida en #61, sin bloquear presentación local.

## Validación y entrega

Igual que [snapshot-presentation](snapshot-presentation.md#validación-y-entrega).
