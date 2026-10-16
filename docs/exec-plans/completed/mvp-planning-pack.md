# Preparar los planes de ejecución del MVP

## Objetivo y alcance

Crear y revisar los ExecPlans derivados de las fases pendientes del [maestro](../active/mvp-master-plan.md), con specs y diseños cuando resuelvan ambigüedades. El usuario autorizó documentar todas las fases por adelantado. No se implementan funcionalidades, no se crean Issues ni se realizan acciones remotas.

## Progreso

- [x] Leer el maestro y registrar el alcance aprobado.
- [x] Definir decisiones técnicas compartidas antes de repartir fases.
- [x] Redactar planes en cuatro grupos paralelos sin editar el maestro.
- [x] Completar specs y diseños necesarios con dos especialistas.
- [x] Integrar enlaces, cobertura y reglas de ejecución en el maestro sin cambiar estados de implementación.
- [x] Revisar independientemente cobertura, coherencia, dependencias, enlaces y aceptación; corregir y archivar este trabajo documental.

## Distribución

Diseñador primero; después redactores A (F0–F3), B (F4–F6), C (F7–F10) y D (F11–F13). Especialistas de specs y diseño completan solo contratos/documentos necesarios. El orquestador integra el maestro y los índices. Ningún redactor modifica estados de las tareas MVP por haber escrito documentación.

## Validación

Cada tarea pendiente tiene un plan o un procedimiento explícito para la acción externa. Los planes cubren los IDs asignados sin doble propietario, siguen el grafo del maestro y distinguen preparación de ejecución. Comprobar vínculos locales, cobertura de REQ-01…18 y progreso inalterado. No corresponde ejecutar tests de aplicación por cambios exclusivamente Markdown.

## Decisiones y evidencia

- La generación anticipada de planes sustituye la regla anterior de crearlos solo justo a tiempo; se actualizará el maestro tras integrar los documentos.
- Specs y diseños describen el objetivo; su existencia no acredita código, servicios ni validaciones de producto implementados.
- Diseño transversal creado en `docs/design/mvp-shared-foundations.md`, con decisiones SH-01…SH-10. Los redactores A–D trabajan en prefijos de archivos separados; el maestro y los índices los integra exclusivamente el orquestador.
- El usuario acordó para ejecución futura una rama/worktree por plan y PR/merge hacia `develop`, con validación por integración. No se crean ramas ni se publica ahora. Se añadirá una matriz de compatibilidad y ownership para no confundir aislamiento de worktree con independencia de contratos/archivos.
- A entregó 11 planes para 16 IDs pendientes de F0–F3. Observaciones a reconciliar: `MVP-070` necesita canonicalización `MVP-012`; fijar prerequisitos de diseño SQL frente a políticas `MVP-011/012`; aclarar alcance de acceso `MVP-007/110`; reutilizar helpers RLS de `MVP-024` en `MVP-120`. La recuperación de contraseña incluye definir y conectar la nueva contraseña (MVP-115/031), sin añadir una funcionalidad distinta.
- B entregó ocho planes (13 IDs) y D nueve (19 IDs). Integración pendiente: un único dueño de `documents/[id]/page.tsx` (MVP-116 monta composición; MVP-054 entrega container), conexión explícita de contraste MVP-053 al flujo UI y motor único de estados. Dobles de proveedores en `tests/server/`, no en `src/mocks/` restringido a contratos.
- El reporte final debe incluir una guía simple por tandas y parejas compatibles, además de la matriz de conflictos. Su secuencia usa dependencias por ID y checkpoints de planes, no implica lanzar todos los planes de una fase a la vez.
- Los 36 planes cubren los 68 IDs pendientes (A:11/B:8/C:8/D:9). Catálogo y maestro integrados por un único escritor, estados inalterados: 5 completadas de base histórica y 68 pendientes. Se añadió la dependencia de E2E MVP-121 en páginas MVP-116 y Auth MVP-031.
- Cinco specs creadas en `docs/specs/`; diseños SQL/manifiesto en terminación. Correcciones cruzadas aplicadas a dependencias de 110/054/116/070/022, ownership de página, reutilización de helpers RLS y recuperación de contraseña. La guía de ejecución propone dos carriles y una matriz semáforo de recursos compartidos; ramas/worktrees/PRs siguen sin crearse.
- Los tres diseños y cinco specs están disponibles y vinculados desde los planes. Se precisó el puente ESM exclusivo de pruebas y la evidencia compuesta de MVP-121; el recorrido HTTP Next íntegro con adapters reales se exige en MVP-134, sin introducir banderas mock en producto ni afirmar cobertura falsa. La aceptación del maestro se ajustó a esa frontera, sin cerrar tareas.
- Revisión independiente final completada con dictamen FINAL PASS en la sesión `ses_ebbf3096effeY40tiAvtj2poyn`. Se verificaron 57 documentos con 0 enlaces rotos, total alineación con el PRD P0, límites y seams de arquitectura respetados, y vectores de prueba SHA-256 calculados con Node.js crypto deterministas. Sugerencias no bloqueantes integradas (smoke Vitest en MVP-120 como gate explícito, provisión de roles SQL documentada en MVP-025/026/132, 'nueva contraseña' explicitada en criterio de aceptación MVP-115/MVP-031 y spec, y consistencia de intento fallido vs sello pendiente en MVP-113). Sin problemas materiales.

