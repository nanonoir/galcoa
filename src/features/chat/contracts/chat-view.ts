import { z } from "zod";

import { IdSchema, InstantSchema } from "@/lib/contracts/common";

/**
 * Contrato de vista del chat (MVP-054, REQ-03). Describe lo que la presentación
 * recibe ya resuelto por el container: no hay red, SDK ni reglas de negocio aquí.
 * Un estado de UI (`streaming`, `uploading`…) no es un estado de negocio del PRD §5,
 * y un error técnico nunca equivale a una advertencia de contenido.
 */

export const ChatMessageViewSchema = z.strictObject({
  messageId: IdSchema,
  sender: z.enum(["autor", "agente"]),
  /** Texto original, sin recortar ni normalizar. */
  content: z.string().min(1),
  sentAt: InstantSchema,
});

/** Mensaje del asistente aún en curso: texto parcial, no persistido. */
export const ChatStreamingViewSchema = z.strictObject({
  content: z.string(),
});

export const ChatAttachmentStatusSchema = z.enum([
  "uploading",
  "uploaded",
  "extracting",
  "extracted",
  "uploaded_without_extraction",
  "rejected",
  "failed",
]);

export const ChatAttachmentViewSchema = z.strictObject({
  /** Clave local estable mientras la carga no tiene identificador del servidor. */
  attachmentId: IdSchema,
  fileName: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  status: ChatAttachmentStatusSchema,
  /** 0–100; solo con `uploading` y cuando el transporte lo informa. */
  progress: z.number().min(0).max(100).nullable(),
  /** Motivo estable del servidor (`rejected`/`failed`); la presentación no lo interpreta. */
  reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]*$/).nullable(),
  retryable: z.boolean(),
});

export const ChatErrorKindSchema = z.enum(["network", "provider", "storage", "permissions", "other"]);

/** Impedimento técnico de una etapa. Nunca se muestra como éxito ni como advertencia de contenido. */
export const ChatErrorViewSchema = z.strictObject({
  kind: ChatErrorKindSchema,
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  retryable: z.boolean(),
  correlationId: IdSchema.nullable(),
});

export const ChatContrastStatusSchema = z.enum(["idle", "running", "done", "unavailable"]);

export const ChatViewStateSchema = z.strictObject({
  messages: z.array(ChatMessageViewSchema),
  /** `null` si no hay respuesta en curso. */
  streaming: ChatStreamingViewSchema.nullable(),
  attachments: z.array(ChatAttachmentViewSchema),
  /** Contraste automático del Agente 2: no bloquea el chat. */
  contrast: ChatContrastStatusSchema,
  /** Error del último turno; `null` si no hubo. */
  turnError: ChatErrorViewSchema.nullable(),
});

export type ChatMessageView = z.infer<typeof ChatMessageViewSchema>;
export type ChatAttachmentStatus = z.infer<typeof ChatAttachmentStatusSchema>;
export type ChatAttachmentView = z.infer<typeof ChatAttachmentViewSchema>;
export type ChatErrorKind = z.infer<typeof ChatErrorKindSchema>;
export type ChatErrorView = z.infer<typeof ChatErrorViewSchema>;
export type ChatContrastStatus = z.infer<typeof ChatContrastStatusSchema>;
export type ChatViewState = z.infer<typeof ChatViewStateSchema>;

/** Props de la presentación: datos serializables y callbacks originados en cliente. */
export interface ChatViewProps {
  state: ChatViewState;
  /** Límite de caracteres por mensaje (F1); la presentación lo muestra, el servidor lo impone. */
  maxMessageChars: number;
  onSend: (content: string) => void;
  onCancel: () => void;
  onRetryTurn: () => void;
  onAttach: (files: File[]) => void;
  onRetryAttachment: (attachmentId: string) => void;
}
