# Preparar el repositorio para delegar frontend

**Estado: completado y cerrado.** La arquitectura está definida en [architecture.md](../../architecture.md). El [PRD v1.5](../GALCOA-PRD-v1.4.md) gobierna producto. Este plan preparó el trabajo paralelo de un líder y un colaborador; no implementa todo el MVP ni flujos de negocio del backend.

## Resultado esperado

Desde un clon limpio, el colaborador puede instalar dependencias, abrir una previsualización local con datos ficticios, desarrollar únicamente la presentación autorizada en su ticket y ejecutar checks sin credenciales. El líder puede integrar esa presentación con datos reales sin cambiar sus props ni trasladar autoridad de negocio al navegador.

No se crean Issues en esta preparación. Al terminar, se prepara el primer ticket frontend autocontenido; los pasos propios del líder se gestionan aquí, sin exigir un Issue por paso. Specs y diseños adicionales solo cuando resuelvan ambigüedad: este plan y la arquitectura son las referencias iniciales.

## Base comprobada

- Next 16.4.2, React 19, Tailwind v4 y shadcn `base-nova`; se conserva `src/` y `cn`.
- Existen `lint`, `typecheck` y `build`; no hay contratos, features, mocks, tests, CI ni preview.
- `.env.example` no está versionado. No se inspeccionan `.env` ni `.env.local`.
- La [deuda técnica](../tech-debt-tracker.md) registra desviaciones y resultados históricos de auditoría, que deben verificarse al cambiar dependencias.
- Esta exploración comprobó lint y tipos; no se atribuye un build nuevo a este plan.

## Propiedad y secuencia

