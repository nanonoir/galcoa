import "server-only";

import { z } from "zod";

import { IdSchema, SchemaVersionSchema } from "@/lib/contracts/common";

import type { DocumentStore, IdempotencyInput } from "./ports";

/**
 * Auditoría solo-agregar (MVP-044; INV-08, REQ-15).
 *
 * - La superficie solo agrega: no existe actualizar ni borrar eventos. En base,
 *   `audit_events` es append-only por trigger (MVP-023).
 * - Catálogo cerrado y versionado; cada tarea posterior agrega sus tipos aquí.
 * - Payload mínimo: identificadores y correlación. Sin contenido de mensajes,
 *   prompts, tokens ni secretos (el esquema estricto rechaza campos extra).
 * - Mutaciones críticas (crear documento, registrar mensaje) escriben su evento
 *   en la misma transacción, pasándolo al puerto de escritura; `appendAuditEvent`
 *   cubre solo eventos no transaccionales.
 * - Retención: INV-08 admite la eliminación legalmente necesaria mediante un
 *   procedimiento separado con permisos extraordinarios (data-transactions §6).
 *   No se fija plazo aquí (MVP-011/012/014): no hay purga automática.
 */

const BaseEventSchema = {
  schemaVersion: SchemaVersionSchema,
  actorScope: IdSchema,
  documentId: IdSchema,
  outcome: z.enum(["ok", "rechazado", "error"]),
  correlationId: IdSchema,
};

export const AuditEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...BaseEventSchema, type: z.literal("document.created"), resourceType: z.literal("document"), resourceId: IdSchema }),
  z.strictObject({ ...BaseEventSchema, type: z.literal("message.recorded"), resourceType: z.literal("message"), resourceId: IdSchema }),
  z.strictObject({ ...BaseEventSchema, type: z.literal("evidence.accepted"), resourceType: z.literal("evidence"), resourceId: IdSchema }),
  z.strictObject({ ...BaseEventSchema, type: z.literal("extraction.recorded"), resourceType: z.literal("extraction"), resourceId: IdSchema }),
]);

/**
 * Eventos ALC que escribe SQL dentro de la transacción que los provoca (migración 20261020000100). No pasan por
 * `appendAuditEvent`: la RPC `append_document_audit` no los acepta a propósito, para que no puedan fabricarse
 * desde TypeScript. El catálogo existe para lectores y pruebas de paridad con el SQL. Metadatos: ids, color y
 * códigos; nunca contenido, citas ni valores de las fuentes.
 */
export const ALC_AUDIT_ACTIONS = {
  EVALUATED: "alc.evaluated",
  REVISION_FROZEN: "revision.frozen",
  FINALIZATION_BLOCKED: "finalization.blocked",
  SEAL_BLOCKED: "seal.blocked",
} as const;

export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditEventType = AuditEvent["type"];

export const AUDIT_EVENT_TYPES = AuditEventSchema.options.map((o) => o.shape.type.value);

export class InvalidAuditEventError extends Error {
  constructor() {
    super("Evento de auditoría inválido");
    this.name = "InvalidAuditEventError";
  }
}

/** Valida un evento; lanza sin incluir el contenido recibido. */
export function parseAuditEvent(event: unknown): AuditEvent {
  const parsed = AuditEventSchema.safeParse(event);
  if (!parsed.success) throw new InvalidAuditEventError();
  return parsed.data;
}

/** Agrega un evento no transaccional. Un reintento con la misma clave no duplica. */
export async function appendAuditEvent(
  store: Pick<DocumentStore, "appendAuditEvent">,
  event: unknown,
  idempotency: IdempotencyInput,
): Promise<"created" | "replayed"> {
  return store.appendAuditEvent(parseAuditEvent(event), idempotency);
}
