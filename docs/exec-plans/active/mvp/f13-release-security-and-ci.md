# F13 · Seguridad y privacidad transversal, y CI ampliado con protección de ramas

**Estado: activo; checkpoint MVP-131 completado (2026-10-16), MVP-130 no iniciado.** ExecPlan derivado del [plan maestro](../mvp-master-plan.md) (filas de `MVP-130` y `MVP-131`). El maestro conserva IDs, estados y evidencia. Issue #35 permanece abierta por MVP-130; este plan compartido no se archiva.

### Ejecución acotada de MVP-131

Dependencia MVP-120 integrada por PR #79/#81 (Issue #32). Se conserva `validate` y se añade un job Ubuntu aislado con Docker/Supabase local efímero, suites RLS, servidor local, persistencia, executor, rutas y Auth real local en serie. Se reutilizan CLI bloqueada y setup/reset existentes; no se cambia producto, paquetes, migraciones ni configuración compartida. Lanzador CI captura toda salida sensible sin publicarla, falla si faltan prerrequisitos y detiene solo su proyecto al finalizar. La DB de esta máquina está reservada a otro carril: no se arranca ni resetea aquí. Validación completada: sintaxis/YAML, checks sin DB y run Linux real; PR #83 integrado como `560edf7eaea8f32575f42781abe21cd8ee04ba60`. Sin proveedores/cloud, despliegue ni protección/checks obligatorios. MVP-130 y matriz futura MVP-121 quedan fuera.

Tareas del maestro: `MVP-130`, `MVP-131`

