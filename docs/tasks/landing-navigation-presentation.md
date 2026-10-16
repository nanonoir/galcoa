# Ficha de delegación: landing y navegación responsive (MVP-114)

**Estado: contrato y escenarios disponibles (probados con Vitest); borrador local sin Issue ni asignación.** Pendientes: referencia visual/copy aprobado y publicación del Issue. Reglas comunes: [dashboard-presentation](dashboard-presentation.md), [frontend-delivery](../specs/frontend-delivery.md) (§2–§5, F-04, F-06) y [plan de tickets](../exec-plans/active/mvp/f11-frontend-presentation-tickets.md).

## Objetivo

Landing simple que explique el alcance (documentar operaciones por chat, confirmaciones, sello de huella en Testnet) y dé acceso, con navegación accesible móvil/escritorio. No prometer envío automático, pagos, Mainnet ni certificación.

Referencias: PRD REQ-02 (navegación), §5, §10 (pantallas), §11 (lenguaje).

## Contrato y alcance

- Props (existen): `LandingViewProps { content: LandingContent }` en `src/features/marketing/contracts/landing-view.ts`; esquema `LandingContentSchema` en `src/lib/contracts/landing.ts` (`brand`, `navigation[]`, `primaryAction`, `heading`, `summary`, `features[]`, `limits[]`). Enlaces como **datos** (`NavLink {label, href}`, solo rutas internas o anclas); la presentación no importa `next/link` (barrera) y usa `<a href>`. El menú móvil es estado visual local.
- Escenarios (existen): `landingScenarios` en `src/mocks/marketing.ts` — `public` y `signed-in`. Menú abierto/cerrado y ancho móvil/escritorio los cubre tu test y las capturas. Preview: «Landing (placeholder, MVP-114)».

**Allowlist propuesta (a confirmar en el Issue):**

1. `src/features/marketing/components/landing-page.tsx`
2. `src/features/marketing/components/landing-page.test.tsx`
3. `src/features/marketing/components/site-navigation.tsx`
4. `src/features/marketing/components/site-navigation.test.tsx`

La carpeta `marketing` es nombre propuesto; no existe hoy. **Prohibido:** igual que [snapshot-presentation](snapshot-presentation.md) (incluye rutas `src/app/(marketing)/`, que monta el líder).

## Aceptación

- [ ] Navegación por teclado completa, foco visible, nombres accesibles; el menú móvil devuelve el foco de forma comprensible al cerrarse.
- [ ] Sin desbordamiento horizontal a 360 px; legible a 1280 px.
- [ ] **Test que recorre el render de todos los escenarios** y falla si aparece «certificado», «validado regulatoriamente», «garantizado verdadero», «firma digital» o «identidad verificada».
- [ ] No afirma pagos, Mainnet, envío automático de invitaciones ni que la blockchain garantice que un dato sea verdadero (PRD §1).
- [ ] Enlaces vienen de los datos, no están fijados en el componente.
- [ ] Texto como contenido; sin imágenes ni dependencias nuevas (`package.json` es del líder).
- [ ] Capturas a 360 y 1280 px: menú cerrado y abierto.

## Huecos

1. Contrato y escenarios ya existen (ver arriba).
2. El líder conectará la entrada del preview a tu componente al integrarlo.
3. Referencia visual y copy aprobado: no fijados; Tomás puede revisar textos.
4. Asignación: ver [índice](README.md).

## Validación y entrega

Igual que [snapshot-presentation](snapshot-presentation.md#validación-y-entrega).
