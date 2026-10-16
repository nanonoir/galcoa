import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PRIVATE_RESPONSE_HEADERS, type SessionCheck } from "@/lib/supabase/auth";
import { trustedOrigin } from "@/lib/supabase/auth-http";
import type { GeminiStructuredPort } from "@/lib/ai/gemini/structured";
import { createExtractionService } from "@/lib/ai/extraction/service";
import type { ServiceResult } from "../result";
import type { EvidenceStorage, EvidenceStore } from "./ports";
import { createEvidenceService, RequestUploadCommandSchema } from "./service";

export interface EvidenceHttpContext {
  session: SessionCheck;
  forUser(userId: string): { store: EvidenceStore; storage: EvidenceStorage; gemini: GeminiStructuredPort };
  close?(): Promise<void>;
}
export interface EvidenceHttpDeps {
  getContext(): Promise<EvidenceHttpContext>;
  trustedOrigins(): readonly string[];
}
const ACTION = { RESERVE: "reserve", COMPLETE: "complete", LIST: "list", READ: "read", EXTRACT: "extract", EXTRACTIONS: "extractions" } as const;
export type EvidenceHttpAction = (typeof ACTION)[keyof typeof ACTION];
const bodySchema = RequestUploadCommandSchema.omit({ documentId: true });
const statuses: Record<string, number> = { NO_SESSION: 401, AUTH_UNAVAILABLE: 503, FORBIDDEN: 403,
  INVALID_INPUT: 400, PAYLOAD_TOO_LARGE: 413, NOT_AVAILABLE: 404, IDEMPOTENCY_CONFLICT: 409,
  EVIDENCE_NOT_UPLOADED: 409, EVIDENCE_LIMIT_FILES: 409, EVIDENCE_LIMIT_TOTAL: 409 };

function respond<T>(r: ServiceResult<T>): Response {
  return r.ok ? Response.json({ schemaVersion: 1, outcome: "completed", result: r.value,
    ...(r.replayed === undefined ? {} : { replayed: r.replayed }) }, { headers: PRIVATE_RESPONSE_HEADERS })
    : Response.json({ error: r.error }, { status: statuses[r.error.code] ??
      (r.error.retryable ? 503 : r.error.stage === "validacion" ? 422 : 500), headers: PRIVATE_RESPONSE_HEADERS });
}
function fail(code: string, retryable = false) {
  return respond({ ok: false, error: { code, retryable, stage: code === "NO_SESSION" || code === "FORBIDDEN" ? "autenticacion" : "validacion", correlationId: randomUUID() } });
}
async function json(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0; let text = "";
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); throw new RangeError(); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

/** El body nunca selecciona actor ni ruta; solo JSON pequeño, sin bytes de archivo. */
export function createEvidenceHttpHandler(deps: EvidenceHttpDeps, action: EvidenceHttpAction) {
  return async (request: Request, documentId: string, evidenceId?: string): Promise<Response> => {
    const mutation = ["reserve", "complete", "extract"].includes(action);
    const method = mutation ? "POST" : "GET";
    if (request.method !== method) return new Response(null, { status: 405, headers: { ...PRIVATE_RESPONSE_HEADERS, Allow: method } });
    let context: EvidenceHttpContext | undefined;
    try {
      if (mutation && (!trustedOrigin(request, deps.trustedOrigins()) || request.headers.get("Sec-Fetch-Site") === "cross-site")) return fail("FORBIDDEN");
      context = await deps.getContext();
      if (context.session.status === "anonymous") return fail("NO_SESSION");
      if (context.session.status !== "authenticated") return fail("AUTH_UNAVAILABLE", true);
      if (!z.uuid().safeParse(documentId).success ||
        (["complete", "read", "extract"].includes(action) && !z.uuid().safeParse(evidenceId).success)) return fail("NOT_AVAILABLE");
      const user = context.session.user.id;
      const { store, storage, gemini } = context.forUser(user);
      const session = { currentUserId: async () => user };
      const service = createEvidenceService({ session, store, storage });
      if (action === "list") return respond(await service.listEvidences(documentId));
      if (action === "read") return respond(await service.readOriginal({ documentId, evidenceId: evidenceId! }));
      if (action === "extractions") {
        const rows = await store.listExtractions(user, documentId);
        return rows === null ? fail("NOT_AVAILABLE") : respond({ ok: true, value: rows });
      }
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) return fail("INVALID_INPUT");
      let body: unknown;
      try { body = await json(request); } catch (e) { return fail(e instanceof RangeError ? "PAYLOAD_TOO_LARGE" : "INVALID_INPUT"); }
      if (action === "reserve") {
        const parsed = bodySchema.safeParse(body);
        return parsed.success ? respond(await service.requestUpload({ ...parsed.data, documentId })) : fail("INVALID_INPUT");
      }
      if (!z.strictObject({}).safeParse(body).success) return fail("INVALID_INPUT");
      if (action === "complete") return respond(await service.completeUpload({ documentId, evidenceId: evidenceId! }));
      return respond(await createExtractionService({ session, store, storage, gemini }).extractEvidence({ documentId, evidenceId: evidenceId!, abortSignal: request.signal }));
    } catch { return fail("TECHNICAL_FAILURE", true); }
    finally { await context?.close?.(); }
  };
}
