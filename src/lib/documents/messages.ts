import "server-only";

import { z } from "zod";

import { DeclaredEventDateSchema, MessageSchema, type Message } from "@/lib/contracts/core";

import type { DocumentStore, SessionPort } from "./ports";
import {
  commandFingerprint,
  failure,
  IDEMPOTENCY_KEY_PATTERN,
  newId,
  type ServiceDeps,
  type ServiceResult,
} from "./result";

/**
 * Mensajes persistentes del chat (MVP-041; REQ-03, INV-09, SH-01/03/04).
 *
 * - El original se conserva sin modificar: no se recorta ni normaliza, y no
 *   hay edición ni borrado (en base, `messages` es append-only).
 * - Orden por secuencia del servidor. La fecha real de carga la fija la base;
 *   el cliente no puede enviarla (el comando es estricto).
 * - La fecha declarada del hecho es un campo propio (texto, precisión, zona);
 *   nunca se completa con la de carga ni se infiere medianoche UTC.
 * - Idempotencia por actor/documento/acción con fingerprint: el mismo comando
 *   devuelve el mensaje persistido; la misma clave con otro contenido es conflicto.
 */

/** Límite aprobado en F1 (MVP-013) para un mensaje de chat. Se rechaza, no se trunca. */
export const MAX_MESSAGE_CHARS = 8000;

export const RecordMessageCommandSchema = z.strictObject({
  documentId: z.string().min(1),
  content: z
    .string()
    .refine((s) => s.trim().length > 0, "Mensaje vacío")
    .refine((s) => s.length <= MAX_MESSAGE_CHARS, `Supera ${MAX_MESSAGE_CHARS} caracteres`),
  declaredEventDate: DeclaredEventDateSchema,
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY_PATTERN),
});

export type RecordMessageCommand = z.infer<typeof RecordMessageCommandSchema>;

export function createMessageService(session: SessionPort, store: DocumentStore, deps: ServiceDeps = {}) {
  const correlation = deps.newCorrelationId ?? newId;

  async function record(sender: Message["sender"], command: unknown): Promise<ServiceResult<Message>> {
    const correlationId = correlation();
    const userId = await session.currentUserId();
    if (!userId) return failure("NO_SESSION", "autenticacion", false, correlationId);

    const parsed = RecordMessageCommandSchema.safeParse(command);
    if (!parsed.success) return failure("INVALID_INPUT", "validacion", false, correlationId);
    const { documentId, content, declaredEventDate, idempotencyKey } = parsed.data;

    try {
      const result = await store.appendMessage({
        ownerId: userId,
        documentId,
        sender,
        content,
        declaredEventDate,
        idempotency: {
          key: idempotencyKey,
          fingerprint: commandFingerprint({
            schemaVersion: 1,
            action: sender === "autor" ? "message.record" : "message.record_agent",
            documentId,
            content,
            declaredEventDate,
          }),
        },
        audit: { actorScope: userId, correlationId },
      });
      if (result.status === "idempotency_conflict") {
        return failure("IDEMPOTENCY_CONFLICT", "persistencia", false, correlationId);
      }
      if (result.status === "not_available") return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
      return { ok: true, value: MessageSchema.parse(result.value), replayed: result.status === "replayed" };
    } catch {
      return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
    }
  }

  return {
    /** Mensaje del autor desde el chat. */
    recordUserMessage: (command: unknown) => record("autor", command),

    /**
     * Puerto para la respuesta oficial del agente (MVP-052). Solo se usa con la
     * respuesta completa: un parcial de streaming nunca se guarda como mensaje.
     */
    recordAgentMessage: (command: unknown) => record("agente", command),

    async listMessages(documentId: string): Promise<ServiceResult<Message[]>> {
      const correlationId = correlation();
      const userId = await session.currentUserId();
      if (!userId) return failure("NO_SESSION", "autenticacion", false, correlationId);
      try {
        const messages = await store.listMessages(userId, documentId);
        if (!messages) return failure("NOT_AVAILABLE", "persistencia", false, correlationId);
        return { ok: true, value: messages.map((m) => MessageSchema.parse(m)) };
      } catch {
        return failure("TECHNICAL_FAILURE", "persistencia", true, correlationId);
      }
    },
  };
}
