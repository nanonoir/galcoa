# ExecPlan — Demo del MVP: camino feliz, título editable, acciones del chat y «Subir Contrato»

Estado: activo (2026-10-17). Pedido directo del usuario (sin Issue). Excepción de producto aceptada por el usuario para la demo.

## Objetivo

Hacer presentable el recorrido principal del MVP:

1. Poder renombrar el documento (hoy siempre queda «Documento sin título»).
2. Ocultar **todas** las advertencias en todo el sistema (chat, contraste, snapshot, revisión, confirmación de terceros, verificador, PDF).
3. Al terminar el agente, mostrar debajo de los mensajes y arriba del input: «Revisar» (con ícono de ojo, abre vista previa del PDF), «Confirmar» (solo autor) y «Compartir con terceros».
4. Reemplazar «Finalizar» por «Subir Contrato» (ícono flecha arriba) con spinner hasta que la huella quede registrada en Hedera Testnet, y mostrar el enlace de verificación.

## Decisiones confirmadas por el usuario

- D1. Las advertencias se ocultan también en el PDF y en cualquier otra superficie. El agente puede seguir generándolas y persistiéndolas; solo no se muestran. Riesgo aceptado: contradice PRD INV-02/INV-10 y §5 (advertencias visibles). Se registra en `tech-debt-tracker.md`.
- D2. «Confirmar» (solo autor) congela la revisión con únicamente el autor y registra la confirmación del autor (con casilla de ratificación, INV-13); después aparece «Subir Contrato».
- D3. El texto del botón es «Subir Contrato».

## Decisiones técnicas

- T1. Interruptor de servidor y cliente: constante `DEMO_HIDE_WARNINGS = true` en `src/lib/demo-mode.ts` (sin variable de entorno, para que el PDF y la UI no diverjan entre entornos). Volver atrás = poner `false`.
- T2. Con el interruptor activo el chat no llama al contraste (evita el 503 visible y costos de IA).
- T3. Renombrar: migración nueva `rename_document` (SECURITY DEFINER, mismo patrón F4, solo propietario, 1–200 caracteres, rechazada si el documento está finalizado, auditada) + `PATCH /api/documents/[id]`. Si el título sigue siendo el predeterminado al publicarse el primer borrador, la UI lo propone/aplica desde el título del borrador.
- T4. Vista previa: `GET /api/documents/[id]/preview` renderiza con `@react-pdf/renderer` desde el borrador vigente con marca «Vista previa — no es la versión final»; no se persiste, no se hashea, no va a HCS; `Cache-Control: no-store`; solo propietario.
- T5. Sello: el `POST` de finalización ya espera el sello; la respuesta se amplía con identificadores públicos (`reference`, `topicId`, `sequenceNumber`, `transactionId`, `consensusTimestamp`) cuando está `registrado` (INV-06: solo hashes e identificadores opacos). Si queda `pendiente`, el cliente reintenta el `POST` (idempotente, reconcilia sin reenviar) con tope acotado. Tras publicar se hace `router.refresh()`.

## Pasos

- [x] P1. Interruptor y ocultamiento de advertencias (UI + PDF + contraste).
- [x] P2. «Subir Contrato», spinner y enlace de huella (respuesta del servidor ampliada).
- [x] P3. Renombrar documento (migración, ruta, UI).
- [x] P4. Barra de acciones del chat, confirmación solo autor y vista previa del PDF.
- [x] P5. Validación: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:boundaries`, `npm run build`.
- [ ] P6. Revisión independiente (toca finalización/Hedera y migración).
- [ ] P7. Aplicar la migración nueva a `galcoa-dev` (requiere autorización explícita) y desplegar.

## Validación

Tests unitarios/componentes actualizados para cada pantalla modificada; tests de la ruta `PATCH` y de la vista previa; verificación de que ningún texto de advertencia se renderiza con el interruptor activo.

## Progreso y evidencia

- P1/P2 (2026-10-17): flag `DEMO_HIDE_WARNINGS` en `src/lib/contracts/demo-mode.ts` (reexportado en `src/lib/demo-mode.ts` por barreras de imports); el chat no llama al contraste; el PDF final omite advertencias. «Subir Contrato» con spinner por etapa; `POST` de finalización devuelve `seal` con `reference`, `topicId`, `sequenceNumber`, `transactionId`, `consensusTimestamp` cuando está registrado; reintento acotado del `POST` y `router.refresh()`. Deuda registrada en `tech-debt-tracker.md` §9.
- P3 (2026-10-17): migración `20261017000100_rename_document.sql` (`public.rename_document`, patrón F4, solo propietario, rechaza finalizado, auditada), `PATCH /api/documents/[id]`, `DocumentTitleEditor`. No probada contra Supabase local (CLI no instalada en este equipo).
- Landing (pedido adicional del usuario): encabezado sin atajos ni menú; a la derecha «Cerrar sesión» con sesión o «Ingresar» sin sesión.
- P5 (2026-10-17, validación consolidada sobre `develop` con todos los cambios y el estilo de `ui-estilo-roadmap.md`): `lint` OK; `typecheck` OK; `npm test` 94 archivos / 1393 tests OK; `test:boundaries` 69 OK; `build` OK; Playwright `responsive-a11y` + `next` + `preview` 141 OK y 1 fallo ajeno: `next.spec.ts` «rutas privadas fallan cerradas sin configuración de Auth» espera 500 pero este equipo tiene `.env` con Supabase y responde 307 (supuesto del test sin `.env`; en CI sin `.env` debería pasar).
- P6: no ejecutada antes de la entrega; el usuario pidió subir a `develop` y abrir PR a `main`.

- P4 (barra de acciones, confirmación solo autor, vista previa; 2026-10-17): implementado. `GET /api/documents/[id]/preview` (PDF efímero con marca «Vista previa — no es la versión final», sin constancias/advertencias/hash/HCS, propietario, `no-store`, 409 `NO_DRAFT`) y `GET /api/documents/[id]/draft` (resumen `draftRevision`/título para hidratar al recargar y fijar `expectedDraftRevision`), ambos vía `src/lib/documents/preview-http.ts` + `preview-runtime.ts`. Chat: `ChatActionsBar` (Revisar/Confirmar/Compartir) y `ChatActionsContainer` (freeze solo autor → confirm → `confirmations` → `FinalizationContainer`); auto-título en `ChatContainer`. Evidencia: `npm run lint`, `typecheck`, `npm test` (94 archivos, 1396 tests) y `test:boundaries` (69) en verde; tests nuevos `chat-container-actions.test.tsx` y `tests/server/routes/preview.test.ts`. Sin llamadas reales a servicios. El enlace fijo «Revisar y compartir con los participantes» se quitó de `documents/[id]/page.tsx` (las acciones viven en la barra del chat).
