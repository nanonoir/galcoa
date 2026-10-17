import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { TechnicalError } from "@/lib/contracts/technical";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/supabase/auth";
import { trustedOrigin } from "@/lib/supabase/auth-http";
import type { SessionCheck } from "@/lib/supabase/auth";

import type { DocumentRpc } from "../persistence/store";

import { createSupabaseFinalizationStore, type ClaimResult, type FinalizationClaimStore } from "./supabase";

/**
 * `POST` de reclamo/reanudación de finalización (MVP-080). Sin cuerpo: ni el renderer ni el lease
 * vienen del cliente, y el actor sale de la sesión verificada (`auth.uid()` en la base). Los
 * estados no exitosos son 409 con código estable; ningún mensaje de SDK/SQL llega al cliente.
 * Solo reclama: no genera PDF, manifiesto ni HCS (MVP-081+). El `GET` de estado espera una RPC de
 * lectura que aún no existe (ver ExecPlan f08-01).
 */

export const FINALIZATION_RENDERER = "react-pdf-v1";
export const FINALIZATION_LEASE_SECONDS = 120;

export interface FinalizationHttpDeps {
  getContext(): Promise<{ session: SessionCheck; rpc: DocumentRpc }>;
  trustedOrigins(): readonly string[];
  /** Solo pruebas: sustituye al adaptador Supabase. */
  storeFor?(userId: string, rpc: DocumentRpc): FinalizationClaimStore;
}

const CODES = {
  rejected: "CONFIRMATION_REJECTED",
  confirmations_missing: "CONFIRMATIONS_MISSING",
  revision_not_active: "REVISION_NOT_ACTIVE",
  draft_changed: "DRAFT_CHANGED",
  not_available: "NOT_AVAILABLE",
} as const;

function problem(code: string, status: number, retryable = false): Response {
  const stage = code === "TECHNICAL_FAILURE" ? "persistencia" : status === 401 || status === 403 || status === 503 ? "autenticacion" : "validacion";
  const error: TechnicalError = { code, stage, retryable, correlationId: randomUUID() };
  return Response.json({ error }, { status, headers: PRIVATE_RESPONSE_HEADERS });
}

/** DTO del cliente: sin hashes, identidad reservada, nonce ni fencing. */
function present(result: Extract<ClaimResult, { operation: unknown }>) {
  const { operationId, phase, status, versionNumber } = result.operation;
  return { outcome: result.status, operation: { operationId, phase, status, versionNumber } };
}

export function createClaimFinalizationHandler(deps: FinalizationHttpDeps) {
  return async (request: Request, documentId: string, revisionId: string): Promise<Response> => {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...PRIVATE_RESPONSE_HEADERS, Allow: "POST" } });
    try {
      if (!trustedOrigin(request, deps.trustedOrigins()) || request.headers.get("Sec-Fetch-Site") === "cross-site") return problem("FORBIDDEN", 403);
      const context = await deps.getContext();
      if (context.session.status === "anonymous") return problem("NO_SESSION", 401);
      if (context.session.status !== "authenticated") return problem("AUTH_UNAVAILABLE", 503, true);
      if (!z.uuid().safeParse(documentId).success || !z.uuid().safeParse(revisionId).success) return problem("NOT_AVAILABLE", 404);
      const userId = context.session.user.id;
      const store = deps.storeFor?.(userId, context.rpc) ?? createSupabaseFinalizationStore({ verifiedUserId: userId, session: context.rpc });
      const result = await store.claim({
        documentId, revisionId, renderer: FINALIZATION_RENDERER, leaseSeconds: FINALIZATION_LEASE_SECONDS, correlationId: randomUUID(),
      });
      if ("operation" in result) {
        const status = result.status === "claimed" ? 201 : 200;
        return Response.json(present(result), { status, headers: PRIVATE_RESPONSE_HEADERS });
      }
      return problem(CODES[result.status], result.status === "not_available" ? 404 : 409);
    } catch {
      return problem("TECHNICAL_FAILURE", 503, true);
    }
  };
}
