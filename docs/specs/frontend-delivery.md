# Presentación verificable para cinco entregas frontend

**Estado objetivo; entregas MVP-110…118 pendientes.** Autoridad: [PRD v1.5](../exec-plans/GALCOA-PRD-v1.4.md), REQ-01/02/08, §5, §10–14; [SH-02/03/07/09](../design/mvp-shared-foundations.md), [arquitectura](../architecture.md) y [maestro](../exec-plans/active/mvp-master-plan.md).

Esta spec cubre las diferencias entre snapshot, historial, landing y acceso que no resuelve la [ficha del dashboard](../tasks/dashboard-presentation.md). No duplica sus props ni crea otro catálogo de estados. La semántica de revisión vive en [review-confirmation](review-confirmation.md), y la evidencia en [release-validation](release-validation.md).

## 1. Contrato común observable

Cada entrega recibe datos validados y callbacks locales. Renderiza lo informado, sin decidir permisos ni producir estados de negocio. Un callback ejecutado en preview no equivale a documento creado, sesión abierta, confirmación o finalización real.

| Entrada | Presentación esperada |
| --- | --- |
| Carga | Estado identificable, sin fingir lista vacía definitiva o éxito |
| Vacío/ausencia | Mensaje contextual, distinto de error; no inventar registros |
| Error | Causa segura y reintento cuando el contrato lo permite |
| Datos | Todo el contenido del DTO de vista relevante, sin reinterpretar autoridad |
| Interacción pendiente | Estado visible que no permite duplicados visuales; la protección real pertenece al servidor |

Confirmaciones, control documental, finalización y HCS son dimensiones separadas. `null` de revisión no significa completa; `sin_inconsistencias_criticas_detectadas` no significa corroboración ni verdad.

El contenido se representa como texto seguro, no HTML arbitrario. No se ocultan advertencias críticas ni se bloquean acciones por severidad. Datos privados no se protegen ocultándolos con CSS: la proyección autorizada llega del líder/servidor.

## 2. Entregas y escenarios mínimos

| Entrega | Responsabilidad visual | Escenarios positivos/negativos requeridos |
| --- | --- | --- |
| MVP-111 Dashboard | Lista/crear/abrir/reintentar conforme ficha existente | Sus ocho escenarios; carga/vacío/error diferenciados, revisión nula y finalizada con sello pendiente/registrado |
| MVP-112 Snapshot y advertencias | Lectura completa del `FrozenOperation`, limitaciones y fuentes seguras; control/avance por separado | Contenido extenso, sin advertencias, crítica con dos fuentes, unidad no informada, ausencia/carga/error; sin confirmar/finalizar |
| MVP-113 Historial | Versiones y antecedente, selección por callback, estado de finalización/sello por registro | Vacío, una/múltiples versiones, selección, carga/error, sello pendiente/registrado; no edición ni regeneración |
| MVP-114 Landing/navegación | Explicar alcance y acceso, navegación responsive con callbacks/enlaces acordados | Móvil/escritorio, menú abierto/cerrado, navegación por teclado; sin afirmaciones de certificación o identidad verificada |
| MVP-115 Acceso | Formularios de login, registro, solicitud de recuperación **y nueva contraseña** | Reposo, campos inválidos, envío, error seguro y resultado informado; sin lógica Auth ni inferir existencia de cuentas |

En MVP-112 lectura completa no significa copiar el panel privado de fuentes del autor. Las referencias seguras acompañan las discrepancias; un resumen colapsado no debe hacerlas inaccesibles al revisar. No añade controles de confirmación/finalización a una entrega de solo lectura.

MVP-113 no atribuye sello de v1 a un borrador v2. Seleccionar una versión llama al callback; no vuelve a consultar IA ni recalcula hashes para reconstruir historia.

MVP-115 conserva labels, ayudas, campos y errores asociados. Las validaciones visuales acordadas no reemplazan validación del servidor. Registro/recuperación no revelan si existe la cuenta; las reglas concretas de contraseña provienen del contrato/Auth, no del gusto del presentador.

## 3. Referencia visual y accesibilidad

Reutilizar el tema y primitivas existentes y la ficha del dashboard como referencia base. El líder adjunta acabado/capturas esperadas para cada entrega en MVP-110; esta spec no inventa un rediseño global ni una certificación WCAG.

- Lectura legible a 360 y 1280 px según referencia existente, sin desbordamiento horizontal que oculte información/acciones.
- Teclado para todas las acciones, foco visible, nombres accesibles y orden de lectura coherente.
- Estados y severidades comprensibles por texto, no solo por color.
- Formularios con labels y errores vinculados; envío pendiente y error distinguibles.
- Menú/modal devuelve foco de forma comprensible; cerrar/cancelar no dispara la acción aceptada.
- Contenido largo, advertencias y fechas no se truncan perdiendo significado; formato local no modifica la fecha persistida.

