import "server-only";

import { randomUUID } from "node:crypto";

import type { TechnicalError } from "@/lib/contracts/technical";
import { PRIVATE_RESPONSE_HEADERS, type SessionCheck } from "@/lib/supabase/auth";
import { trustedOrigin } from "@/lib/supabase/auth-http";

import { createAggregateService } from "./confirmations/service";
import { createSupabaseAggregateStore } from "./confirmations/supabase";
import { createInvitationService } from "./invitations/service";
import { createSupabaseInvitationStore } from "./invitations/supabase";
import { createAuthorConfirmationHandler, createFreezeHandler } from "./revisions/http";
import { createRevisionService } from "./revisions/service";
import { createSupabaseRevisionAdapters } from "./revisions/supabase";
import { createIssueInvitationHandler, createRevokeInvitationHandler } from "./invitations/http";
import { createExecutorRpc } from "./persistence/executor-rpc";
import type { DocumentRpc } from "./persistence/store";

/**
 * Rutas del propietario para revisiones, confirmación del autor, estado
 * agregado e invitaciones (MVP-070…075). Mutaciones: POST con origen confiable,
 * `application/json` acotado y sesión verificada; la identidad sale de la
 * sesión, nunca del cuerpo. La composición de servicios y adaptadores ocurre
 * por petición, sin cliente compartido ni `service_role`.
 */

export interface ReviewHttpContext {
  session: SessionCheck;
  /** Cliente de la sesión verificada; las RPC usan `auth.uid()`. */
  rpc: DocumentRpc;
}

export interface ReviewHttpDeps {
  getContext(): Promise<ReviewHttpContext>;
  trustedOrigins(): readonly string[];
}

export type ReviewAction = "freeze" | "confirm" | "aggregate" | "issue" | "revoke";

const MAX_BODY_BYTES = 65536;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function problem(code: string, status: number, retryable = false): Response {
  const stage = status === 401 || status === 403 || status === 503 ? "autenticacion" : "validacion";
  const error: TechnicalError = { code, stage, retryable, correlationId: randomUUID() };
  return Response.json({ error }, { status, headers: PRIVATE_RESPONSE_HEADERS });
}

export function createReviewOwnerHandler(deps: ReviewHttpDeps, action: ReviewAction) {
  const mutation = action !== "aggregate";
  return async (request: Request, id: string): Promise<Response> => {
    if (request.method !== (mutation ? "POST" : "GET")) {
      return new Response(null, { status: 405, headers: { ...PRIVATE_RESPONSE_HEADERS, Allow: mutation ? "POST" : "GET" } });
    }
    try {
      if (mutation && (!trustedOrigin(request, deps.trustedOrigins()) || request.headers.get("Sec-Fetch-Site") === "cross-site")) {
        return problem("FORBIDDEN", 403);
      }
      if (!UUID.test(id)) return problem("NOT_AVAILABLE", 404);
      if (mutation && action !== "revoke") {
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") ?? "")) return problem("INVALID_INPUT", 400);
        if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY_BYTES) return problem("PAYLOAD_TOO_LARGE", 413);
      }
      const context = await deps.getContext();
      if (context.session.status === "anonymous") return problem("NO_SESSION", 401);
      if (context.session.status === "unavailable") return problem("AUTH_UNAVAILABLE", 503, true);
      const userId = context.session.user.id;
      const session = { currentUserId: async () => userId };

      if (action === "freeze" || action === "confirm") {
        const { store, reader } = createSupabaseRevisionAdapters({ verifiedUserId: userId, session: context.rpc, executor: createExecutorRpc(userId) });
        const service = createRevisionService({ session, source: reader, revisions: store });
        return (action === "freeze" ? createFreezeHandler : createAuthorConfirmationHandler)(async () => service)(request, id);
      }
      if (action === "aggregate") {
        const service = createAggregateService({ session, store: createSupabaseAggregateStore({ verifiedUserId: userId, session: context.rpc }) });
        const result = await service.getForAuthor(id);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.error.code === "NOT_AVAILABLE" ? 404 : result.error.retryable ? 503 : 400, headers: PRIVATE_RESPONSE_HEADERS });
        return Response.json(result.value, { status: 200, headers: PRIVATE_RESPONSE_HEADERS });
      }
      const invitations = createInvitationService({ session, invitations: createSupabaseInvitationStore({ verifiedUserId: userId, rpc: context.rpc }) });
      return action === "issue"
        ? createIssueInvitationHandler(async () => invitations)(request, id)
        : createRevokeInvitationHandler(async () => invitations)(request, id);
    } catch {
      return problem("TECHNICAL_FAILURE", 503, true);
    }
  };
}
