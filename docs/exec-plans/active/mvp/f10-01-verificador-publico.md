# F10-01 — Verificador público

**Estado: planificado (no iniciado).** Ninguna tarea de este plan está implementada ni validada.

Tareas del maestro: `MVP-100`, `MVP-101`

Referencias: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3.13, §9, §10, §12.7, 12.14, REQ-11) · [arquitectura](../../../architecture.md) · [fundaciones](../../../design/mvp-shared-foundations.md) (SH-02, SH-06, SH-07, SH-09) · [desarrollo](../../../development.md#checks-según-el-cambio) · [maestro](../mvp-master-plan.md).

## 1. Alcance

Servicio de verificación y página pública `verify/[reference]`, **separados de la invitación**. Con PDF: comprobar integridad de sus bytes y la cadena de hashes contra el mensaje HCS recuperado. Sin PDF: informar solo el estado del registro, sin afirmar que se verificó un archivo. Nunca expone chat, evidencias, constancias personales ni el manifiesto privado.

**Fuera:** emisión del manifiesto/envelope ([f08-02](f08-02-manifiesto-version-inmutable-y-nueva-version.md)); envío y reconciliación HCS y lector de Mirror ([f09-01](f09-01-hedera-hcs-testnet.md)). Este plan consume ambos.

## 2. Dependencias y entrada exacta

| Tarea | Depende de (maestro) | Entrada requerida |
| --- | --- | --- |
| `MVP-100` | `MVP-093`, `MVP-083` | Lector de Mirror tipado ([f09-01](f09-01-hedera-hcs-testnet.md)); versión inmutable con `pdfHash`, envelope público, `manifestHash` y localizadores persistidos ([f08-02](f08-02-manifiesto-version-inmutable-y-nueva-version.md)); reglas de verificación y mensajes de [RQ-C3](#8-referencias-a-completar) |
| `MVP-101` | `MVP-100` | Servicio y esquema de resultado; contrato de verificación pública de `MVP-021` |

Entradas no formales: Postgres local real; para Playwright, un doble de Mirror inyectado por la costura de tests de [data-transactions §7](../../../design/data-transactions.md#7-costuras-de-tests-y-evidencia) (bundle de test con las mismas factories; sin URL de proveedor arbitraria ni flag productivo) en lugar de la red; sin credenciales. La lectura SSR de la página no puede interceptarse: las rutas que consultan Mirror se prueban en tests de servidor con dobles y en el navegador solo las mutaciones/POST (p. ej. subida del PDF) interceptables, con el límite declarado en la matriz.

## 3. Requisitos e invariantes aplicables

REQ-11, REQ-16, REQ-17. INV-06, INV-15 (acceso distinto del de invitación; integridad ≠ verdad factual), INV-05, INV-18. [SH-06](../../../design/mvp-shared-foundations.md#sh-06--manifiesto-privado-prueba-pública-y-hcs-incierto) (envelope público, vínculo PDF → `pdfHash` → `manifestHash` → mensaje HCS), [SH-02](../../../design/mvp-shared-foundations.md#sh-02--contratos-versionados-y-proyecciones-explícitas) (verificación pública por allowlist), [SH-07](../../../design/mvp-shared-foundations.md#sh-07--capas-auth-y-ownership-de-archivos).

## 4. Objetivo y aceptación por ID

**`MVP-100` — Servicio de verificación.**

- [ ] Entrada: referencia pública opaca y, opcionalmente, bytes de un PDF. Una referencia inexistente produce la misma respuesta externa que una no verificable (sin enumerar).
- [ ] **Sin PDF:** solo estado del registro (`no_iniciado / pendiente / registrado / fallido` en términos públicos, con localizadores de consenso si hay) y nunca «archivo verificado» ni «integridad comprobada».
- [ ] **Con PDF:** calcula SHA-256 de los bytes y compara con `pdfHash` del envelope; recomputa `manifestHash` desde el envelope canónico y lo compara con el persistido y con el mensaje recuperado de HCS (topic y red correctos). Resultados: `integridad comprobada` (todos los eslabones coinciden), `discrepancia` (algún eslabón definitivamente distinto), `no verificable` (falta un eslabón, sello pendiente/incierto, Mirror indisponible o reinicio de Testnet). **Un byte alterado produce discrepancia** (PRD §12.7).
- [ ] Un fallo del Mirror o un sello pendiente nunca produce «integridad comprobada»; tampoco se reintenta ni se modifica el registro desde el verificador.
- [ ] El DTO público se construye por allowlist con esquema estricto: referencia, estado del registro, envelope canónico no sensible, localizadores y resultado. Sin operación, participantes, constancias, evidencias, chat, rutas, IDs privados ni manifiesto privado; sin hashes individuales de evidencias.
- [ ] El PDF aportado se procesa en memoria con límites de tamaño/tipo, no se publica ni persiste y su nombre/contenido no se registra en logs.
- [ ] Límite de abuso y de carga conforme a la decisión de `MVP-011`/RQ-C3 para endpoints públicos (PD-02); acceso de lectura a datos públicos por función o proyección de permisos mínimos, no por un bypass general de RLS (RQ-C2).
- [ ] Mensajes y resultados no afirman verdad factual de la operación.

**`MVP-101` — Página `verify/[reference]`.**

- [ ] Ruta, layout y componentes **separados** de `confirm/[token]`; no comparte token ni contenedor con la invitación; la invitación no verifica y el verificador no confirma.
- [ ] Sin PDF muestra solo el estado del registro; con PDF muestra el resultado real (comprobada/discrepancia/no verificable) con texto que explica el alcance («integridad del archivo respecto al registro», no veracidad de los hechos).
- [ ] Carga de PDF acotada (tipo, tamaño, un archivo) con validación cliente solo como ayuda; el servidor decide. Estados: cargando, error, referencia no encontrada/no verificable, resultado. Accesible por teclado, con anuncio del resultado y responsive.
- [ ] Menciona que Testnet puede reiniciarse y no ofrece permanencia de producción; sin «certificado», «validado» ni «garantizado».
- [ ] `noindex`, `Cache-Control` apropiado, sin recursos de terceros; el archivo no sale del servidor hacia terceros.

## 5. Rutas, propiedad y fronteras

Todo del líder; el verificador es superficie pública sensible y **no se delega** inicialmente.

| Superficie | Contenido |
| --- | --- |
| `src/lib/documents/verification/` (propuesta, `server-only`) | Servicio: lectura pública de la versión, comparación de la cadena, clasificación del resultado |
| `src/lib/hedera/mirror.ts` | Lector de [f09-01](f09-01-hedera-hcs-testnet.md); se reutiliza, no se duplica |
| `src/lib/contracts/` | Esquema de verificación pública y de resultado: de `MVP-021` |
| `supabase/migrations/` | Función/proyección de solo lectura de datos públicos de versión, permisos mínimos (RQ-C2) |
| `src/app/api/verify/[reference]/route.ts` (propuesta) | `GET` estado sin PDF; `POST` con PDF (multipart) |
| `src/app/verify/[reference]/page.tsx` | Server Component; DTO hacia el container |
| `src/features/documents/containers/`, `src/features/documents/components/` (verificador) | Container cliente (subida, estado) y presentación sin red ni SDK; `react-dropzone` ya está en `package.json` |
| `tests/server/`, `tests/e2e/` | Vitest (bytes, matriz) y Playwright con doble de Mirror vía el bundle de test de `MVP-120` |

**Límite de plataforma.** El despliegue puede restringir el tamaño del cuerpo de una petición de función; se verifica con documentación oficial del plan contratado al ejecutar (`MVP-132`). Si un PDF final puede superar el límite soportado, se registra como limitación o se somete a decisión del líder (p. ej., mecanismo alternativo de cálculo del hash), sin cambiar el comportamiento acordado por iniciativa propia (PD-01).

## 6. Pasos ejecutables

1. **C100-0 Verificar entrada.** `MVP-093` y `MVP-083` integradas; localizar los datos públicos persistidos (envelope, `manifestHash`, localizadores). Sin ellos, bloquear solo esta tarea.
2. **C100-1 Comparador de cadena.** Función pura: entradas (`pdfBytes?`, envelope, `manifestHash` persistido, resultado de Mirror, red/topic esperados) → resultado clasificado. Tests de tabla con todas las combinaciones, incluyendo byte alterado, envelope manipulado, topic/red incorrectos, sello pendiente, Mirror indisponible.
3. **C100-2 Proyección pública.** Construcción por allowlist; test de fuga con centinelas de chat/evidencia/constancia/nombre/correo/ruta/ID privado en el JSON serializado de la respuesta y de los errores.
4. **C100-3 Servicio y handlers.** Límites de tamaño y tipo; lectura en memoria; sin persistir ni registrar el archivo; errores estables; limitador de abuso.
5. **C100-4 Pruebas con base local.** Acceso de lectura público por función restringida; `anon` sin acceso a tablas.
6. **C101-0 Presentación y container.** Estados y textos de RQ-C3; accesibilidad; sin importar presentación/containers de la invitación.
7. **C101-1 Ruta.** Server Component + DTO; cabeceras; `noindex`.
8. **C101-2 Playwright.** Con base local sembrada con una versión ficticia y un doble de Mirror (seam de §7 del diseño de datos): sin PDF (solo registro), PDF correcto (comprobada), un byte alterado (discrepancia), Mirror caído (no verificable), referencia inexistente; verificar que el navegador no hace peticiones a hosts externos y que no hay ningún elemento de confirmación/invitación.

## 7. Validación (ejecución pendiente — no ejecutado)

| Check | Cobertura | Estado |
| --- | --- | --- |
| `lint`, `typecheck`, `test`, `test:boundaries`, `build` | `server-only`; presentación sin red/SDK/env; `build` sin llamar a Mirror | no ejecutado |
| Vitest Node: comparador y clasificación; byte alterado; allowlist y fuga de datos | PRD §12.7, 12.14 | no ejecutado |
| Vitest contra Postgres local real | Función pública de solo lectura con permisos mínimos; `anon` sin tablas; usuario autenticado sin privilegios adicionales | no ejecutado |
| Playwright (`npm run test:e2e`) con doble de Mirror vía el bundle de test (evidencia compuesta, no recorrido Next íntegro) | PRD §12.14: verificador distinto de invitación; sin PDF no afirma integridad; sin fugas; accesibilidad básica y móvil/escritorio | no ejecutado |
| Verificación real contra Mirror de Testnet | Solo en `MVP-134`, con autorización; **no se ejecuta aquí** | no ejecutado |

## 8. Referencias a completar

Documentos objetivo **disponibles** y enlazados; los parámetros operativos (entropía, vigencia, cuotas, límites, perfil y tiempos) siguen siendo propuestas **no aprobadas** hasta que F1 (`MVP-011/012/013`) los registre. Este plan consume los documentos y no los reescribe.

| ID | Documento | Qué necesita este plan |
| --- | --- | --- |
| RQ-C3 | [`manifest-hcs`](../../../design/manifest-hcs.md) | Cadena de verificación exacta (qué se compara con qué y en qué orden), resultados y mensajes públicos, contenido del envelope público, límites de carga del PDF, política de reinicio de Testnet y de sello pendiente |
| RQ-C2 | [`data-transactions`](../../../design/data-transactions.md) | Función/proyección pública de solo lectura, permisos, sin bypass general de RLS |
| RQ-C4 | [`public-capabilities`](../../../specs/public-capabilities.md) (registro abierto de `MVP-011`, §8) | Límite de abuso aplicable también a este endpoint, si la decisión lo abarca |

## 9. Decisiones pendientes

- **PD-01** Tamaño máximo del PDF aceptado y su relación con el límite de cuerpo del despliegue; decisión de producto/arquitectura si hay conflicto (no se resuelve aquí).
- **PD-02** Qué límite de abuso rige para el verificador (si `MVP-011` no lo cubre, requiere decisión).
- **PD-03** Si el sello está `pendiente` pero el envelope ya existe, la presentación exacta del resultado `no verificable` la fija RQ-C3.

## 10. Rollback y recuperación

- Antes de integrar: descartar la rama; sin datos ni efectos externos.
- Tras integrar: revertir ruta y servicio sin tocar datos. El verificador es de solo lectura: no hay estado propio que recuperar. Si se detecta fuga de datos privados, retirar la ruta pública de inmediato (revertir o deshabilitar el commit), corregir la allowlist y añadir el caso al test antes de reponerla.
- Si el Mirror falla durante una verificación: devolver `no verificable`; nunca persistir ni cachear un resultado de éxito.

## 11. Cierre

Con integración y evidencia real, actualizar solo las filas `MVP-100` y `MVP-101` y el recuento del §3 del maestro; archivar al cerrar ambas. La verificación contra Testnet real queda acreditada por `MVP-134`. Documentar no marca nada. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

[Maestro](../mvp-master-plan.md) · [PRD](../../GALCOA-PRD-v1.4.md) · [Arquitectura](../../../architecture.md)
