# Desarrollo, validación y seguridad

La [arquitectura](architecture.md) define límites y propiedad. Esta guía explica cómo desarrollar presentación sin credenciales; no acredita integraciones reales del PRD.

## Inicio desde un clon limpio

1. Usar Node **24.18.0** (`.nvmrc`) y npm **>=11**; lockfile generado con npm 11.16.0.
2. Ejecutar `npm ci`. No copiar `.env` para desarrollar presentación.
3. Ejecutar `npm run preview:ui` y abrir la URL de loopback indicada por Vite.
4. Elegir un escenario ficticio y trabajar solo en los archivos autorizados por la tarea.
5. Ejecutar los checks relevantes y entregar resultados reales, no supuestos.

La aplicación Next se inicia por separado con `npm run dev`; aún muestra la plantilla, no el dashboard del preview. Vite sirve exclusivamente la previsualización local, Vitest ejecuta unidades/componentes y Playwright prueba navegador/E2E. Ninguna herramienta exige un agente específico.

## Escenarios y autoridad

`src/mocks/dashboard.ts` contiene ocho escenarios: carga, error, vacío, entrega comercial contradictoria, medición sin unidad, confirmaciones pendientes y versión finalizada con HCS pendiente/registrado. Sus DTO se validan con Zod. Props de la presentación en `src/features/dashboard/contracts/dashboard-view.ts`.

Los callbacks del preview solo muestran eventos locales y no persisten. Rechazo, confirmación, finalización y HCS reales se implementarán en servidor. No llevar fixtures a rutas de producto ni simular éxito cuando falle un proveedor. Contratos y registro del preview los cambia el líder; el colaborador pide ampliación del ticket si los necesita modificar.

## Checks según el cambio

| Cambio | Validación |
| --- | --- |
| Solo Markdown | Enlaces locales, coherencia y diff sin secretos |
| Contratos, escenarios, componentes o utilidades | `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries` |
| Rutas, configuración, dependencias o CSS global | Los anteriores y `npm run build` |
| Interacciones o preview/navegación | Los anteriores y `npm run test:e2e` |
| Lógica crítica futura | Tests deterministas del PRD §12, con proveedores simulados; integración real solo cuando esté autorizada |

`npm test` es finito. `npm run test:watch` solo se usa localmente. Vitest no verifica Server Components asíncronos ni aislamiento RLS real; Playwright y pruebas de integración cubrirán los flujos al implementarlos. La evaluación de IA sigue separada, sin llamadas a modelos en cada PR.

`typecheck` ejecuta `next typegen` antes de TypeScript: genera `next-env.d.ts` y tipos de rutas como `LayoutProps` desde un clon limpio, sin depender de un build/dev previo ni versionar archivos generados.

## Navegador y CI

Instalar Chromium antes de la primera ejecución: `npx playwright install chromium`. Linux/CI: `npx playwright install --with-deps chromium`. Playwright arranca y limpia sus servidores propios; si el puerto ya está ocupado, resolver la colisión sin terminar procesos ajenos. No reutilizar una instancia desconocida para obtener un resultado verde.

El workflow `.github/workflows/ci.yml` define `npm ci`, lint, tipos, Vitest, barreras, build y Playwright en Ubuntu, sin secretos de aplicación. Descargas de npm, Chromium y fuentes de `next/font` requieren red pública; no son llamadas a Supabase, IA o Hedera con credenciales. Evidencia browser fallida tiene retención de siete días y debe contener únicamente datos ficticios.

La ejecución Linux en GitHub se comprobará después de una publicación autorizada. Un workflow y `CODEOWNERS` no activan protección de ramas ni otorgan permisos. No afirmar CI remoto verde sin un run real.

## Entorno y seguridad

- `.env` y `.env.local` permanecen ignorados y no se leen ni imprimen desde agentes. `.env.example` se versiona con nombres del PRD, vacíos salvo `HEDERA_NETWORK=testnet`.
- Solo `NEXT_PUBLIC_*` puede llegar al cliente; claves IA/Hedera y futuras claves privilegiadas Supabase son exclusivamente de servidor.
- La plantilla local anterior se preservó sin inspeccionarla como `.env.example.local`, ignorada. Quien clone no necesita ese archivo.
- Preview sin carga de archivos de entorno ni inyección de secretos; datos ficticios, sin persistencia y solo loopback. No sirve para compartir una demo por red.
- Supabase Auth/RLS, migraciones, rutas, integraciones y claves solo dentro del alcance explícito del pedido/ticket del líder. HCS únicamente Testnet, sin herramientas abiertas para agentes (INV-04).
- Auditoría: registrar resultado completo y de producción por separado. Las incidencias dev conocidas no se ocultan ni justifican `npm audit fix --force`; consultar [deuda](exec-plans/tech-debt-tracker.md).

## Entrega del colaborador

Issue con objetivo, referencias, allowlist, props, escenarios y aceptación → rama corta → PR con checks y capturas → revisión/merge del líder. La [plantilla de Issue](../.github/ISSUE_TEMPLATE/frontend-task.md) y la [plantilla de PR](../.github/pull_request_template.md) ayudan a no depender de esta conversación.

El líder puede preparar infraestructura desde un pedido/plan sin crear Issues para cada paso. Diferencias de dependencias se resuelven en ese alcance explícito, no como limpieza oportunista. Los SDK de IA faltantes se agregan con su consumidor, no para trabajar sobre componentes visuales.

[Índice](README.md) · [Arquitectura](architecture.md) · [PRD](exec-plans/GALCOA-PRD-v1.4.md)
