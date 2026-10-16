# F13 · Despliegue en Vercel y datos y cuentas de demo

**Estado: planificado; implementación no iniciada.** ExecPlan derivado del [plan maestro](../mvp-master-plan.md) (filas de `MVP-132` y `MVP-133`). El maestro conserva IDs, estados y evidencia; este plan no los modifica.

Tareas del maestro: `MVP-132`, `MVP-133`

Producto: [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§0 límite de correo, §2 flujos demostrables, §11, §13 variables de entorno). Fundaciones: [mvp-shared-foundations](../../../design/mvp-shared-foundations.md) (SH-05, SH-07, SH-09). Entorno: [desarrollo](../../../development.md#entorno-y-seguridad), plantilla [`.env.example`](../../../../.env.example).

## 1. Objetivo y alcance

- **`MVP-132`:** proyecto Vercel con nombres de variables de servidor y solo `NEXT_PUBLIC_*` públicas, redirecciones de Auth y migraciones aplicadas.
- **`MVP-133`:** cuentas precreadas/autorizadas, datos ficticios y guion de demo, con credenciales fuera del repositorio.

Gran parte es **acción externa** (cuenta de Vercel, proyecto y credenciales de Supabase). Por eso el plan separa preparación local —que no espera nada— de checkpoints remotos que requieren autorización expresa del usuario y **bloquean solo su propio paso**. El smoke real integrado y la evaluación real son `MVP-134/135` ([plan](f13-live-validation-and-closure.md)).

Fuera de alcance: SMTP propio para registros públicos, pagos, Mainnet, dominios personalizados no pedidos, desactivar la confirmación de email por defecto en cloud.

## 2. Trazabilidad

| ID | REQ / INV / PRD | Idea de aceptación |
| --- | --- | --- |
| `MVP-132` | REQ-17; INV-04, INV-06; PRD §11, §13 | Solo `NEXT_PUBLIC_*` hacia cliente; claves privilegiadas únicamente en servidor; migraciones aplicadas; sin secretos en el repo |
| `MVP-133` | REQ-01; PRD §0 (límite de 2 correos/hora del emisor integrado), §2, §11 | Cuentas precreadas/autorizadas; confirmación por defecto activa; datos ficticios; guion de demo; credenciales fuera del repo |

## 3. Dependencias

- `MVP-132` ← `MVP-026` (entorno Supabase de desarrollo/demo y migraciones aplicadas), `MVP-118` (revisión de accesibilidad/responsive), `MVP-130` (seguridad), `MVP-131` (CI y protección).
- `MVP-133` ← `MVP-031` (registro, login, logout y recuperación reales), `MVP-132`.
- Por paso: V1 (checklist local) no tiene dependencias remotas; V2 ← `MVP-026`, autorización; V3 ← V2; V4 ← V3, `MVP-118`, `MVP-130`, `MVP-131`; V5 ← V4; D1 ← `MVP-031`, V5; D2 ← D1; D3 ← D2.
- Los pasos V1 y el borrador del guion (D0) no esperan a nada.

## 4. Archivos: propiedad y límites

| Zona | Owner | Notas |
| --- | --- | --- |
| Configuración de Vercel y de Supabase cloud | **Externo / Líder con autorización** | Fuera del repo; el agente no lee valores ni los imprime |
| `.env.example` | Líder | Solo nombres; si el consumidor real exige un nombre nuevo, se actualiza sin valores |
| `vercel.json` u otra configuración de despliegue | Líder, solo si es imprescindible | Se justifica; no se añade por costumbre |
| `docs/development.md` (sección de despliegue) | Líder | Solo procedimiento, nunca secretos |
| Credenciales de cuentas de demo | **Fuera del repositorio** | Gestor de secretos o entrega manual del propietario |
| Colaborador | No participa | |

## 5. Insumos y salidas

| Insumo | Origen |
| --- | --- |
| Migraciones aplicables y proyecto Supabase de demo | `MVP-026` (autorizado) |
| Lista de variables | `.env.example` (nombres PRD §13): públicas `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; de servidor: claves de IA, Hedera (red `testnet`) y claves privilegiadas de Supabase si las necesita el consumidor |
| Resultados de seguridad y CI | `MVP-130`, `MVP-131` |

Salidas: despliegue accesible, runbook sin secretos, cuentas de demo disponibles, guion de demo (§9 de este plan), registro de qué se verificó en remoto.

## 6. Pasos y checkpoints

Todos pendientes. Todo lo remoto exige autorización del usuario y no se ejecuta por defecto.

**Checkpoint A — preparación local (sin dependencias remotas)**

- [ ] **V1 · Checklist de despliegue** (Líder). Variables por nombre y su alcance (cliente/servidor), URLs de redirección de Auth a configurar, orden de migraciones, comprobación de que el `build` funciona **sin credenciales** (la arquitectura exige no inicializar proveedores en build) y límite de duración de funciones frente a la finalización recuperable por fases (SH-05): verificar con la documentación oficial vigente del plan contratado; si no cabe, registrar la limitación, no inventar asincronía garantizada.
- [ ] **D0 · Borrador del guion de demo** (Líder). Ver §9 del plan; solo ficción.

**Checkpoint B — `MVP-132` (remoto, autorizado)**

- [ ] **V2 · Proyecto Supabase de demo y migraciones** (← `MVP-026`; autorización y credenciales fuera del repo). Verificar que las migraciones del repo están aplicadas en ese proyecto.
- [ ] **V3 · Proyecto Vercel** (← V2; autorización y cuenta). Crear/vincular el proyecto, cargar variables **por el propietario** (el agente no ve valores), solo públicas `NEXT_PUBLIC_*` hacia cliente.
- [ ] **V4 · Configuración de Auth** (← V3, `MVP-118`, `MVP-130`, `MVP-131`). Redirecciones y URL del sitio de Auth apuntando al dominio desplegado.
- [ ] **V5 · Despliegue y comprobación mínima** (← V4). Deploy; comprobar carga de landing, redirección sin sesión y ausencia de secretos en el bundle desplegado; sin llamadas a proveedores todavía. Registrar URL y ID de despliegue.

**Checkpoint C — `MVP-133` (remoto, autorizado)**

- [ ] **D1 · Cuentas de demo** (← `MVP-031`, V5). Precreadas/autorizadas: el emisor de correo integrado es limitado (PRD §0); **no** desactivar la confirmación por defecto en cloud. Credenciales entregadas fuera del repo.
- [ ] **D2 · Datos ficticios** (← D1). Documentos de ejemplo del PRD §2 (entrega comercial, medición/control) sin datos reales ni regulados (PRD §11).
- [ ] **D3 · Ensayo del guion** (← D2). Recorrer el guion en el entorno desplegado hasta donde no requiera proveedores reales; el tramo con IA/HCS reales pertenece a `MVP-134`.

## 7. Validación

| Qué | Cómo | Límite |
| --- | --- | --- |
| Build sin credenciales | `npm run build` local | No prueba el entorno Vercel |
| Despliegue | Inspección del deploy y bundle desplegado | No acredita flujo con IA/HCS reales |
| Auth | Registro/login con cuentas de demo | El emisor integrado impone cuota; no se usa para pruebas masivas |

Local: `npm run lint`, `typecheck`, `test`, `test:boundaries`, `build`. Remoto: solo con autorización y credenciales fuera del repo.

## 8. Evidencia

No ejecutada. Se registrará: fecha · comandos y resultados reales · URL y ID de despliegue · qué se comprobó en remoto y qué no. Sin secretos, sin valores de variables.

## 9. Referencias a completar y guion de demo (borrador)

- **RQ-D1** → [release-validation](../../../specs/release-validation.md) (§1 y §5): criterios de aceptación del despliegue y la demo (`MVP-132/133`) y requisitos de evidencia remota; la falta de permiso remoto bloquea solo esta tarea.
- **RQ-D2** → no aplica.

**Guion de demo (borrador; sin credenciales, datos ficticios):** (1) registro/login con una cuenta de demo; (2) crear un documento y conversar una entrega comercial con una cantidad contradictoria entre chat y remito (p. ej. 10 vs 12 cajas) y fecha no informada; (3) mostrar el borrador con advertencias materiales sin bloqueo; (4) elegir selección de participantes; (5) compartir el enlace manualmente y confirmar/rechazar desde otra sesión sin cuenta; (6) finalización con PDF; (7) sello en Testnet y verificación pública con y sin PDF. Los pasos 6–7 con proveedores reales dependen de `MVP-134`.

## 10. Rollback y límites

- Despliegue: revertir al deploy anterior desde Vercel o retirar el proyecto; sin migraciones destructivas. Supabase: no se ejecutan migraciones destructivas sin autorización.
- Todo cambio remoto requiere autorización expresa; no se leen `.env` ni valores de variables; no se guardan credenciales en el repo ni en documentos.
- Sin commit/push/PR/merge sin pedido.

## 11. Cierre

`MVP-132` se completa con despliegue verificado y evidencia real **tras integrar** los cambios del repo; `MVP-133` con cuentas, datos y guion comprobados. Si falta autorización, cuenta o credenciales, solo esa tarea queda `bloqueada`. Luego: recuento del §3 del maestro. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.
