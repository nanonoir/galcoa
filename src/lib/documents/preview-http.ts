import "server-only";

import { randomUUID } from "node:crypto";

import type { Draft } from "@/lib/contracts/core";
import type { TechnicalError } from "@/lib/contracts/technical";
import { PRIVATE_RESPONSE_HEADERS, type SessionCheck } from "@/lib/supabase/auth";

import { renderPreviewPdf } from "./pdf/render";

/**
 * Lectura del borrador vigente para el propietario: vista previa en PDF (efímera, sin persistir,
 * sin hash ni sello) y resumen JSON (`draftRevision`, título) para que el chat sepa qué congelar
 * tras recargar. Solo GET; la identidad sale de la sesión verificada. Ajeno e inexistente
 * responden igual (404); sin borrador, 409 `NO_DRAFT`.
 */

export type DraftRead = { status: "not_available" } | { status: "no_draft" } | { status: "ok"; draft: Draft };

export interface DraftHttpContext {
  session: SessionCheck;
  readDraft(userId: string, documentId: string): Promise<DraftRead>;
}

export interface DraftHttpDeps {
  getContext(): Promise<DraftHttpContext>;
}

export type DraftAction = "preview" | "summary";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function problem(code: string, status: number, retryable = false): Response {
  const stage = status === 401 || status === 403 || status === 503 ? "autenticacion" : "validacion";
  const error: TechnicalError = { code, stage, retryable, correlationId: randomUUID() };
  return Response.json({ error }, { status, headers: PRIVATE_RESPONSE_HEADERS });
}

export function createDraftHandler(deps: DraftHttpDeps, action: DraftAction) {
  return async (request: Request, documentId: string): Promise<Response> => {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { ...PRIVATE_RESPONSE_HEADERS, Allow: "GET" } });
    }
    try {
      if (request.headers.get("Sec-Fetch-Site") === "cross-site") return problem("FORBIDDEN", 403);
      if (!UUID.test(documentId)) return problem("NOT_AVAILABLE", 404);
      const context = await deps.getContext();
      if (context.session.status === "anonymous") return problem("NO_SESSION", 401);
      if (context.session.status === "unavailable") return problem("AUTH_UNAVAILABLE", 503, true);
      const read = await context.readDraft(context.session.user.id, documentId);
      if (read.status === "not_available") return problem("NOT_AVAILABLE", 404);
      if (read.status === "no_draft") return problem("NO_DRAFT", 409);
      const { draft } = read;
      if (action === "summary") {
        return Response.json(
          { draftId: draft.draftId, draftRevision: draft.draftRevision, title: draft.content.title },
          { status: 200, headers: PRIVATE_RESPONSE_HEADERS },
        );
      }
      const bytes = await renderPreviewPdf(draft.content);
      return new Response(bytes as BodyInit, {
        status: 200,
        headers: {
          ...PRIVATE_RESPONSE_HEADERS,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="vista-previa.pdf"',
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return problem("TECHNICAL_FAILURE", 503, true);
    }
  };
}
