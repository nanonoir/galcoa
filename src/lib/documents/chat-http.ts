import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { createContrastService } from "@/lib/ai/groq/contrast";
import type { TechnicalError } from "@/lib/contracts/technical";
import { PRIVATE_RESPONSE_HEADERS, type SessionCheck } from "@/lib/supabase/auth";
import { trustedOrigin } from "@/lib/supabase/auth-http";

import type { createTurnService } from "./turns/service";
import { createChatTurnHandler, errorResponse } from "./turns/http";

/**
 * Rutas de chat y contraste (MVP-052/053): comprobaciones de transporte (método, origen, sesión,
 * id) y composición por petición. Las lógicas viven en los servicios; el actor sale de la sesión
 * verificada, nunca del body ni de la URL.
 */

export type ChatServices = {
  turns: ReturnType<typeof createTurnService>;
  contrast: ReturnType<typeof createContrastService>;
};

export interface ChatHttpDeps {
  getContext(): Promise<{ session: SessionCheck; forUser(userId: string): ChatServices }>;
  trustedOrigins(): readonly string[];
}

const STATUS: Record<string, number> = {
  NO_SESSION: 401, AUTH_UNAVAILABLE: 503, FORBIDDEN: 403, INVALID_INPUT: 400, NOT_AVAILABLE: 404,
  NO_DRAFT: 409, STALE_DRAFT: 409, INPUT_TOO_LARGE: 413,
};

function failure(code: string, retryable = false): Response {
  const error: TechnicalError = {
    code,
    stage: code === "NO_SESSION" || code === "AUTH_UNAVAILABLE" || code === "FORBIDDEN" ? "autenticacion" : code === "TECHNICAL_FAILURE" ? "persistencia" : "validacion",
    retryable,
    correlationId: randomUUID(),
  };
  return Response.json({ error }, { status: STATUS[code] ?? (retryable ? 503 : 500), headers: PRIVATE_RESPONSE_HEADERS });
}

/** Un solo punto de entrada por acción; ambas son POST same-origin con sesión. */
export function createChatHttpHandler(deps: ChatHttpDeps, action: "turn" | "contrast") {
  return async (request: Request, documentId: string): Promise<Response> => {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...PRIVATE_RESPONSE_HEADERS, Allow: "POST" } });
    try {
      if (!trustedOrigin(request, deps.trustedOrigins()) || request.headers.get("Sec-Fetch-Site") === "cross-site") return failure("FORBIDDEN");
      const context = await deps.getContext();
      if (context.session.status === "anonymous") return failure("NO_SESSION");
      if (context.session.status !== "authenticated") return failure("AUTH_UNAVAILABLE", true);
      if (!z.uuid().safeParse(documentId).success) return failure("NOT_AVAILABLE");
      const services = context.forUser(context.session.user.id);

      if (action === "turn") return await createChatTurnHandler(async () => services.turns)(request, documentId);

      const result = await services.contrast.contrastDraft({ documentId, abortSignal: request.signal });
      if (!result.ok) {
        return Response.json({ error: result.error }, {
          status: STATUS[result.error.code] ?? (result.error.retryable ? 503 : result.error.stage === "validacion" ? 422 : 500),
          headers: PRIVATE_RESPONSE_HEADERS,
        });
      }
      return Response.json({ schemaVersion: 1, outcome: "completed", result: result.value }, { headers: PRIVATE_RESPONSE_HEADERS });
    } catch {
      return errorResponse({ code: "TECHNICAL_FAILURE", stage: "persistencia", retryable: true, correlationId: randomUUID() });
    }
  };
}