## Implementation Outcome

### Implemented

Paquete documental completo para la planificación exhaustiva del MVP P0, cubriendo todas las fases pendientes sin alterar código ni dependencias:
- **36 ExecPlans derivados** en [`../active/mvp/README.md`](../active/mvp/README.md) que cubren con cardinalidad exacta 1:1 las 68 tareas pendientes (`MVP-006` a `MVP-136`) del [plan maestro](../active/mvp-master-plan.md) (Grupo A: 11 planes para F0–F3, Grupo B: 8 planes para F4–F6, Grupo C: 8 planes para F7–F10, Grupo D: 9 planes para F11–F13).
- **5 especificaciones canónicas** en [`../../specs/README.md`](../../specs/README.md):
  - `auth-flow-specs.md` (flujos de autenticación, sesiones y recuperación)
  - `confirmation-verification-specs.md` (revisión congelada, token, respuestas y pantalla pública)
  - `evidence-ingestion-specs.md` (carga privada, hashing y extracción de texto)
  - `hcs-anchoring-specs.md` (cliente HCS, formateo de mensaje y reconciliación Testnet)
  - `rules-engine-specs.md` (motor determinista de reglas ALCOA+ y advertencias)
- **3 documentos de diseño técnico** en [`../../design/README.md`](../../design/README.md):
  - `mvp-shared-foundations.md` (decisiones transversales SH-01 a SH-10 de ciclo de vida, privacidad y transacciones)
  - `sql-schema-and-rls-design.md` (esquema DDL, funciones y políticas RLS propuestas)
  - `version-manifest-design.md` (formato JSON canónico, SHA-256 e integración HCS)
- **Guía de ejecución y concurrencia**: [`../../execution/mvp-execution-guide.md`](../../execution/mvp-execution-guide.md) que define la estrategia de dos carriles paralelos, matriz semáforo (Verde, Amarillo, Rojo) de contención de archivos y orden de tandas por dependencias.
- **Índices del repositorio**: [`../active/mvp/README.md`](../active/mvp/README.md), [`../../specs/README.md`](../../specs/README.md), [`../../design/README.md`](../../design/README.md) y actualización de [`../../README.md`](../../README.md).
- **Plan maestro preservado**: [`../active/mvp-master-plan.md`](../active/mvp-master-plan.md) integró los enlaces a los 36 planes derivados y dependencias cruzadas (estrategia develop en `MVP-006a`, dependencias en `MVP-121`), manteniendo rigurosamente inalterados los estados (5 completadas de base histórica, 68 pendientes).

### Deviations from Design

None. La generación anticipada del paquete completo de planes documentales fue expresamente solicitada y autorizada por el usuario, sustituyendo la creación "just-in-time" individual. No se implementó código de aplicación, no se alteraron dependencias ni se crearon ramas o worktrees en Git, preservando `main` como rama estable actual. La estrategia `worktree/branch -> develop` es una propuesta documentada para la posterior fase de ejecución (acción MVP-006).

### Validation

- **Revisión independiente**: Aprobada en FINAL PASS (sesión `ses_ebbf3096effeY40tiAvtj2poyn`), sin bloqueantes materiales.
- **Validación de enlaces y anclas**: Verificación estática sobre 57 documentos con 0 enlaces rotos y anclas locales resueltas.
- **Cobertura de tareas**: Cobertura exacta 68/68 IDs pendientes sin duplicados ni tareas huérfanas. Grafo de dependencias acíclico verificado (0 ciclos, ancho máximo 31 tareas en 6 oleadas).
- **Consistencia criptográfica y semántica**: Verificación de vectores SHA-256 calculados de forma determinista mediante Node.js crypto; alineación con invariantes de PRD (INV-01 a INV-18), confianza de servidor, límites de presentación y roles de base de datos.
- **Sugerencias no bloqueantes integradas**: Smoke Vitest en MVP-120 como puerta explícita; provisión de roles SQL documentada como pendiente en MVP-025/026/132; flujo de "nueva contraseña" explicitado en criterio de aceptación de MVP-115, MVP-031 y spec correspondiente; y consistencia de intento fallido vs sello pendiente en MVP-113.
- **Límites de validación**: No se ejecutaron tests de aplicación ni llamadas de red en esta etapa exclusivamente documental (la evidencia histórica previa de tests de workspace no acredita fases funcionales).

### Follow-up

- Ejecución de los 36 planes derivados activos en `docs/exec-plans/active/mvp/` según sus dependencias del plan maestro.
- Aprobación formal y resolución técnica de los valores DDL propuestos en `sql-schema-and-rls-design.md` y estructura de manifiesto en F1/F2 antes de su consumo en código.
- Creación futura de la rama `develop` y flujo de ramas/worktrees cuando sea autorizado e iniciado formalmente en `MVP-006`.
