import "server-only";

import type { DeclaredEventDate, DocumentRecord, Message } from "@/lib/contracts/core";

import type { AuditEvent } from "./audit";

/**
 * Contexto del evento transaccional. El adaptador arma el evento del catálogo
 * (`document.created` / `message.recorded`) con los ids definitivos y lo
 * valida con `parseAuditEvent` dentro de la misma transacción (INV-08).
 */
export type AuditContext = {
  actorScope: string;
  correlationId: string;
};

/**
 * Puertos de F4 (MVP-040/041/044). Los servicios dependen de estas
 * interfaces, no de Supabase: el helper de sesión es de MVP-030 y el
 * adaptador de persistencia (RPC `create_document` / `append_message` de
 * docs/design/data-transactions.md, migración aditiva de F4) depende de
 * MVP-025. Hasta entonces solo existen dobles en la suite de servidor de F4;
 * no hay fallback productivo.
 */

/** Helper de usuario autenticado (MVP-030). `null` = sin sesión. */
export type SessionPort = {
  currentUserId(): Promise<string | null>;
};

export type IdempotencyInput = {
  key: string;
  /** SHA-256 del comando canónico (SH-04). */
  fingerprint: string;
};

export type CreateDocumentInput = {
  ownerId: string;
  title: string;
  idempotency: IdempotencyInput;
  /** Se audita `document.created` en la misma transacción. */
  audit: AuditContext;
};

export type AppendMessageInput = {
  ownerId: string;
  documentId: string;
  sender: Message["sender"];
  content: string;
  declaredEventDate: DeclaredEventDate;
  idempotency: IdempotencyInput;
  /** Se audita `message.recorded` en la misma transacción. */
  audit: AuditContext;
};

export type WriteResult<T> =
  | { status: "created"; value: T }
  | { status: "replayed"; value: T }
  | { status: "idempotency_conflict" }
  | { status: "not_available" };

/**
 * Persistencia del núcleo documental. Cada escritura es atómica con su
 * auditoría y su registro de idempotencia; la fecha de carga y la secuencia
 * las fija el servidor de base. Lecturas filtradas por propietario: un
 * documento ajeno y uno inexistente devuelven lo mismo (`null`).
 * No hay operaciones de actualización ni borrado de mensajes o auditoría.
 */
export type DocumentStore = {
  createDocument(input: CreateDocumentInput): Promise<WriteResult<DocumentRecord>>;
  listDocuments(ownerId: string): Promise<DocumentRecord[]>;
  getDocument(ownerId: string, documentId: string): Promise<DocumentRecord | null>;
  appendMessage(input: AppendMessageInput): Promise<WriteResult<Message>>;
  /** Mensajes en orden de secuencia del servidor; `null` si el documento no es del propietario. */
  listMessages(ownerId: string, documentId: string): Promise<Message[] | null>;
  /** Eventos no transaccionales (los transaccionales viajan en cada escritura). */
  appendAuditEvent(event: AuditEvent, idempotency: IdempotencyInput): Promise<"created" | "replayed">;
};
