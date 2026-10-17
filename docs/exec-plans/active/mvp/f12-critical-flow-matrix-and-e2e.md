# F12 · Matriz del PRD §12 y E2E del flujo crítico

**Estado: planificado; implementación no iniciada.** ExecPlan derivado del [plan maestro](../mvp-master-plan.md) (fila de `MVP-121`). El maestro conserva IDs, estados y evidencia; este plan no los modifica.

Tareas del maestro: `MVP-121`

Producto: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (REQ-18; §12; INV-03, INV-11…INV-18). Fundaciones: [mvp-shared-foundations](../../../design/mvp-shared-foundations.md) (SH-09 define la distribución de evidencia por frontera). Base previa: [`f12-server-test-harness`](../../completed/f12-server-test-harness.md). Política de evidencia: [release-validation](../../../specs/release-validation.md) (§1–§3). Seam del E2E: [data-transactions §7](../../../design/data-transactions.md#7-costuras-de-tests-y-evidencia).

## 1. Objetivo y alcance

Una **matriz completa** de los 15 casos deterministas del PRD §12, cada uno con al menos un test enlazado, más un E2E del flujo crítico con dobles que cubra las cuatro selecciones. Ese E2E es evidencia **compuesta** («navegador Next + integración de handlers con dobles», ver §6/M4), no un recorrido Next íntegro con proveedores fake. Los huecos se listan en la fila del maestro, no se ocultan; un hueco (caso no probado, nivel insuficiente o prueba fallida) no cierra REQ-18 ni se acepta como cumplimiento de un caso sin probar. Esta tarea **integra** pruebas de otras tareas y completa lo que falte; no reemplaza los tests propios de cada servicio.

No entra: evaluación de IA (otro plan), smoke real autorizado (`MVP-134`), CI (`MVP-131`), pruebas de despliegue. Un E2E con dobles **no** acredita Supabase cloud, proveedores reales ni Hedera, ni el cableado HTTP de todas las mutaciones Next→proveedores; ese recorrido íntegro con adapters reales es el smoke autorizado `MVP-134`.

## 2. Trazabilidad

REQ-18 y PRD §12.1…§12.15; INV-03, INV-05, INV-06, INV-08, INV-11…INV-18; SH-04, SH-05, SH-06, SH-09.

**Cobertura mínima obligatoria**

| Eje | Qué debe quedar probado |
| --- | --- |
| Los 15 casos del §12 | Cada uno enlazado a ≥1 test real |
| 4 selecciones (INV-14) | solo autor; autor + intermediario; autor + comprador; los tres. Siempre autor; un enlace distinto por tercero; mismo contenido completo con advertencias; ningún tercero obtiene chat ni evidencias |
| Actor / checkbox / modal | Checkbox vacío no permite confirmar y marcado sí; rechazar exige casilla desmarcada y modal ratificado; cancelar no responde ni consume token; acción de rechazo visible y accesible; rechazo impide finalizar esa revisión y permite otra |
| Mismos bytes | Reintento de sello y de finalización conservan los mismos bytes/hash de PDF; un byte alterado falla la integridad |
| HCS incierto | Timeout tras envío = resultado incierto, no fallido seguro; se reconcilia antes de reintentar; no se afirma «registrado» sin comprobarlo |
| Prueba pública Mirror (negativos) | Falta un eslabón del vínculo PDF → hash → envelope → mensaje; Mirror Node no disponible o retrasado → «no verificable/pendiente», nunca éxito; topic/red incorrectos; mensaje distinto del compromiso esperado; sin PDF → solo estado del registro |

## 3. Dependencias

- Del maestro: `MVP-024` (RLS y buckets), `MVP-031` (flujos reales de Auth, para la sesión del autor en el E2E), `MVP-076` (pantalla pública de confirmación), `MVP-077` (UI de revisión del autor), `MVP-084` (nueva versión), `MVP-092` (reconciliación HCS), `MVP-100` (servicio de verificación), `MVP-116` (páginas del producto integradas), `MVP-120` (harness).
- **Checkpoints por nivel**, para no bloquear lo local por el ciclo completo: las filas de la matriz de nivel contrato/servidor/RLS se completan cuando su tarea fuente esté integrada, sin esperar a la UI; solo los E2E de navegador esperan a `MVP-031`, `MVP-076/077` y `MVP-116`. `MVP-121` se completa únicamente cuando las 15 filas y el E2E de las cuatro selecciones tienen evidencia del nivel exigido por release-validation; un caso sin probar o con evidencia insuficiente es un hueco que se lista y mantiene REQ-18 abierto, no un cierre aceptado. El hueco de transporte/composición Next→proveedores es un **límite declarado** del E2E compuesto (se documenta en la matriz y lo cierra el smoke `MVP-134`); no bloquea circularmente a `MVP-121` ni a `MVP-134`.
- Por paso: M1 ← `MVP-120`; M2 ← M1; M3 ← M2 y tareas fuente por fila; M4 ← `MVP-031`, `MVP-076`, `MVP-077`, `MVP-116`, M3; M5 ← M3, M4.

## 4. Archivos: propiedad y límites

Todo **Líder**: `tests/server/`, `tests/contracts/`, `tests/e2e/`, `playwright.config.ts`, `vitest.config.ts`. Sin cambios en `src/lib/**`. Los tests de presentación del colaborador pueden aportar filas (p. ej. §12.12) pero se enlazan, no se mueven.

Reglas: ninguna **ruta mock de producto**, ninguna bandera de producción que cambie a dobles. El E2E real y autorizado vive en `MVP-134`, sin fallback a mock.

## 5. Insumos y salidas

Insumos: harness `MVP-120` (incluido el puente de bundle de test); tests de cada tarea F2–F10; presentaciones `MVP-076/077` y páginas integradas de `MVP-116`. Salida: la matriz (sección de evidencia de este plan) con columnas `caso · comportamiento · nivel · test · tarea fuente · estado`, y una convención de título de test `[PRD §12.N]` que permite verificar por búsqueda textual que los 15 casos están enlazados. Los huecos pasan a la fila `MVP-121` del maestro al cerrarla.

### Distribución propuesta por frontera (según SH-09; se confirma al ejecutar)

| Caso §12 | Nivel principal | Notas |
| --- | --- | --- |
| 1 Aislamiento A/B | Supabase local real (RLS, Storage) | Incluye anon y respuestas privadas |
| 2 Persistencia y v2 sin alterar v1 | Servidor con base local | |
| 3 Confirmar autor / solo autor / sin PDF ni HCS prematuros | Servidor + base local | |
| 4 Advertencias sin bloqueo; impedimentos sí | Contratos + servidor con dobles | Advertencia ≠ error técnico (SH-03) |
| 5 Estados deterministas; agentes mockeados | Vitest Node | Mismos eventos → mismo resultado |
| 6 Fallo HCS: sello pendiente, mismo PDF/hash, incierto reconcilia | Servidor con dobles HCS/Mirror | |
| 7 Un byte del PDF falla | Servidor con dobles | Verificación con PDF aportado |
| 8 Invitación vence/revoca; GET no consume; atomicidad | Base local con concurrencia real | Conexiones independientes |
| 9 Cuatro selecciones | Servidor + E2E | Ver §2 |
| 10 Devolución posterior conserva entrega | Servidor con base local | |
| 11 Cambio material crea revisión sin herencia | Base local | Sustituye enlaces pendientes |
| 12 Checkbox, rechazo, modal | Componentes + Playwright | No sustituye RLS |
| 13 Sin PDF/HCS antes de todas las confirmaciones | Servidor | Un solo sello por versión, ninguno por confirmación |
| 14 Verificador ≠ invitación; sin fugas | Servidor + Playwright | Sin chat, evidencias ni constancias |
| 15 Cantidades contradictorias y medición sin unidad | Servidor + componentes | Sin validación visual independiente |

## 6. Pasos y checkpoints

Todos pendientes.

- [ ] **M1 · Esqueleto de la matriz** (← `MVP-120`). Tabla con los 15 casos y estado inicial «sin test»; convención `[PRD §12.N]`; comando de comprobación que lista casos sin test enlazado.
- [ ] **M2 · Inventario** (← M1). Para cada caso, listar tests ya aportados por las tareas fuente; marcar lo que falta.
- [ ] **M3 · Completar tests de servidor y RLS** (← M2 y la tarea fuente integrada de cada fila). Incluir los negativos de §2 (Mirror, byte alterado, resultado incierto, doble respuesta). Concurrencia con conexiones independientes (SH-09).
- [ ] **M4 · E2E con dobles de las cuatro selecciones** (← `MVP-076`, `MVP-077`, M3). Playwright sobre rutas/páginas reales de Next con base local, según la costura ya decidida en [data-transactions §7](../../../design/data-transactions.md#7-costuras-de-tests-y-evidencia): las lecturas SSR/autorización usan la base local real; las mutaciones que necesitan proveedor se interceptan en el navegador, el runner Node invoca las **mismas factories de handlers** (importadas del bundle de test de `MVP-120`) con Auth local real y dobles solo de Gemini/Groq/Storage/HCS/Mirror, y devuelve su respuesta; cada transición se verifica en la base local y la siguiente lectura SSR real la observa. Recorrer cada selección: autor confirma desde sesión, cada tercero abre su enlace (GET no consume), contenido idéntico, checkbox, confirmar o rechazar con modal, finalización solo tras todas. La matriz rotula esta evidencia «navegador Next + integración de handlers con dobles», identifica los requests interceptados y declara el límite: **no** prueba el cableado HTTP de todas las mutaciones Next; el recorrido íntegro con adapters reales es `MVP-134`. No se promete un mecanismo de inyección abierto, un flag de producto ni un clon de la aplicación; no hay fixtures de red estáticos que finjan persistencia. Los flujos centrales usan RLS/Postgres reales, no mocks.
- [ ] **M5 · Cierre de la matriz** (← M3, M4). Ejecutar `npm run lint`, `typecheck`, `test`, `test:boundaries`, `build` y `test:e2e`; verificar por búsqueda textual que los 15 `[PRD §12.N]` existen; listar huecos.

## 7. Validación

| Evidencia | Acredita | No acredita |
| --- | --- | --- |
| Vitest con dobles | Lógica determinista, contratos, estados | RLS, proveedores reales |
| Base local real | RLS, constraints, atomicidad e inmutabilidad | Cloud/Vercel |
| Playwright con dobles (navegador Next + handlers con dobles) | Flujo de interfaz, lecturas SSR reales y lógica persistida con dobles de proveedores | Comportamiento con Gemini/Groq/Hedera reales; cableado HTTP de todas las mutaciones Next |

La integración real autorizada pertenece a [`f13-live-validation-and-closure`](f13-live-validation-and-closure.md) (`MVP-134`). Sin llamadas a proveedores ni a Supabase cloud en este plan.

## 8. Evidencia

No ejecutada. Se registrará: matriz completa con enlace a cada test, comandos y resultados reales, fecha, rama/PR/commit y lista de huecos.

## 9. Referencias a completar

- **RQ-D1** → [release-validation](../../../specs/release-validation.md) (§1, §3): criterios y matriz de evidencia por frontera, matriz exacta de los 15 casos (archivo + nombre del test + enlace) y definición de hueco. Este plan usa esas reglas y no las duplica.
- **Costura del E2E** → [data-transactions §7](../../../design/data-transactions.md#7-costuras-de-tests-y-evidencia): puente de bundle de test, Auth local real y límite transparente; este plan lo consume sin repetirlo. Su ajuste a la aceptación del maestro (`MVP-121`) lo hace el líder.
- **RQ-D2** → no aplica.

## 10. Rollback y límites

- Solo tests y configuración de tests: se revierten sin afectar producto. Un test inestable se corrige o se aísla con motivo registrado; no se oculta.
- Sin secretos, sin proveedores, sin cloud; sin commit/push/merge sin autorización.

## 11. Cierre

Se completa cuando la matriz tiene los 15 casos enlazados (o huecos aceptados explícitamente), el E2E de las cuatro selecciones pasó **tras integrar**, y la evidencia real está en la fila `MVP-121`. Después: actualizar la deuda #5 en el [tracker](../../tech-debt-tracker.md) solo cuando proceda (se hace en el cierre, no aquí), recuento del §3 del maestro. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
