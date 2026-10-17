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
}).superRefine((attachment, ctx) => {
  const failed = attachment.status === "rejected" || attachment.status === "failed";
  if (attachment.progress !== null && attachment.status !== "uploading") {
    ctx.addIssue({ code: "custom", path: ["progress"], message: "El progreso solo aplica a `uploading`." });
  }
  if (attachment.reasonCode !== null && !failed) {
    ctx.addIssue({ code: "custom", path: ["reasonCode"], message: "El motivo solo aplica a `rejected` o `failed`." });
  }
  if (attachment.retryable && !failed) {
    ctx.addIssue({ code: "custom", path: ["retryable"], message: "El reintento solo aplica a `rejected` o `failed`." });
  }
});

export const ChatErrorKindSchema = z.enum(["network", "provider", "storage", "permissions", "cancelled", "other"]);

/** Impedimento técnico de una etapa. Nunca se muestra como éxito ni como advertencia de contenido. */
export const ChatErrorViewSchema = z.strictObject({
  kind: ChatErrorKindSchema,
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  retryable: z.boolean(),
  correlationId: IdSchema.nullable(),
});

export const ChatContrastStatusSchema = z.enum(["idle", "running", "done", "unavailable"]);

/**
 * Borrador publicado por el turno. `warnings` y `notInformed` solo existen si el servidor los
 * informó (en un replay faltan): la presentación no los sustituye por cero.
 */
export const ChatDraftNoticeSchema = z.strictObject({
  draftId: IdSchema,
  draftRevision: z.number().int().nonnegative(),
  title: z.string(),
  warnings: z.number().int().nonnegative().optional(),
  notInformed: z.number().int().nonnegative().optional(),
});

/** Hallazgo del contraste: aviso no bloqueante, nunca un impedimento. */
export const ChatContrastFindingSchema = z.strictObject({
  message: z.string().min(1),
  severity: z.enum(["warning", "critical"]),
});

export const ChatViewStateSchema = z.strictObject({
  messages: z.array(ChatMessageViewSchema),
  /** `null` si no hay respuesta en curso. */
  streaming: ChatStreamingViewSchema.nullable(),
  attachments: z.array(ChatAttachmentViewSchema),
  /** Contraste automático del Agente 2: no bloquea el chat. */
  contrast: ChatContrastStatusSchema,
  /** Error del último turno; `null` si no hubo. */
  turnError: ChatErrorViewSchema.nullable(),
  /** Último borrador publicado por el turno, si lo hay. */
  draft: ChatDraftNoticeSchema.nullable().optional(),
  /** Hallazgos del último contraste; ausente si no corrió. */
  contrastFindings: z.array(ChatContrastFindingSchema).optional(),
});

export type ChatMessageView = z.infer<typeof ChatMessageViewSchema>;
export type ChatAttachmentStatus = z.infer<typeof ChatAttachmentStatusSchema>;
export type ChatAttachmentView = z.infer<typeof ChatAttachmentViewSchema>;
export type ChatErrorKind = z.infer<typeof ChatErrorKindSchema>;
export type ChatErrorView = z.infer<typeof ChatErrorViewSchema>;
export type ChatContrastStatus = z.infer<typeof ChatContrastStatusSchema>;
export type ChatDraftNotice = z.infer<typeof ChatDraftNoticeSchema>;
export type ChatViewState = z.infer<typeof ChatViewStateSchema>;

/** Props de la presentación: datos serializables y callbacks originados en cliente. */
export interface ChatViewProps {
  state: ChatViewState;
  /** Límite de caracteres por mensaje (F1); la presentación lo muestra, el servidor lo impone. */
  maxMessageChars: number;
  onSend: (content: string) => void;
  onCancel: () => void;
  onRetryTurn: () => void;
  /** Sin callbacks de adjuntos la presentación no ofrece la carga (aún sin ruta conectada). */
  onAttach?: (files: File[]) => void;
  onRetryAttachment?: (attachmentId: string) => void;
}
