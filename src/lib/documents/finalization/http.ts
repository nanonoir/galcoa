import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { TechnicalError } from "@/lib/contracts/technical";
import { PRIVATE_RESPONSE_HEADERS } from "@/lib/supabase/auth";
import { trustedOrigin } from "@/lib/supabase/auth-http";
import type { SessionCheck } from "@/lib/supabase/auth";

import type { DocumentRpc } from "../persistence/store";
import type { SealResult } from "../sealing/service";

import {
  createSupabaseFinalizationStatusStore,
  createSupabaseFinalizationStore,
  type ClaimResult,
  type FinalizationClaimStore,
  type FinalizationStatusStore,
} from "./supabase";
import type { FinalizationAdvancer } from "./resume";

/**
 * `POST` de reclamo/reanudación de finalización (MVP-080/081). Sin cuerpo: ni el renderer ni el lease
 * vienen del cliente, y el actor sale de la sesión verificada (`auth.uid()` en la base). Los
 * estados no exitosos son 409 con código estable; ningún mensaje de SDK/SQL llega al cliente.
 * Quien obtiene el claim (nuevo o reanudado) recibe el fencing solo dentro del servidor y con él avanza
 * las fases; quien no tiene fencing (`in_progress`, `published`) no regenera artefactos. El `GET` de estado lee la
 * proyección mínima de `get_finalization_status` (propietario; ajeno e inexistente son indistinguibles).
 * Tras publicar, el POST espera el sello; repetirlo recupera el intento persistido sin repetir el PDF.
 */

export const FINALIZATION_RENDERER = "react-pdf-v1";
export const FINALIZATION_LEASE_SECONDS = 120;

export interface FinalizationHttpDeps {
  getContext(): Promise<{ session: SessionCheck; rpc: DocumentRpc }>;
  trustedOrigins(): readonly string[];
  /** Solo pruebas: sustituye al adaptador Supabase. */
  storeFor?(userId: string, rpc: DocumentRpc): FinalizationClaimStore;
  /** Solo pruebas: sustituye al adaptador de lectura de estado. */
  statusStoreFor?(userId: string, rpc: DocumentRpc): FinalizationStatusStore;
  /** Avance de fases del dueño del claim; sin él el POST solo reclama. Puede lanzar si falta el canal del ejecutor. */
  advancerFor?(userId: string): FinalizationAdvancer;
  /** Solo después de publicación confirmada, con el propietario y versionId del claim autorizado. */
  sealerFor?(userId: string): { seal(versionId: string): Promise<SealResult> };
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

const ADVANCE_STATUS: Record<string, number> = {
  NOT_AVAILABLE: 404,
  STALE_CLAIM: 409,
  FINALIZATION_ABANDONED: 409,
  ARTIFACT_CONFLICT: 409,
  RECEIPTS_INCOMPLETE: 409,
};

/** Fallo de una fase: código y reintentabilidad del servicio; los no listados son impedimentos técnicos 503. */
function advanceProblem(error: TechnicalError): Response {
  const status = ADVANCE_STATUS[error.code] ?? 503;
  return Response.json({ error }, { status, headers: PRIVATE_RESPONSE_HEADERS });
}

type PublicSeal =
  | { status: "pendiente" }
  | { status: "registrado"; reference: string; topicId: string; sequenceNumber: string; transactionId: string; consensusTimestamp: string };

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
        const dto = present(result);
        // Solo quien tiene el fencing (claim nuevo o reanudado) avanza; se queda en el servidor.
        if ("fencing" in result.operation && deps.advancerFor) {
          const advanced = await deps.advancerFor(userId).advance({
            operationId: result.operation.operationId, fencing: result.operation.fencing, phase: result.operation.phase,
          });
          if (!advanced.ok) return advanceProblem(advanced.error);
          dto.operation.phase = advanced.phase;
        }
        if (dto.operation.phase === "published" && deps.sealerFor) {
          // Sin fire-and-forget: intención persistida antes del envío y reconciliación en replay.
          // Una caída deja la publicación como punto de recuperación, sin regenerar artefactos.
          let seal: PublicSeal = { status: "pendiente" };
          try {
            const sealed = await deps.sealerFor(userId).seal(result.operation.versionId);
            if (sealed.status === "registrado") {
              // Solo identificadores públicos y opacos (INV-06): nunca bytes firmados ni claves.
              const { topicId, sequenceNumber, transactionId, consensusTimestamp } = sealed.registration;
              seal = { status: "registrado", reference: sealed.reference, topicId, sequenceNumber, transactionId, consensusTimestamp };
            }
          } catch {
            // INV-18: configuración ausente o HCS indisponible no deshacen la publicación.
          }
          return Response.json({ ...dto, seal }, { status, headers: PRIVATE_RESPONSE_HEADERS });
        }
        return Response.json(dto, { status, headers: PRIVATE_RESPONSE_HEADERS });
      }
      if (result.status === "blocked") {
        const error: TechnicalError = { code: "ALC_BLOCKED", stage: "validacion", retryable: false, correlationId: randomUUID() };
        return Response.json({ error, reason: result.code }, { status: 409, headers: PRIVATE_RESPONSE_HEADERS });
      }
      return problem(CODES[result.status], result.status === "not_available" ? 404 : 409);
    } catch {
      return problem("TECHNICAL_FAILURE", 503, true);
    }
  };
}

/** `GET` de estado: solo lectura; si llega `Origin` debe ser de confianza y se rechaza `cross-site`. */
export function createFinalizationStatusHandler(deps: FinalizationHttpDeps) {
  return async (request: Request, documentId: string, revisionId: string): Promise<Response> => {
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { ...PRIVATE_RESPONSE_HEADERS, Allow: "GET" } });
    try {
      const hasOrigin = request.headers.get("origin") !== null;
      if ((hasOrigin && !trustedOrigin(request, deps.trustedOrigins())) || request.headers.get("Sec-Fetch-Site") === "cross-site") return problem("FORBIDDEN", 403);
      const context = await deps.getContext();
      if (context.session.status === "anonymous") return problem("NO_SESSION", 401);
      if (context.session.status !== "authenticated") return problem("AUTH_UNAVAILABLE", 503, true);
      if (!z.uuid().safeParse(documentId).success || !z.uuid().safeParse(revisionId).success) return problem("NOT_AVAILABLE", 404);
      const userId = context.session.user.id;
      const store = deps.statusStoreFor?.(userId, context.rpc) ?? createSupabaseFinalizationStatusStore({ verifiedUserId: userId, session: context.rpc });
      const result = await store.status({ documentId, revisionId });
      if (result.status !== "found") return problem("NOT_AVAILABLE", 404);
      const { operationId, phase, status, versionNumber } = result.operation;
      return Response.json({ operation: { operationId, phase, status, versionNumber } }, { status: 200, headers: PRIVATE_RESPONSE_HEADERS });
    } catch {
      return problem("TECHNICAL_FAILURE", 503, true);
    }
  };
}
