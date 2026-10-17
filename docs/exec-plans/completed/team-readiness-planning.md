# Definir arquitectura y preparación para trabajo en equipo

## Objetivo y alcance

Definir, a partir del PRD v1.5 y del repositorio actual, límites técnicos y carpetas de trabajo para un líder de integración y un colaborador frontend. Entregar un plan ejecutable de preparación; no implementar el MVP, crear Issues ni cambiar código o dependencias en este trabajo.

Fuente de producto: [PRD](../GALCOA-PRD-v1.4.md). La [arquitectura](../../architecture.md) registra decisiones técnicas; los planes registran ejecución, sin duplicar requisitos.

## Pasos

- [x] Leer PRD y documentación actual e iniciar exploración del repositorio.
- [x] Contrastar hallazgos y definir arquitectura, propiedad de archivos y contratos.
- [x] Documentar un plan de implementación de la base para colaboración con dependencias, aceptación y validación ([Plan de preparación](team-workspace-readiness.md)).
- [x] Revisar coherencia y enlaces; cerrar este plan de definición sin declarar implementada la preparación.

## Validación

Revisión independiente de correspondencia con el PRD, estado real, límites cliente/servidor, trabajo con mocks sin credenciales y secuencia delegable. Comprobar enlaces locales y diff documental. No se requieren checks de aplicación si solo cambia Markdown.

## Progreso y decisiones

- El colaborador recibe tareas frontend sencillas y acotadas; el líder conserva contratos, rutas/integración, seguridad y servicios.
- Issues solo para trabajo delegado. Specs y diseños se crean cuando aclaran requisitos o decisiones; no hay un pipeline obligatorio por ticket.
- Arquitectura actualizada con límites de presentación/container/servidor, propiedad por archivo, DTO serializables, preview Vite local aislado de entorno y herramientas futuras. No se implementó código ni se instalaron dependencias.
- Se redactó el plan futuro ejecutable de 5 fases (P1 a P5) en [team-workspace-readiness.md](team-workspace-readiness.md) para la preparación efectiva de la base de colaboración.
- Se incorporó la aclaración de herramientas de tests solicitada por el usuario (Vitest para unit/componentes y Playwright para navegador/E2E, con Vite exclusivo para preview local).
- Revisión independiente aprobada con veredicto PASS (sesión `ses_ebc4c115affe7ZaWWx6Ifyv0BM`), incorporando la sugerencia mínima de reflejar `tests/e2e` en la tabla de propiedad de `docs/architecture.md`.
- Plan de definición concluido y archivado en `docs/exec-plans/completed/team-readiness-planning.md`.

## Implementation Outcome

### Implemented

Se completó la definición de la arquitectura de colaboración y la planificación de la preparación técnica del entorno de trabajo para el equipo (líder de integración y colaborador frontend):
- `docs/architecture.md`: documentó la arquitectura de aplicación única Next.js 16 con `src/`, propiedad explícita de archivos inicial asignada a `@nanonoir`, límites entre presentación, client containers y servicios de servidor (`server-only`), contratos DTO Zod serializables sin instancias de runtime complejas, preview local aislado mediante Vite (en loopback, sin credenciales) y criterios objetivos para la delegación de tickets frontend. Se incluyó `tests/e2e` en la tabla de propiedad de pruebas bajo el líder.
- `docs/development.md` y `docs/README.md`: alineados con las herramientas futuras explicitadas (Vitest para tests unitarios/componentes, Playwright para navegador/E2E y Vite para preview local) y enlazados al plan de preparación activo.
- `docs/exec-plans/completed/team-workspace-readiness.md`: redactado inicialmente en `active/` como plan ejecutable en 5 fases (P1 Base y entorno, P2 Tests y límites comprobables, P3 Contrato mínimo y escenarios, P4 Preview y referencia mínima, P5 CI y puerta de delegación), y posteriormente implementado y archivado.

### Deviations from Design

None. La definición respeta el PRD v1.5 y las decisiones técnicas de aplicación única sin introducir dependencias, código ni cambios de configuración antes de su ejecución planificada.

### Validation

- Revisión independiente completada con resultado PASS sin bloqueos (sesión `ses_ebc4c115affe7ZaWWx6Ifyv0BM`), incorporando la sugerencia mínima de listar `tests/e2e` en la tabla de propiedad de `docs/architecture.md`.
- Enlaces relativos y anclas de la documentación verificados.
- Formato y diff comprobados mediante `git diff --check`.
- Comprobación estática de `npm run lint` y `npm run typecheck` pasando sin errores. No se ejecutó un build nuevo ya que los cambios corresponden exclusivamente a documentación.

### Follow-up

- La implementación técnica se llevó a cabo siguiendo las fases P1 a P5 del plan archivado en `docs/exec-plans/completed/team-workspace-readiness.md`.
- No se registraron deudas técnicas nuevas ni se modificaron código, dependencias o secretos.
