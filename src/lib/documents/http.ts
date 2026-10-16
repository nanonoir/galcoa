import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { TechnicalError } from "@/lib/contracts/technical";
import { PRIVATE_RESPONSE_HEADERS, type SessionCheck } from "@/lib/supabase/auth";
import { trustedOrigin } from "@/lib/supabase/auth-http";

import { createDocumentService, CreateDocumentCommandSchema } from "./documents";
import { createMessageService, RecordMessageCommandSchema } from "./messages";
import type { DocumentStore } from "./ports";
import type { ServiceResult } from "./result";

export interface DocumentHttpContext {
  session: SessionCheck;
  /** Se crea solo tras comprobar sesión. No recibe identidad del request body. */
  storeForUser(userId: string): DocumentStore;
}

export interface DocumentHttpDeps {
  getContext(): Promise<DocumentHttpContext>;
  /** URL confiable de despliegue, nunca Host/X-Forwarded-Host del request. */
  trustedOrigins(): readonly string[];
}

const ACTION = {
  LIST: "list", CREATE: "create", GET: "get", MESSAGES: "messages", APPEND: "append",
} as const;
export type DocumentHttpAction = (typeof ACTION)[keyof typeof ACTION];
const MessageBodySchema = RecordMessageCommandSchema.omit({ documentId: true });
const UUID = z.uuid();
const HTTP_STATUS: Record<string, number> = {
  NO_SESSION: 401, AUTH_UNAVAILABLE: 503, INVALID_INPUT: 400, FORBIDDEN: 403,
  NOT_AVAILABLE: 404, IDEMPOTENCY_CONFLICT: 409, PAYLOAD_TOO_LARGE: 413,
};

function error(code: string, retryable = false): Response {
  const value: TechnicalError = {
    code, stage: code === "NO_SESSION" || code === "AUTH_UNAVAILABLE" || code === "FORBIDDEN" ? "autenticacion" : code === "TECHNICAL_FAILURE" ? "persistencia" : "validacion",
    retryable, correlationId: randomUUID(),
  };
  return resultResponse({ ok: false, error: value });
}

function resultResponse<T>(result: ServiceResult<T>): Response {
  if (!result.ok) return Response.json({ error: result.error }, {
    status: HTTP_STATUS[result.error.code] ?? (result.error.retryable ? 503 : 500), headers: PRIVATE_RESPONSE_HEADERS,
  });
  return Response.json({ schemaVersion: 1, outcome: "completed", result: result.value, ...(result.replayed === undefined ? {} : { replayed: result.replayed }) }, {
    status: 200, headers: PRIVATE_RESPONSE_HEADERS,
  });
}

/** Cota de transporte; no trunca el mensaje (la cota semántica sigue en el servicio). */
async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new RangeError(); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

/** Factory compartida por Next y pruebas; sin proveedores ni identidad inventada. */
export function createDocumentHttpHandler(deps: DocumentHttpDeps, action: DocumentHttpAction) {
  return async (request: Request, documentId?: string): Promise<Response> => {
    const mutation = action === ACTION.CREATE || action === ACTION.APPEND;
    if (request.method !== (mutation ? "POST" : "GET")) {
      return new Response(null, { status: 405, headers: { ...PRIVATE_RESPONSE_HEADERS, Allow: mutation ? "POST" : "GET" } });
    }
    try {
      if (mutation) {
        // Origin ausente/null o configuración inválida: falla cerrado.
        if (!trustedOrigin(request, deps.trustedOrigins()) || request.headers.get("Sec-Fetch-Site") === "cross-site") return error("FORBIDDEN");
      }
      const context = await deps.getContext();
      if (context.session.status === "anonymous") return error("NO_SESSION");
      if (context.session.status === "unavailable") return error("AUTH_UNAVAILABLE", true);
      if (action !== ACTION.LIST && action !== ACTION.CREATE && !UUID.safeParse(documentId).success) return error("NOT_AVAILABLE");
      const userId = context.session.user.id;
      const store = context.storeForUser(userId);
      const session = { currentUserId: async () => userId };
      const documents = createDocumentService(session, store);
      const messages = createMessageService(session, store);
      if (action === ACTION.LIST) return resultResponse(await documents.listDocuments());
      if (action === ACTION.GET) return resultResponse(await documents.getDocument(documentId!));
      if (action === ACTION.MESSAGES) return resultResponse(await messages.listMessages(documentId!));
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) return error("INVALID_INPUT");
      let body: unknown;
      try { body = await readJson(request); } catch (cause) { return error(cause instanceof RangeError ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT"); }
      if (action === ACTION.CREATE) {
        const parsed = CreateDocumentCommandSchema.safeParse(body);
        return parsed.success ? resultResponse(await documents.createDocument(parsed.data)) : error("INVALID_INPUT");
      }
      const parsed = MessageBodySchema.safeParse(body);
      return parsed.success ? resultResponse(await messages.recordUserMessage({ ...parsed.data, documentId })) : error("INVALID_INPUT");
    } catch {
      return error("TECHNICAL_FAILURE", true);
    }
  };
}
