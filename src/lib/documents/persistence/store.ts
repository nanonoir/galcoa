import "server-only";

import { z } from "zod";

import { DocumentRecordSchema, MessageSchema } from "@/lib/contracts/core";

import { parseAuditEvent } from "../audit";
import type { DocumentStore } from "../ports";

/** Compatible con Supabase.rpc; no crea clientes ni lee configuración. */
export interface DocumentRpc {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export interface DocumentStoreContext {
  /** Identidad ya verificada con Auth, nunca del body. La sesión RPC debe ser la misma. */
  verifiedUserId: string;
  session: DocumentRpc;
  /** Solo canal galcoa_executor. No pasar un cliente service_role. */
  executor?: DocumentRpc;
}

const writeResult = <T extends z.ZodType>(value: T) => z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("created"), value }),
  z.strictObject({ status: z.literal("replayed"), value }),
  z.strictObject({ status: z.literal("idempotency_conflict") }),
  z.strictObject({ status: z.literal("not_available") }),
]);

/** Errores SDK/SQL no atraviesan la frontera del dominio. Sin fallback en memoria. */
export function createDocumentStore(context: DocumentStoreContext): DocumentStore {
  function requireActor(actor: string) {
    if (!actor || actor !== context.verifiedUserId) throw new Error("Operación no autorizada");
  }
  async function call(name: string, args?: Record<string, unknown>, internal = false): Promise<unknown> {
    const client = internal ? context.executor : context.session;
    if (!client) throw new Error("Transporte del ejecutor no disponible");
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error("Persistencia no disponible");
    return data;
  }
  function document(value: unknown) {
    const record = DocumentRecordSchema.parse(value);
    requireActor(record.ownerId);
    return record;
  }
  return {
    async createDocument(input) {
      requireActor(input.ownerId);
      requireActor(input.audit.actorScope);
      const result = writeResult(DocumentRecordSchema).parse(await call("create_document", {
        p_title: input.title, p_key: input.idempotency.key, p_correlation_id: input.audit.correlationId,
      }));
      if ("value" in result) document(result.value);
      return result;
    },
    async listDocuments(ownerId) {
      requireActor(ownerId);
      return z.array(z.unknown()).parse(await call("list_documents")).map(document);
    },
    async getDocument(ownerId, documentId) {
      requireActor(ownerId);
      const value = await call("get_document", { p_document_id: documentId });
      if (value === null) return null;
      const record = document(value);
      if (record.documentId !== documentId) throw new Error("Respuesta de persistencia inválida");
      return record;
    },
    async appendMessage(input) {
      requireActor(input.ownerId);
      requireActor(input.audit.actorScope);
      const internal = input.sender === "agente";
      const result = writeResult(MessageSchema).parse(await call(internal ? "append_agent_message" : "append_message", {
        ...(internal ? { p_actor_id: input.ownerId } : {}),
        p_document_id: input.documentId, p_content: input.content,
        p_declared_event_date: input.declaredEventDate, p_key: input.idempotency.key,
        p_correlation_id: input.audit.correlationId,
      }, internal));
      if ("value" in result && (result.value.documentId !== input.documentId || result.value.sender !== input.sender)) {
        throw new Error("Respuesta de persistencia inválida");
      }
      return result;
    },
    async listMessages(ownerId, documentId) {
      requireActor(ownerId);
      const value = await call("list_messages", { p_document_id: documentId });
      if (value === null) return null;
      const messages = z.array(MessageSchema).parse(value);
      if (messages.some((message) => message.documentId !== documentId)) throw new Error("Respuesta de persistencia inválida");
      return messages;
    },
    async appendAuditEvent(event, idempotency) {
      const parsed = parseAuditEvent(event);
      requireActor(parsed.actorScope);
      return z.enum(["created", "replayed"]).parse(await call("append_document_audit", {
        p_actor_id: parsed.actorScope, p_document_id: parsed.documentId, p_type: parsed.type,
        p_resource_id: parsed.resourceId, p_outcome: parsed.outcome,
        p_correlation_id: parsed.correlationId, p_key: idempotency.key,
      }, true));
    },
  };
}
