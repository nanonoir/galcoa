# F7-04 — UI de revisión del autor y compartir manual

**Estado: planificado (no iniciado).** Ninguna tarea de este plan está implementada ni validada.

Tareas del maestro: `MVP-077`, `MVP-078`

Referencias: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3.7–3.8, §10, REQ-12, REQ-14) · [arquitectura](../../../architecture.md#condición-para-delegar-y-primeros-candidatos) · [fundaciones](../../../design/mvp-shared-foundations.md) (SH-02, SH-03, SH-07) · [desarrollo](../../../development.md#checks-según-el-cambio) · [maestro](../mvp-master-plan.md).

## 1. Alcance

Pantalla del autor para elegir participantes, congelar, ver el snapshot y el avance **por separado** (confirmaciones, finalización, sello), confirmar como autor, y compartir manualmente el enlace de cada tercero (copiar, QR, WhatsApp, correo).

**Este es el único plan de F7 que depende de la presentación del colaborador (`MVP-112`).** Es deliberadamente un plan aparte para que la espera de `MVP-112` **no bloquee** `MVP-071` ni `MVP-072`, que viven en [f07-01](f07-01-revision-congelada-y-confirmacion-autor.md) y [f07-02](f07-02-invitaciones-y-respuesta-atomica.md).

**Fuera:** servicios de revisión/invitación/agregado (planes anteriores); presentación del snapshot y advertencias (la entrega el colaborador en `MVP-112`; se integra, no se reescribe); finalización y PDF (F8). El backend **no envía** correos ni mensajes (REQ-14).

## 2. Dependencias y entrada exacta

| Tarea | Depende de (maestro) | Entrada requerida |
| --- | --- | --- |
| `MVP-077` | `MVP-070`, `MVP-072`, `MVP-075`, `MVP-112` | Servicios y endpoints de congelar, emitir invitaciones y estado agregado ([f07-01](f07-01-revision-congelada-y-confirmacion-autor.md), [f07-02](f07-02-invitaciones-y-respuesta-atomica.md), [f07-03](f07-03-estado-agregado-y-pantalla-publica.md)); componente de presentación del snapshot y advertencias de `MVP-112`, **integrado y con sus checks** |
| `MVP-078` | `MVP-077` | UI del autor con enlaces emitidos |

**Tramo realizable sin `MVP-112`** (no cambia el grafo del maestro): el container, el estado de interacción, el selector de participantes y el panel de avance pueden construirse antes, con una vista provisional **solo en el preview/tests del líder**, nunca en rutas de producto. La integración del snapshot y el cierre de `MVP-077` esperan a `MVP-112`.

## 3. Requisitos e invariantes aplicables

REQ-12, REQ-14, REQ-08. INV-02, INV-11, INV-14, INV-17. PRD §10: «¿Quiénes van a confirmar…?», selección fija por revisión, tres indicadores separados, QR, Copiar enlace, `wa.me`, `mailto:`; no prometer envío automático. SH-03: los estados del servidor no cambian de significado en la UI.

## 4. Objetivo y aceptación por ID

**`MVP-077` — UI de revisión del autor.**

- [ ] Se ofrecen exactamente las cuatro selecciones; el autor siempre incluido; la IA solo puede sugerir y el autor decide. La selección se muestra como fija para la revisión congelada.
- [ ] El autor ve el snapshot completo y las advertencias (componente de `MVP-112`) **antes** de congelar y confirmar; las advertencias, incluso críticas, no deshabilitan acciones.
- [ ] Tres indicadores independientes: avance de confirmaciones, finalización y sello HCS, cada uno con la `revisionId`/`snapshotId`/versión a la que se refiere. «Sin inconsistencias críticas detectadas» no se presenta como «hechos corroborados».
- [ ] Cambiar contenido o selección tras congelar abre otra revisión y comunica que las confirmaciones previas no se heredan y los enlaces anteriores dejan de aceptar respuestas. Se puede seguir conversando mientras faltan respuestas, sin finalizar esa revisión.
- [ ] El estado de rechazo se muestra como respuesta de negocio con su siguiente acción (abrir otra revisión), no como error técnico.
- [ ] La disponibilidad de cada acción proviene del servidor, que revalida; deshabilitar un botón no es el control de seguridad.
- [ ] Actualización del avance sin infraestructura nueva: consulta acotada con retroceso mientras la pestaña está visible y botón manual; no Realtime, SSE ni colas salvo decisión explícita posterior (PD-02).

**`MVP-078` — Compartir manual.**

- [ ] Por cada tercero seleccionado: copiar enlace, QR, `wa.me` con texto prearmado y `mailto:` con asunto/cuerpo; el enlace es **individual** (nunca el del otro tercero).
- [ ] El texto prearmado contiene solo una frase genérica y el enlace; sin contenido de la operación, nombres ni evidencias; sin lenguaje prohibido (PRD §5/§11).
- [ ] El enlace en claro solo existe en la respuesta de emisión (el servidor guarda únicamente el hash); la UI advierte que, si se pierde, hay que reemitir (PD-01).
- [ ] El QR se genera en el navegador, sin enviar el token a ningún servicio externo.
- [ ] El backend no realiza ningún envío; ninguna petición de la UI sale hacia WhatsApp/correo desde el servidor.

## 5. Rutas, propiedad y fronteras

**Delegación expresa del usuario, 2026-10-16:** Facu (`@jfacundoayala`) implementa #21 después de #31, incluyendo la ruta, presentación y containers enumerados abajo. Consume las entradas reales de #18/#19/#20 de Gastón; no modifica sus servicios, RPC ni migraciones. El líder conserva contratos compartidos, configuración global, dependencias y seguridad. Esta autorización sustituye la propiedad inicial exclusiva del líder, sin ampliar el producto ni permitir endpoints inventados o mocks en producto.

| Superficie | Contenido |
| --- | --- |
| `src/app/(app)/documents/[id]/review/page.tsx` | Ruta de revisión del autor, separada de la página base de documento de MVP-116; MVP-054 no crea páginas. Mantener navegación coordinada sin editar esa página base en paralelo |
| `src/features/documents/containers/` y `src/features/corroborations/containers/` | Containers cliente: red, clave de idempotencia por intención, consulta de avance |
| `src/features/documents/components/`, `src/features/corroborations/components/` | Presentación de selección, panel de avance y compartir (props + callbacks, sin red ni SDK). El snapshot lo aporta `MVP-112` |
| `src/lib/contracts/` | Esquemas de estado/avance: de `MVP-021`; no se añaden en este plan |
| `src/mocks/`, `preview/` | Escenarios ficticios para el tramo previo a `MVP-112`; solo preview/tests, nunca producto |
| `tests/e2e/`, `src/features/**/*.test.tsx` | Componentes y navegador |

**Dependencia nueva a decidir (QR).** El repositorio no incluye librería de QR. Añadirla modifica `package.json` y el lockfile (superficie del líder). La elección se resuelve al ejecutar con documentación oficial, licencia, tamaño y soporte; se corre `npm audit` y se registra el resultado. Sin esa decisión, `MVP-078` avanza en todo lo demás (PD-03).

## 6. Pasos ejecutables

1. **C077-0 Verificar entrada.** Endpoints de [f07-01…03](f07-01-revision-congelada-y-confirmacion-autor.md) integrados y estado del `MVP-112`. Si `MVP-112` no está `completada`, los pasos 2–4 siguen en preview y la fila queda `en_curso` con la causa; no se marca `bloqueada` la parte independiente.
2. **C077-1 Selector de participantes.** Contenedor y presentación con las 4 opciones; tests de la combinatoria y de que el autor no se puede quitar.
3. **C077-2 Congelar y confirmar.** Container: `expectedDraftRevision`, idempotency key por intención; resultados `ok`/conflicto/error estable; sin éxito optimista.
4. **C077-3 Panel de avance.** Tres indicadores independientes; consulta acotada; atribución a revisión/versión.
5. **C077-4 Integrar `MVP-112`.** Importar el componente aprobado; sin copiar su lógica. El mismo `FrozenOperation` alimenta autor y tercero.
6. **C077-5 Playwright** del flujo del autor con base local y dobles de proveedores según la costura de [data-transactions §7](../../../design/data-transactions.md#7-costuras-de-tests-y-evidencia) (navegador Next + handlers con dobles; evidencia compuesta, sin flag productivo ni clon de la app): elegir cada una de las 4 selecciones, congelar, ver un enlace por tercero, cambio material ⇒ nueva revisión y enlace anterior no responde.
7. **C078-0 Utilidades de URL.** Funciones puras que construyen `wa.me` y `mailto:` con codificación correcta y sin datos privados; tests de codificación y de ausencia de contenido de operación.
8. **C078-1 QR y copiar.** Tras la decisión PD-03; QR con etiqueta accesible y alternativa textual (el enlace).
9. **C078-2 Verificación sin envío.** Test de navegador que intercepta la red y confirma que no hay peticiones del servidor para enviar mensajes y que el token no sale a hosts de terceros (el abrir de `wa.me`/`mailto:` es acción local del usuario).

## 7. Validación (ejecución pendiente — no ejecutado)

| Check | Cobertura | Estado |
| --- | --- | --- |
| `lint`, `typecheck`, `test`, `test:boundaries`, `build` | Barreras de presentación y containers | no ejecutado |
| Vitest jsdom + user-event | Selector 4 combinaciones, indicadores separados, texto sin términos prohibidos | no ejecutado |
| Vitest Node | Constructores de URL `wa.me`/`mailto:` | no ejecutado |
| Playwright (`npm run test:e2e`) | Flujo del autor con las 4 selecciones, nueva revisión sin herencia, compartir sin envío backend, viewports móvil/escritorio | no ejecutado |

La integración con proveedores externos no aplica: el compartir lo hace el usuario fuera de la aplicación. La cobertura transversal de las cuatro selecciones con flujo completo hasta HCS corresponde a `MVP-121`.

## 8. Referencias a completar

Documentos objetivo **disponibles** y enlazados; los parámetros operativos (entropía, vigencia, cuotas, límites, perfil y tiempos) siguen siendo propuestas **no aprobadas** hasta que F1 (`MVP-011/012/013`) los registre. Este plan consume los documentos y no los reescribe.

| ID | Documento | Qué necesita este plan |
| --- | --- | --- |
| RQ-C1 | [`review-confirmation`](../../../specs/review-confirmation.md) | Textos de selección, de avance y de nueva revisión; mensaje prearmado de WhatsApp/correo; cómo presentar «sin inconsistencias críticas» frente a «corroborado»; política de UX ante enlace perdido |
| RQ-C4 | [`public-capabilities`](../../../specs/public-capabilities.md) (registro abierto de `MVP-011`, §8) | Reemisión y revocación visibles para el autor |

## 9. Decisiones pendientes

- **PD-01** UX de enlace perdido y reemisión (depende de `MVP-011`): la UI no puede recuperar un token ya emitido.
- **PD-02** Cadencia y técnica de actualización del avance: se fija al ejecutar sin añadir infraestructura; si se quisiera Realtime/SSE, requiere decisión del líder (no P0 por defecto).
- **PD-03** Librería de QR (nueva dependencia): decisión del líder al ejecutar, con evidencia de licencia/tamaño/auditoría.
- **PD-04** Integración de navegación con MVP-116: la revisión usa la subruta `/review`; el líder serializa cualquier ajuste de la página base del documento, que pertenece a MVP-116.

## 10. Rollback y recuperación

- Antes de integrar: descartar la rama; sin cambios de datos.
- Tras integrar: revertir containers y la ruta de revisión; las revisiones, invitaciones y respuestas persistidas permanecen. Si falla la dependencia de QR, puede conservarse temporalmente el enlace copiable como recuperación degradada, pero MVP-078 no se completa hasta restaurar el QR y las demás formas de compartir exigidas.
- Un fallo de red al congelar se recupera consultando la revisión persistida antes de repetir; reintentar con la misma clave.

## 11. Cierre

Con integración y evidencia real, actualizar solo las filas `MVP-077` y `MVP-078` y el recuento del §3 del maestro; archivar al cerrar ambas. Documentar no marca nada. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

[Maestro](../mvp-master-plan.md) · [PRD](../../GALCOA-PRD-v1.4.md) · [Arquitectura](../../../architecture.md)
