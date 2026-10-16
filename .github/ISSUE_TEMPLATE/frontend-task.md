---
name: Tarea frontend delegada
about: Entrega acotada de presentación con contrato y escenarios preparados
title: "feat(ui): "
---

## Objetivo

Resultado visible y alcance. No comenzar si faltan contrato, escenarios o entrypoint de preview.

## Referencias

- PRD y REQ/INV aplicables:
- Plan aplicable:
- Spec/diseño cuando elimina ambigüedad; si no aplica, indicarlo:
- Contrato de props y DTO (rutas/exportaciones):
- Escenarios y comando/selector para abrir la tarea:

## Archivos autorizados

Enumerar archivos o subcarpetas concretas de componentes, sus tests y fixtures locales. Una feature completa no es permiso implícito.

## Fuera de alcance

Contratos, containers, mocks compartidos, rutas, servicios, configuración global, manifiestos y lockfile, CI y migraciones. No leer secretos, llamar proveedores ni inventar endpoints o reglas. Ante una necesidad fuera de la allowlist, pedir ampliación al líder.

## Datos y acciones

- Props y callbacks permitidos:
- Datos y advertencias que deben permanecer visibles:
- Interacciones locales y resultado observable:

## Aceptación

- [ ] Estados de carga, vacío, error y datos definidos por los escenarios.
- [ ] Responsive y teclado/semántica accesibles según la tarea.
- [ ] Sin autoridad de negocio, red, SDK, secretos ni persistencia en presentación.
- [ ] Tests de componente y casos negativos relevantes.
- [ ] Capturas o video con escenarios/tamaños indicados por el ticket.

## Validación y entrega

Ejecutar `npm run lint`, `npm run typecheck`, `npm test` y `npm run test:boundaries`; incluir `npm run build` y `npm run test:e2e` cuando corresponda a los archivos/interacciones cambiados. Informar resultados reales y limitaciones.

Rama corta desde `main`, PR vinculado a este Issue y revisión/merge del líder. No hacer push directo a `main` ni ampliar alcance sin autorización.
