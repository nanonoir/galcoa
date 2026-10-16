# F4 — Evidencias: carga privada, hash y extracción de texto

Tareas del maestro: `MVP-042`, `MVP-043`

**Estado: implementado con puertos y dobles el 2026-10-16 (rama `issue/11-evidence-extraction`); faltan los adaptadores Supabase/Storage, las RPC, las rutas y la prueba en base real (Nahuel).** Fuentes: [maestro](../mvp-master-plan.md), [PRD v1.5](../../GALCOA-PRD-v1.4.md) (§3, §4 REQ-04, §6 INV-04/07/09, §11, §12), [fundaciones](../../../design/mvp-shared-foundations.md) (`SH-01`, `SH-03`, `SH-05`, `SH-07`, `SH-08`, `SH-10`), [arquitectura](../../../architecture.md), [desarrollo](../../../development.md). No repite esos documentos.

## 1. Objetivo y estado de partida

`MVP-042`: aceptar texto, PDF e imágenes simples dentro de los límites decididos, conservar el original en Storage privado con SHA-256 de sus bytes y metadatos, y rechazar con motivo técnico explícito. `MVP-043`: persistir texto extraído con procedencia; un fallo del proveedor es un impedimento informado, nunca texto inventado, y no se proclama verificación visual independiente.

**Estado real verificado:** no existen Storage, buckets ni integración de extracción/IA. `@ai-sdk/google` está instalado, sin consumidor; faltan `ai`, `@ai-sdk/react` y `groq-sdk`. Solo hay contratos de resumen y herramientas. Nada de lo descrito está implementado.

## 2. Criterios del PRD

| Tarea | REQ / INV | Aceptación (resumen) |
| --- | --- | --- |
| `MVP-042` | REQ-04, REQ-17, INV-09, INV-06 | Originales privados, hash, metadatos; rechazo técnico explícito; sin URL pública permanente (PRD §11) |
| `MVP-043` | REQ-04, REQ-06 (insumo), INV-07 | Texto con procedencia; fallo = impedimento informado; sin independencia visual proclamada (PRD §4 «Límites de actuación») |

## 3. Dependencias

| Para | Requiere `completada` en el maestro |
| --- | --- |
| `MVP-042` | `MVP-041` (mensajes), `MVP-010` (decisión de límites y pipeline **documentada**), `MVP-024` (RLS y buckets) |
| `MVP-043` | `MVP-042` y `MVP-050` (cliente Gemini servidor) |

- `MVP-042` **no** depende de `MVP-050`: el endpoint de extracción es independiente de la carga (§5), para que 042 pueda cerrarse antes que el proveedor.
- Salidas: `MVP-054` consume `MVP-042`; `MVP-053` y `MVP-061` consumen `MVP-043`; `MVP-051` puede aceptar extracciones opcionales (ver su plan).
- Una tarea que depende de `MVP-010` no empieza su consumidor sin la decisión documentada (maestro §8.7). Las partes independientes (hash sobre bytes, adaptador de Storage con nombre reservado, esquema de rechazo) pueden avanzar antes.

## 4. Decisiones y pendientes

- **Pendiente `MVP-010`** ([SH-10](../../../design/mvp-shared-foundations.md)): tipos MIME, tamaños, páginas, tratamiento de texto/PDF/imagen y de discrepancias visuales. Este plan no fija valores; los límites se leen de una configuración tipada cuya fuente es el registro aprobado de `MVP-010` (ver `RQ-B1`, [sources-and-ai §7](../../../specs/sources-and-ai.md)). Cualquier default de desarrollo se etiqueta «propuesto, no aprobado».
- **Texto como evidencia:** si «texto» es un archivo `.txt` o contenido pegado almacenado como evidencia lo define `MVP-010`; el plan implementa la parte común (bytes + hash) y deja la variante pendiente.
- **Metadatos estructurados de PDF** (productor, fechas de creación/modificación) necesarios para `MVP-061`: si se extraen deterministamente aquí o en otra etapa lo decide `MVP-010`. Solicitud en §10.
- **Disparador de la extracción:** endpoint separado invocado por el container tras una carga exitosa (decisión técnica local, desacopla 042 de 050); alternativas se evalúan al implementar sin cambiar contratos.
- **Contratos `MVP-020/021`:** esquemas de evidencia y extracción son base compartida; no se redefinen aquí.

