# Fichas de delegación frontend

Borradores locales; **no son Issues** y no hay números asignados. Cada ficha es una tarea completa, sin subdivisiones artificiales. Plan: [paquete](../exec-plans/completed/f11-frontend-delegation-package.md) · [tickets](../exec-plans/active/mvp/f11-frontend-presentation-tickets.md). Carriles y orden: [team-ticket-order](../execution/team-ticket-order.md).

| ID | Ficha | Contrato / escenarios (verificados con Vitest) | Asignación propuesta (la decide el líder) |
| --- | --- | --- | --- |
| MVP-111 | [dashboard](dashboard-presentation.md) | `DashboardViewProps`, `dashboardScenarios` (8) | Facu (`@jfacundoayala`) |
| MVP-112 | [snapshot](snapshot-presentation.md) | `SnapshotViewProps`, `snapshotScenarios` (7) | Gastón o Facu, según carril libre |
| MVP-113 | [historial](version-history-presentation.md) | `VersionHistoryViewProps`, `versionHistoryScenarios` (6) | Gastón o Facu, según carril libre |
| MVP-114 | [landing](landing-navigation-presentation.md) | `LandingViewProps`, `landingScenarios` (2) | Facu |
| MVP-115 | [acceso](access-forms-presentation.md) | `AuthFormProps<T>`, `authFormScenarios` (18) | Facu |

Gastón: handle de GitHub pendiente de confirmar (no se inventa). Tomás no tiene agente: revisa textos y prueba a mano. Facu es aprendiz con Claude: preferir fichas con aceptación comprobable por tests.

## Cómo arrancar una ficha (Facu / Gastón)

1. `npm run preview:ui` y elegir el componente en el preview. Hoy las entradas de 112–115 son **placeholders que vuelcan el JSON del escenario**; no son UI de producto.
2. Implementar solo los archivos de la allowlist de la ficha; importar contratos de `src/lib/contracts/*` y `src/features/<dominio>/contracts/*`. Para tests, los escenarios de `src/mocks/*` (permitido en tests de presentación).
3. Pedir al líder que cambie la entrada del preview para renderizar el componente (el registro es del líder).

## Referencia visual (wireframe textual, propuesta técnica local)

Wireframes técnicos y layout local definidos por el líder orquestador aceptados como referencia operativa para las primeras entregas. De acuerdo con `AGENTS.md`, no existe aprobación humana obligatoria; la referencia visual es una pauta técnica interna que sirve de base directa a los implementadores, no un requisito exterior bloqueante. Reglas: tarjetas shadcn existentes, un solo acento, texto siempre junto al color, 360 px en una columna.

- **Snapshot (112):** encabezado con título y cuatro insignias etiquetadas («Documento», «Control», «Confirmaciones», «Sello HCS»); debajo, bloque «Contenido» (texto completo, correcciones en lista); bloque «Advertencias» con una tarjeta por advertencia (etiqueta «Crítica» o «Advertencia» + mensaje + lista «Fuentes» con alias y descripción); pie con «Revisión»/«Snapshot» en texto pequeño. Sin botones salvo «Reintentar» en el error.
- **Historial (113):** lista vertical, la más reciente arriba; cada fila: «v2», fecha, texto «Versión finalizada» y a la derecha «Sello: pendiente | registrado | fallido (pendiente de reintento)»; fila seleccionada con `aria-current`. Vacío: «Todavía no hay versiones finalizadas».
- **Landing (114):** barra superior con marca y enlaces (menú desplegable en móvil, botón «Menú»); hero con título, resumen y botón principal; tres tarjetas de características; sección «Alcance» con los límites en lista.
- **Acceso (115):** tarjeta centrada de 1 columna; título, campos con etiqueta visible y error bajo cada campo, mensaje global arriba (`role="alert"`), botón principal ancho completo («Enviando…» deshabilitado en `submitting`), enlaces secundarios entre formularios. Resultado `success` reemplaza el botón por el mensaje.

Copy definitivo: el de los escenarios (`src/mocks/*`); lenguaje conforme a PRD §5 y §11.

## Estado de preparación y pendientes

1. **Contratos y exports disponibles:** Los contratos, DTOs de vista y fixtures ya existen y están exportados en el repositorio (`src/lib/contracts/*` y `src/features/*/contracts/*`). Las referencias visuales y wireframes del líder quedan aceptados operativamente para el arranque de entregas.
2. **Issues en GitHub:** La publicación o posting posterior de Issues autorizados es una acción de seguimiento que no bloquea el cierre del paquete de delegación `MVP-110` (según se especifica en su plan).
3. **Control del Preview (`preview/registry.ts`):** Principio de un único escritor; el registro permanece bajo control exclusivo del líder, quien actualizará los entrypoints conforme se integren las entregas. `MVP-110` integra placeholders JSON y fixtures sin implementar los componentes de UI finales.
4. **Identidades y roles:** Facu confirmado como `@jfacundoayala`; handle de GitHub de Gastón pendiente de confirmación externa; Tomás participa en pruebas y revisión sin cuenta de agente.
5. **No implementación de UI final:** Ningún componente final de `MVP-111…115` ni runtime de Auth fue implementado en `MVP-110`, preservando la delimitación estricta de responsabilidades.