Todos los pasos de preparación los implementa el líder. El colaborador empieza después de superar la puerta de delegación. Propiedad y dependencias permitidas se mantienen únicamente en [arquitectura](../../architecture.md#árbol-objetivo-y-propiedad).

```text
P1 Base y entorno → P2 Checks y barreras → P3 Primer contrato y escenarios
                                            ↓
                           P4 Preview y ejemplo → P5 CI y entrega
```

P2 y P3 pueden avanzar en paralelo una vez fijada la base si no modifican los mismos manifiestos. Para dos personas no se necesita un monorepo ni paquetes independientes.

## P1 — Base reproducible y entorno seguro

- [x] Fijar Node LTS compatible y disponible al ejecutar, igual local/CI, mediante un archivo de versión y `engines`; documentar npm compatible con el lockfile. No actualizar Next/React mayores como parte de esto.
- [x] Agregar Zod y las dependencias de desarrollo seleccionadas para P2/P4 de forma coherente; revisar compatibilidad con React/Next instalados y resolver el lockfile con npm.
- [x] Revisar imports antes de retirar dependencias no consumidas: candidatos `@ai-sdk/groq`, agent kits de Hedera y pagos. Conservar `cn` y dependencias usadas por shadcn. SDK `ai`, `@ai-sdk/react` y `groq-sdk` se incorporan con su consumidor real; no son requisito para un dashboard visual.
- [x] Recalcular necesidad de overrides tras la limpieza; no retirar un override vigente sin revisar el árbol y la auditoría resultante. No usar `audit fix --force`.
- [x] Versionar una `.env.example` generada desde los nombres del PRD, vacía salvo `HEDERA_NETWORK=testnet`; no copiar ni leer secretos locales. Agregar excepción `!.env.example` a `.gitignore`.
- [x] Documentar instalación con `npm ci`. El desarrollo de presentación no debe requerir configurar ni validar claves de servicios.

**Archivos:** `package.json`, `package-lock.json`, archivo de versión Node, `.gitignore`, `.env.example`, README/guía de desarrollo y tracker si cambia la deuda.

**Aceptación:** instalación reproducible con npm; plantilla incluida en Git sin valores privados; lint, tipos y build pasan. Registrar auditoría completa y `--omit=dev`, distinguiendo incidencias nuevas de deuda aceptada. Cero vulnerabilidades reportadas no se interpreta como prueba absoluta de seguridad.

## P2 — Tests y límites comprobables

- [x] Configurar Vitest: entorno Node para contratos y reglas puras, jsdom para UI. Incorporar Testing Library y setup DOM; resolver `@/*` igual que TypeScript. Configurar Playwright con Chromium, `webServer`, timeouts y trazas en fallos; separar proyectos de preview y Next.
- [x] Agregar `test` (Vitest, una ejecución finita), `test:watch` (solo local), `test:boundaries` y `test:e2e` (Playwright); mantener scripts existentes. Instalar el navegador de Playwright de forma reproducible, incluyendo dependencias del sistema en CI.
- [x] Implementar restricciones ESLint y tests de dependencias para la separación de arquitectura: presentación/contratos sin servidor, SDK, entorno ni red; producto sin fixtures/preview; servidor marcado `server-only` cuando se cree.
- [x] Probar casos permitidos y rechazados, incluidos alias, rutas relativas y reexports transitivos. Un helper no debe permitir evadir las restricciones. Evitar una infraestructura propia de análisis mayor que la necesaria; usar resolución real de módulos en los checks que deban seguir dependencias.
- [x] Crear pruebas iniciales reales, no una suite vacía que pasa con `passWithNoTests`. No tratar pruebas DOM como verificación de RLS, HCS o componentes de servidor asíncronos.

**Archivos:** configuración Vitest/Playwright/ESLint, setup de pruebas, `tests/boundaries/`, `tests/e2e/`, scripts/manifiestos compartidos. Ninguno pertenece al colaborador inicial.

**Aceptación:** los comandos terminan y fallan ante un caso negativo sembrado; retirar el caso negativo restaura verde. No necesitan secretos ni llamadas a proveedores. Los tests de Server Components asíncronos se cubren posteriormente por integración/E2E, no se promete soporte de Vitest inexistente.

## P3 — Contrato mínimo y escenarios del primer ticket

- [x] Definir en `src/lib/contracts/` el DTO Zod de resumen de documento y dimensiones de estado necesarias para dashboard; exportar tipos inferidos. Campos materiales desconocidos no se vuelven obligatorios para finalizar por contenido.
- [x] Separar DTO de dominio de props de presentación. Publicar el contrato de props bajo control del líder antes del ticket: entradas serializables y callbacks de abrir/crear originados en cliente. No definir endpoints falsos ni obligar a UI a importar tipos de Supabase.
- [x] Crear escenarios compartidos en `src/mocks/`: lista vacía, carga, error técnico recuperable, entrega comercial contradictoria, medición sin unidad, confirmaciones pendientes y versión finalizada con sello pendiente/registrado. Usar datos fijos ficticios, IDs y fechas estables.
- [x] Validar los fixtures contra Zod. Distinguir estados de carga de UI de estados de negocio; no inventar enums nuevos de producto para satisfacer un mock.
- [x] Incluir tests de que discrepancias materiales se conservan visibles y las dimensiones no se confunden. Los estados en fixtures son ejemplos, no un motor de confirmaciones ni una prueba de las invariantes de persistencia.

**Archivos:** `src/lib/contracts/`, `src/mocks/`, `tests/contracts/`. Los props se ubican en `src/features/dashboard/contracts/` o archivo explícito equivalente, reservado al líder y fuera de la allowlist de componentes.

**Aceptación:** escenarios válidos, fixture inválido rechazado y ninguna dependencia React/Next/SDK/env en contratos de dominio. La UI puede renderizar con DTO y callbacks sin proveedor ni endpoint implementado.

Antes de delegar snapshot e historial se repite este paso para sus propios contratos y escenarios; no se diseña ahora toda la base de datos ni se bloquea el primer ticket por contratos ajenos.

## P4 — Preview local y referencia mínima de integración

- [x] Configurar el entrypoint Vite de arquitectura en `preview/`, fuera de `src/app/`, reutilizando CSS/primitivas reales. Respetar loopback, solo development y sin carga/inyección de entorno. Agregar `preview:ui`; no crear un build/export de preview.
- [x] Proporcionar selector explícito de escenarios y un componente mínimo de referencia con sus tests. La referencia muestra patrones de props, callbacks locales, estados visuales y accesibilidad; no implementa el dashboard completo que se va a delegar.
- [x] Mantener registros/selector del preview bajo control del líder. Al preparar cada ticket, dejar previamente conectado su entrypoint al contrato acordado; no obligar al colaborador a editar configuración global para ver su tarea.
- [x] Verificar que estilo Tailwind y componentes base-nova funcionen en Vite; aislar o evitar imports Next específicos en las presentaciones. Los adapters de navegación viven fuera de ellas.
- [x] Probar con entorno de servicios ausente: carga/render y cambio de escenarios sin red externa, sin persistencia y con indicador visible de datos ficticios. No incluir dobles de agentes, tokens reales ni secretos.
- [x] Añadir smoke Playwright de render real del preview, cambio de escenarios y callbacks locales, con evidencias de fallo. Probar también el arranque de Next sin credenciales, sin confundir la plantilla con flujos de negocio implementados. Publicar pasos de capturas manuales; HTTP 200 no basta como evidencia de render.
- [x] Ejecutar build Next para detectar contaminación de producto por fixtures o imports de preview; comprobar barreras y que no se agregaron rutas mock en la aplicación.

**Archivos:** `preview/`, configuración Vite, feature de ejemplo mínima, tests y scripts. Configuración y registro de previews permanecen reservados al líder.

**Aceptación:** desde un clon limpio se puede inspeccionar UI sin `.env`; llamadas locales de demostración no fabrican acciones reales. El servidor rechaza uso de preview no-development, se limita a loopback y se limpia después del smoke. Tests y build Next pasan.

## P5 — CI, entrega y puerta de delegación

- [x] Crear GitHub Actions para PR/push con versión Node acordada, `npm ci`, lint, tipos, tests/barreras, build y Playwright. No usar secretos ni llamar IA, Supabase o Hedera. Definir timeout y permisos mínimos de lectura.
- [x] Instalar Chromium y dependencias del sistema en CI e integrar Playwright con arranque acotado y limpieza de procesos propios; no reutilizar un servidor ajeno como evidencia. Guardar reportes/trazas de fallos con retención acotada y datos ficticios. Si build necesita descargar fuentes, distinguir esa dependencia de red de una llamada a servicios con credenciales y documentar el requisito del runner.
- [x] Agregar plantilla de Issue de delegación y de PR. Deben pedir enlaces al PRD/plan, spec/diseño cuando aplican, alcance, allowlist, contratos, escenarios, aceptación, validaciones y evidencia visual. No crear Issues de trabajo propios del líder por defecto.
- [x] Agregar `CODEOWNERS` con `@nanonoir` para superficies compartidas/sensibles. No inventar handle del colaborador. Documentar que el archivo no otorga permisos ni activa protección de ramas.
- [x] Reconciliar AGENTS, README, arquitectura y guía de desarrollo con lo realmente implementado; mantener acceso con cualquier agente, sin skills/subagentes obligatorios.
- [x] Ensayar desde un checkout limpio que solo contenga archivos versionados, sin entorno local. Registrar versiones, comandos, resultados y límites; no reutilizar cachés o archivos ignorados como evidencia suficiente de onboarding.

**Archivos:** `.github/workflows/`, templates Issue/PR y CODEOWNERS, documentación y scripts de smoke cuando se necesiten.

**Aceptación para entregar al colaborador:**

- [x] Clon limpio → `npm ci` → `npm run preview:ui` funciona sin credenciales.
- [x] Contrato, escenarios, props y entrypoint de la primera tarea existen y están probados.
- [x] `lint`, `typecheck`, `test`, `test:boundaries`, `build` y `test:e2e` pasan; CI ejecuta los mismos checks (validado localmente en clon limpio; ejecución remota en CI pendiente).
- [x] La allowlist exacta de la tarea no incluye contratos, containers, mocks compartidos, rutas o configuración.
- [x] El ticket indica cómo pedir una ampliación sin tocar archivos compartidos por iniciativa propia.
- [x] El líder conoce los límites: preview no prueba integración Next, permisos ni servicios reales.
- [ ] Acceso del colaborador al repositorio confirmado antes de asignarle un Issue; handle pendiente no impide preparar la base. *(Pendiente externo: confirmación de handle y permisos de acceso del colaborador por fuera de este repositorio).*

Configurar branch protection o permisos de GitHub es una acción remota aparte: requiere autorización y comprobación efectiva. No se modifica como efecto secundario de agregar workflow/CODEOWNERS. Este plan no autoriza push, PR ni merge.

## Primeras entregas delegables (solo al estar listas)

| Entrega | Allowlist candidata del ticket | Requisito previo |
| --- | --- | --- |
| Dashboard vacío/lista y estados | `src/features/dashboard/components/`, fixtures locales autorizados y tests de esos componentes | P1–P5 y contrato dashboard |
| Snapshot completo y advertencias | Archivos específicos de `src/features/documents/components/` y sus tests/fixtures locales | Contrato de revisión y escenarios publicados por líder |
| Historial de versiones | Otros archivos específicos de `src/features/documents/components/` y sus tests/fixtures locales | DTO histórico y escenarios publicados; no solapar archivos con snapshot |

Estas rutas son candidatas, no permiso abierto sobre la carpeta. Cada Issue enumera archivos o subcarpetas concretas, criterios verificables, estados de carga/vacío/error, responsive y accesibilidad. Auth, chat conectado, confirmación pública y verificador real no son primeras tareas sencillas. Integrarlos corresponde al líder con planes propios.

## Riesgos y reversibilidad

- **Contrato cambia:** acordar primero la modificación, actualizar fixtures/preview y coordinar la rama del colaborador; no introducir un contrato incompatible mientras una tarea lo consume.
- **Vite/Tailwind incompatible:** resolver la referencia mínima antes de delegar. Si exige un segundo sistema visual o cambios extensos, revisar la decisión en arquitectura; no ocultar divergencias con CSS duplicado.
- **Restricciones demasiado amplias:** mantener pruebas de imports permitidos para no bloquear UI legítima; permisos del servidor siguen siendo necesarios aunque lint pase.
- **Auditoría:** registrar deuda remanente y aumentos; nunca ignorar todo audit para obtener verde ni forzar downgrades.
- **Rollback:** separar cambios coherentes P1–P5 en commits al entregar. Revertir solo la unidad fallida y sus consumidores dependientes, sin borrar trabajo ajeno ni retirar barreras para conseguir que compile. No hay migraciones ni datos reales que revertir en esta preparación.

## Progreso e integración

- **P1 (Base y entorno):** Completado el 2026-10-16. Node `24.18.0` fijado en `.nvmrc` y `engines` (`node >=24.18.0 <25`, `npm >=11`). `zod@4.6.7` añadido. Retiradas dependencias no consumidas (`@ai-sdk/groq`, agent kits de Hedera, `mercadopago`, `stripe`). Overrides de `@modelcontextprotocol/sdk` y `ws` mantenidos. `.env.example` generado a partir de PRD §13 y versionado. `.env.example.local` preservado e ignorado sin leer secretos.
- **P2 (Tests y límites):** Completado el 2026-10-16. Vitest configurado con proyectos Node y jsdom. Playwright configurado con proyectos `preview` y `next`. Reglas ESLint (`eslint.config.mjs`) y análisis estático de dependencias de TypeScript (`tests/boundaries/`) implementados y probados con casos permitidos y negativos. Scripts `test`, `test:watch`, `test:boundaries` y `test:e2e` operativos.
- **P3 (Contrato mínimo y escenarios):** Completado el 2026-10-16. DTOs creados en `src/lib/contracts/` (`document.ts`, `dashboard.ts`). Props de vista en `src/features/dashboard/contracts/dashboard-view.ts`. Ocho escenarios probados en `src/mocks/dashboard.ts` validando dimensiones de estado ortogonales y preservación de advertencias materiales (INV-02, INV-10).
- **P4 (Preview local y referencia):** Completado el 2026-10-16. Entrypoint Vite en `preview/` con loopback estricto y sin inyección de entorno. Selector de escenarios y componente `src/features/dashboard/components/dashboard-reference.tsx` implementados con tests de accesibilidad y callbacks. Suite Playwright del preview verificada.
- **P5 (CI y entrega):** Completado el 2026-10-16. Workflow `.github/workflows/ci.yml` configurado con permisos mínimos. Templates de PR e Issue creados. `CODEOWNERS` agregado con `@nanonoir`. Documentación (`README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/development.md`) actualizada y alineada. Borrador local del primer ticket en `docs/tasks/dashboard-presentation.md`.
- **Revisión de contratos y CI:** Sesión `ses_ebc3cb03affe77IAD13mad3H5R` dictaminó PASS sin objeciones.
- **Revisión de tooling y pruebas:** Sesión `ses_ebc368735ffe0W82U40YLYfcjA` dictaminó PASS WITH FINDINGS, destacando dos observaciones no bloqueantes registradas en el tracker de deuda técnica (aviso informativo de TypeScript en Vite y discrepancia menor de extensión en manifest vs graph).
- **Validación final en copia limpia:** Ejecutada sobre `Temp/opencode/galcoa-readiness-xLnH4u` conteniendo únicamente archivos versionables: `npm ci` instaló 845 paquetes limpiamente. Lint, typecheck (con corrección `next typegen && tsc --noEmit`), 91 tests Vitest, 51 tests de barreras, build Next.js (rutas `/` y `/_not-found`) y 15/15 tests Playwright (13 preview y 2 smoke Next tras ajustar ruta negativa 404 a `request.get`) pasaron en verde. Puertos 4173 y 3100 liberados. Auditoría de producción reportó 0 vulnerabilidades.

---

## Implementation Outcome

### Implemented

Se completó integralmente la preparación técnica del espacio de trabajo para habilitar el desarrollo frontend colaborativo y seguro conforme a las 5 fases planificadas (P1–P5):

1. **Base y entorno seguro (P1):**
   - Node fijado en `24.18.0` vía `.nvmrc` y `engines` en `package.json` (`node >=24.18.0 <25`, `npm >=11`).
   - Incorporación de `zod@4.6.7` en dependencias de producción.
   - Retiro seguro de dependencias innecesarias para P0 (`@ai-sdk/groq`, `@hashgraph/hedera-agent-kit`, `@hashgraph/hedera-agent-kit-ai-sdk`, `mercadopago`, `stripe`). Overrides de seguridad de `@modelcontextprotocol/sdk` y `ws` mantenidos.
   - Creación de `.env.example` versionado derivado estrictamente de PRD §13, vacío salvo `HEDERA_NETWORK=testnet`. Excepción `!.env.example` añadida a `.gitignore`. El archivo local previo se preservó como `.env.example.local` (ignorado) sin leer secretos.
2. **Infraestructura de pruebas y barreras arquitectónicas (P2):**
   - Configuración de Vitest (`vitest.config.ts`) con entornos diferenciados: Node para contratos/reglas y jsdom para componentes UI. Setup DOM con Testing Library y resolución de alias `@/*`.
   - Configuración de Playwright (`playwright.config.ts`) con Chromium y aislamiento en dos proyectos (`preview` en puerto 4173 y `next` en puerto 3100).
   - Enforce de barreras de arquitectura mediante ESLint (`eslint.config.mjs`) y análisis estático del grafo de dependencias de TypeScript (`tests/boundaries/`): presentación y contratos aislados de paquetes de servidor (`server-only`), SDKs de IA, base de datos, Node builtins, globals de red (`fetch`, `process`) y variables de entorno.
   - Scripts agregados y probados: `test`, `test:watch`, `test:boundaries`, `test:e2e`.
3. **Contratos mínimos y escenarios del dashboard (P3):**
   - DTOs Zod en `src/lib/contracts/` (`document.ts`, `dashboard.ts`) con tipado inferido y dimensiones ortogonales de estado.
   - Contrato de presentación en `src/features/dashboard/contracts/dashboard-view.ts` con props serializables y callbacks cliente (`onCreate`, `onOpen`, `onRetry`).
   - Ocho escenarios representativos en `src/mocks/dashboard.ts` cubriendo estados de carga, vacío, error recuperable, contradicción comercial, medición sin unidad, confirmaciones pendientes y versiones finalizadas con sello pendiente/registrado.
   - 27 pruebas de contratos y mocks que garantizan la visibilidad de advertencias materiales (INV-02, INV-10).
4. **Preview local y componente de referencia (P4):**
   - Entrypoint Vite en `preview/` aislado de `src/app/`, vinculado a primitivas visuales reales de shadcn y estilos Tailwind, restringido a loopback y modo development.
   - Selector interactivo de escenarios y componente de referencia `src/features/dashboard/components/dashboard-reference.tsx` con sus pruebas unitarias y de accesibilidad.
   - Pruebas Playwright browser de preview y smoke de Next.js sin requerir credenciales ni backend activo.
5. **CI y delegación frontend (P5):**
   - Flujo de GitHub Actions en `.github/workflows/ci.yml` ejecutando lint, typecheck, tests unitarios, barreras de arquitectura, build de Next.js y tests E2E de Playwright con retención acotada de reportes y permisos mínimos de lectura (`contents: read`).
   - Plantillas de Issue (`.github/ISSUE_TEMPLATE/delegated-task.md`) y PR (`.github/PULL_REQUEST_TEMPLATE.md`).
   - Archivo `CODEOWNERS` asignando superficies críticas a `@nanonoir`.
   - Documentación sincronizada (`README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/development.md`) y borrador local de la primera tarea delegable en `docs/tasks/dashboard-presentation.md`.

### Deviations from Design

1. **Ajuste en script de comprobación de tipos (`npm run typecheck`):**
   - *Desviación:* Se modificó el comando a `next typegen && tsc --noEmit`.
   - *Causa:* En Next.js 16 (App Router), en un clon limpio sin un build previo, `app/layout.tsx` requiere los tipos generados de Next (`LayoutProps`). Sin ejecutar `next typegen`, `tsc` fallaba estáticamente. Se alineó con la documentación oficial de Next 16 para verificación de tipos sin requerir un build completo.
2. **E2E smoke de rutas negativas en Next.js (`tests/e2e/next-smoke.spec.ts`):**
   - *Desviación:* La verificación de rutas inexistentes (404) se realizó mediante `request.get` de Playwright en lugar de navegación de página con `page.goto`.
   - *Causa:* La navegación del navegador a rutas 404 generaba errores de consola esperados por la prueba, pero que disparaban el guard global estricto contra errores de consola. El uso de `request.get` comprueba el código HTTP 404 exacto sin relajar la protección contra errores no controlados en la consola del navegador.
3. **Declaración explícita de plugins de ESLint:**
   - *Desviación:* Se declararon explícitamente en `devDependencies` de `package.json` los plugins de ESLint referenciados directamente por `eslint.config.mjs` (`@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`).
   - *Causa:* Evita depender de resolución de módulos transitiva implícita instalada por `next`, garantizando reproducibilidad en cualquier gestor o runner.
4. **Postergación de instalación de dependencias de IA:**
   - *Desviación:* Los paquetes `ai`, `@ai-sdk/react` y `groq-sdk` no se incorporaron al `package.json` en P1.
   - *Causa:* Se aplazó su inclusión hasta la implementación de sus consumidores reales en el backend de chat, manteniendo el árbol de dependencias acotado para el trabajo frontend delegado.

### Validation

- **Revisión de contratos, base y CI:** Dictamen PASS independiente emitido en la sesión `ses_ebc3cb03affe77IAD13mad3H5R`.
- **Revisión de herramientas y entorno:** Dictamen PASS WITH FINDINGS emitido en la sesión `ses_ebc368735ffe0W82U40YLYfcjA`, validando ausencia de bloqueos críticos y señalando dos hallazgos menores registrados en la deuda técnica.
- **Validación final en clon limpio en `Temp/opencode/galcoa-readiness-xLnH4u`:**
  - `npm ci`: Instaló 845 paquetes de forma limpia, determinista y reproducible desde archivos versionables.
  - `npm run lint`: Verde (0 errores, 0 advertencias).
  - `npm run typecheck` (`next typegen && tsc --noEmit`): Verde.
  - `npm test`: 91 tests pasaron en Vitest (pruebas de contrato, mocks y componentes de referencia).
  - `npm run test:boundaries`: 51 pruebas de barreras de arquitectura pasaron (enforcement de aislamiento entre capas y reglas de imports).
  - `npm run build`: Compilación Next.js 16 verde (generación estática limpia de rutas `/` y `/_not-found`).
  - `npm run test:e2e`: 15/15 pruebas Playwright pasaron (13 pruebas browser de escenarios y accesibilidad en preview y 2 pruebas smoke de Next.js).
  - Verificación de puertos de red: Puertos 4173 y 3100 confirmados como libres tras la ejecución de las suites.
  - Seguridad y auditoría de paquetes: `npm audit --omit=dev` reportó 0 vulnerabilidades. La auditoría completa reporta 9 vulnerabilidades altas dev conocidas en `braces` vía `fast-glob` (herramientas de desarrollo de linting/build; no forman parte de los bundles cliente ni artefactos de producción; audit no se toma como prueba de seguridad absoluta).
  - Integridad documental: 48 enlaces internos comprobados; bloque de instrucciones de agente de Next.js conservado intacto.
  - Límites de ejecución: No se realizaron commits, push, creación de Issues remotos, runs en GitHub Actions ni cambios en branch protection.

### Follow-up

- **Condiciones externas pendientes:**
  - Confirmación del handle de GitHub del colaborador frontend e invitación formal con permisos de acceso al repositorio.
  - Acompañamiento visual: El líder técnico debe adjuntar o acordar la referencia visual y de acabado estético antes de publicar el borrador local `docs/tasks/dashboard-presentation.md` como Issue.
- **Configuración remota en GitHub:**
  - Ejecución remota del workflow CI en los runners de GitHub Actions al abrir el primer Pull Request.
  - Activación de branch protection rules en GitHub y verificación de la asignación de revisión mediante `CODEOWNERS`.
- **Implementación funcional futura:**
  - La base técnica queda preparada exclusivamente para el onboarding y desarrollo frontend aislado. La implementación del backend MVP, base de datos Supabase, reglas de negocio P0 (REQ-01 a REQ-17), chat con agentes de IA y notarización en Hedera Testnet (REQ-18) se implementarán en planes de ejecución posteriores.