## 5. Rutas y propiedad

| Zona | Permitido (Líder) | Prohibido |
| --- | --- | --- |
| `src/lib/documents/evidence*` (o equivalente en `src/lib/documents/`) | Servicio de evidencias, `server-only` | Lógica de revisión/finalización |
| `src/lib/supabase/` | Adaptador de Storage privado (bucket de `MVP-024`) y persistencia | URLs públicas, claves en cliente |
| `src/lib/ai/` | Servicio de extracción que usa el cliente de `MVP-050` | Herramientas de acción, envío a blockchain (INV-04) |
| `src/app/api/` | Handlers de carga y de extracción (propuestos: `POST /api/documents/[id]/evidences`, `POST /api/documents/[id]/evidences/[evidenceId]/extraction`) | Endpoints de otros dominios |
| `tests/server/` | Casos con dobles de Storage y de Gemini | Dobles en código de producto; `src/mocks/` solo depende de contratos |
| `src/features/*/components/` | Nada (la UI de adjuntos va en `MVP-054`) | Todo |

## 6. Pasos

### 6.1 MVP-042 — Carga privada

- [ ] Verificar `MVP-010` documentado; leer la fila y las guías locales de Route Handlers (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`) para el tratamiento de cuerpos multipart/binarios en la versión instalada.
- [ ] Validación de entrada: sesión y propiedad del documento, tipo declarado vs. firma real de los bytes, tamaño y páginas según `MVP-010`; límite aplicado antes de leer todo en memoria cuando la API lo permita.
- [ ] Reservar `evidenceId` y ruta de objeto opaca (no el nombre de archivo del usuario); calcular SHA-256 sobre los bytes originales exactos (`SH-03`), longitud y MIME verificado; subir sin sobrescritura; persistir registro con propietario, hash, longitud, ruta privada, nombre original saneado como metadato privado, `createdAt` del servidor y fecha declarada del hecho opcional separada.
- [ ] Orden y recuperación: si falla la persistencia tras subir, limpieza acotada solo de objetos no referenciados; si falla la subida, no se persiste el registro. Idempotencia por clave del cliente (mismo contenido: mismo registro; distinto: conflicto, `SH-04`).
- [ ] Errores técnicos con código estable (rechazo por tipo, tamaño, páginas, corrupción, almacenamiento), no mensajes de advertencia de contenido. Una imagen ilegible **no** se rechaza por contenido: es una limitación informativa posterior (`SH-03`).
- [ ] Acceso al original: sin URL permanente pública; si se requiere lectura, URL firmada breve solo para el propietario, no cacheable entre usuarios (`SH-07`).
- [ ] Emitir evento de auditoría mediante `MVP-044` (identificadores y hash; sin contenido ni nombre sensible).

### 6.2 MVP-043 — Extracción con procedencia

- [ ] Texto directo: decodificación determinista sin IA, registrada con método `directo`.
- [ ] PDF/imagen: llamada servidor a Gemini mediante el cliente de `MVP-050`, con la evidencia como dato **no confiable** delimitado, sin herramientas, salida estructurada validada con Zod (`SH-08`). Ilegible o ambiguo se marca como limitación; jamás se completa un valor.
- [ ] Persistir extracción separada del original: texto, método/proveedor/modelo, versión de prompt, página o región cuando exista, limitaciones y tiempo del servidor; cada reintento crea otro registro, no sobrescribe. Marca persistida: «interpretada por Gemini; sin verificación visual independiente».
- [ ] Fallo de red/proveedor, configuración ausente o salida inválida: impedimento técnico informado, estado de operación técnica `fallida` reintentable; no se crea extracción ni texto de relleno; el original no se altera.
- [ ] Logs y auditoría con IDs de correlación; sin prompts, texto de documentos ni secretos.
- [ ] Contrato de lectura de extracciones para `MVP-051/053/061` (puerto de servidor); la forma exacta la fija `MVP-020`.

## 7. Casos de test por aceptación

| Aceptación | Caso |
| --- | --- |
| `MVP-042` | Subida válida: hash coincide con SHA-256 de los bytes; registro privado; ruta no derivada del nombre; sin URL pública |
| `MVP-042` | Tipo no admitido, tamaño excedido, firma que no corresponde al MIME, PDF corrupto: rechazo con código estable, sin objeto persistido |
| `MVP-042` | Documento ajeno o sin sesión: denegado; mismo contenido con la misma clave: un registro |
| `MVP-042` | Fallo de Storage simulado: no queda registro; fallo de persistencia: sin referencia a objeto huérfano |
| `MVP-042` | Fecha del hecho y fecha de carga separadas (INV-09) |
| `MVP-043` | Texto directo se persiste con método `directo`; PDF/imagen con doble de Gemini persisten procedencia y limitación visual |
| `MVP-043` | Fallo del proveedor/config ausente/salida inválida: error técnico, cero extracción persistida, original intacto, reintento crea otro registro |
| `MVP-043` | Contenido con instrucciones inyectadas («ignora lo anterior…») no altera esquema ni acciones; ninguna herramienta expuesta |
| `MVP-043` | Ninguna cadena de la UI ni del DTO afirma «verificado visualmente» |

Aislamiento de Storage entre dos usuarios: `MVP-024`/`MVP-121`, con base local real.

## 8. Validación, evidencia y rollback

Checks: `lint`, `typecheck`, `npm test`, `test:boundaries` y `build` (rutas y dependencias). **Evidencia (2026-10-16):** `src/lib/documents/evidence/` (inspect, ports, service) y `src/lib/ai/extraction/` (prompt-v1, service con lector); pruebas `tests/server/evidence/` y `tests/server/extraction/` 43/43 con dobles de Storage, base y modelo Gemini (puerto real de MVP-050 con `MockLanguageModelV4`); `npx vitest run --project server` 163, `npm test` 429, lint, typecheck, boundaries 67 y build en verde. Archivos de Files API no hacen falta: cada archivo mide ≤ 10 MiB y la solicitud entra inline (§7.5). Sin llamadas reales. Límites: el conteo de páginas es determinista sin librería (un PDF cuyo árbol de páginas solo está en flujos comprimidos se rechaza como ilegible); el nombre original no se guarda porque la tabla `evidences` no tiene columna para eso. La extracción real con Gemini y Storage remoto no se prueban aquí: requieren autorización y credenciales (`MVP-134/135`); no se leen secretos ni se llama a proveedores. Un fallo de proveedor no se reemplaza con un mock ni con «texto extraído» ficticio. Rollback: revertir archivos del plan; objetos de prueba en Storage local se eliminan con el entorno local.

## 9. Cierre

Se valida tras integrar. Actualizar solo las filas `MVP-042` y `MVP-043` y el recuento del maestro; archivar el plan. Escribir este documento no marca tareas. **Al archivar:** mover el plan a `docs/exec-plans/completed/`, conservar su enlace en las filas de sus IDs actualizándolo a la nueva ubicación y corregir los relativos del propio plan (pierden un nivel: `../../../x` → `../../x`, `../../GALCOA-PRD-v1.4.md` → `../GALCOA-PRD-v1.4.md`; el maestro pasa a `../active/mvp-master-plan.md` y los planes hermanos aún activos a `../active/mvp/<plan>.md`). El cierre registra solo los IDs propios, el recuento del §3 del maestro y la evidencia de la integración en `develop` (hasta la transición de `MVP-006`, la base vigente). Se archiva únicamente al completar; ningún plan se archiva ahora.

## 10. Pendientes y solicitudes

**Referencias:** `RQ-B1` — [sources-and-ai](../../../specs/sources-and-ai.md) (§1, §6 y §7): alcance de fuentes, casos S-01/S-03 y registro abierto de `MVP-010` (formatos, tamaños, páginas, pipeline, metadatos PDF), aún propuesto, no aprobado; `RQ-B2` — [data-transactions](../../../design/data-transactions.md): objetos privados, tablas de evidencia/extracción y orden objeto↔fila.

**Solicitudes:** a `MVP-020` (contratos de evidencia/extracción con proveedor, método, página y limitaciones); a `MVP-024` (políticas de bucket compatibles con subida de servidor y lectura firmada); a `MVP-061` (¿qué metadatos PDF necesita?); a `MVP-054` (consumir el endpoint de extracción tras la carga).

**Decisiones pendientes:** valores de `MVP-010` (parte dependiente: límites y pipeline de PDF/imagen); no hay otras.

[Maestro](../mvp-master-plan.md) · [Fundaciones](../../../design/mvp-shared-foundations.md) · Siguiente en F5: [Proveedor Gemini](f05-gemini-provider.md)