Una casilla HTML nativa accesible es válida. No se exige agregar componente/dependencia por preferencia estética. QR pertenece a compartir manual (MVP-078): cualquier librería futura tiene un único dueño de cambio de paquete/lockfile, el líder; no se incorpora desde las cinco presentaciones.

## 4. Paquete y límites de responsabilidad

MVP-110 prepara para cada entrega contrato de props, escenarios validados, callbacks, allowlist exacta, prohibidos, preview y referencia visual. Puede prepararse antes de MVP-007; la ejecución delegada de MVP-111…115 sí requiere acceso confirmado y paquete listo.

La presentación no hace red, Auth, SDK, acceso a entorno, persistencia o cálculo de autoridad. Contratos, containers, rutas, primitivas compartidas, estilos globales, paquetes y configuración siguen bajo propiedad del líder según SH-07; el ticket no delega una feature completa.

Los fixtures compartidos de `src/mocks/` son DTO de contratos para tests/preview. Dobles de proveedores viven en `tests/server/`, no se convierten en escenarios de producto ni en fallback. Preview sirve para presentación local ficticia, no para demostrar permisos ni integración.

| Integración | Owner/responsabilidad según maestro |
| --- | --- |
| MVP-031 | Conectar Auth real con MVP-115, incluida nueva contraseña |
| MVP-054 | Container/API de chat, adjuntos, stream y contraste automático persistido; consume MVP-053 |
| MVP-077 | Selección/avance/acciones de revisión, usando la lectura de MVP-112 |
| MVP-116 | Páginas `(app)`, incluido `documents/[id]/page.tsx`; monta chat de 054 y conecta dashboard/historial/navegación de 114 |
| MVP-076/101 | Confirmación pública y verificador, no entregas delegadas 111…115 |
| MVP-118 | Revisión transversal móvil/escritorio y accesibilidad del producto integrado |

No duplicar implementación de chat en MVP-116 ni trasladar su página a MVP-054. La referencia canónica de dependencias es el maestro, no tablas anteriores de planes aún por reconciliar.

## 5. Aceptación trazable — a implementar

| Caso | Resultado positivo / negativo esperado | Consumidor |
| --- | --- | --- |
| F-01 | Ocho escenarios dashboard; callbacks correctos; sin éxito productivo simulado | MVP-111; REQ-02 |
| F-02 | Snapshot completo, crítica/fuentes visibles y estados separados; no botón de confirmar/finalizar | MVP-112/077; PRD §12.9,15 |
| F-03 | Historial conserva v1/v2 y sus sellos; selección no edita ni regenera | MVP-113/116; §12.2,10,11 |
| F-04 | Landing accesible móvil/escritorio; no claims prohibidos; navegación integrada por líder | MVP-114/116; §10/11 |
| F-05 | Cuatro vistas de acceso, incluida nueva contraseña; errores y callbacks sin Auth en componente | MVP-115/031; REQ-01 |
| F-06 | Teclado, foco, labels y advertencias legibles a anchos de referencia; cancelación no ejecuta aceptación | MVP-111…115/118; §12.12 |
| F-07 | Imports prohibidos/datos ajenos no se aceptan; componentes no calculan permiso desde control documental | MVP-110/130; REQ-17 |

Cada entrega aporta tests de escenarios/callbacks y capturas identificadas a los dos anchos; tras integrar se verifica navegación real y páginas, no solo preview. Los checks proporcionales y límites de evidencia se rigen por release-validation, sin afirmar que se ejecutaron en esta preparación.

## 6. Registro operativo y cierre de paquete

| Tema | Estado operativo | Resolución técnica |
| --- | --- | --- |
| Acabado de 112…115 | Wireframes y layout técnico local del líder aceptados para primeras entregas | Definido por el líder técnico orquestador como base técnica interna directa para el arranque. Sin aprobación humana obligatoria (regla AGENTS.md); la referencia visual sirve de guía operativa sin constituir requisito externo bloqueante |
| Props/nombres concretos | Cerrado e integrado en `develop` local (MVP-020, MVP-021, MVP-110) | Los contratos, DTOs de vista, fixtures y esquemas Zod ya existen y están exportados en `src/lib/contracts/` y `src/features/<dominio>/contracts/`. La presentación no define API por su cuenta |

El archivo `preview/registry.ts` sigue el principio estricto de un único escritor (el líder); el paquete `MVP-110` aporta placeholders JSON validados sin implementar los componentes de UI finales ni el runtime de Auth, los cuales quedan reservados a las entregas de presentación delegadas (`MVP-111…115`) y a Auth real (`MVP-031`). La publicación posterior de Issues en GitHub es un paso operativo de seguimiento que no bloquea el cierre técnico del paquete `MVP-110`.