Producto: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (REQ-17, REQ-18; §11; INV-04, INV-06, INV-08, INV-12). Fundaciones: [mvp-shared-foundations](../../../design/mvp-shared-foundations.md) (SH-04, SH-07, SH-09). Proceso: [desarrollo](../../../development.md#navegador-y-ci), [workflow actual](../../../../.github/workflows/ci.yml), deuda #5 del [tracker](../../tech-debt-tracker.md).

## 1. Objetivo y alcance

- **`MVP-130` (seguridad):** límites de carga y rate limits en endpoints públicos y de upload; logs de acceso sin secretos ni contenido privado; auditoría de que ningún secreto llega al bundle; datos de demo ficticios.
- **`MVP-131` (CI):** el CI Linux ejecuta también los tests de servidor y RLS; protección de ramas y checks requeridos opcionales posthackathon, no exigidos por el usuario ni configurados en esta entrega.

Son dos checkpoints independientes: `MVP-130` es local y verificable con pruebas; `MVP-131` tiene una parte local (edición y validación del workflow) y una remota que exige autorización y permisos. La parte remota **solo bloquea `MVP-131`**, no a `MVP-130`.

Fuera de alcance: despliegue (`MVP-132`), cuentas de demo (`MVP-133`), nuevas funciones de producto, SMTP propio.

## 2. Trazabilidad

| ID | REQ / INV / SH | Idea de aceptación |
| --- | --- | --- |
| `MVP-130` | REQ-17; INV-04, INV-06, INV-08, INV-12; SH-02, SH-07, SH-08; PRD §11 | Límites, rate limits, logs sin secretos, sin secretos en bundle, demo ficticia |
| `MVP-131` | REQ-18; SH-09; deuda #5 | CI ejecuta tests de servidor/RLS en Linux real; protección de ramas opcional, no ejecutada |

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

Checkpoint A pendiente; checkpoint B integrado y aceptado. C4 es opcional y no se declara ejecutado.

**Checkpoint A — `MVP-130`**

- [ ] **S1 · Inventario** (← `MVP-054`, `MVP-073`, `MVP-101`). Endpoints públicos (invitación, verificador) y de upload; para cada uno: autenticación, límite de tamaño, tipo, rate limit y datos que devuelve.
- [ ] **S2 · Límites de carga y rate limits** (← S1). Aplicar los valores decididos; tests de rechazo por tamaño/tipo y por exceso de intentos, con error técnico explícito, sin alterar estados de producto. Límites en el verificador: carga acotada del PDF y procesamiento sin persistirlo por defecto (SH-06).
- [ ] **S3 · Logs sin secretos ni contenido privado** (← S1). Revisión y tests que fallan si un log, error o telemetría contiene tokens, PK privadas de fuentes, URLs firmadas, claves o texto de chat/evidencia (SH-02, SH-07, SH-08). Sin prompts completos por defecto.
- [ ] **S4 · Secretos fuera del bundle** (← S1). Construir **sin credenciales** (el build no debe inicializar proveedores) y construir de nuevo con valores centinela ficticios en variables de servidor; buscar los centinelas y nombres de variables privadas en la salida del cliente. Solo `NEXT_PUBLIC_*` pueden aparecer. No se leen `.env` reales.
- [ ] **S5 · Datos de demo ficticios** (← S2–S4). Verificar que fixtures, seeds y guion no contienen datos reales ni credenciales; barreras: sin fixtures en producto.

**Checkpoint B — `MVP-131`**

- [x] **C1 · Jobs ampliados** (← `MVP-120`). `validate` preservado; job `local-server-db` ejecuta RLS, servidor local, persistencia, executor, rutas y Auth real local en serie, reutilizando reset y seis migraciones. CLI instalada por lockfile, mismas acciones/Node, sin proveedores ni secretos configurados. YAML válido. DB de esta máquina reservada: suites con DB validadas en runner Linux exclusivo, no ejecutadas aquí.
- [x] **C2 · Equivalencia local/CI** (← C1). Comandos, captura privada, limpieza y exclusiones documentados en `docs/development.md`.
- [x] **C3 · Run remoto e integración** (← C2, `MVP-006`). PR #83, commit `4c23db8`: [run Linux 38954022116](https://github.com/nanonoir/galcoa/actions/runs/38954022116) verde con ambos jobs y limpieza exitosa. Revisión independiente PASS WITH FINDINGS sin bloqueantes; merge `560edf7` confirmado en `develop`.
- **C4 · Protección de ramas: opcional, no ejecutada.** Opt-out explícito del usuario durante la hackathon. Una futura configuración requiere autorización/permisos y verificación real; no bloquea C3 ni la aceptación de MVP-131.

## 7. Validación

| Qué | Nivel | Límite |
| --- | --- | --- |
| Límites y rate limits | Vitest/Playwright locales con base local | No acredita producción ni carga real |
| Bundle sin secretos | Build local con centinelas | No sustituye revisión de Vercel (`MVP-132`) |
| CI ampliado | Comandos locales + run remoto real | Un workflow sin run no es evidencia; un run no activa la protección |
| Branch protection | Lectura de la configuración real de GitHub | Requiere permisos |

Comandos locales: `npm run lint`, `typecheck`, `test`, `test:boundaries`, `build`, `test:e2e`, más los proyectos de servidor y base local.

## 8. Evidencia

2026-10-16 · rama `flow/35-server-ci`, PR [#83](https://github.com/nanonoir/galcoa/pull/83), implementación `4c23db8`. Local: `npm ci`, lint, typecheck y build correctos; `npm test` **984/984**, barreras **69/69**, navegador **89/89**; `node --test scripts/ci-local.test.mjs` **4/4** (dobles de CLI, sin Docker), sintaxis Node y YAML con `js-yaml` correctos; diff sin errores. `npm ci` informa nueve vulnerabilidades high del lockfile previo, sin actualización de paquetes ni audit fix.

[Run Linux 38954022116](https://github.com/nanonoir/galcoa/actions/runs/38954022116): **success**, `validate` 2m08s, `local-server-db` 5m24s. Arranque, cinco suites Vitest locales en serie, Auth real local y parada del proyecto exitosos. El job solo publica etiquetas/resultado, no conteos ni salida cruda de las suites; no se inventan conteos remotos ni se suman pruebas focales al total. Sin artefactos del job local ni secretos impresos. Revisión independiente `ses_eb9d6ce79ffe9t42ZTZstZFTh7`: PASS WITH FINDINGS, sin bloqueantes; revisor y coordinador repitieron 4/4 tests del lanzador sin DB. [Aceptación del coordinador](https://github.com/nanonoir/galcoa/pull/83#issuecomment-6223119632) e integración #83 confirmadas. MVP-131 completada; MVP-130 intacto. C4 opcional no ejecutado por opt-out, sin lectura/cambio de protecciones. No acredita MVP-121 completo, cloud, IA/HCS ni Vercel.

## 9. Referencias a completar

- **RQ-D1** → [release-validation](../../../specs/release-validation.md) (§2 y §5): criterios de aceptación de seguridad/privacidad verificables (`MVP-130`), qué cuenta como evidencia de CI y de protección de ramas (`MVP-131`) y requisitos de entorno de los jobs.
- **RQ-D2** → no aplica.

Decisiones locales abiertas (líder): mecanismo del rate limit (según `MVP-011`); forma de la búsqueda de centinelas en el bundle.

## 10. Rollback y límites

- Cambios de código y de workflow son reversibles por revert. La regla de branch protection se puede revertir en GitHub, pero es una acción remota y requiere autorización explícita; no se modifica sin ella.
- Sin lectura de `.env`, sin secretos en CI, sin proveedores reales; no se ejecuta commit/push/PR/merge sin pedido expreso.

## 11. Cierre

`MVP-130` se completa tras integrar y repetir los checks sobre la base; permanece pendiente. `MVP-131` aceptada con run remoto real e integración (C3); C4 no es obligatorio por opt-out explícito. El plan y #35 permanecen abiertos hasta completar ambos IDs; no se archiva este plan compartido al cerrar solo CI. La deuda #5 registra el avance sin declarar REQ-18 completo.

## Resultado de implementación — checkpoint MVP-131

### Implementado

PR [#83](https://github.com/nanonoir/galcoa/pull/83), merge `560edf7`: `validate` conservado y job Linux/Docker `local-server-db` serial con RLS, servidor local, persistencia, executor LOGIN, factories HTTP y tres casos Auth E2E locales reales. El lanzador Node mantiene privada la salida de CLI/suites, usa claves efímeras del runner sin secretos de proveedores, fuerza `RLS_SKIP_RESET=0` y falla ante prerrequisitos ausentes. Limpieza `always()` solo del proyecto propio `galcoa`, sin `--all` ni prune; no publica artefactos del job con DB.

### Desviaciones del diseño

Protección de ramas no configurada por decisión explícita del usuario; no es requisito de aceptación. La salida cruda se descarta por privacidad: un fallo publica etiqueta/resultado pero no diagnóstico detallado. La sugerencia menor del revisor de añadir exit status/signal quedó fuera, sin omitir suites ni bloquear cierre. No crea una deuda comprometida nueva.

### Validación

Metadatos GitHub comprobados: run `38954022116` SUCCESS sobre `4c23db8`; ambos jobs y limpieza SUCCESS, incluido build Next en `validate`. Las suites locales cubren RLS 119, servidor 8, persistencia 8, executor 6, rutas 2 y Auth 3 según sus inventarios/evidencia de implementación; los logs remotos suprimen conteos y esta clausura no los reejecutó. Revisión independiente y aceptación del coordinador sin bloqueantes; 4 tests del lanzador repetidos por ambos. Los previews Vercel fallaron por cuota externa build-rate-limit, advertida antes de integrar; no son evidencia de release ni invalidan el build de `validate`.

Reconciliación documental consolidada con UI: 73 filas (28 completadas, 27 en curso, 18 pendientes), únicamente cambios de MVP-111…115 y MVP-131 frente a `origin/develop`; F11 6/8 y F13 1/7. Catálogo conservado en 26 activos + 10 archivados. Cuatro JSON de rollout parseados; rutas propias del plan UI archivado y 330 enlaces relativos de Markdown modificado correctos. Referencia histórica JSON ajena a F2 preservada. `git diff --check` correcto; cero código modificado y sin reejecutar suites runtime por este cierre exclusivamente documental.

### Seguimiento

MVP-130 y su inventario de endpoints/seguridad transversal siguen pendientes: #35 abierta, sin cierre automático. MVP-121 (15 casos/cuatro selecciones), MVP-134 y despliegue conservan sus propias validaciones. Sin llamadas a DB o proveedores desde esta reconciliación documental; no se cambia código, paquetes, Auth, executor ni responsabilidades de Facu.

## Corrección acotada de cobertura CI — consolidación, etapa A

La auditoría posterior encontró dos suites ausentes del lanzador: persistencia de evidencias y E2E real de confirmaciones. La aceptación histórica de MVP-131 arriba no acredita estas regresiones nuevas. Esta corrección las agrega en serie después de rutas (evidencias) y Auth (confirmaciones), sin cambiar `validate`, resets, SQL, producto ni dependencias. Ante cualquier fallo no se ejecutan suites posteriores; stdout/stderr siguen privados y solo se informan estado, señal y timeout. Limpieza limitada al proyecto del runner.

La suite de evidencias deja de contar ocho migraciones: enumera versiones de los archivos SQL del repositorio y exige igualdad exacta con el historial ordenado de la DB, además de conjunto no vacío y sin versiones duplicadas. No permite versiones faltantes, adicionales o sustituidas con igual cantidad.

Validación inicial sin Docker: `node --test scripts/ci-local.test.mjs` 9/9 en Windows (CLI dobles): orden exacto, reset forzado, fallo cerrado en suites previas/nuevas/Auth, privacidad, script ausente, runner/modo inválidos y parada propia. Pendiente repetir tras el último ajuste de diagnóstico y ejecutar CI Linux real en PR. No se inicia ni resetea la pila local reservada. MVP-130 permanece pendiente; no se cierra #35 ni se declara aceptada la ampliación sin run remoto.
