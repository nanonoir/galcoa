import type { ChatViewState } from "@/features/chat/contracts/chat-view";

/**
 * Escenarios ficticios de la presentación del chat (MVP-054). Solo para tests y
 * preview: no se importan desde código de producto ni representan servicios reales.
 */

const base: ChatViewState = {
  messages: [],
  streaming: null,
  attachments: [],
  contrast: "idle",
  turnError: null,
};

const history: ChatViewState["messages"] = [
  { messageId: "m1", sender: "autor", content: "Entregué 40 bolsas de semilla a Pérez el lunes.", sentAt: "2026-03-02T14:00:00.000Z" },
  { messageId: "m2", sender: "agente", content: "Anoté la entrega. ¿Quién la recibió y en qué lugar?", sentAt: "2026-03-02T14:00:05.000Z" },
];

export const chatScenarios: { id: string; label: string; state: ChatViewState }[] = [
  { id: "empty", label: "Sin mensajes", state: base },
  { id: "history", label: "Historial", state: { ...base, messages: history, contrast: "done" } },
  {
    id: "streaming",
    label: "Respuesta en curso",
    state: { ...base, messages: history.slice(0, 1), streaming: { content: "Estoy armando el borrador" } },
  },
  {
    id: "provider-error",
    label: "Error del proveedor",
    state: {
      ...base,
      messages: history.slice(0, 1),
      turnError: { kind: "provider", code: "PROVIDER_UNAVAILABLE", retryable: true, correlationId: "corr-1" },
    },
  },
  {
    id: "attachment-rejected",
    label: "Adjunto rechazado",
    state: {
      ...base,
      attachments: [
        { attachmentId: "a1", fileName: "remito.exe", byteLength: 2048, status: "rejected", progress: null, reasonCode: "UNSUPPORTED_TYPE", retryable: false },
      ],
    },
  },
  {
    id: "upload-in-progress",
    label: "Carga en curso",
    state: {
      ...base,
      attachments: [
        { attachmentId: "a2", fileName: "remito.pdf", byteLength: 150_000, status: "uploading", progress: 40, reasonCode: null, retryable: false },
      ],
    },
  },
];
