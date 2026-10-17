import { randomUUID } from "node:crypto";

import type { DocumentRecord, Message } from "@/lib/contracts/core";
import { parseAuditEvent, type AuditEvent } from "@/lib/documents/audit";
import type { DocumentStore, IdempotencyInput, WriteResult } from "@/lib/documents/ports";

/**
 * Doble en memoria del puerto `DocumentStore`, exclusivo de tests. Imita lo que
 * hará la RPC: escritura + auditoría + idempotencia juntas, secuencia y fecha
 * de carga del servidor, lecturas filtradas por propietario y colecciones solo
 * de agregar. No acredita RLS ni transacciones reales (SH-09).
 */
export function createMemoryStore(options: { now?: () => string } = {}) {
  const now = options.now ?? (() => new Date().toISOString().replace(/\.\d+Z$/, "Z"));
  const documents = new Map<string, DocumentRecord>();
  const messages: Message[] = [];
  const audit: AuditEvent[] = [];
  const idempotency = new Map<string, { fingerprint: string; value: unknown }>();
  const seq = new Map<string, number>();
  let failNext = false;

  function idem<T>(scope: string, input: IdempotencyInput, write: () => T): WriteResult<T> {
    const key = `${scope}|${input.key}`;
    const existing = idempotency.get(key);
    if (existing) {
      return existing.fingerprint === input.fingerprint
        ? { status: "replayed", value: existing.value as T }
        : { status: "idempotency_conflict" };
    }
    const value = write();
    idempotency.set(key, { fingerprint: input.fingerprint, value });
    return { status: "created", value };
  }

  const store: DocumentStore = {
    async createDocument(input) {
      if (failNext) throw ((failNext = false), new Error("base caída"));
      return idem(`${input.ownerId}|documents|document.create`, input.idempotency, () => {
        const at = now();
        const record: DocumentRecord = {
          documentId: randomUUID(),
          ownerId: input.ownerId,
          title: input.title,
          documentStatus: "borrador",
          controlStatus: "sin_evaluar",
          confirmationStatus: null,
          hcsStatus: "no_iniciado",
          activeRevisionId: null,
          createdAt: at,
          updatedAt: at,
        };
        // Misma «transacción»: si el evento es inválido, no queda nada escrito.
        const event = parseAuditEvent({
          schemaVersion: 1,
          type: "document.created",
          actorScope: input.audit.actorScope,
          documentId: record.documentId,
          resourceType: "document",
          resourceId: record.documentId,
          outcome: "ok",
          correlationId: input.audit.correlationId,
        });
        documents.set(record.documentId, record);
        audit.push(event);
        return { ...record };
      });
    },

    async renameDocument(input) {
      if (failNext) throw ((failNext = false), new Error("base caída"));
      const doc = documents.get(input.documentId);
      if (!doc || doc.ownerId !== input.ownerId) return { status: "not_available" };
      if (doc.documentStatus === "finalizado") return { status: "finalized" };
      const title = input.title.trim();
      if (doc.title === title) return { status: "unchanged", value: { ...doc } };
      doc.title = title;
      doc.updatedAt = now();
      return { status: "updated", value: { ...doc } };
    },

    async listDocuments(ownerId) {
      return [...documents.values()].filter((d) => d.ownerId === ownerId).map((d) => ({ ...d }));
    },

    async getDocument(ownerId, documentId) {
      const doc = documents.get(documentId);
      return doc && doc.ownerId === ownerId ? { ...doc } : null;
    },

    async appendMessage(input) {
      if (failNext) throw ((failNext = false), new Error("base caída"));
      const doc = documents.get(input.documentId);
      if (!doc || doc.ownerId !== input.ownerId) return { status: "not_available" };
      const action = input.sender === "autor" ? "message.record" : "message.record_agent";
      return idem(`${input.ownerId}|${input.documentId}|${action}`, input.idempotency, () => {
        const sequence = (seq.get(input.documentId) ?? 0) + 1;
        const message: Message = {
          messageId: randomUUID(),
          documentId: input.documentId,
          sender: input.sender,
          content: input.content,
          declaredEventDate: input.declaredEventDate,
          uploadedAt: now(),
        };
        const event = parseAuditEvent({
          schemaVersion: 1,
          type: "message.recorded",
          actorScope: input.audit.actorScope,
          documentId: input.documentId,
          resourceType: "message",
          resourceId: message.messageId,
          outcome: "ok",
          correlationId: input.audit.correlationId,
        });
        seq.set(input.documentId, sequence);
        messages.push(message);
        audit.push(event);
        return structuredClone(message);
      });
    },

    async listMessages(ownerId, documentId) {
      const doc = documents.get(documentId);
      if (!doc || doc.ownerId !== ownerId) return null;
      return messages.filter((m) => m.documentId === documentId).map((m) => structuredClone(m));
    },

    async appendAuditEvent(event, input) {
      const result = idem(`${event.actorScope}|${event.documentId}|audit.${event.type}`, input, () => {
        audit.push(event);
        return event;
      });
      return result.status === "created" ? "created" : "replayed";
    },
  };

  return {
    store,
    /** Vista de solo lectura para asserts. */
    inspect: () => ({ documents: [...documents.values()], messages: [...messages], audit: [...audit] }),
    /** Hace fallar la próxima escritura (simula una caída de la base). */
    failNextWrite: () => {
      failNext = true;
    },
  };
}
