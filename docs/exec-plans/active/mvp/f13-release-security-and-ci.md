# F13 · Seguridad y privacidad transversal, y CI ampliado con protección de ramas

**Estado: planificado; implementación no iniciada.** ExecPlan derivado del [plan maestro](../mvp-master-plan.md) (filas de `MVP-130` y `MVP-131`). El maestro conserva IDs, estados y evidencia; este plan no los modifica.

Tareas del maestro: `MVP-130`, `MVP-131`

Producto: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (REQ-17, REQ-18; §11; INV-04, INV-06, INV-08, INV-12). Fundaciones: [mvp-shared-foundations](../../../design/mvp-shared-foundations.md) (SH-04, SH-07, SH-09). Proceso: [desarrollo](../../../development.md#navegador-y-ci), [workflow actual](../../../../.github/workflows/ci.yml), deuda #5 del [tracker](../../tech-debt-tracker.md).

## 1. Objetivo y alcance

- **`MVP-130` (seguridad):** límites de carga y rate limits en endpoints públicos y de upload; logs de acceso sin secretos ni contenido privado; auditoría de que ningún secreto llega al bundle; datos de demo ficticios.
- **`MVP-131` (CI):** el CI Linux ejecuta también los tests de servidor y RLS; protección de ramas y checks requeridos **comprobados en GitHub**.

Son dos checkpoints independientes: `MVP-130` es local y verificable con pruebas; `MVP-131` tiene una parte local (edición y validación del workflow) y una remota que exige autorización y permisos. La parte remota **solo bloquea `MVP-131`**, no a `MVP-130`.

Fuera de alcance: despliegue (`MVP-132`), cuentas de demo (`MVP-133`), nuevas funciones de producto, SMTP propio.

## 2. Trazabilidad

| ID | REQ / INV / SH | Idea de aceptación |
| --- | --- | --- |
| `MVP-130` | REQ-17; INV-04, INV-06, INV-08, INV-12; SH-02, SH-07, SH-08; PRD §11 | Límites, rate limits, logs sin secretos, sin secretos en bundle, demo ficticia |
| `MVP-131` | REQ-18; SH-09; deuda #5 | CI ejecuta tests de servidor/RLS; branch protection con checks requeridos comprobada |

## 3. Dependencias

- `MVP-130` ← `MVP-054` (chat y adjuntos), `MVP-073` (lectura pública de invitación), `MVP-101` (página de verificación). También consume decisiones `MVP-010` (límites de adjuntos) y `MVP-011` (vigencia y abuso) a través de esas tareas: los valores vienen de esas decisiones, no de este plan.
- `MVP-131` ← `MVP-006` (base integrada y primer run remoto), `MVP-120` (harness).
- Por paso: S1 ← `MVP-054/073/101`; S2 ← S1; S3 ← S1; S4 ← S1; S5 ← S2–S4. C1 ← `MVP-120`; C2 ← C1; C3 ← C2, `MVP-006`, autorización; C4 ← C3, autorización/permisos.
- Los pasos S1 parciales (inventario de endpoints existentes) pueden empezar al integrarse cada endpoint; no es necesario esperar a todas las tareas para revisar las ya integradas.

## 4. Archivos: propiedad y límites

Todo **Líder**.

| Zona | Notas |
| --- | --- |
| `src/app/api/**`, `src/lib/**` (límites, rate limits, redacción de logs) | Cambios mínimos en endpoints existentes; sin refactor ajeno |
| `tests/server/`, `tests/e2e/`, `tests/boundaries/` | Casos de abuso, límites y escaneo de bundle |
| `.github/workflows/ci.yml` | Ampliación de jobs; sin secretos de aplicación ni proveedores |
| Configuración de GitHub (branch protection) | **Externa al repo**; requiere autorización y permisos |
| Colaborador | No participa |

Sin Redis, colas ni servicios externos (PRD §13): el rate limit usa lo disponible en la pila aprobada (p. ej. contadores en Postgres) según la decisión de `MVP-011`; no se elige aquí.

## 5. Insumos y salidas

| Insumo | Salida |
| --- | --- |
| Límites y política de abuso (`MVP-010`, `MVP-011`) | Límites y rate limits aplicados y probados |
| Inventario de endpoints públicos y de upload | Tabla de endpoint → límite → test |
| Harness `MVP-120` | Jobs de CI para servidor/doubles y base local |
| — | Evidencia de run remoto y de la regla de protección (cuando haya autorización) |

## 6. Pasos y checkpoints

Todos pendientes.

**Checkpoint A — `MVP-130`**

- [ ] **S1 · Inventario** (← `MVP-054`, `MVP-073`, `MVP-101`). Endpoints públicos (invitación, verificador) y de upload; para cada uno: autenticación, límite de tamaño, tipo, rate limit y datos que devuelve.
- [ ] **S2 · Límites de carga y rate limits** (← S1). Aplicar los valores decididos; tests de rechazo por tamaño/tipo y por exceso de intentos, con error técnico explícito, sin alterar estados de producto. Límites en el verificador: carga acotada del PDF y procesamiento sin persistirlo por defecto (SH-06).
- [ ] **S3 · Logs sin secretos ni contenido privado** (← S1). Revisión y tests que fallan si un log, error o telemetría contiene tokens, PK privadas de fuentes, URLs firmadas, claves o texto de chat/evidencia (SH-02, SH-07, SH-08). Sin prompts completos por defecto.
- [ ] **S4 · Secretos fuera del bundle** (← S1). Construir **sin credenciales** (el build no debe inicializar proveedores) y construir de nuevo con valores centinela ficticios en variables de servidor; buscar los centinelas y nombres de variables privadas en la salida del cliente. Solo `NEXT_PUBLIC_*` pueden aparecer. No se leen `.env` reales.
- [ ] **S5 · Datos de demo ficticios** (← S2–S4). Verificar que fixtures, seeds y guion no contienen datos reales ni credenciales; barreras: sin fixtures en producto.

**Checkpoint B — `MVP-131`**

- [ ] **C1 · Jobs ampliados, parte local** (← `MVP-120`). Añadir al workflow la ejecución de los tests de servidor (dobles) y de la base local Supabase (requisitos de entorno de H3 del [harness](../../completed/f12-server-test-harness.md)); versiones de acciones y de Node fijadas igual que el resto; sin secretos de aplicación; sin llamadas a proveedores. Validar localmente que los mismos comandos pasan y que el YAML es válido.
- [ ] **C2 · Equivalencia local/CI** (← C1). Documentar en `docs/development.md` (edición del líder, acotada) qué corre en CI y qué no (evaluación de IA y smoke real quedan fuera).
- [ ] **C3 · Run remoto** (← C2, `MVP-006`; **requiere autorización de commit/push/PR**). Obtener un run en Linux; enlazarlo. Fallos se corrigen o se registran; no se declara verde sin run real.
- [ ] **C4 · Protección de ramas** (opcional posthackathon; el usuario optó explícitamente por no exigirla durante la hackathon) (← C3; **requiere autorización y permisos de administración en GitHub**). Configurar checks requeridos y revisión; verificar que los nombres de los checks coinciden con los jobs reales y comprobar el resultado leyendo la configuración. Si faltan permisos, se registra el bloqueo en el §9 del maestro (edición del líder) y se bloquea **solo C3/C4**.

## 7. Validación

| Qué | Nivel | Límite |
| --- | --- | --- |
| Límites y rate limits | Vitest/Playwright locales con base local | No acredita producción ni carga real |
| Bundle sin secretos | Build local con centinelas | No sustituye revisión de Vercel (`MVP-132`) |
| CI ampliado | Comandos locales + run remoto real | Un workflow sin run no es evidencia; un run no activa la protección |
| Branch protection | Lectura de la configuración real de GitHub | Requiere permisos |

Comandos locales: `npm run lint`, `typecheck`, `test`, `test:boundaries`, `build`, `test:e2e`, más los proyectos de servidor y base local.

## 8. Evidencia

No ejecutada. Se registrará: fecha · comandos y resultados reales · rama/PR/commit · URL del run remoto · captura/lectura de la regla de protección. Sin secretos.

## 9. Referencias a completar

- **RQ-D1** → [release-validation](../../../specs/release-validation.md) (§2 y §5): criterios de aceptación de seguridad/privacidad verificables (`MVP-130`), qué cuenta como evidencia de CI y de protección de ramas (`MVP-131`) y requisitos de entorno de los jobs.
- **RQ-D2** → no aplica.

Decisiones locales abiertas (líder): mecanismo del rate limit (según `MVP-011`); forma de la búsqueda de centinelas en el bundle.

## 10. Rollback y límites

- Cambios de código y de workflow son reversibles por revert. La regla de branch protection se puede revertir en GitHub, pero es una acción remota y requiere autorización explícita; no se modifica sin ella.
- Sin lectura de `.env`, sin secretos en CI, sin proveedores reales; no se ejecuta commit/push/PR/merge sin pedido expreso.

## 11. Cierre

`MVP-130` se completa tras integrar y repetir los checks sobre la base. `MVP-131` con run remoto real (C3); la protección de ramas y los checks requeridos (C4) **no son obligatorios** en la hackathon por opt-out explícito del usuario y quedan opcionales posthackathon (el workflow se conserva como señal). Si se decide configurarlos y faltan autorización o permisos, C4 queda `bloqueada` y no se declara hecha. Luego: evidencia en las filas, recuento del §3 del maestro, enlace, archivo en `../../completed/` y actualización de la deuda #5 en el tracker durante el cierre general (`MVP-136`). **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
